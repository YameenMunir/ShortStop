// ==UserScript==
// @name         ShortStop: Shorts & Reels Blocker
// @namespace    https://github.com/YOUR_GITHUB_USERNAME/shortstop
// @version      1.0.0
// @description  Blocks YouTube Shorts, Instagram Reels and Facebook Reels while keeping the rest of each site usable. No tracking.
// @author       Yameen Munir
// @license      MIT
// @match        *://www.youtube.com/*
// @match        *://m.youtube.com/*
// @match        *://www.instagram.com/*
// @match        *://www.facebook.com/*
// @match        *://web.facebook.com/*
// @match        *://m.facebook.com/*
// @run-at       document-start
// @inject-into  content
// @noframes
// @grant        none
// ==/UserScript==

/*
 * GENERATED FILE: edit extension/content/*.js, then run
 * `python tools/build_userscript.py`. Only the settings block below is meant
 * to be edited by hand.
 */

/* ===================== SETTINGS: edit these ===================== */
/* Set any of these to false to stop blocking on that site.        */
const BLOCK_YOUTUBE_SHORTS = true;
const BLOCK_INSTAGRAM_REELS = true;
const BLOCK_FACEBOOK_REELS = true;
/* ================================================================ */

(function () {
  'use strict';

  const SETTINGS = {
    youtube: BLOCK_YOUTUBE_SHORTS,
    instagram: BLOCK_INSTAGRAM_REELS,
    facebook: BLOCK_FACEBOOK_REELS,
  };

  /* ======== core.js ======== */
  /*
   * ShortStop core engine
   * =====================
   * Shared by every platform content script, and bundled verbatim into the iOS
   * userscript. A platform file (youtube.js, instagram.js, ...) describes WHAT to
   * block in a single config object; this file decides HOW:
   *
   *   1. At document_start it injects a stylesheet generated from the config, so
   *      Shorts/Reels are hidden before the first paint (no flash of content).
   *   2. A MutationObserver re-scans as the single-page app streams in content,
   *      marking matches with data attributes. Marking is what feeds the daily
   *      "blocked today" counter, and it also covers rules CSS cannot express
   *      (text matching, "closest ancestor" targets).
   *   3. SPA navigations (pushState hook, yt-navigate-finish, popstate, URL
   *      polling) trigger redirects away from Shorts/Reels URLs.
   *   4. Settings changes apply live, without reloading the tab.
   *
   * Config shape (see the platform files for real examples):
   *   {
   *     id: 'youtube',                        // key in the settings object
   *     hosts: ['youtube.com'],               // hostnames (subdomains included)
   *     blockSite: false,                     // true = send every page to the blocked page
   *     navigationEvents: ['yt-navigate-finish'], // extra SPA events fired on document
   *     pages: { explore: /^\/explore\// },   // named pathname patterns, for page-scoped rules
   *     redirects: [{ name, match: /regex on pathname/, when?(url), to(match, url) }],
   *     rules: [{
   *       name: 'Human readable description',
   *       selector: 'css selector',           // prefer tags, href patterns, ARIA labels
   *       action: 'hide' | 'blur',            // default 'hide'
   *       page: 'explore' | ['a', 'b'],        // only apply on these named pages
   *       closest: 'css selector',            // hide this ancestor of the match instead (JS only)
   *       text: /regex/,                      // only if the target's text matches (JS only)
   *       count: true,                        // counts toward "blocked today"
   *     }],
   *   }
   *
   * List container rules (shelves, sections) BEFORE item rules: an element inside
   * something already hidden is skipped, so it is not counted twice.
   */
  (function (global) {
    'use strict';

    if (global.ShortStop) return; // Already loaded in this world.

    const ATTR_HIDDEN = 'data-shortstop-hidden';
    const ATTR_BLURRED = 'data-shortstop-blurred';
    const ATTR_PAGE = 'data-shortstop-page';
    const MARKED = `[${ATTR_HIDDEN}], [${ATTR_BLURRED}]`;

    const SCAN_THROTTLE_MS = 120; // Coalesce bursts of DOM mutations into one scan.
    const COUNT_FLUSH_MS = 1500; // Batch counter updates to spare storage writes.
    const URL_POLL_MS = 1000; // Last-resort check for navigations nothing else caught.
    const MAX_REDIRECT_WAIT_MS = 300; // How long a redirect waits for the counter write.

    // Styles for elements marked by the JS scan. Generated per-rule CSS is appended.
    const BASE_CSS = `
  [${ATTR_HIDDEN}] { display: none !important; }
  [${ATTR_BLURRED}] {
    position: relative !important;
    overflow: hidden !important;
    pointer-events: none !important;
    user-select: none !important;
  }
  [${ATTR_BLURRED}] > * { filter: blur(20px) saturate(0.4) !important; }
  [${ATTR_BLURRED}]::after {
    content: "Reel hidden by ShortStop";
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    background: rgba(22, 35, 58, 0.55);
    color: #fff;
    font: 600 12px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
    text-align: center;
    border-radius: inherit;
  }`;

    // Hides the whole page while we decide whether to redirect it.
    const CLOAK_CSS = 'html { opacity: 0 !important; pointer-events: none !important; }';

    /* ------------------------------------------------------------------ */
    /* Environment adapters                                                 */
    /* ------------------------------------------------------------------ */

    // The browser-extension environment: settings in chrome.storage.sync, the
    // counter kept by the background service worker.
    function createExtensionEnv() {
      const api = global.chrome;
      return {
        href: () => location.href,
        navigate(url, replace) {
          if (replace) location.replace(url);
          else location.assign(url);
        },
        getSettings() {
          return new Promise((resolve) => {
            try {
              api.storage.sync.get('settings', (result) => {
                void api.runtime.lastError; // Swallow errors; fall back to defaults.
                resolve((result && result.settings) || {});
              });
            } catch (error) {
              resolve({}); // Extension was reloaded: this script is orphaned.
            }
          });
        },
        onSettingsChanged(callback) {
          try {
            api.storage.onChanged.addListener((changes, area) => {
              if (area === 'sync' && changes.settings) callback(changes.settings.newValue || {});
            });
          } catch (error) {
            /* Orphaned script; nothing to listen to. */
          }
        },
        count(platform, amount) {
          return new Promise((resolve) => {
            try {
              api.runtime.sendMessage({ type: 'shortstop:count', platform, amount }, () => {
                void api.runtime.lastError;
                resolve();
              });
            } catch (error) {
              resolve();
            }
          });
        },
        blockedPageUrl(from) {
          return `${api.runtime.getURL('blocked/blocked.html')}?from=${encodeURIComponent(from)}`;
        },
      };
    }

    let env = null;
    function getEnv() {
      if (!env) env = createExtensionEnv();
      return env;
    }

    /* ------------------------------------------------------------------ */
    /* Small helpers                                                        */
    /* ------------------------------------------------------------------ */

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const asList = (value) => (value == null ? [] : [].concat(value));

    // Runs `callback` once <html> exists (it almost always does at document_start).
    function whenRootReady(callback) {
      if (document.documentElement) {
        callback();
        return;
      }
      const observer = new MutationObserver(() => {
        if (!document.documentElement) return;
        observer.disconnect();
        callback();
      });
      observer.observe(document, { childList: true });
    }

    function pauseMedia() {
      for (const media of document.querySelectorAll('video, audio')) {
        try {
          media.muted = true;
          media.pause();
        } catch (error) {
          /* Ignore media we cannot control. */
        }
      }
    }

    function unmark(element) {
      element.removeAttribute(ATTR_HIDDEN);
      element.removeAttribute(ATTR_BLURRED);
    }

    /* ------------------------------------------------------------------ */
    /* Engine: one per page, driven by a platform config                    */
    /* ------------------------------------------------------------------ */

    class Engine {
      constructor(config, environment) {
        this.config = config;
        this.env = environment;
        this.rules = asList(config.rules).map((rule, index) => ({ action: 'hide', ...rule, index }));
        this.enabled = true; // Optimistic until settings load, so nothing flashes.
        this.redirecting = false;
        this.observer = null;
        this.styleEl = null;
        this.cloakEl = null;
        this.scanTimer = 0;
        this.flushTimer = 0;
        this.pendingCount = 0;
        this.page = 'other';
        this.lastHref = environment.href();
        this.warnedRules = new Set();
      }

      boot() {
        const { config, env: environment } = this;

        // A URL we are about to redirect (or a fully blocked site) stays invisible
        // until settings arrive, so Shorts never paint for a split second.
        if (config.blockSite || this.resolveRedirect(this.lastHref)) this.setCloak(true);

        if (!config.blockSite) {
          this.updatePage();
          this.injectStyle();
          this.listenForNavigation();
        }

        const apply = (settings) => this.setEnabled(settings[config.id] !== false);
        environment.getSettings().then(apply);
        environment.onSettingsChanged(apply);
        window.addEventListener('pagehide', () => this.flushCount());
      }

      setEnabled(on) {
        this.enabled = on;
        if (on) this.activate();
        else this.deactivate();
      }

      activate() {
        if (this.config.blockSite) {
          this.redirect(this.env.blockedPageUrl(this.env.href()), { replace: true });
          return;
        }
        if (this.redirectIfNeeded()) return;
        this.setCloak(false);
        this.injectStyle();
        this.updatePage();
        if (!this.observer) {
          this.observer = new MutationObserver(() => this.onMutations());
          this.observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            // YouTube recycles list items and just swaps their links.
            attributes: true,
            attributeFilter: ['href'],
          });
        }
        this.scan();
      }

      deactivate() {
        this.setCloak(false);
        if (this.observer) {
          this.observer.disconnect();
          this.observer = null;
        }
        clearTimeout(this.scanTimer);
        this.scanTimer = 0;
        if (this.styleEl) {
          this.styleEl.remove();
          this.styleEl = null;
        }
        for (const element of document.querySelectorAll(MARKED)) unmark(element);
        document.documentElement.removeAttribute(ATTR_PAGE);
      }

      /* ---------------- Styles ---------------- */

      // Turns each "hide" rule into its own CSS rule. Separate rules mean one
      // selector a browser does not understand cannot break all the others.
      buildCss() {
        const blocks = [BASE_CSS];
        for (const rule of this.rules) {
          // Rules that need JS (text match, ancestor lookup, blur label) are skipped.
          if (rule.action !== 'hide' || rule.closest || rule.text) continue;
          const pages = asList(rule.page);
          const selector = pages.length
            ? pages.map((page) => `html[${ATTR_PAGE}="${page}"] :is(${rule.selector})`).join(',\n')
            : rule.selector;
          blocks.push(`/* ${rule.name} */\n${selector} { display: none !important; }`);
        }
        return blocks.join('\n\n');
      }

      injectStyle() {
        if (this.styleEl && this.styleEl.isConnected) return;
        if (!this.styleEl) {
          this.styleEl = document.createElement('style');
          this.styleEl.id = `shortstop-${this.config.id}`;
          this.styleEl.textContent = this.buildCss();
        }
        // At document_start <head> does not exist yet; <html> does.
        (document.head || document.documentElement).appendChild(this.styleEl);
      }

      setCloak(on) {
        if (on) {
          if (this.cloakEl && this.cloakEl.isConnected) return;
          this.cloakEl = this.cloakEl || document.createElement('style');
          this.cloakEl.id = 'shortstop-cloak';
          this.cloakEl.textContent = CLOAK_CSS;
          (document.head || document.documentElement).appendChild(this.cloakEl);
        } else if (this.cloakEl) {
          this.cloakEl.remove();
          this.cloakEl = null;
        }
      }

      // Publishes the current named page (e.g. "explore") on <html> so the
      // generated CSS can scope rules to it.
      updatePage() {
        let pathname = '/';
        try {
          pathname = new URL(this.env.href()).pathname;
        } catch (error) {
          /* Keep the default. */
        }
        const pages = this.config.pages || {};
        this.page = Object.keys(pages).find((name) => pages[name].test(pathname)) || 'other';
        const root = document.documentElement;
        if (root.getAttribute(ATTR_PAGE) !== this.page) root.setAttribute(ATTR_PAGE, this.page);
      }

      /* ---------------- Redirects ---------------- */

      // Returns the absolute URL `href` should be redirected to, or null.
      resolveRedirect(href) {
        let url;
        try {
          url = new URL(href);
        } catch (error) {
          return null;
        }
        for (const rule of asList(this.config.redirects)) {
          const match = url.pathname.match(rule.match);
          if (!match || (rule.when && !rule.when(url))) continue;
          const destination = new URL(rule.to(match, url), url.origin).href;
          if (destination !== url.href) return destination;
        }
        return null;
      }

      redirectIfNeeded() {
        if (this.redirecting) return true;
        if (!this.enabled) return false;
        const target = this.resolveRedirect(this.env.href());
        if (!target) return false;
        // Replace, so the Back button skips the Short instead of bouncing into it.
        this.redirect(target, { replace: true });
        return true;
      }

      redirect(target, { replace }) {
        this.redirecting = true;
        this.setCloak(true);
        pauseMedia();
        this.pendingCount += 1;
        // Record the block before leaving, but never hold the user up for it.
        Promise.race([this.flushCount(), delay(MAX_REDIRECT_WAIT_MS)]).then(() =>
          this.env.navigate(target, replace)
        );
      }

      /* ---------------- Navigation ---------------- */

      listenForNavigation() {
        const onNavigate = () => this.onNavigate();
        window.addEventListener('shortstop:navigate', onNavigate); // From nav-hook.js (page world).
        window.addEventListener('popstate', onNavigate);
        for (const name of asList(this.config.navigationEvents)) {
          document.addEventListener(name, onNavigate);
        }
        setInterval(() => {
          if (this.env.href() !== this.lastHref) onNavigate();
        }, URL_POLL_MS);
        // Capture phase on window runs before the site's own click handlers.
        window.addEventListener('click', (event) => this.onClick(event), true);
      }

      onNavigate() {
        this.lastHref = this.env.href();
        if (!this.enabled || this.redirectIfNeeded()) return;
        this.updatePage();
        this.scheduleScan();
      }

      // Stops a click on a Short/Reel link before the SPA router starts playing it.
      onClick(event) {
        if (!this.enabled || this.redirecting || event.defaultPrevented) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return; // New-tab clicks are handled by the content script in that tab.
        }
        const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
        if (!link) return;
        const target = this.resolveRedirect(link.href);
        if (!target) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (target === this.env.href()) {
          this.addCount(1); // Destination is this page: just swallow the click.
          return;
        }
        this.redirect(target, { replace: false }); // A real click keeps Back working.
      }

      /* ---------------- Scanning ---------------- */

      onMutations() {
        if (this.env.href() !== this.lastHref) this.onNavigate();
        else this.scheduleScan();
      }

      scheduleScan() {
        if (this.scanTimer || !this.enabled) return;
        this.scanTimer = setTimeout(() => {
          this.scanTimer = 0;
          this.scan();
        }, SCAN_THROTTLE_MS);
      }

      query(rule) {
        try {
          return document.querySelectorAll(rule.selector);
        } catch (error) {
          if (!this.warnedRules.has(rule.index)) {
            this.warnedRules.add(rule.index);
            console.warn(`[ShortStop] Invalid selector in rule "${rule.name}":`, rule.selector);
          }
          return [];
        }
      }

      appliesOnPage(rule) {
        const pages = asList(rule.page);
        return pages.length === 0 || pages.includes(this.page);
      }

      stillMatches(element, rule) {
        if (!this.appliesOnPage(rule)) return false;
        try {
          const selectorOk = rule.closest
            ? element.matches(rule.selector) || element.querySelector(rule.selector) !== null
            : element.matches(rule.selector);
          return selectorOk && (!rule.text || rule.text.test(element.textContent.trim()));
        } catch (error) {
          return false;
        }
      }

      scan() {
        if (!this.enabled || this.redirecting) return;
        this.injectStyle(); // Re-attach if the site replaced <head>.
        this.updatePage();

        // 1. Release elements that no longer match. YouTube reuses the same
        //    <ytd-rich-item-renderer> for different videos as you scroll.
        for (const element of document.querySelectorAll(MARKED)) {
          const index = element.getAttribute(ATTR_HIDDEN) ?? element.getAttribute(ATTR_BLURRED);
          const rule = this.rules[Number(index)];
          if (!rule || !this.stillMatches(element, rule)) unmark(element);
        }

        // 2. Mark new matches.
        let blocked = 0;
        for (const rule of this.rules) {
          if (!this.appliesOnPage(rule)) continue;
          const attribute = rule.action === 'blur' ? ATTR_BLURRED : ATTR_HIDDEN;
          for (const node of this.query(rule)) {
            const target = rule.closest ? node.closest(rule.closest) : node;
            if (!target || target.matches(MARKED)) continue;
            if (rule.text && !rule.text.test(target.textContent.trim())) continue;
            // Skip anything inside a block we already handled (no double counting).
            if (target.parentElement && target.parentElement.closest(MARKED)) continue;
            target.setAttribute(attribute, String(rule.index));
            if (rule.count) blocked += 1;
          }
        }
        if (blocked) this.addCount(blocked);
      }

      /* ---------------- Counter ---------------- */

      addCount(amount) {
        this.pendingCount += amount;
        if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flushCount(), COUNT_FLUSH_MS);
      }

      flushCount() {
        clearTimeout(this.flushTimer);
        this.flushTimer = 0;
        const amount = this.pendingCount;
        this.pendingCount = 0;
        return amount ? this.env.count(this.config.id, amount) : Promise.resolve();
      }
    }

    /* ------------------------------------------------------------------ */
    /* Public API                                                           */
    /* ------------------------------------------------------------------ */

    global.ShortStop = {
      version: '1.0.0',
      engines: [],

      // Swap the storage/navigation backend (used by the userscript and tests).
      useEnv(customEnv) {
        env = customEnv;
      },

      // Starts blocking if the current host belongs to `config.hosts`.
      start(config) {
        const environment = getEnv();
        let hostname = '';
        try {
          hostname = new URL(environment.href()).hostname;
        } catch (error) {
          return null;
        }
        const ours = config.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
        if (!ours) return null;
        const engine = new Engine(config, environment);
        this.engines.push(engine);
        whenRootReady(() => engine.boot());
        return engine;
      },
    };
  })(typeof globalThis !== 'undefined' ? globalThis : window);

  /* ---- Userscript environment: fixed settings, no storage, no counter ---- */
  ShortStop.useEnv({
    href: () => location.href,
    navigate(url, replace) {
      if (replace) location.replace(url);
      else location.assign(url);
    },
    getSettings: () => Promise.resolve(SETTINGS),
    onSettingsChanged() {},
    count: () => Promise.resolve(),
    blockedPageUrl: () => 'about:blank',
  });

  /* ======== youtube.js ======== */
  /*
   * ShortStop: YouTube
   * ==================
   * - /shorts/VIDEO_ID opens in the normal player (/watch?v=VIDEO_ID).
   * - Shorts shelves are hidden on home, search, subscriptions, channel and watch pages.
   * - The Shorts entries in the sidebar, mini sidebar, channel tabs, search filter
   *   chips and the mobile (m.youtube.com) bottom bar are removed.
   *
   * WHEN YOUTUBE CHANGES: open DevTools on the page, inspect the Shorts element
   * that slipped through, and add or adjust a rule below. See README.md.
   */
  ShortStop.start({
    id: 'youtube',
    hosts: ['youtube.com'],

    // YouTube's own SPA events (desktop, then m.youtube.com).
    navigationEvents: ['yt-navigate-finish', 'yt-page-data-updated', 'state-navigateend'],

    redirects: [
      {
        name: 'Shorts player to the regular player',
        match: /^\/shorts\/([\w-]{5,})/,
        to: (match) => `/watch?v=${match[1]}`,
      },
      {
        name: 'Bare Shorts feed to the home page',
        match: /^\/shorts\/?$/,
        to: () => '/',
      },
    ],

    rules: [
      /* ---- Shelves and sections (containers first) ---- */
      {
        name: 'Shorts shelf on search, watch and channel pages',
        selector: 'ytd-reel-shelf-renderer',
        count: true,
      },
      {
        name: 'Shorts section on the home page',
        selector: 'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
        count: true,
      },
      {
        name: 'Shorts rich shelf (outside a section)',
        selector: 'ytd-rich-shelf-renderer[is-shorts]',
        count: true,
      },
      {
        name: 'Shorts grid shelf in search (2025 layout)',
        selector:
          'grid-shelf-view-model:has(ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, a[href^="/shorts/"])',
        count: true,
      },
      {
        name: 'Mobile: Shorts section on the home page',
        selector:
          'ytm-rich-section-renderer:has(ytm-reel-shelf-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2)',
        count: true,
      },
      {
        name: 'Mobile: Shorts shelf (outside a section)',
        selector: 'ytm-reel-shelf-renderer',
        count: true,
      },

      /* ---- Individual Shorts mixed into normal video lists ---- */
      {
        name: 'Short in the home / subscriptions grid',
        selector: 'ytd-rich-item-renderer:has(a[href^="/shorts/"])',
        count: true,
      },
      {
        name: 'Short in search results',
        selector: 'ytd-video-renderer:has(a[href^="/shorts/"])',
        count: true,
      },
      {
        name: 'Short in a channel or legacy grid',
        selector: 'ytd-grid-video-renderer:has(a[href^="/shorts/"])',
        count: true,
      },
      {
        name: 'Short in watch-page suggestions',
        selector: 'ytd-compact-video-renderer:has(a[href^="/shorts/"])',
        count: true,
      },
      {
        name: 'Mobile: Short in a video list',
        selector:
          'ytm-video-with-context-renderer:has(a[href^="/shorts/"]), ytm-rich-item-renderer:has(a[href^="/shorts/"])',
        count: true,
      },
      {
        name: 'Any leftover Shorts tile',
        selector: 'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ytd-reel-item-renderer',
        count: true,
      },

      /* ---- Navigation entry points ---- */
      {
        name: 'Sidebar "Shorts" entry',
        selector:
          'ytd-guide-entry-renderer:has(a[title="Shorts"]), ytd-guide-entry-renderer:has(a[href^="/shorts"])',
      },
      {
        name: 'Mini sidebar "Shorts" entry',
        selector:
          'ytd-mini-guide-entry-renderer[aria-label="Shorts"], ytd-mini-guide-entry-renderer:has(a[title="Shorts"])',
      },
      {
        name: 'Channel page "Shorts" tab',
        selector: 'yt-tab-shape[tab-title="Shorts"], tp-yt-paper-tab:has(a[href$="/shorts"])',
      },
      {
        name: 'Search filter chip "Shorts"',
        selector: 'yt-chip-cloud-chip-renderer, chip-shape',
        text: /^Shorts$/i, // Text match needs JS, so this rule is not in the CSS.
      },
      {
        name: 'Mobile: bottom bar "Shorts" tab',
        selector: 'ytm-pivot-bar-item-renderer:has(.pivot-shorts)',
      },
    ],
  });

  /* ======== instagram.js ======== */
  /*
   * ShortStop: Instagram
   * ====================
   * - /reels/, /reel/ID and /username/reel/ID go to the home feed;
   *   /username/reels/ goes to that profile's normal grid.
   * - The Reels link (sidebar and mobile bottom bar) and profile Reels tab are hidden.
   * - Reel posts in the home feed and Reel tiles in Explore are hidden.
   * - Reels shared in DMs are blurred and made unclickable.
   *
   * Instagram's class names are generated and change often, so every selector
   * here keys off URLs, ARIA roles/labels or element names. See README.md for
   * how to update them.
   */
  ShortStop.start({
    id: 'instagram',
    hosts: ['instagram.com'],

    // Named pages, used to scope rules below (matched against location.pathname).
    pages: {
      home: /^\/$/,
      explore: /^\/explore(\/|$)/,
      direct: /^\/direct(\/|$)/,
    },

    redirects: [
      { name: 'Reels tab', match: /^\/reels(\/|$)/, to: () => '/' },
      { name: 'Single Reel', match: /^\/reel\//, to: () => '/' },
      { name: 'Profile-scoped Reel', match: /^\/[^/]+\/reel\//, to: () => '/' },
      {
        name: "A profile's Reels tab to its main grid",
        match: /^\/([^/]+)\/reels\/?$/,
        to: (match) => `/${match[1]}/`,
      },
    ],

    rules: [
      /* ---- Navigation ---- */
      {
        name: 'Reels link in the sidebar / bottom bar',
        selector: 'a[href="/reels/"], a[href^="/reels/?"]',
      },
      {
        name: 'Reels tab on profiles',
        selector: 'a[role="tab"][href$="/reels/"]',
      },

      /* ---- Home feed ---- */
      {
        name: 'Reel post in the home feed',
        selector: 'article:has(a[href*="/reel/"])',
        page: 'home',
        count: true,
      },

      /* ---- Explore ---- */
      {
        name: 'Reel tile in Explore',
        selector: 'main a[href*="/reel/"]',
        page: 'explore',
        count: true,
      },
      {
        name: 'Explore tile with the Reel badge',
        selector: 'main a:has(svg[aria-label="Clip"], svg[aria-label="Reel"])',
        page: 'explore',
        count: true,
      },

      /* ---- Direct messages: blur rather than hide, so the chat still reads ---- */
      {
        name: 'Reel link shared in a DM',
        selector: 'a[href*="/reel/"]',
        page: 'direct',
        action: 'blur',
        count: true,
      },
      {
        name: 'Reel preview card shared in a DM',
        selector: 'svg[aria-label="Clip"], svg[aria-label="Reel"]',
        closest: 'a, div[role="button"]', // Innermost clickable card around the badge.
        page: 'direct',
        action: 'blur',
        count: true,
      },
    ],
  });

  /* ======== facebook.js ======== */
  /*
   * ShortStop: Facebook
   * ===================
   * - /reel/ID and /reels/ go to the home feed; a Page's /name/reels/ tab and
   *   profile.php?sk=reels_tab go back to the Page/profile.
   * - The Reels shortcut in the navigation and the Reels tab on Pages are hidden.
   * - Feed posts and "Reels and short videos" carousels that link to Reels are hidden.
   *
   * Facebook's class names are generated per build, so selectors use URLs and
   * ARIA roles only. See README.md for how to update them.
   */
  ShortStop.start({
    id: 'facebook',
    hosts: ['facebook.com'],

    redirects: [
      { name: 'Reel viewer', match: /^\/reels?(\/|$)/, to: () => '/' },
      {
        name: "A Page's Reels tab to the Page",
        match: /^\/([^/]+)\/reels\/?$/,
        to: (match) => `/${match[1]}/`,
      },
      {
        name: 'Profile Reels tab to the profile',
        match: /^\/profile\.php$/,
        when: (url) => url.searchParams.get('sk') === 'reels_tab',
        to: (match, url) => `/profile.php?id=${encodeURIComponent(url.searchParams.get('id') || '')}`,
      },
    ],

    rules: [
      /* ---- Navigation ---- */
      {
        name: 'Reels shortcut in the navigation (whole list item)',
        selector: 'div[role="navigation"] li:has(a[href*="/reel/"])',
      },
      {
        name: 'Reels shortcut in the navigation (bare link)',
        selector: 'div[role="navigation"] a[href*="/reel/"]',
      },
      {
        name: 'Reels tab on Pages and profiles',
        selector: 'a[role="tab"][href*="/reels"], a[role="tab"][href*="sk=reels_tab"]',
      },

      /* ---- Feed ---- */
      {
        name: 'Feed post or carousel containing Reels',
        selector: 'div[role="feed"] > div:has(a[href*="/reel/"])',
        count: true,
      },
      {
        name: 'Reels carousel outside the main feed (English label)',
        selector: 'div[aria-label="Reels"], div[aria-label="Reels and short videos"]',
        count: true,
      },

      /* ---- Anything else that links to a Reel (search, Watch, profiles) ---- */
      {
        name: 'Leftover Reel link',
        selector: 'a[href*="/reel/"]',
      },
    ],
  });
})();
