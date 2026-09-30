/*
 * ShortStop: content category filter
 * ==================================
 * The page half of "Content preferences" (the categories and the classifier
 * are in shared/categories.js). A platform turns it on by adding a
 * `categories` object to its config; the engine (core.js) then hands it every
 * settings change and runs it after each scan, so it adds no observer of its
 * own and only looks at cards it has not sorted yet.
 *
 * For each video card in a filtered area it guesses the category, then:
 *   allow   leaves the card alone;
 *   reduce  hides two in three of that category's cards in recommendations
 *           (always the same ones, picked from the video id);
 *   hide    folds the card into a one-line note with "Show anyway" and a
 *           menu to correct the category.
 * Hovering (or tabbing into) a card shows a small chip with the guessed
 * category, which is also a menu to correct it. A correction applies to the
 * whole channel, is stored on this device only, and always beats the guess.
 *
 * Videos opened directly are left alone, unless the platform's `view` option
 * is on: then a video in a hidden category shows a notice first, with
 * "Watch anyway". Only a confident guess (or a correction) ever does that.
 *
 * Config shape (config.categories in a platform file):
 *   {
 *     setting: 'youtubeCategories',       // the choices, in the synced settings
 *     enabled: (options) => boolean,      // the platform option that turns it on
 *     items: 'css selector',              // video cards (the outermost match wins)
 *     skip: 'css selector',               // cards inside these are left alone (ads)
 *     areas: [{ page, within?, onlyIf?(options), reduce }], // where it filters;
 *                                         // `reduce: false` leaves reduced ones in
 *     read: (card) => ({ id, title, channel, owner?, text? }) | null, // null: not loaded yet
 *     view: { page, onlyIf(options), read: (url) => ({ ...same, genre? }) | null },
 *   }
 */
(function (global) {
  'use strict';

  if (global.ShortStopCategoryFilter) return; // Already loaded in this world.

  const ATTR_CATEGORY = 'data-shortstop-category'; // The card's guessed (or corrected) category.
  const ATTR_FILTER = 'data-shortstop-filter'; // 'reduce' or 'hide'.
  const ATTR_CHIP = 'data-shortstop-chip'; // The card the chip is on.
  const NOTE_TAG = 'shortstop-note';
  const CHIP_TAG = 'shortstop-chip';
  const VIEW_TAG = 'shortstop-view';
  const REDUCE_KEEP = 3; // "Reduce" keeps one card in three.

  const asList = (value) => (value == null ? [] : [].concat(value));

  const PAGE_CSS = `
[${ATTR_FILTER}="reduce"] { display: none !important; }
[${ATTR_FILTER}="hide"] > :not(${NOTE_TAG}) { display: none !important; }
[${ATTR_CHIP}] { position: relative !important; }`;

  // The ShortStop mark, small, for the chip and the note.
  function mark(size) {
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('aria-hidden', 'true');
    for (const [tag, attributes] of [
      ['polygon', { points: '29.3,0 70.7,0 100,29.3 100,70.7 70.7,100 29.3,100 0,70.7 0,29.3', fill: '#d62839' }],
      ['rect', { x: 34, y: 22, width: 32, height: 56, rx: 7, fill: '#fff' }],
      ['polygon', { points: '44,39 60,50 44,61', fill: '#d62839' }],
    ]) {
      const shape = document.createElementNS(svgNs, tag);
      for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, String(value));
      svg.appendChild(shape);
    }
    return svg;
  }

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  // Styles live in shadow roots, so the site's CSS can't restyle them. The
  // note follows the site's own light or dark theme (`theme` on its host).
  const NOTE_CSS = `
:host { all: initial; display: block; box-sizing: border-box; width: 100%;
  --text: #0f0f0f; --muted: #606060; --line: rgba(0, 0, 0, 0.2); --fill: rgba(0, 0, 0, 0.06); --fill-hover: rgba(0, 0, 0, 0.12);
  color: var(--muted); font: 400 13px/1.4 Roboto, system-ui, -apple-system, "Segoe UI", sans-serif; }
:host([theme="dark"]) { --text: #f1f1f1; --muted: #aaaaaa; --line: rgba(255, 255, 255, 0.24); --fill: rgba(255, 255, 255, 0.1); --fill-hover: rgba(255, 255, 255, 0.18); }
.note { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 8px 10px;
  border: 1px dashed var(--line); border-radius: 12px; }
svg { flex: none; }
button, select { font: 500 13px/1.2 Roboto, system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--text); }
button { padding: 5px 12px; border: 0; border-radius: 999px; background: var(--fill); cursor: pointer; }
button:hover { background: var(--fill-hover); }
select { min-width: 0; max-width: 190px; padding: 3px 4px; border: 1px solid var(--line); border-radius: 8px; background: transparent; cursor: pointer; }
option { color: #0f0f0f; background: #ffffff; }
button:focus-visible, select:focus-visible { outline: 2px solid #3ea6ff; outline-offset: 2px; }`;

  const CHIP_CSS = `
:host { all: initial; position: absolute; top: 8px; left: 8px; z-index: 5; }
label { display: inline-flex; align-items: center; gap: 5px; padding: 3px 4px 3px 7px; border-radius: 999px;
  background: rgba(15, 15, 15, 0.86); color: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  font: 500 12px/1.2 Roboto, system-ui, -apple-system, "Segoe UI", sans-serif; }
select { max-width: 170px; padding: 1px 2px; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
option { color: #0f0f0f; background: #fff; }
select:focus-visible { outline: 2px solid #6ea8ff; outline-offset: 1px; border-radius: 4px; }`;

  // The notice in front of a video opened directly (only with the stricter option).
  const VIEW_CSS = `
:host { all: initial; position: fixed; inset: 0; z-index: 2147483646; display: flex; align-items: center; justify-content: center;
  box-sizing: border-box; padding: 48px 16px; overflow-y: auto; background: #e8edf1; color: #16233a;
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.panel { width: 100%; max-width: 416px; }
.mark { display: block; margin-bottom: 20px; }
h1 { margin: 0 0 8px; font: 700 30px/1.1 "Bahnschrift", "DIN Alternate", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif; font-stretch: 75%; }
p { margin: 0 0 20px; color: #56657a; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
button { padding: 10px 16px; border: 1px solid #c9d2dc; border-radius: 8px; background: #fff; color: #16233a;
  font: 600 15px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; cursor: pointer; }
button.primary { border-color: #d62839; background: #d62839; color: #fff; }
label { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; color: #56657a; }
select { padding: 6px 8px; border: 1px solid #c9d2dc; border-radius: 8px; background: #fff; color: #16233a; font: inherit; }
button:focus-visible, select:focus-visible { outline: 2px solid #1f6feb; outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  :host { background: #111b2b; color: #e8edf1; }
  p, label { color: #9aa8bb; }
  button, select { background: #182538; border-color: #2b3b53; color: #e8edf1; }
  button.primary { background: #ff5a67; border-color: #ff5a67; color: #111b2b; }
  button:focus-visible, select:focus-visible { outline-color: #6ea8ff; }
}`;

  class CategoryFilter {
    constructor(engine, spec) {
      this.engine = engine;
      this.spec = spec;
      this.shared = global.ShortStopCategories;
      this.prefs = {};
      this.fixes = {};
      this.settingsKey = '';
      this.epoch = 0; // Bumped when anything that changes a card's fate changes.
      this.sorted = new WeakMap(); // card -> { key, info, result }
      this.revealed = new Set(); // Video ids shown anyway, for this tab.
      this.styleEl = null;
      this.chip = null; // { host, select, card }
      this.view = { host: null, id: null };
      this.listening = false;
    }

    get platform() {
      return this.engine.config.id;
    }

    /* ---------------- Settings ---------------- */

    // Every settings change, before the engine scans.
    apply(settings) {
      const prefs = this.shared.normalizePrefs(settings[this.spec.setting]);
      const fixes = this.shared.normalizeFixes((settings.categoryFixes || {})[this.platform]);
      const key = JSON.stringify([prefs, fixes, [...this.engine.allowed]]);
      if (key === this.settingsKey) return;
      this.settingsKey = key;
      this.prefs = prefs;
      this.fixes = fixes;
      this.epoch += 1;
    }

    active() {
      return this.engine.enabled && !this.engine.redirecting && Boolean(this.spec.enabled(this.engine.options));
    }

    // Where corrections are stored: the channel's name (every card shows it),
    // or the video itself when there is no name.
    fixTarget(info) {
      const name = String(info.channel || '').replace(/\s+/g, ' ').trim();
      if (name) return { key: `name:${name.toLowerCase()}`, label: name, scope: 'channel' };
      return { key: `video:${info.id}`, label: String(info.title || info.id).slice(0, 80), scope: 'video' };
    }

    resultFor(info) {
      const fix = this.fixes[this.fixTarget(info).key] || this.fixes[`video:${info.id}`];
      return fix ? this.shared.fixed(fix.category) : this.shared.classify(info);
    }

    // A correction from the chip, the note or the notice: saved on this device,
    // applied at once.
    saveFix(info, category) {
      const { key, label } = this.fixTarget(info);
      const fixes = { ...this.fixes };
      delete fixes[key]; // Re-added at the end: the newest is kept longest.
      if (category) fixes[key] = { category, label };
      this.fixes = this.shared.normalizeFixes(fixes);
      this.epoch += 1;
      const env = this.engine.env;
      if (env.saveCategoryFixes) env.saveCategoryFixes(this.platform, this.fixes);
      this.engine.scheduleScan();
    }

    /* ---------------- Scanning ---------------- */

    // The filtered area on this page, if any. Covered pages are hidden anyway.
    area() {
      if (this.engine.isCovered()) return null;
      const options = this.engine.options;
      return (
        this.spec.areas.find(
          (area) => asList(area.page).includes(this.engine.page) && (!area.onlyIf || area.onlyIf(options))
        ) || null
      );
    }

    cards(area) {
      const items = this.spec.items;
      let found;
      try {
        found = document.querySelectorAll(area.within ? `:is(${area.within}) :is(${items})` : items);
      } catch (error) {
        return [];
      }
      return Array.from(found).filter(
        (card) =>
          !(card.parentElement && card.parentElement.closest(items)) && // The outermost card only.
          !(this.spec.skip && (card.closest(this.spec.skip) || card.querySelector(this.spec.skip))) && // Ads.
          !card.closest('[data-shortstop-hidden]') // Already hidden by a rule (e.g. a Short).
      );
    }

    // After every engine scan (so on every navigation and DOM change).
    scan() {
      if (!this.active()) {
        this.clear();
        return;
      }
      this.injectStyle();
      this.listen();
      const area = this.area();
      const current = new Set(area ? this.cards(area) : []);
      for (const card of current) this.sort(card, area);
      // Cards that left the filtered area (another page, an option switched off).
      for (const card of document.querySelectorAll(`[${ATTR_CATEGORY}]`)) {
        if (!current.has(card)) this.unmark(card);
      }
      this.updateView();
    }

    sort(card, area) {
      const info = this.spec.read(card);
      if (!info || !info.id || !info.title) return; // Not rendered yet: the next scan.
      const key = `${this.epoch}|${info.id}|${info.title}|${info.channel || ''}`;
      const previous = this.sorted.get(card);
      if (previous && previous.key === key) return;
      const result = this.resultFor(info);
      this.sorted.set(card, { key, info, result });

      let mode = this.shared.decide(result, this.prefs);
      if (info.owner && this.engine.allowed.has(info.owner)) mode = 'allow'; // An allowed channel.
      if (this.revealed.has(info.id)) mode = 'allow';
      // Reduce keeps one card in three, and only in recommendations.
      if (mode === 'reduce' && (!area.reduce || this.shared.bucket(info.id, REDUCE_KEEP) === 0)) mode = 'allow';

      card.setAttribute(ATTR_CATEGORY, result.category);
      if (mode === 'allow') {
        card.removeAttribute(ATTR_FILTER);
        this.removeNote(card);
      } else {
        card.setAttribute(ATTR_FILTER, mode);
        if (mode === 'hide') this.showNote(card, info, result);
        else this.removeNote(card);
      }
      if (this.chip && this.chip.card === card) this.renderChip();
    }

    unmark(card) {
      card.removeAttribute(ATTR_CATEGORY);
      card.removeAttribute(ATTR_FILTER);
      this.sorted.delete(card);
      this.removeNote(card);
      if (this.chip && this.chip.card === card) this.detachChip();
    }

    clear() {
      for (const card of document.querySelectorAll(`[${ATTR_CATEGORY}], [${ATTR_FILTER}]`)) this.unmark(card);
      this.detachChip();
      this.hideView();
      if (this.styleEl) {
        this.styleEl.remove();
        this.styleEl = null;
      }
    }

    injectStyle() {
      if (this.styleEl && this.styleEl.isConnected) return;
      if (!this.styleEl) {
        this.styleEl = document.createElement('style');
        this.styleEl.id = `shortstop-categories-${this.platform}`;
        this.styleEl.textContent = PAGE_CSS;
      }
      (document.head || document.documentElement).appendChild(this.styleEl);
    }

    /* ---------------- The correction menu ---------------- */

    // A <select> of every category, set to the current one. Picking one saves
    // a correction; "Use ShortStop's guess" removes it.
    categoryMenu(info, result, label) {
      const select = make('select');
      select.setAttribute('aria-label', label);
      const { key } = this.fixTarget(info);
      for (const category of this.shared.CATEGORIES) {
        const option = make('option', null, category.label);
        option.value = category.id;
        option.selected = category.id === result.category;
        select.append(option);
      }
      if (this.fixes[key]) {
        const reset = make('option', null, "Use ShortStop's guess");
        reset.value = '';
        select.append(reset);
      }
      select.addEventListener('change', () => this.saveFix(info, select.value));
      // Keep the site's own handlers (e.g. opening the video) out of it.
      for (const type of ['click', 'mousedown', 'pointerdown', 'keydown']) {
        select.addEventListener(type, (event) => event.stopPropagation());
      }
      return select;
    }

    /* ---------------- Hidden cards: a note ---------------- */

    showNote(card, info, result) {
      let note = card.querySelector(`:scope > ${NOTE_TAG}`);
      if (!note) {
        note = document.createElement(NOTE_TAG);
        note.attachShadow({ mode: 'open' });
        card.prepend(note);
      }
      // YouTube's dark theme is an attribute on <html>, not the system setting.
      note.setAttribute('theme', document.documentElement.hasAttribute('dark') ? 'dark' : 'light');
      const label = this.shared.LABELS[result.category];
      const shadow = note.shadowRoot;
      // One short line, to fit a narrow column: "Hidden [Gaming v] Show anyway".
      // The menu names the category and is also where it is corrected.
      const box = make('div', 'note');
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', `${label} video hidden by ShortStop`);
      const menu = this.categoryMenu(info, result, `Hidden as ${label}. Wrong category? Choose the right one for ${this.fixTarget(info).label}`);
      menu.title = 'Wrong category? Choose the right one.';
      const show = make('button', null, 'Show anyway');
      show.type = 'button';
      show.addEventListener('click', (event) => {
        event.stopPropagation();
        this.reveal(card, info);
      });
      box.append(mark(16), make('span', null, 'Hidden'), menu, show);
      const style = make('style');
      style.textContent = NOTE_CSS;
      shadow.replaceChildren(style, box);
    }

    removeNote(card) {
      const note = card.querySelector(`:scope > ${NOTE_TAG}`);
      if (note) note.remove();
    }

    // "Show anyway": this video, for the rest of this tab's life.
    reveal(card, info) {
      this.revealed.add(info.id);
      card.removeAttribute(ATTR_FILTER);
      this.removeNote(card);
      const link = card.querySelector('a[href]');
      if (link) link.focus({ preventScroll: true });
    }

    /* ---------------- Visible cards: the chip ---------------- */

    listen() {
      if (this.listening) return;
      this.listening = true;
      const onEnter = (event) => this.onEnter(event);
      document.addEventListener('mouseover', onEnter, { passive: true });
      document.addEventListener('focusin', onEnter);
      // A hidden video must not play behind the notice.
      document.addEventListener(
        'play',
        (event) => {
          if (this.view.host && this.view.host.isConnected && event.target instanceof HTMLMediaElement) event.target.pause();
        },
        true
      );
    }

    onEnter(event) {
      if (!this.active()) return;
      const target = event.target instanceof Element ? event.target : null;
      const card = target ? target.closest(`[${ATTR_CATEGORY}]`) : null;
      if (this.chip && card === this.chip.card) return;
      // Leave the chip alone while its menu is in use.
      if (this.chip && this.chip.host.shadowRoot.activeElement) return;
      this.detachChip();
      if (card && !card.hasAttribute(ATTR_FILTER) && this.sorted.has(card)) this.attachChip(card);
    }

    attachChip(card) {
      if (!this.chip) {
        const host = document.createElement(CHIP_TAG);
        host.attachShadow({ mode: 'open' });
        this.chip = { host, card: null };
      }
      this.chip.card = card;
      card.setAttribute(ATTR_CHIP, '');
      this.renderChip();
      card.append(this.chip.host);
    }

    renderChip() {
      const { host, card } = this.chip;
      const entry = this.sorted.get(card);
      if (!entry) return;
      const label = make('label');
      label.title = "ShortStop's guess at this video's category. Change it to correct it for the whole channel.";
      label.append(mark(12), this.categoryMenu(entry.info, entry.result, `ShortStop category for ${this.fixTarget(entry.info).label}`));
      const style = make('style');
      style.textContent = CHIP_CSS;
      host.shadowRoot.replaceChildren(style, label);
    }

    detachChip() {
      if (!this.chip || !this.chip.card) return;
      this.chip.card.removeAttribute(ATTR_CHIP);
      this.chip.host.remove();
      this.chip.card = null;
    }

    /* ---------------- Videos opened directly (stricter option) ---------------- */

    updateView() {
      const found = this.viewToCheck();
      if (!found) {
        this.hideView();
        return;
      }
      if (this.view.id === found.info.id && this.view.host && this.view.host.isConnected) return;
      this.showView(found.info, found.result);
    }

    // The video on this page, if it is in a hidden category and the option is on.
    viewToCheck() {
      const view = this.spec.view;
      const engine = this.engine;
      if (!view || !asList(view.page).includes(engine.page)) return null;
      if ((view.onlyIf && !view.onlyIf(engine.options)) || engine.viewAllowed || engine.isCovered()) return null;
      let url;
      try {
        url = new URL(engine.env.href());
      } catch (error) {
        return null;
      }
      const info = view.read(url);
      if (!info || !info.id || this.revealed.has(info.id)) return null;
      if (info.owner && engine.allowed.has(info.owner)) return null;
      const result = this.resultFor(info);
      // Only a real guess (or a correction) ever stands between someone and a video.
      if (!result.confident || this.shared.decide(result, this.prefs) !== 'hide') return null;
      return { info, result };
    }

    showView(info, result) {
      if (!this.view.host) {
        this.view.host = document.createElement(VIEW_TAG);
        this.view.host.attachShadow({ mode: 'open' });
      }
      const host = this.view.host;
      this.view.id = info.id;
      const label = this.shared.LABELS[result.category];
      const panel = make('div', 'panel');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', 'shortstop-view-title');
      const icon = mark(48);
      icon.setAttribute('class', 'mark');
      const article = /^[aeiou]/i.test(label) ? 'an' : 'a';
      const title = make('h1', null, `This looks like ${article} ${label} video.`);
      title.id = 'shortstop-view-title';
      const message = make(
        'p',
        null,
        `You chose to hide ${label} on YouTube. ShortStop guesses from the title, channel and description, so it can be wrong.`
      );
      const watch = make('button', 'primary', 'Watch anyway');
      watch.type = 'button';
      watch.addEventListener('click', () => {
        this.revealed.add(info.id);
        this.hideView();
      });
      const back = make('button', null, 'Go back');
      back.type = 'button';
      back.addEventListener('click', () => {
        if (global.history.length > 1) global.history.back();
        else this.engine.env.navigate(new URL('/', this.engine.env.href()).href, false);
      });
      const actions = make('div', 'actions');
      actions.append(watch, back);
      const scope = this.fixTarget(info).scope;
      const fix = make('label', null, `Wrong category? This ${scope} is:`);
      fix.append(this.categoryMenu(info, result, `Category for ${this.fixTarget(info).label}`));
      panel.append(icon, title, message, actions, fix);
      const style = make('style');
      style.textContent = VIEW_CSS;
      host.shadowRoot.replaceChildren(style, panel);
      if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
      for (const media of document.querySelectorAll('video, audio')) {
        try {
          media.pause();
        } catch (error) {
          /* Media we can't control. */
        }
      }
      watch.focus({ preventScroll: true });
    }

    hideView() {
      if (this.view.host) this.view.host.remove();
      this.view.id = null;
    }
  }

  global.ShortStopCategoryFilter = CategoryFilter;
})(typeof globalThis !== 'undefined' ? globalThis : window);
