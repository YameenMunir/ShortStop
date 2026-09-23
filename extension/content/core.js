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
 *   4. Whole routes (e.g. Instagram's Home feed) can be "covered": the page's
 *      content area is hidden from the first paint and replaced by a ShortStop
 *      panel, re-applied whenever the route or the DOM changes.
 *   5. Settings changes apply live, without reloading the tab.
 *
 * Config shape (see the platform files for real examples):
 *   {
 *     id: 'youtube',                        // key in the settings object
 *     hosts: ['youtube.com'],               // hostnames (subdomains included)
 *     blockSite: false,                     // true = send every page to the blocked page
 *     navigationEvents: ['yt-navigate-finish'], // extra SPA events fired on document
 *     pages: { explore: /^\/explore\// },   // named pathname patterns, first match wins
 *     options: {                            // extra switches stored in settings
 *       notifications: { setting: 'instagramNotifications', default: false },
 *     },
 *     redirects: [{ name, match: /regex on pathname/, when?(url), to(match, url) }],
 *     cover: {                              // replace whole pages with a ShortStop panel
 *       target: 'main',                     // the content area to hide
 *       message: 'Shown on every covered page',
 *       pages: { home: { title, message?, onlyIf?(options) } },
 *       links: (options) => [{ label, href }],
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
@media (prefers-color-scheme: dark) {
  :host { background: #111b2b; color: #e8edf1; }
  p { color: #9aa8bb; }
  a { background: #182538; border-color: #2b3b53; color: #e8edf1; }
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
    panel.append(
      mark,
      make('h1', 'title'),
      make('p', 'message'),
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

      // A URL we are about to redirect (or a fully blocked site) stays invisible
      // until settings arrive, so Shorts never paint for a split second.
      if (config.blockSite || this.resolveRedirect(this.lastHref)) this.setCloak(true);

      if (!config.blockSite) {
        this.updatePage();
        this.injectStyle();
        this.listenForNavigation();
      }

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
        for (const page of Object.keys(cover.pages)) {
          if (!this.coverSpec(page)) continue;
          blocks.push(
            `/* Covered page: ${page} */\nhtml[${ATTR_PAGE}="${page}"] ${cover.target} { display: none !important; }`
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

      const target = document.querySelector(this.config.cover.target);
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

    renderCover(spec) {
      const cover = this.config.cover;
      const shadow = this.cover.host.shadowRoot;
      shadow.querySelector('.title').textContent = spec.title;
      shadow.querySelector('.message').textContent = spec.message || cover.message || '';
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
