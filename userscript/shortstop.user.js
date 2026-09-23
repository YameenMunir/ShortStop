// ==UserScript==
// @name         ShortStop: Shorts & Reels Blocker
// @namespace    https://github.com/YOUR_GITHUB_USERNAME/shortstop
// @version      1.0.0
// @description  Blocks YouTube Shorts, Facebook Reels, and the scrolling feeds on Instagram and TikTok, while keeping search, messages and profiles usable. No tracking.
// @author       Yameen Munir
// @license      MIT
// @match        *://www.youtube.com/*
// @match        *://m.youtube.com/*
// @match        *://www.instagram.com/*
// @match        *://www.facebook.com/*
// @match        *://web.facebook.com/*
// @match        *://m.facebook.com/*
// @match        *://*.tiktok.com/*
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
/* Instagram blocks the Home feed, Explore, Reels and Stories.      */
/* Set this to true to keep Instagram notifications reachable.      */
const ALLOW_INSTAGRAM_NOTIFICATIONS = false;
/* TikTok blocks For You, Following, Friends, LIVE and Explore.     */
const BLOCK_TIKTOK_FEEDS = true;
const ALLOW_TIKTOK_NOTIFICATIONS = false;
/* ================================================================ */

(function () {
  'use strict';

  const SETTINGS = {
    youtube: BLOCK_YOUTUBE_SHORTS,
    instagram: BLOCK_INSTAGRAM_REELS,
    facebook: BLOCK_FACEBOOK_REELS,
    instagramNotifications: ALLOW_INSTAGRAM_NOTIFICATIONS,
    tiktok: BLOCK_TIKTOK_FEEDS,
    tiktokNotifications: ALLOW_TIKTOK_NOTIFICATIONS,
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
   *   4. Whole routes (e.g. Instagram's Home feed, TikTok's For You) can be
   *      "covered": the page's content area is hidden from the first paint and
   *      replaced by a ShortStop panel, re-applied whenever the route or the DOM
   *      changes. On covered routes, scroll/next-video keys are swallowed and any
   *      media that starts playing is paused at once.
   *   5. Settings changes apply live, without reloading the tab.
   *
   * Config shape (see the platform files for real examples):
   *   {
   *     id: 'youtube',                        // key in the settings object
   *     hosts: ['youtube.com'],               // hostnames (subdomains included)
   *     navigationEvents: ['yt-navigate-finish'], // extra SPA events fired on document
   *     pages: { explore: /^\/explore\// },   // named pathname patterns, first match wins
   *     options: {                            // extra switches stored in settings
   *       notifications: { setting: 'instagramNotifications', default: false },
   *     },
   *     redirects: [{ name, match: /regex on pathname/, when?(url), to(match, url) }],
   *     cover: {                              // replace whole pages with a ShortStop panel
   *       target: 'main' | ['#feed', 'main'], // the content area; first selector that exists wins
   *       title: 'Shown on every covered page',
   *       message: 'Shown on every covered page',
   *       pages: { home: { title?, message?, onlyIf?(options) } },
   *       links: (options) => [{ label, href }],
   *       search: { label, placeholder, url: (query) => '/search?q=...' }, // optional search box
   *     },
   *     rules: [{
   *       name: 'Human readable description',
   *       selector: 'css selector',           // prefer tags, href patterns, ARIA labels
   *       action: 'hide' | 'blur',            // default 'hide'
   *       page: 'explore' | ['a', 'b'],        // only apply on these named pages
   *       onlyIf: (options) => boolean,       // only apply when an option allows it
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
    const ATTR_COVER = 'data-shortstop-cover';
    const MARKED = `[${ATTR_HIDDEN}], [${ATTR_BLURRED}]`;
    const COVER_TAG = 'shortstop-cover';

    const SCAN_THROTTLE_MS = 120; // Coalesce bursts of DOM mutations into one scan.
    const COUNT_FLUSH_MS = 1500; // Batch counter updates to spare storage writes.
    const URL_POLL_MS = 1000; // Last-resort check for navigations nothing else caught.
    const MAX_REDIRECT_WAIT_MS = 300; // How long a redirect waits for the counter write.

    // Keys that scroll a page or jump to the next/previous video in a feed.
    const FEED_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'j', 'k', 'J', 'K']);

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

    // Styles for the cover panel. They live inside its shadow root, so the site's
    // CSS cannot restyle it and ours cannot leak into the site.
    const COVER_CSS = `
  :host {
    all: initial;
    box-sizing: border-box;
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 100vh;
    padding: 48px 16px;
    background: #e8edf1;
    color: #16233a;
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  :host([mode="fixed"]) {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    overflow-y: auto;
  }
  .panel { width: 100%; max-width: 26rem; }
  .mark { display: block; width: 48px; height: 48px; margin-bottom: 20px; }
  h1 {
    margin: 0 0 8px;
    font: 700 2.25rem/1 "Bahnschrift", "DIN Alternate", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif;
    font-stretch: 75%;
  }
  p { margin: 0 0 20px; color: #56657a; }
  .links { display: flex; flex-direction: column; gap: 8px; }
  a {
    display: block;
    padding: 11px 14px;
    border: 1px solid #c9d2dc;
    border-radius: 8px;
    background: #fff;
    color: #16233a;
    font-weight: 600;
    text-decoration: none;
  }
  a:hover { border-color: #16233a; }
  a:focus-visible { outline: 2px solid #1f6feb; outline-offset: 2px; }
  .foot { margin: 20px 0 0; font-size: 13px; }
  form { display: flex; gap: 8px; margin: 0 0 8px; }
  form[hidden] { display: none; }
  input {
    flex: 1;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid #c9d2dc;
    border-radius: 8px;
    background: #fff;
    color: inherit;
    font: inherit;
  }
  button {
    padding: 10px 16px;
    border: 0;
    border-radius: 8px;
    background: #d62839;
    color: #fff;
    font: 600 15px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    cursor: pointer;
  }
  input:focus-visible, button:focus-visible { outline: 2px solid #1f6feb; outline-offset: 2px; }
  @media (prefers-color-scheme: dark) {
    :host { background: #111b2b; color: #e8edf1; }
    p { color: #9aa8bb; }
    a, input { background: #182538; border-color: #2b3b53; color: #e8edf1; }
    button { background: #ff5a67; color: #111b2b; }
    a:hover { border-color: #e8edf1; }
    a:focus-visible { outline-color: #6ea8ff; }
  }`;

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

    // Builds the cover panel with DOM calls rather than innerHTML, which sites
    // enforcing Trusted Types would reject.
    function createCoverHost() {
      const host = document.createElement(COVER_TAG);
      const shadow = host.attachShadow({ mode: 'open' });
      const make = (tag, className, text) => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
      };

      const style = make('style');
      style.textContent = COVER_CSS;

      // The ShortStop mark: stop octagon around a vertical video frame.
      const svgNs = 'http://www.w3.org/2000/svg';
      const mark = document.createElementNS(svgNs, 'svg');
      mark.setAttribute('class', 'mark');
      mark.setAttribute('viewBox', '0 0 100 100');
      mark.setAttribute('aria-hidden', 'true');
      for (const [tag, attributes] of [
        ['polygon', { points: '29.3,0 70.7,0 100,29.3 100,70.7 70.7,100 29.3,100 0,70.7 0,29.3', fill: '#d62839' }],
        ['rect', { x: 34, y: 22, width: 32, height: 56, rx: 7, fill: '#fff' }],
        ['polygon', { points: '44,39 60,50 44,61', fill: '#d62839' }],
      ]) {
        const shape = document.createElementNS(svgNs, tag);
        for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, String(value));
        mark.appendChild(shape);
      }

      const panel = make('div', 'panel');
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-label', 'Blocked by ShortStop');
      const links = make('nav', 'links');
      links.setAttribute('aria-label', 'Places you can still go');

      // Optional search box (hidden unless the platform config asks for one).
      const form = make('form', 'search');
      form.setAttribute('role', 'search');
      form.hidden = true;
      const input = make('input');
      input.type = 'search';
      input.name = 'q';
      input.required = true;
      input.autocomplete = 'off';
      form.append(input, make('button', null, 'Search'));

      panel.append(
        mark,
        make('h1', 'title'),
        make('p', 'message'),
        form,
        links,
        make('p', 'foot', 'Blocked by ShortStop. You can change this in its toolbar menu.')
      );
      shadow.append(style, panel);
      return host;
    }

    /* ------------------------------------------------------------------ */
    /* Engine: one per page, driven by a platform config                    */
    /* ------------------------------------------------------------------ */

    class Engine {
      constructor(config, environment) {
        this.config = config;
        this.env = environment;
        this.rules = asList(config.rules).map((rule, index) => ({ action: 'hide', ...rule, index }));
        this.options = this.resolveOptions({});
        this.enabled = true; // Optimistic until settings load, so nothing flashes.
        this.cover = { host: null, page: null, countedHref: null, linksKey: null };
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

        // A URL we are about to redirect stays invisible until settings arrive,
        // so Shorts never paint for a split second.
        if (this.resolveRedirect(this.lastHref)) this.setCloak(true);

        this.updatePage();
        this.injectStyle();
        this.listenForNavigation();

        const apply = (settings) => this.applySettings(settings);
        environment.getSettings().then(apply);
        environment.onSettingsChanged(apply);
        window.addEventListener('pagehide', () => this.flushCount());
      }

      // Reads this platform's extra switches (config.options) from the settings.
      resolveOptions(settings) {
        const options = {};
        for (const [name, spec] of Object.entries(this.config.options || {})) {
          const value = settings[spec.setting];
          options[name] = typeof value === 'boolean' ? value : spec.default;
        }
        return options;
      }

      applySettings(settings) {
        const options = this.resolveOptions(settings);
        const changed = JSON.stringify(options) !== JSON.stringify(this.options);
        this.options = options;
        // Options can switch CSS rules and covered pages on or off.
        if (changed && this.styleEl) this.styleEl.textContent = this.buildCss();
        this.setEnabled(settings[this.config.id] !== false);
      }

      setEnabled(on) {
        this.enabled = on;
        if (on) this.activate();
        else this.deactivate();
      }

      activate() {
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
        this.removeCover();
        document.documentElement.removeAttribute(ATTR_PAGE);
      }

      /* ---------------- Styles ---------------- */

      // Turns each "hide" rule into its own CSS rule. Separate rules mean one
      // selector a browser does not understand cannot break all the others.
      buildCss() {
        const blocks = [BASE_CSS];

        // Covered pages: hide the content area from the very first paint, and
        // stop the page scrolling if the panel had to cover the whole viewport.
        const cover = this.config.cover;
        if (cover) {
          // With several candidate content areas, a later one is only hidden when
          // it does not contain an earlier one (which is where the panel goes).
          const targets = asList(cover.target);
          const hide = targets
            .map((target, i) => (i === 0 ? target : `${target}${targets.slice(0, i).map((t) => `:not(:has(${t}))`).join('')}`))
            .join(', ');
          for (const page of Object.keys(cover.pages)) {
            if (!this.coverSpec(page)) continue;
            blocks.push(
              `/* Covered page: ${page} */\nhtml[${ATTR_PAGE}="${page}"] :is(${hide}) { display: none !important; }`
            );
          }
          blocks.push(
            `html[${ATTR_COVER}="fixed"], html[${ATTR_COVER}="fixed"] body { overflow: hidden !important; }`
          );
        }

        for (const rule of this.rules) {
          // Rules that need JS (text match, ancestor lookup, blur label) are skipped.
          if (rule.action !== 'hide' || rule.closest || rule.text) continue;
          if (rule.onlyIf && !rule.onlyIf(this.options)) continue;
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

      /* ---------------- Covered pages ---------------- */

      // The cover settings for `page`, or null if that page is not covered
      // (or an option such as "allow notifications" currently uncovers it).
      coverSpec(page) {
        const cover = this.config.cover;
        const spec = cover && Object.prototype.hasOwnProperty.call(cover.pages, page) ? cover.pages[page] : null;
        if (!spec || (spec.onlyIf && !spec.onlyIf(this.options))) return null;
        return spec;
      }

      // Puts the panel in place of the content area on covered pages, and takes
      // it away everywhere else. Runs on every navigation and every scan, so if
      // the site re-renders and drops the panel, it comes straight back.
      updateCover() {
        const spec = this.enabled && !this.redirecting ? this.coverSpec(this.page) : null;
        if (!spec) {
          this.removeCover();
          return;
        }
        const state = this.cover;
        const root = document.documentElement;
        if (!state.host) state.host = createCoverHost();

        if (state.page !== this.page) {
          state.page = this.page;
          this.renderCover(spec);
        }
        // Links can depend on the page (e.g. "Your profile" is read from the
        // site's navigation, which renders after us), so refresh them each time.
        this.renderCoverLinks();

        // A covered feed must not keep playing video or audio behind the panel.
        pauseMedia();

        const target = this.coverTarget();
        if (target && target.parentElement) {
          // Normal case: sit right where the feed was, leaving the site's own
          // navigation (messages, search, profile) usable.
          if (state.host.nextElementSibling !== target) target.before(state.host);
          state.host.setAttribute('mode', 'inline');
          root.setAttribute(ATTR_COVER, 'inline');
        } else {
          // No content area (still loading, or the site changed its layout):
          // cover the whole viewport, so there is never a moment to scroll.
          // Once the content area appears, the next scan moves the panel inline.
          const parent = document.body || root;
          if (state.host.parentNode !== parent) parent.appendChild(state.host);
          state.host.setAttribute('mode', 'fixed');
          root.setAttribute(ATTR_COVER, 'fixed');
        }

        // One visit to a covered page counts once toward "blocked today".
        const href = this.env.href();
        if (state.countedHref !== href) {
          state.countedHref = href;
          this.addCount(1);
        }
      }

      // The first configured content area that exists on the page.
      coverTarget() {
        for (const selector of asList(this.config.cover.target)) {
          const element = document.querySelector(selector);
          if (element) return element;
        }
        return null;
      }

      renderCover(spec) {
        const cover = this.config.cover;
        const shadow = this.cover.host.shadowRoot;
        shadow.querySelector('.title').textContent = spec.title || cover.title || '';
        shadow.querySelector('.message').textContent = spec.message || cover.message || '';

        const form = shadow.querySelector('form');
        if (cover.search && form.hidden) {
          form.hidden = false;
          const input = form.querySelector('input');
          input.placeholder = cover.search.placeholder || '';
          input.setAttribute('aria-label', cover.search.label || 'Search');
          form.addEventListener('submit', (event) => {
            event.preventDefault();
            const query = input.value.trim();
            if (query) this.env.navigate(new URL(cover.search.url(query), this.env.href()).href, false);
          });
        }
      }

      renderCoverLinks() {
        const cover = this.config.cover;
        const wanted = asList(cover.links && cover.links(this.options)).filter((link) => link && link.href);
        const key = JSON.stringify(wanted);
        if (key === this.cover.linksKey) return; // Unchanged: leave the DOM alone.
        this.cover.linksKey = key;
        const container = this.cover.host.shadowRoot.querySelector('.links');
        container.replaceChildren();
        for (const link of wanted) {
          const anchor = document.createElement('a');
          anchor.href = link.href;
          anchor.textContent = link.label;
          container.appendChild(anchor);
        }
      }

      removeCover() {
        const state = this.cover;
        if (state.host) state.host.remove();
        state.page = null;
        state.countedHref = null;
        document.documentElement.removeAttribute(ATTR_COVER);
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

        if (this.config.cover) {
          // A hidden feed can still react to the keyboard (TikTok skips to the
          // next video on arrow keys). Swallow those keys on covered pages,
          // except while typing in a field (including the panel's search box).
          window.addEventListener(
            'keydown',
            (event) => {
              if (!this.isCovered() || !FEED_KEYS.has(event.key)) return;
              const origin = event.composedPath()[0];
              const typing =
                origin instanceof Element &&
                (origin.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(origin.tagName));
              if (typing) return;
              event.preventDefault();
              event.stopImmediatePropagation();
            },
            true
          );
          // Media events do not bubble, but they do go through the capture phase:
          // anything that starts playing behind the panel is stopped at once.
          document.addEventListener(
            'play',
            (event) => {
              if (this.isCovered() && event.target instanceof HTMLMediaElement) {
                event.target.muted = true;
                event.target.pause();
              }
            },
            true
          );
        }
      }

      isCovered() {
        return this.enabled && !this.redirecting && this.coverSpec(this.page) !== null;
      }

      onNavigate() {
        this.lastHref = this.env.href();
        if (!this.enabled || this.redirectIfNeeded()) return;
        this.updatePage();
        this.updateCover(); // Straight away, not after the scan throttle.
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

      // Whether a rule is active on the current page with the current options.
      applies(rule) {
        const pages = asList(rule.page);
        if (pages.length && !pages.includes(this.page)) return false;
        return !rule.onlyIf || rule.onlyIf(this.options);
      }

      // `text` is tested on the element the selector matched, which for
      // `closest` rules is inside the element that actually gets hidden.
      textMatches(rule, node) {
        return !rule.text || rule.text.test(node.textContent.trim());
      }

      stillMatches(element, rule) {
        if (!this.applies(rule)) return false;
        try {
          const nodes = element.matches(rule.selector) ? [element] : [];
          if (rule.closest) nodes.push(...element.querySelectorAll(rule.selector));
          return nodes.some((node) => this.textMatches(rule, node));
        } catch (error) {
          return false;
        }
      }

      scan() {
        if (!this.enabled || this.redirecting) return;
        this.injectStyle(); // Re-attach if the site replaced <head>.
        this.updatePage();
        this.updateCover(); // Re-mount the panel if the site re-rendered it away.

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
          if (!this.applies(rule)) continue;
          const attribute = rule.action === 'blur' ? ATTR_BLURRED : ATTR_HIDDEN;
          for (const node of this.query(rule)) {
            if (!this.textMatches(rule, node)) continue;
            const target = rule.closest ? node.closest(rule.closest) : node;
            if (!target || target.matches(MARKED)) continue;
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
   * ShortStop: Instagram (focus mode)
   * =================================
   * Instagram's Home feed, Explore, Reels and Stories are all built to keep you
   * scrolling, so they are treated the same: the page's content area is hidden
   * from the first paint and replaced with a ShortStop panel. There is nothing
   * left to scroll, so the Home feed is no loophole around blocking Reels.
   *
   * Still available on purpose:
   *   - Direct Messages (Reels shared in DMs are blurred and unclickable)
   *   - Searching for an account (/explore/search/, or the sidebar Search panel)
   *   - Profiles and single posts you open deliberately (minus the Reels tab
   *     and "Suggested for you" accounts)
   *   - Posting
   *   - Notifications, only if "Allow notifications" is on in the popup
   *
   * Routes are re-checked on every pushState, popstate and DOM change (see
   * core.js), so this holds up while Instagram navigates without reloading.
   *
   * Instagram's class names are generated and change often, so every selector
   * here keys off URLs, ARIA roles/labels or element names. See README.md for
   * how to update them.
   */

  // Your own profile link in Instagram's navigation (not someone's post avatar).
  function findOwnProfileHref() {
    for (const link of document.querySelectorAll('a[href^="/"]:has(img[alt*="profile picture"])')) {
      if (!link.closest('main')) return link.getAttribute('href');
    }
    return null;
  }

  ShortStop.start({
    id: 'instagram',
    hosts: ['instagram.com'],

    // Named pages (matched against location.pathname, first match wins).
    // Covered pages are listed under `cover.pages` below.
    pages: {
      home: /^\/$/,
      search: /^\/explore\/search\/?$/, // Account search only; checked before "explore".
      explore: /^\/explore(\/|$)/, // Explore grid, hashtags, places, suggested people, keyword results.
      reels: /^\/(reels?|[^/]+\/reel)(\/|$)/, // /reels/, /reel/ID, /username/reel/ID
      stories: /^\/stories(\/|$)/, // Stories and highlights viewer.
      notifications: /^\/(accounts\/activity|notifications)(\/|$)/,
      direct: /^\/direct(\/|$)/,
    },

    // Extra switches shown in the popup under Instagram.
    options: {
      notifications: { setting: 'instagramNotifications', default: false },
    },

    redirects: [
      {
        name: "A profile's Reels tab to its main grid",
        match: /^\/([^/]+)\/reels\/?$/,
        to: (match) => `/${match[1]}/`,
      },
      // Home, Explore, Reels and Stories are covered rather than redirected: a
      // redirect could loop if Instagram bounced the destination back.
    ],

    cover: {
      target: 'main', // Instagram's content area; the navigation lives outside it.
      message:
        "ShortStop has switched off Instagram's feeds, so there's nothing to scroll. " +
        'Messages, search and profiles still work.',
      pages: {
        home: { title: 'Your feed is off' },
        explore: { title: 'Explore is off' },
        reels: { title: 'Reels are off' },
        stories: { title: 'Stories are off' },
        notifications: {
          title: 'Notifications are off',
          message: 'Turn on "Allow notifications" in the ShortStop menu if you need them.',
          onlyIf: (options) => !options.notifications,
        },
      },
      links: (options) => [
        { label: 'Messages', href: '/direct/inbox/' },
        { label: 'Search for an account', href: '/explore/search/' },
        options.notifications && { label: 'Notifications', href: '/accounts/activity/' },
        { label: 'Your profile', href: findOwnProfileHref() },
      ],
    },

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
      {
        name: 'Notifications link (mobile top bar)',
        selector: 'a[href^="/accounts/activity"], a[href^="/notifications"]',
        onlyIf: (options) => !options.notifications,
      },
      {
        name: 'Notifications button (desktop sidebar opens a panel, not a page)',
        selector: 'svg[aria-label="Notifications"]',
        closest: 'a, [role="link"], [role="button"]',
        onlyIf: (options) => !options.notifications,
      },

      /* ---- Recommendations on pages that stay open ---- */
      {
        name: '"See all" suggested accounts link',
        selector: 'a[href^="/explore/people"]',
      },
      {
        name: '"Suggested for you" accounts on profiles',
        selector: 'main span, main h2, main h3, main h4, main div[role="heading"]',
        page: 'other', // Profiles and posts. Covered pages are hidden already.
        text: /^Suggested for you$/i,
        // The nearest block that holds the account cards (they have Follow
        // buttons), but never the profile header itself.
        closest: 'div:has(button):not(:has(header, h1, h2))',
        count: true,
      },
      {
        name: 'Post grid on the search page (only account results should show)',
        selector: 'main a[href*="/p/"], main a[href*="/reel/"]',
        page: 'search',
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

  /* ======== tiktok.js ======== */
  /*
   * ShortStop: TikTok (focus mode)
   * ==============================
   * Every algorithmic feed is treated the same: For You, Following, Friends,
   * LIVE, Explore and the discovery pages behind hashtags, sounds and topics.
   * On those routes the feed area is hidden from the first paint and replaced
   * with a ShortStop panel, so there is no feed to switch to as a way around the
   * block. While a feed is covered, the scroll and next-video keys are swallowed
   * and any video that tries to play is paused (see core.js).
   *
   * Still available on purpose:
   *   - Search (TikTok's own search bar, or the search box on the panel)
   *   - Direct messages
   *   - Profiles and single videos you open deliberately
   *     (without "You may like" / suggested-account recommendations)
   *   - Uploading and TikTok Studio
   *   - Your account settings
   *   - Notifications, only if "Allow notifications" is on in the popup
   *
   * Routes are re-checked on every pushState, popstate and DOM change, so this
   * holds up while TikTok navigates without reloading.
   *
   * Selectors prefer TikTok's own data-e2e attributes (they exist for TikTok's
   * automated tests and change far less than its generated class names) and
   * URL patterns. See README.md for how to update them.
   */

  // Your own profile link in TikTok's navigation, if it has rendered yet.
  // Logged out, TikTok renders it as a bare "/@", which is no use as a link.
  function findOwnTikTokProfileHref() {
    const element = document.querySelector('[data-e2e="nav-profile"]');
    const link = element && (element.closest('a[href]') || element.querySelector('a[href]'));
    const href = link && link.getAttribute('href');
    return href && /^\/@[^/?#]+/.test(href) ? href : null;
  }

  ShortStop.start({
    id: 'tiktok',
    hosts: ['tiktok.com'],

    // Named pages (matched against location.pathname, first match wins).
    // Covered pages are listed under `cover.pages` below.
    pages: {
      foryou: /^\/(?:[a-z]{2}\/?)?$|^\/foryou\/?$/, // "/", "/en/", "/foryou"
      following: /^\/following\/?$/,
      friends: /^\/friends\/?$/,
      live: /^\/(?:live(?:\/|$)|@[^/]+\/live(?:\/|$))/, // LIVE feed and individual streams.
      explore: /^\/(?:explore|discover|channel|tag|music|trending|topics?)(?:\/|$)/,
      notifications: /^\/(?:notifications|activity|inbox)(?:\/|$)/,
      video: /^\/@[^/]+\/(?:video|photo)\//, // A single video or photo post.
      search: /^\/search(?:\/|$)/,
      messages: /^\/messages(?:\/|$)/,
    },

    // Extra switches shown in the popup under TikTok.
    options: {
      notifications: { setting: 'tiktokNotifications', default: false },
    },

    cover: {
      // The feed column. TikTok names it main-content-<page>; <main> is the
      // fallback. The panel goes where the feed was, next to TikTok's sidebar.
      target: ['div[id^="main-content-"]', 'main'],
      title: 'Scrolling is blocked by your focus settings.',
      pages: {
        foryou: { message: "TikTok's For You feed is switched off." },
        following: { message: 'The Following feed is switched off.' },
        friends: { message: 'The Friends feed is switched off.' },
        live: { message: 'LIVE is switched off.' },
        explore: { message: 'Explore and discovery feeds are switched off.' },
        notifications: {
          message: 'Notifications are switched off. Turn on "Allow notifications" in the ShortStop menu if you need them.',
          onlyIf: (options) => !options.notifications,
        },
      },
      search: {
        label: 'Search TikTok',
        placeholder: 'Search for an account or video',
        url: (query) => `/search?q=${encodeURIComponent(query)}`,
      },
      links: () => [
        { label: 'Messages', href: '/messages' },
        { label: 'Upload a video', href: '/tiktokstudio/upload' },
        { label: 'Your profile', href: findOwnTikTokProfileHref() },
      ],
    },

    rules: [
      /* ---- Sidebar and top-bar links into feeds ---- */
      {
        name: 'For You link (TikTok points it at "/")',
        selector: '[data-e2e="nav-foryou"], a[href^="/foryou"]',
      },
      {
        name: 'Following link',
        selector: '[data-e2e="nav-following"], a[href="/following"], a[href^="/following?"]',
      },
      {
        name: 'Friends link',
        selector: '[data-e2e="nav-friends"], a[href="/friends"], a[href^="/friends?"]',
      },
      {
        name: 'Explore link',
        selector: '[data-e2e="nav-explore"], a[href="/explore"], a[href^="/explore?"]',
      },
      {
        name: 'LIVE link',
        selector: '[data-e2e="nav-live"], a[href="/live"], a[href^="/live?"], a[href^="/live/"]',
      },
      {
        name: 'Short drama link (a short-form series feed shown to some users)',
        selector: '[data-e2e="nav-short-drama"]',
      },
      {
        name: 'Notifications / inbox button',
        selector: '[data-e2e="inbox-icon"], [data-e2e="nav-activity"], a[href^="/notifications"]',
        onlyIf: (options) => !options.notifications,
      },

      /* ---- Recommendations on pages that stay open ---- */
      {
        name: 'Suggested accounts list',
        selector: '[data-e2e="suggest-accounts"], [data-e2e="suggested-accounts"]',
      },
      {
        name: 'Recommendation sections on profiles and videos (English headings)',
        selector: 'h2, h3, h4, p, span, div[role="heading"]',
        text: /^(You may like|Suggested accounts|Suggested for you|Recommended for you|Related videos|More videos)$/i,
        // The nearest block that holds video/profile links, but never the page's
        // main video player or the profile header.
        closest: 'div:has(a[href*="/video/"], a[href^="/@"]):not(:has(video, [data-e2e="user-page"], h1))',
        page: ['video', 'other'],
        count: true,
      },
    ],
  });
})();
