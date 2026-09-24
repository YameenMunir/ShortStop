// ==UserScript==
// @name         ShortStop: Block Shorts, Reels & Endless Feeds
// @namespace    https://github.com/YameenMunir/ShortStop
// @version      1.0.0
// @description  Blocks Shorts, Reels, Spotlight and endless feeds on YouTube, Instagram, Facebook, TikTok, Reddit, X and Snapchat, while keeping search, messages and profiles usable. No tracking.
// @author       Yameen Munir
// @license      MIT
// @match        *://www.youtube.com/*
// @match        *://m.youtube.com/*
// @match        *://www.instagram.com/*
// @match        *://www.facebook.com/*
// @match        *://web.facebook.com/*
// @match        *://m.facebook.com/*
// @match        *://*.tiktok.com/*
// @match        *://www.reddit.com/*
// @match        *://old.reddit.com/*
// @match        *://x.com/*
// @match        *://mobile.x.com/*
// @match        *://twitter.com/*
// @match        *://mobile.twitter.com/*
// @match        *://www.snapchat.com/*
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
/* true = block, false = allow. Save the file, then reload the site. */

// YouTube: Shorts open in the normal player; the home feed, Up next,
// end screens and autoplay are switched off.
const BLOCK_YOUTUBE_SHORTS = true;
// Hide YouTube Shorts: Shorts shelves, cards, the Shorts tab and /shorts/
// links. Independent of BLOCK_YOUTUBE_SHORTS above: true keeps Shorts hidden
// even when that is false. false = Shorts are left alone.
const HIDE_YOUTUBE_SHORTS = true;

// Instagram: the Home feed, Explore, Reels and Stories are blocked.
const BLOCK_INSTAGRAM_REELS = true;
const ALLOW_INSTAGRAM_NOTIFICATIONS = false;

// Facebook: the News Feed, Reels, Watch, Stories and other recommendation
// feeds are blocked. Messenger, search, profiles and groups keep working.
const BLOCK_FACEBOOK_FEEDS = true;
const ALLOW_FACEBOOK_NOTIFICATIONS = false;
const ALLOW_FACEBOOK_MARKETPLACE_SEARCH = true;

// TikTok: For You, Following, Friends, LIVE and Explore are blocked.
const BLOCK_TIKTOK_FEEDS = true;
const ALLOW_TIKTOK_NOTIFICATIONS = false;

// Reddit: the Home feed, Popular, All and Explore are blocked. Communities,
// posts, search and chat keep working.
const BLOCK_REDDIT_FEEDS = true;

// X: the Home timeline (For you and Following) and Explore are blocked.
const BLOCK_X_FEEDS = true;
const ALLOW_X_NOTIFICATIONS = false;

// Snapchat: Spotlight, Discover and Explore are blocked.
const BLOCK_SNAPCHAT_SPOTLIGHT = true;

/* ================================================================ */

(function () {
  'use strict';

  const SETTINGS = {
    youtube: BLOCK_YOUTUBE_SHORTS,
    youtubeHideShorts: HIDE_YOUTUBE_SHORTS,
    instagram: BLOCK_INSTAGRAM_REELS,
    facebook: BLOCK_FACEBOOK_FEEDS,
    facebookNotifications: ALLOW_FACEBOOK_NOTIFICATIONS,
    facebookMarketplaceSearch: ALLOW_FACEBOOK_MARKETPLACE_SEARCH,
    instagramNotifications: ALLOW_INSTAGRAM_NOTIFICATIONS,
    tiktok: BLOCK_TIKTOK_FEEDS,
    tiktokNotifications: ALLOW_TIKTOK_NOTIFICATIONS,
    reddit: BLOCK_REDDIT_FEEDS,
    x: BLOCK_X_FEEDS,
    xNotifications: ALLOW_X_NOTIFICATIONS,
    snapchat: BLOCK_SNAPCHAT_SPOTLIGHT,
  };

  /* ======== shared/schedule.js ======== */
  /*
   * ShortStop: allowed times ("focus schedule")
   * ===========================================
   * A platform can be allowed at set times, e.g. YouTube 20:00-21:00 on weekdays,
   * or Instagram all day at weekends. Shared by the content scripts (which stop
   * blocking inside an allowed time) and the popup (which edits the times).
   *
   * Stored in the synced settings as `schedules`, one list per platform:
   *
   *   schedules = {
   *     youtube: [{ days: [1, 2, 3, 4, 5], start: 1200, end: 1260 }],
   *   }
   *
   *   days    0 = Sunday ... 6 = Saturday (the day the window starts on)
   *   start   minutes after local midnight, 0-1439
   *   end     minutes after local midnight, 0-1439. end < start runs past
   *           midnight into the next day; end === start means all day.
   *
   * Times are the device's own local time, so "20:00" means 20:00 wherever the
   * browser is.
   */
  (function (global) {
    'use strict';

    const DAY = 1440; // Minutes in a day.
    const WEEK = 7 * DAY;
    const MAX_WINDOWS = 3; // Per platform, to keep the popup small.

    const isMinute = (value) => Number.isInteger(value) && value >= 0 && value < DAY;

    // Drops anything malformed, so a bad sync value can never unblock by accident.
    function normalizeWindows(list) {
      if (!Array.isArray(list)) return [];
      const windows = [];
      for (const item of list) {
        if (!item || !isMinute(item.start) || !isMinute(item.end) || !Array.isArray(item.days)) continue;
        const days = [...new Set(item.days.filter((day) => Number.isInteger(day) && day >= 0 && day < 7))].sort((a, b) => a - b);
        if (days.length) windows.push({ days, start: item.start, end: item.end });
      }
      return windows.slice(0, MAX_WINDOWS);
    }

    // A local time `dayOffset` days after `date`'s day, `minute` minutes after midnight.
    function localTime(date, dayOffset, minute) {
      const result = new Date(date.getTime());
      result.setDate(result.getDate() + dayOffset);
      result.setHours(0, minute, 0, 0);
      return result.getTime();
    }

    // When `slot` stops allowing, if it allows `date`; otherwise 0.
    function slotEnd(slot, date) {
      const day = date.getDay();
      const minute = date.getHours() * 60 + date.getMinutes();
      const startsToday = slot.days.includes(day);
      if (slot.start === slot.end) return startsToday ? localTime(date, 1, 0) : 0;
      if (slot.start < slot.end) {
        return startsToday && minute >= slot.start && minute < slot.end ? localTime(date, 0, slot.end) : 0;
      }
      // Runs past midnight: tonight's slot, or the tail of last night's.
      if (startsToday && minute >= slot.start) return localTime(date, 1, slot.end);
      const startedYesterday = slot.days.includes((day + 6) % 7);
      return startedYesterday && minute < slot.end ? localTime(date, 0, slot.end) : 0;
    }

    // Returns the time (ms) the allowed period around `date` ends, or 0 if
    // `date` is not in an allowed time. Back-to-back windows (Saturday all day,
    // then Sunday all day) count as one period.
    function allowedUntil(list, date = new Date()) {
      const windows = normalizeWindows(list);
      let until = 0;
      let at = date;
      for (let step = 0; step < 8; step += 1) {
        const ends = windows.map((slot) => slotEnd(slot, at));
        const latest = Math.max(0, ...ends);
        if (!latest) break;
        until = latest;
        at = new Date(latest);
      }
      return until;
    }

    function isAllowed(list, date = new Date()) {
      return allowedUntil(list, date) > 0;
    }

    // Every minute of the week (Sunday 00:00 = 0) that the windows allow.
    function allowedMinutes(list) {
      const minutes = new Uint8Array(WEEK);
      const mark = (from, to) => {
        for (let minute = from; minute < to; minute += 1) minutes[minute % WEEK] = 1;
      };
      for (const slot of normalizeWindows(list)) {
        for (const day of slot.days) {
          const base = day * DAY;
          if (slot.start === slot.end) mark(base, base + DAY);
          else if (slot.start < slot.end) mark(base + slot.start, base + slot.end);
          else mark(base + slot.start, base + DAY + slot.end);
        }
      }
      return minutes;
    }

    // True if `next` allows any minute that `current` does not. Loosening the
    // schedule takes the same wait as switching blocking off; tightening it is
    // instant.
    function isLooser(next, current) {
      const before = allowedMinutes(current);
      const after = allowedMinutes(next);
      return after.some((allowed, minute) => allowed && !before[minute]);
    }

    global.ShortStopSchedule = { MAX_WINDOWS, normalizeWindows, allowedUntil, isAllowed, isLooser };
  })(globalThis);

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
   *   5. Settings changes apply live, without reloading the tab. A temporary
   *      unlock ("allow 10 minutes", stored as an expiry time in `unlocks`) pauses
   *      blocking, then switches it back on by itself when the time runs out.
   *      Allowed times (`schedules`, see shared/schedule.js) pause blocking the
   *      same way, re-checked once a second. A focus session (`focusUntil`)
   *      overrides all of that: every platform blocks until it ends.
   *
   * Config shape (see the platform files for real examples):
   *   {
   *     id: 'youtube',                        // key in the settings object
   *     hosts: ['youtube.com'],               // hostnames (subdomains included)
   *     navigationEvents: ['yt-navigate-finish'], // extra SPA events fired on document
   *     pages: { explore: /^\/explore\//, feed: (url) => bool }, // pathname RegExp or URL test; first match wins
   *     options: {                            // extra switches stored in settings
   *       notifications: { setting: 'instagramNotifications', default: false },
   *       // duringFocus: the value it takes while a focus session runs
   *       hideShorts: { setting: 'youtubeHideShorts', default: true, duringFocus: true },
   *     },
   *     redirects: [{ name, match: /regex on pathname/, when?(url), onlyIf?(options), independent?, to(match, url) }],
   *     cover: {                              // replace whole pages with a ShortStop panel
   *       target: 'main' | ['#feed', 'main'], // the content area; first selector that exists wins
   *       title: 'Shown on every covered page',
   *       message: 'Shown on every covered page',
   *       pages: { home: { title?, message?, onlyIf?(options), search?, links? } }, // per-page overrides
   *       links: (options, url) => [{ label, href }],
   *       search: { label, placeholder, url: (query) => '/search?q=...' }, // optional search box;
   *                                           // a page's `search` may be null or (options) => config
   *       pauseMedia: true,                   // pause media on covered pages (default true)
   *       blockKeys: true,                    // swallow feed keys on covered pages (default true)
   *     },
   *     effects: [{                           // small actions run after every scan, e.g.
   *       name, page?, onlyIf?(options),      // switching a site's autoplay off
   *       run: () => void,
   *     }],
   *     rules: [{
   *       name: 'Human readable description',
   *       selector: 'css selector',           // prefer tags, href patterns, ARIA labels
   *       action: 'hide' | 'blur',            // default 'hide'
   *       page: 'explore' | ['a', 'b'],        // only apply on these named pages
   *       onlyIf: (options) => boolean,       // only apply when an option allows it
   *       closest: 'css selector',            // hide this ancestor of the match instead (JS only)
   *       text: /regex/,                      // only if the target's text matches (JS only)
   *       count: true,                        // counts toward "blocked today"
   *       independent: true,                  // keeps working while the platform's blocking is
   *                                           // off, paused or in an allowed time (its own option
   *                                           // switch, e.g. "Hide YouTube Shorts", decides)
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
    const MAX_TIMEOUT_MS = 2 ** 31 - 1; // Longest delay setTimeout accepts.

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
  .panel { width: 100%; max-width: 416px; } /* px, not rem: sites set their own root font size */
  .mark { display: block; width: 48px; height: 48px; margin-bottom: 20px; }
  h1 {
    margin: 0 0 8px;
    font: 700 36px/1 "Bahnschrift", "DIN Alternate", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif;
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

      // Settings (including allowed times) live in sync storage. Temporary
      // unlocks ("allow 10 minutes") and "block now" skips of an allowed time
      // live in this device's local storage and are merged in.
      function readSettings() {
        const read = (area, key) =>
          new Promise((resolve) => {
            try {
              api.storage[area].get(key, (result) => {
                void api.runtime.lastError; // Swallow errors; fall back to defaults.
                resolve((result && result[key]) || {});
              });
            } catch (error) {
              resolve({}); // Extension was reloaded: this script is orphaned.
            }
          });
        return Promise.all([read('sync', 'settings'), read('local', 'unlocks'), read('local', 'scheduleSkips')]).then(
          ([settings, unlocks, scheduleSkips]) => ({ ...settings, unlocks, scheduleSkips })
        );
      }

      return {
        href: () => location.href,
        navigate(url, replace) {
          if (replace) location.replace(url);
          else location.assign(url);
        },
        // True once the extension has been reloaded, updated or switched off:
        // this copy of the script can no longer read settings or hear changes.
        isOrphaned() {
          try {
            return !api.runtime || !api.runtime.id;
          } catch (error) {
            return true;
          }
        },
        reload: () => location.reload(),
        getSettings: readSettings,
        onSettingsChanged(callback) {
          try {
            api.storage.onChanged.addListener((changes, area) => {
              if (
                (area === 'sync' && changes.settings) ||
                (area === 'local' && (changes.unlocks || changes.scheduleSkips))
              ) {
                readSettings().then(callback);
              }
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
        this.lastSettings = {};
        this.unlock = { until: 0, timer: 0 }; // A running temporary unlock, if any.
        this.scheduleOpen = false; // Inside an allowed time when settings were last applied.
        this.focusOn = false; // A focus session was running when settings were last applied.
        this.enabled = true; // Optimistic until settings load, so nothing flashes.
        this.running = true; // Blocking on, or only the independent rules working.
        this.cover = { host: null, page: null, renderedHref: null, countedHref: null, linksKey: null };
        this.redirecting = false;
        this.reloadingForUpdate = false; // See checkOrphaned().
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
        const focus = this.focusActive(settings);
        const options = {};
        for (const [name, spec] of Object.entries(this.config.options || {})) {
          const value = settings[spec.setting];
          if (focus && spec.duringFocus !== undefined) options[name] = spec.duringFocus;
          else options[name] = typeof value === 'boolean' ? value : spec.default;
        }
        return options;
      }

      // A focus session (started from the popup, stored as `focusUntil`) blocks
      // every platform until it ends, whatever its switch, allowed times or
      // options such as "Hide YouTube Shorts" say. It cannot be ended early.
      focusActive(settings) {
        return (Number(settings.focusUntil) || 0) > Date.now();
      }

      applySettings(settings) {
        const options = this.resolveOptions(settings);
        const changed = JSON.stringify(options) !== JSON.stringify(this.options);
        this.options = options;
        // Options can switch CSS rules and covered pages on or off.
        if (changed && this.styleEl) this.styleEl.textContent = this.buildCss();
        this.lastSettings = settings;
        this.focusOn = this.focusActive(settings);
        this.setEnabled(this.isBlocking(settings));
      }

      // Blocking is on unless this platform is switched off, a temporary unlock
      // is still running, or it is inside one of its allowed times. When an
      // unlock or an allowed time ends, blocking comes back by itself in every
      // open tab (a timer for unlocks, and the once-a-second check below).
      isBlocking(settings) {
        const unlock = this.unlock;
        clearTimeout(unlock.timer);
        unlock.timer = 0;
        unlock.until = 0;
        this.scheduleOpen = this.scheduleAllows(settings);
        if (this.focusOn) return true;
        if (settings[this.config.id] === false) return false;
        const until = Number(settings.unlocks && settings.unlocks[this.config.id]) || 0;
        if (until > Date.now()) {
          unlock.until = until;
          unlock.timer = setTimeout(() => this.recheck(), Math.min(until - Date.now() + 50, MAX_TIMEOUT_MS));
          return false;
        }
        return !this.scheduleOpen;
      }

      // Whether this platform's allowed times allow it right now, unless
      // "Block now" in the popup skipped the current allowed time.
      scheduleAllows(settings) {
        const schedule = global.ShortStopSchedule;
        const windows = settings.schedules && settings.schedules[this.config.id];
        if (!schedule || !Array.isArray(windows) || !windows.length) return false;
        const skipUntil = Number(settings.scheduleSkips && settings.scheduleSkips[this.config.id]) || 0;
        return skipUntil <= Date.now() && schedule.isAllowed(windows, new Date());
      }

      // Re-applies the settings if time alone has changed the answer: an unlock
      // ran out, or an allowed time started or ended. Cheap, so it runs every
      // second (a timer can also be late after the computer sleeps).
      recheck() {
        const unlockEnded = this.unlock.until && Date.now() >= this.unlock.until;
        const focusChanged = this.focusActive(this.lastSettings) !== this.focusOn;
        if (unlockEnded || focusChanged || this.scheduleAllows(this.lastSettings) !== this.scheduleOpen) {
          this.applySettings(this.lastSettings);
        }
      }

      // `on` is the platform's own blocking. Independent rules (e.g. "Hide
      // YouTube Shorts") keep working while it is off, paused or in an allowed
      // time, as long as their own option allows them.
      setEnabled(on) {
        this.enabled = on;
        this.running = on || this.hasIndependentWork();
        if (this.running) this.activate();
        else this.deactivate();
      }

      hasIndependentWork() {
        return [...this.rules, ...asList(this.config.redirects)].some(
          (rule) => rule.independent && (!rule.onlyIf || rule.onlyIf(this.options))
        );
      }

      activate() {
        if (this.redirectIfNeeded()) return;
        this.setCloak(false);
        this.injectStyle();
        this.refreshCss(); // Full blocking and independent-only need different CSS.
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
        if (cover && this.enabled) {
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
          if (!this.enabled && !rule.independent) continue;
          if (rule.onlyIf && !rule.onlyIf(this.options)) continue;
          const pages = asList(rule.page);
          const selector = pages.length
            ? pages.map((page) => `html[${ATTR_PAGE}="${page}"] :is(${rule.selector})`).join(',\n')
            : rule.selector;
          blocks.push(`/* ${rule.name} */\n${selector} { display: none !important; }`);
        }
        return blocks.join('\n\n');
      }

      refreshCss() {
        const css = this.buildCss();
        if (this.styleEl.textContent !== css) this.styleEl.textContent = css;
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
      // A page pattern is a RegExp tested on the pathname, or a function given
      // the whole URL (for sites that put the feed choice in the query string).
      updatePage() {
        let url = null;
        try {
          url = new URL(this.env.href());
        } catch (error) {
          /* Treat as "other". */
        }
        const pages = this.config.pages || {};
        const matches = (pattern) =>
          url !== null && (typeof pattern === 'function' ? pattern(url) : pattern.test(url.pathname));
        this.page = Object.keys(pages).find((name) => matches(pages[name])) || 'other';
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

        const href = this.env.href();
        if (state.page !== this.page || state.renderedHref !== href) {
          state.page = this.page;
          state.renderedHref = href;
          this.renderCover(spec);
        }
        // Links can depend on the page (e.g. "Your profile" is read from the
        // site's navigation, which renders after us), so refresh them each time.
        this.renderCoverLinks(spec);

        // A covered feed must not keep playing video or audio behind the panel
        // (unless the platform opts out, e.g. YouTube's miniplayer keeps going).
        if (this.config.cover.pauseMedia !== false) pauseMedia();

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

        // A page can bring its own search box (e.g. Marketplace search), turn
        // the shared one off with `search: null`, or fall back to the shared one.
        const search = this.coverSearch(spec);
        const form = shadow.querySelector('form');
        const input = form.querySelector('input');
        form.hidden = !search;
        if (search) {
          input.placeholder = search.placeholder || '';
          input.setAttribute('aria-label', search.label || 'Search');
        }
        if (!form.dataset.wired) {
          form.dataset.wired = 'true';
          form.addEventListener('submit', (event) => {
            event.preventDefault();
            const current = this.coverSearch(this.coverSpec(this.page));
            const query = input.value.trim();
            if (current && query) this.env.navigate(new URL(current.url(query), this.env.href()).href, false);
          });
        }
      }

      coverSearch(spec) {
        if (!spec) return null;
        if (spec.search !== undefined) {
          return typeof spec.search === 'function' ? spec.search(this.options) : spec.search;
        }
        return this.config.cover.search || null;
      }

      // Links come from the page's own `links` or the shared ones, and are given
      // the options and the current URL (e.g. to offer "open this video only").
      renderCoverLinks(spec) {
        const cover = this.config.cover;
        const source = (spec && spec.links) || cover.links;
        let url = null;
        try {
          url = new URL(this.env.href());
        } catch (error) {
          /* Links that need the URL just get null. */
        }
        const wanted = asList(source && source(this.options, url)).filter((link) => link && link.href);
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
        state.renderedHref = null;
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
          if (!this.enabled && !rule.independent) continue;
          if (!match || (rule.when && !rule.when(url)) || (rule.onlyIf && !rule.onlyIf(this.options))) continue;
          const destination = new URL(rule.to(match, url), url.origin).href;
          if (destination !== url.href) return destination;
        }
        return null;
      }

      redirectIfNeeded() {
        if (this.redirecting) return true;
        if (!this.running) return false;
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
          this.recheck(); // Unlocks and allowed times that ran out or began.
          this.checkOrphaned();
        }, URL_POLL_MS);
        // Capture phase on window runs before the site's own click handlers.
        window.addEventListener('click', (event) => this.onClick(event), true);

        const cover = this.config.cover;
        if (cover && cover.blockKeys !== false) {
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
        }
        if (cover && cover.pauseMedia !== false) {
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

      // After the extension is reloaded or updated, this copy of the script is
      // cut off: it keeps blocking with the old settings and never hears the
      // popup again, and Chrome does not give open tabs the new copy. A page
      // showing only the ShortStop panel has nothing to lose, so it is reloaded
      // to pick up the new copy (not while typing in the panel's search box).
      // Pages with real content are left alone until they reach a covered page.
      checkOrphaned() {
        if (this.reloadingForUpdate || !this.env.isOrphaned || !this.env.isOrphaned()) return;
        if (!this.isCovered() || document.activeElement === this.cover.host) return;
        this.reloadingForUpdate = true;
        this.env.reload();
      }

      isCovered() {
        return this.enabled && !this.redirecting && this.coverSpec(this.page) !== null;
      }

      onNavigate() {
        this.lastHref = this.env.href();
        if (!this.running || this.redirectIfNeeded()) return;
        this.updatePage();
        this.updateCover(); // Straight away, not after the scan throttle.
        this.scheduleScan();
      }

      // Stops a click on a Short/Reel link before the SPA router starts playing it.
      onClick(event) {
        if (!this.running || this.redirecting || event.defaultPrevented) return;
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
        if (this.scanTimer || !this.running) return;
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
        if (!this.enabled && !rule.independent) return false;
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
        if (!this.running || this.redirecting) return;
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
        // Things inside a covered feed are hidden with it and already counted
        // as one blocked visit, so they do not count again.
        const coveredArea = this.isCovered() ? this.coverTarget() : null;
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
            if (rule.count && !(coveredArea && coveredArea.contains(target))) blocked += 1;
          }
        }
        if (blocked) this.addCount(blocked);
        this.runEffects();
      }

      // Small actions that hiding cannot do (e.g. switching autoplay off). They
      // run after every scan, so they must be cheap and safe to repeat.
      runEffects() {
        for (const effect of asList(this.config.effects)) {
          if (!this.applies(effect)) continue;
          try {
            effect.run();
          } catch (error) {
            if (!this.warnedRules.has(effect.name)) {
              this.warnedRules.add(effect.name);
              console.warn(`[ShortStop] Effect "${effect.name}" failed:`, error);
            }
          }
        }
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
   * ShortStop: YouTube (focus mode)
   * ===============================
   * Shorts (while "Hide YouTube Shorts" is on in the popup, the default):
   * - /shorts/VIDEO_ID opens in the normal player (/watch?v=VIDEO_ID).
   * - Shorts shelves are hidden on search, subscriptions, channel and watch pages.
   * - The Shorts entries in the sidebar, mini sidebar, channel tabs, search filter
   *   chips and the mobile (m.youtube.com) bottom bar are removed.
   *
   * Recommendations, the same way as the other platforms' feeds:
   * - The home page's recommended grid, Trending/Explore and Gaming are covered
   *   by the ShortStop panel (with a YouTube search box).
   * - On the watch page the "Up next" list, end-screen video walls, end cards
   *   and the autoplay countdown are hidden, and autoplay is switched off.
   * - Search results lose their "For you" / "People also watched" shelves.
   *
   * Still available on purpose: search, subscriptions, playlists (including
   * playing through them), channels, history, Watch later and any video you
   * open. The miniplayer keeps playing when you go back to the home page.
   *
   * "Hide YouTube Shorts" is its own switch. Off, Shorts are left alone and
   * everything else in this file (the covered home page, Up next, autoplay)
   * carries on. On, Shorts stay hidden even while that other blocking is
   * switched off, paused or in an allowed time.
   *
   * WHEN YOUTUBE CHANGES: open DevTools on the page, inspect the Shorts element
   * that slipped through, and add or adjust a rule below. See README.md.
   */
  // Every Shorts rule and redirect depends on the "Hide YouTube Shorts" option,
  // and only on it: they are `independent`, so they keep working while YouTube's
  // other blocking is switched off, paused or in an allowed time.
  const youtubeShortsHidden = (options) => options.hideShorts;

  ShortStop.start({
    id: 'youtube',
    hosts: ['youtube.com'],

    // YouTube's own SPA events (desktop, then m.youtube.com).
    navigationEvents: ['yt-navigate-finish', 'yt-page-data-updated', 'state-navigateend'],

    // Extra switches shown in the popup under YouTube.
    options: {
      // A focus session hides Shorts whatever this switch says.
      hideShorts: { setting: 'youtubeHideShorts', default: true, duringFocus: true },
    },

    redirects: [
      {
        name: 'Shorts player to the regular player',
        match: /^\/shorts\/([\w-]{5,})/,
        onlyIf: youtubeShortsHidden,
        independent: true,
        to: (match) => `/watch?v=${match[1]}`,
      },
      {
        name: 'Bare Shorts feed to the home page',
        match: /^\/shorts\/?$/,
        onlyIf: youtubeShortsHidden,
        independent: true,
        to: () => '/',
      },
    ],

    // Named pages (matched against location.pathname, first match wins).
    pages: {
      home: /^\/$/,
      explore: /^\/(?:feed\/(?:trending|explore)|gaming)(?:\/|$)/,
      watch: /^\/watch(?:\/|$)/,
      search: /^\/results(?:\/|$)/,
    },

    cover: {
      // Every browse page YouTube keeps in memory is hidden on covered pages;
      // the panel sits in front of them. m.youtube.com uses ytm-browse.
      target: ['ytd-browse', 'ytm-browse'],
      title: 'Scrolling is blocked by your focus settings.',
      // The miniplayer may be playing a video you chose, and its keyboard
      // controls must keep working, so do not pause media or swallow keys here.
      pauseMedia: false,
      blockKeys: false,
      pages: {
        home: { message: "YouTube's recommended videos are switched off." },
        explore: { message: 'Trending, Explore and Gaming are switched off.' },
      },
      search: {
        label: 'Search YouTube',
        placeholder: 'Search for a video or channel',
        url: (query) => `/results?search_query=${encodeURIComponent(query)}`,
      },
      links: () => [
        { label: 'Subscriptions', href: '/feed/subscriptions' },
        { label: 'Watch later', href: '/playlist?list=WL' },
        { label: 'Your playlists', href: '/feed/playlists' },
        { label: 'History', href: '/feed/history' },
      ],
    },

    // Autoplay: switch YouTube's own toggle off, and if an autoplay countdown
    // appears anyway (e.g. the toggle has not rendered yet), cancel it.
    effects: [
      {
        name: 'Switch autoplay off',
        page: 'watch',
        run: () => {
          const toggle = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
          if (toggle) (toggle.closest('button') || toggle).click();
        },
      },
      {
        name: 'Cancel the autoplay countdown',
        run: () => {
          // YouTube keeps the overlay in the page and shows it with an inline
          // style only while counting down (our CSS hides it either way).
          const overlay = document.querySelector('.ytp-autonav-endscreen-countdown-overlay');
          if (!overlay || overlay.style.display === 'none') return;
          const cancel = overlay.querySelector('.ytp-autonav-endscreen-upnext-cancel-button');
          if (cancel) cancel.click();
        },
      },
    ],

    rules: [
      /* ---- Shelves and sections (containers first) ---- */
      {
        name: 'Shorts shelf on search, watch and channel pages',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector: 'ytd-reel-shelf-renderer',
        count: true,
      },
      {
        name: 'Shorts section on the home page',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector: 'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
        count: true,
      },
      {
        name: 'Shorts rich shelf (outside a section)',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector: 'ytd-rich-shelf-renderer[is-shorts]',
        count: true,
      },
      {
        name: 'Shorts grid shelf in search (2025 layout)',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector:
          'grid-shelf-view-model:has(ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, a[href^="/shorts/"])',
        count: true,
      },
      {
        name: 'Mobile: Shorts section on the home page',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector:
          'ytm-rich-section-renderer:has(ytm-reel-shelf-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2)',
        count: true,
      },
      {
        name: 'Mobile: Shorts shelf (outside a section)',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector: 'ytm-reel-shelf-renderer',
        count: true,
      },

      /* ---- Individual Shorts mixed into normal video lists ---- */
      {
        name: 'Short in the home / subscriptions grid',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector: 'ytd-rich-item-renderer:has(a[href^="/shorts/"])',
        count: true,
      },
      {
        name: 'Short in search results',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector: 'ytd-video-renderer:has(a[href^="/shorts/"])',
        count: true,
      },
      {
        name: 'Short in a channel or legacy grid',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector: 'ytd-grid-video-renderer:has(a[href^="/shorts/"])',
        count: true,
      },
      {
        name: 'Short in watch-page suggestions',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector: 'ytd-compact-video-renderer:has(a[href^="/shorts/"])',
        count: true,
      },
      {
        name: 'Mobile: Short in a video list',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector:
          'ytm-video-with-context-renderer:has(a[href^="/shorts/"]), ytm-rich-item-renderer:has(a[href^="/shorts/"])',
        count: true,
      },
      {
        name: 'Short as a new-style lockup card',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector: 'yt-lockup-view-model:has(a[href^="/shorts/"])',
        count: true,
      },
      {
        name: 'Short marked by the SHORTS badge on its thumbnail',
        onlyIf: youtubeShortsHidden,
        independent: true,
        // Some lists link a Short as /watch?v=; the thumbnail badge still says SHORTS.
        selector:
          ':is(ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer):has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
        count: true,
      },
      {
        name: 'Any leftover Shorts tile',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector: 'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ytd-reel-item-renderer',
        count: true,
      },

      /* ---- Navigation entry points ---- */
      {
        name: 'Sidebar "Shorts" entry',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector:
          'ytd-guide-entry-renderer:has(a[title="Shorts"]), ytd-guide-entry-renderer:has(a[href^="/shorts"])',
      },
      {
        name: 'Mini sidebar "Shorts" entry',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector:
          'ytd-mini-guide-entry-renderer[aria-label="Shorts"], ytd-mini-guide-entry-renderer:has(a[title="Shorts"])',
      },
      {
        name: 'Channel page "Shorts" tab',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector: 'yt-tab-shape[tab-title="Shorts"], tp-yt-paper-tab:has(a[href$="/shorts"])',
      },
      {
        name: 'Search filter chip "Shorts"',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector: 'yt-chip-cloud-chip-renderer, chip-shape',
        text: /^Shorts$/i, // Text match needs JS, so this rule is not in the CSS.
      },
      {
        name: 'Mobile: bottom bar "Shorts" tab',
        onlyIf: youtubeShortsHidden,
        independent: true,
        selector: 'ytm-pivot-bar-item-renderer:has(.pivot-shorts)',
      },

      /* ---- Recommendations (focus mode) ---- */
      {
        name: '"Up next" recommendations beside or below the video',
        // Only the recommendations list: the playlist panel and live chat share
        // the same column and stay.
        selector: 'ytd-watch-next-secondary-results-renderer',
        count: true,
      },
      {
        name: 'Mobile: related videos under the video',
        selector:
          'ytm-item-section-renderer[section-identifier="related-items"], ytm-watch-next-secondary-results-renderer',
        count: true,
      },
      {
        name: 'End screen: video wall, end cards and autoplay countdown',
        selector: '.html5-endscreen, .ytp-ce-element, .ytp-autonav-endscreen-countdown-overlay',
      },
      {
        name: 'Paused-video "More videos" overlay',
        selector: '.ytp-pause-overlay, .ytp-pause-overlay-container',
      },
      {
        name: 'Recommendation shelves in search results (English titles)',
        selector: 'ytd-shelf-renderer #title, ytd-horizontal-card-list-renderer #title',
        text: /^(For you|People also watched|Channels new to you|From related searches|Explore more)$/i,
        closest: 'ytd-shelf-renderer, ytd-horizontal-card-list-renderer',
        page: 'search',
        count: true,
      },
      {
        name: 'Sidebar links to Trending, Explore and Gaming',
        selector:
          'ytd-guide-entry-renderer:has(a[href^="/feed/trending"], a[href^="/feed/explore"], a[href^="/gaming"])',
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
   * ShortStop: Facebook (focus mode)
   * ================================
   * Facebook stays usable as a communication and utility tool, but not as an
   * endless-scroll feed. The News Feed, Feeds, Reels, Watch, Stories, the groups
   * feed, Gaming, friend suggestions and Marketplace's recommended listings are
   * all treated the same: the content area is hidden from the first paint and
   * replaced by a ShortStop panel, so moving from one feed to another gets you
   * nowhere. While a feed is covered, feed keys (including Facebook's j/k
   * shortcuts) are swallowed and any video that starts playing is paused.
   *
   * Still available on purpose:
   *   - Messenger
   *   - Search for a person, Page, group or post
   *   - Profiles and Pages you open, including your own for posting (/me/)
   *   - Managing your Pages
   *   - A specific group you open (/groups/<id>)
   *   - Marketplace search, categories, listings, selling and inbox
   *     (search can be switched off with "Allow Marketplace search")
   *   - Notifications, only if "Allow notifications" is on in the popup
   *
   * Routes are re-checked on every pushState, popstate and DOM change, so the
   * block comes straight back whenever Facebook navigates to a feed.
   *
   * Facebook's class names are generated per build, so selectors use URLs,
   * ARIA roles and element structure. See README.md for how to update them.
   */

  // Places Facebook is still useful for, offered on every blocked page.
  const facebookUtilityLinks = (options) => [
    { label: 'Messenger', href: '/messages/' },
    { label: 'Post from your profile', href: '/me/' },
    { label: 'Your groups', href: '/groups/joins/' },
    { label: 'Pages you manage', href: '/pages/?category=your_pages' },
    options.notifications && { label: 'Notifications', href: '/notifications/' },
  ];

  const marketplaceSearch = {
    label: 'Search Marketplace',
    placeholder: 'Search for a specific item',
    url: (query) => `/marketplace/search/?query=${encodeURIComponent(query)}`,
  };

  const marketplaceLinks = () => [
    { label: 'Your listings', href: '/marketplace/you/selling/' },
    { label: 'Marketplace inbox', href: '/marketplace/inbox/' },
    { label: 'Messenger', href: '/messages/' },
  ];

  ShortStop.start({
    id: 'facebook',
    hosts: ['facebook.com'],

    // Named pages, first match wins. Covered pages are listed under `cover.pages`.
    pages: {
      // "/" also carries the Feeds filters (?filter=friends, ?sk=h_chr, ...).
      home: /^\/(?:home\.php)?$/,
      feeds: /^\/feeds?(?:\/|$)/,
      reels: /^\/reels?(?:\/|$)/,
      watch: /^\/watch(?:\/|$)/,
      stories: /^\/stories(?:\/|$)/,
      groupsfeed: /^\/groups\/?(?:(?:feed|discover)(?:\/.*)?)?$/, // Not a specific group.
      gaming: /^\/gaming(?:\/|$)/,
      friendsuggestions: /^\/friends\/suggestions(?:\/|$)/,
      // Marketplace, most specific first: tools, then searches/categories, then browsing.
      marketplacetools: /^\/marketplace\/(?:item|you|create|inbox|notifications|saved|profile|selling|buying)(?:\/|$)/,
      marketplacesearch: /^\/marketplace\/(?:[^/]+\/)?(?:search|category)(?:\/|$)|^\/marketplace\/[^/]+\/[^/]+/,
      marketplace: /^\/marketplace(?:\/[^/]+)?\/?$/, // Home, or a city's recommended listings.
      notifications: /^\/notifications(?:\/|$)/,
      messages: /^\/messages(?:\/|$)/,
      search: /^\/search(?:\/|$)/,
      group: /^\/groups\/[^/]+/,
    },

    // Extra switches shown in the popup under Facebook.
    options: {
      notifications: { setting: 'facebookNotifications', default: false },
      marketplaceSearch: { setting: 'facebookMarketplaceSearch', default: true },
    },

    redirects: [
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
      // Feeds themselves are covered rather than redirected: a redirect could
      // loop if Facebook bounced the destination back.
    ],

    cover: {
      // Facebook's centre column. The top bar, left menu and chat sidebar stay.
      target: ['div[role="main"]', 'main'],
      title: 'Scrolling is blocked by your focus settings.',
      search: {
        label: 'Search Facebook',
        placeholder: 'Search for a person, Page, group or post',
        url: (query) => `/search/top/?q=${encodeURIComponent(query)}`,
      },
      links: facebookUtilityLinks,
      pages: {
        home: { message: 'Your News Feed is switched off.' },
        feeds: { message: 'Feeds are switched off.' },
        reels: { message: 'Reels are switched off.' },
        watch: {
          message: 'Watch and video feeds are switched off.',
          // A video someone sent you can still be opened on its own.
          links: (options, url) => {
            const video = url && url.searchParams.get('v');
            return [
              video && { label: 'Open this video only', href: `/video.php?v=${encodeURIComponent(video)}` },
              ...facebookUtilityLinks(options),
            ];
          },
        },
        stories: { message: 'Stories are switched off.' },
        groupsfeed: {
          message: 'The groups feed is switched off. Open a specific group from Your groups.',
        },
        gaming: { message: 'Gaming videos are switched off.' },
        friendsuggestions: {
          message: 'Friend suggestions are switched off.',
          links: (options) => [{ label: 'Friend requests', href: '/friends/requests/' }, ...facebookUtilityLinks(options)],
        },
        marketplace: {
          message: "Marketplace's recommended listings are switched off.",
          search: (options) => (options.marketplaceSearch ? marketplaceSearch : null),
          links: marketplaceLinks,
        },
        marketplacesearch: {
          message: 'Marketplace search is switched off. Turn on "Allow Marketplace search" in the ShortStop menu to use it.',
          onlyIf: (options) => !options.marketplaceSearch,
          search: null,
          links: marketplaceLinks,
        },
        notifications: {
          message: 'Notifications are switched off. Turn on "Allow notifications" in the ShortStop menu if you need them.',
          onlyIf: (options) => !options.notifications,
        },
      },
    },

    rules: [
      /* ---- Menu and top-bar shortcuts into feeds ---- */
      {
        name: 'Feed shortcut in the left menu (whole list item)',
        selector:
          'div[role="navigation"] li:has(a[href*="/reel/"], a[href*="/watch"], a[href*="/gaming"], a[href*="sk=h_chr"], a[href*="/feeds"])',
      },
      {
        name: 'Feed shortcut in the menus or top bar (bare link)',
        selector:
          ':is(div[role="navigation"], div[role="banner"]) :is(a[href*="/reel/"], a[href*="/watch"], a[href*="/gaming"], a[href*="sk=h_chr"], a[href*="/feeds"])',
      },
      {
        name: 'Reels tab on Pages and profiles',
        selector: 'a[role="tab"][href*="/reels"], a[role="tab"][href*="sk=reels_tab"]',
      },
      {
        name: 'Notifications bell and link',
        selector: 'div[role="banner"] :is(a[href*="/notifications"], [aria-label^="Notifications"])',
        onlyIf: (options) => !options.notifications,
      },

      /* ---- Recommendations inside pages that stay open (profiles, groups, search) ---- */
      {
        name: 'Stories tray',
        selector: '[data-pagelet^="Stories"], div[aria-label="Stories"]',
        count: true,
      },
      {
        name: 'Feed post or carousel containing Reels',
        selector: 'div[role="feed"] > div:has(a[href*="/reel/"])',
        count: true,
      },
      {
        name: 'Reels carousel outside a feed (English label)',
        selector: 'div[aria-label="Reels"], div[aria-label="Reels and short videos"]',
        count: true,
      },
      {
        name: 'Suggested posts, people, groups and Pages (English headings)',
        selector: 'div[role="feed"] span, [role="heading"], h2, h3',
        text: /^(Suggested for you|People you may know|Suggested groups|Suggested Pages|Pages you may like|Groups you may like|Reels and short videos)$/i,
        closest: 'div[role="feed"] > div, [role="article"], [data-pagelet*="FeedUnit"]',
        count: true,
      },
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
   * LIVE, Explore, Short dramas and the discovery pages behind hashtags, sounds
   * and topics.
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
      // Catalog and episodes (/shortdrama/episode/<series>/<n>): episodes play on through a series.
      shortdrama: /^\/shortdrama(?:\/|$)/,
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
        shortdrama: { message: 'Short dramas are switched off.' },
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
        selector: '[data-e2e="nav-short-drama"], a[href="/shortdrama"], a[href^="/shortdrama/"], a[href^="/shortdrama?"]',
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

  /* ======== reddit.js ======== */
  /*
   * ShortStop: Reddit (focus mode)
   * ==============================
   * Reddit's algorithmic feeds are treated like the other platforms' feeds:
   * the Home feed (every sort order), Popular, All, and Explore / topic pages.
   * On those routes the content area is hidden from the first paint and
   * replaced with a ShortStop panel, with a Reddit search box.
   *
   * Still available on purpose:
   *   - A community (subreddit) you open, like a Facebook group you open
   *   - Posts and their comments
   *   - Search, profiles, saved posts, chat and messages
   *
   * Works on www.reddit.com and old.reddit.com (same URLs, different markup),
   * so selectors key off URLs rather than either layout's class names.
   * See README.md for how to update them.
   */
  ShortStop.start({
    id: 'reddit',
    hosts: ['reddit.com'],

    // Named pages (matched against location.pathname, first match wins).
    pages: {
      home: /^\/(?:best|hot|new|top|rising)?\/?$/, // The Home feed and its sort orders.
      popular: /^\/r\/(?:popular|all)(?:\/|$)/, // r/popular and r/all, any sort.
      explore: /^\/(?:explore|t)(?:\/|$)/, // Explore and topic pages.
      search: /^\/search(?:\/|$)/,
    },

    cover: {
      // www.reddit.com's <main>; old.reddit.com's content column.
      target: ['main', 'div.content[role="main"]'],
      title: 'Scrolling is blocked by your focus settings.',
      pages: {
        home: { message: 'Your Reddit Home feed is switched off.' },
        popular: { message: 'Popular and All are switched off.' },
        explore: { message: 'Explore and topic feeds are switched off.' },
      },
      search: {
        label: 'Search Reddit',
        placeholder: 'Search for a community or post',
        url: (query) => `/search/?q=${encodeURIComponent(query)}`,
      },
      links: () => [
        { label: 'Your profile', href: '/user/me/' },
        { label: 'Saved posts', href: '/user/me/saved/' },
        { label: 'Chat', href: 'https://chat.reddit.com/' },
      ],
    },

    rules: [
      /* ---- Navigation into feeds ---- */
      {
        name: 'Popular and All links',
        // Exact paths, so communities like r/allthingsX or r/popularmemes stay.
        selector:
          'a[href="/r/popular"], a[href^="/r/popular/"], a[href^="/r/popular?"], a[href="/r/all"], a[href^="/r/all/"], a[href^="/r/all?"]',
      },
      {
        name: 'Explore link',
        selector: 'a[href="/explore"], a[href^="/explore/"]',
      },

      /* ---- Recommendations on pages that stay open (English headings) ---- */
      {
        name: 'Recommended posts and communities',
        selector: 'h2, h3, span, faceplate-tracker span',
        text: /^(More posts you may like|Related posts|Similar posts|Popular posts|Trending today|Popular communities|Recommended for you)$/i,
        closest: 'aside, section, [role="complementary"]',
        count: true,
      },
    ],
  });

  /* ======== x.js ======== */
  /*
   * ShortStop: X, formerly Twitter (focus mode)
   * ============================================
   * The Home timeline ("For you" and "Following" share /home), Explore and
   * topic timelines are treated like the other platforms' feeds: the content
   * area is hidden from the first paint and replaced with a ShortStop panel,
   * with an X search box. While a feed is covered, X's j/k and space shortcuts
   * are swallowed and any video that starts playing is paused.
   *
   * Still available on purpose:
   *   - Search results
   *   - Messages and chat
   *   - Profiles and single posts you open, bookmarks and lists
   *   - Notifications, only if "Allow notifications" is on in the popup
   *
   * Selectors prefer X's data-testid attributes (used by its own tests, so
   * they change far less than its generated class names) and URL patterns.
   * See README.md for how to update them.
   */

  // Your own profile link in X's navigation, if it has rendered yet.
  function findOwnXProfileHref() {
    const link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    const href = link && link.getAttribute('href');
    return href && /^\/[A-Za-z0-9_]+$/.test(href) ? href : null;
  }

  ShortStop.start({
    id: 'x',
    hosts: ['x.com', 'twitter.com'],

    // Named pages (matched against location.pathname, first match wins).
    pages: {
      home: /^\/home\/?$/,
      explore: /^\/(?:explore(?:\/|$)|i\/topics\/)/, // Explore, its tabs and topic timelines.
      notifications: /^\/notifications(?:\/|$)/,
      search: /^\/search(?:\/|$)/,
      messages: /^\/(?:messages|i\/chat)(?:\/|$)/,
    },

    // Extra switches shown in the popup under X.
    options: {
      notifications: { setting: 'xNotifications', default: false },
    },

    cover: {
      // X's content area (the timeline and the right-hand column); the left
      // navigation sits outside it.
      target: ['main[role="main"]', 'main'],
      title: 'Scrolling is blocked by your focus settings.',
      pages: {
        home: { message: 'Your X timeline is switched off, For you and Following both.' },
        explore: { message: 'Explore and trending are switched off.' },
        notifications: {
          message: 'Notifications are switched off. Turn on "Allow notifications" in the ShortStop menu if you need them.',
          onlyIf: (options) => !options.notifications,
        },
      },
      search: {
        label: 'Search X',
        placeholder: 'Search for a person or post',
        url: (query) => `/search?q=${encodeURIComponent(query)}&src=typed_query`,
      },
      links: (options) => [
        { label: 'Messages', href: '/messages' },
        { label: 'Bookmarks', href: '/i/bookmarks' },
        options.notifications && { label: 'Notifications', href: '/notifications' },
        { label: 'Your profile', href: findOwnXProfileHref() },
      ],
    },

    rules: [
      /* ---- Navigation into feeds ---- */
      {
        name: 'Home link in the navigation',
        selector: 'a[data-testid="AppTabBar_Home_Link"], nav a[href="/home"]',
      },
      {
        name: 'Explore link in the navigation',
        selector: 'a[data-testid="AppTabBar_Explore_Link"], nav a[href="/explore"]',
      },
      {
        name: 'Notifications link',
        selector: 'a[data-testid="AppTabBar_Notifications_Link"], nav a[href="/notifications"]',
        onlyIf: (options) => !options.notifications,
      },

      /* ---- Recommendations beside pages that stay open ---- */
      {
        name: 'Trends in the right-hand column',
        selector: '[aria-label="Timeline: Trending now"], [data-testid="sidebarColumn"] section:has([data-testid="trend"])',
      },
      {
        name: '"Who to follow" in the right-hand column',
        // Only the labelled box: "Relevant people" on a post also lists accounts, and stays.
        selector: 'aside[aria-label="Who to follow"]',
      },
      {
        name: 'Other recommendation boxes in the right-hand column (English headings)',
        selector: '[data-testid="sidebarColumn"] :is(h2, span)',
        text: /^(What's happening|Trends for you|Who to follow|You might like|Today's News|Live on X)$/i,
        closest: 'section, aside',
      },
    ],
  });

  /* ======== snapchat.js ======== */
  /*
   * ShortStop: Snapchat (focus mode)
   * ================================
   * Spotlight is Snapchat's short-video feed. It is covered like the other
   * platforms' feeds, together with the Discover and Explore pages that lead
   * into it. A single Spotlight link is covered too, because its player goes
   * straight on to the next video. While covered, feed keys are swallowed and
   * any video that starts playing is paused.
   *
   * Still available on purpose:
   *   - Snapchat for web (chat), at /web
   *   - Public profiles you open (their Spotlight links are hidden)
   *
   * See README.md for how to update the selectors.
   */
  ShortStop.start({
    id: 'snapchat',
    hosts: ['snapchat.com'],

    // Named pages (matched against location.pathname, first match wins).
    pages: {
      spotlight: /^\/(?:@[^/]+\/)?spotlight(?:\/|$)/, // The feed, single videos and a profile's Spotlight.
      discover: /^\/(?:discover|explore)(?:\/|$)/,
    },

    cover: {
      // With no content area to find, the panel covers the whole viewport.
      target: ['main'],
      title: 'Scrolling is blocked by your focus settings.',
      pages: {
        spotlight: { message: 'Spotlight is switched off.' },
        discover: { message: 'Discover and Explore are switched off.' },
      },
      links: () => [{ label: 'Chat on Snapchat for web', href: '/web' }],
    },

    rules: [
      {
        name: 'Links into Spotlight, Discover and Explore',
        selector:
          'a[href^="/spotlight"], a[href*="/spotlight/"], a[href^="/discover"], a[href^="/explore"], a[href*="snapchat.com/spotlight"]',
      },
    ],
  });
})();
