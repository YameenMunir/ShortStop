/*
 * ShortStop popup
 * ===============
 * Shows today's counter, one switch per platform, extra options such as
 * "Allow notifications", and each platform's allowed times. Everything applies
 * to open tabs immediately, with no reload, because content scripts listen for
 * storage changes.
 *
 * Each platform's switch turns off and back on in one click. The one thing
 * that waits is loosening the allowed times: adding or lengthening a time is a
 * "pending request", 30 seconds and then a confirmation within 2 minutes. It
 * keeps running if the popup is closed, because it is stored, not held in
 * memory. Shortening or removing a time is instant, and so is "Block now"
 * during an allowed time.
 *
 * Allowed accounts (YouTube, Instagram, TikTok, Snapchat): a short list of
 * channels or accounts whose own pages and items get through while the feeds
 * stay blocked. Adding one loosens blocking, so it goes through the same
 * waiting request as allowed times; removing one is instant.
 *
 * Content preferences (YouTube): an optional filter, off by default, that sorts
 * videos into categories and allows, reduces or hides each one where YouTube
 * still shows videos. Presets set every category at once. Choices are saved
 * straight away (they shape what is shown rather than switch blocking off);
 * corrections made on YouTube ("this channel is Education") are kept on this
 * device only and can be removed here.
 *
 * A focus session ("Focus session" at the top) blocks every platform for 30
 * minutes to 2 hours: switches, YouTube's choice of what to block and allowed
 * times are locked until it ends. It is stored as `focusUntil` in the synced settings
 * and cannot be ended early.
 */
'use strict';

const { PLATFORMS, todayKey, normalizeStats, totalOf } = globalThis.ShortStopStats;

// The wait for loosening allowed times lives in shared/pause.js (the welcome
// page explains it too).
const { OFF_WAIT_SECONDS, OFF_WINDOW_SECONDS } = globalThis.ShortStopPause;
const { MAX_WINDOWS, normalizeWindows, allowedUntil, isLooser } = globalThis.ShortStopSchedule;
const { MAX_ACCOUNTS, sites: ALLOW_SITES, normalizeList } = globalThis.ShortStopAllowlist;
const { CATEGORIES, PRESETS, LABELS: CATEGORY_LABELS, normalizePrefs, normalizeFixes, presetPrefs, matchingPreset } =
  globalThis.ShortStopCategories;

// Content preferences: the settings behind each platform's category filter.
const CATEGORY_SITES = {
  youtube: { setting: 'youtubeCategories', enabled: 'youtubeCategoryFilter' },
};
// Where the filter has something to do, for each choice of what YouTube blocks.
const CATEGORY_WHERE = {
  all: 'All of YouTube is blocked right now, so there is nothing to filter.',
  feeds: 'Filters search results, and Subscriptions if you like. The home feed and Up next are blocked already.',
  shorts: 'Filters the home feed, Up next and search results, and Subscriptions if you like.',
};
const CATEGORY_MODES = [
  ['allow', 'Allow'],
  ['reduce', 'Reduce'],
  ['hide', 'Hide'],
];

// What an allowed account gets through on each site (and what stays blocked).
const ALLOW_NOTES = {
  youtube: "An allowed channel's page, videos and Shorts get through. The home feed and Up next stay blocked.",
  instagram: "An allowed account's profile, Reels tab and Stories get through. The feed and Explore stay blocked.",
  tiktok: "An allowed account's profile, videos and LIVE get through. For You and the other feeds stay blocked.",
  snapchat: "An allowed account's own Spotlight gets through. The Spotlight feed stays blocked.",
};

const NAMES = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  reddit: 'Reddit',
  x: 'X',
  snapchat: 'Snapchat',
};
const numberFormat = new Intl.NumberFormat();
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
// Chrome focuses a control when the popup opens (and clicking a row's label
// focuses its switch), which draws a focus ring nobody asked for. Rings show
// only once the keyboard is in use (see popup.css).
addEventListener('keydown', () => (document.documentElement.dataset.keyboard = ''), true);
addEventListener('pointerdown', () => delete document.documentElement.dataset.keyboard, true);

const platformSwitches = Array.from(document.querySelectorAll('.switch[data-platform]'));
const optionSwitches = Array.from(document.querySelectorAll('.switch[data-setting]'));
// Choices under a platform's switch (YouTube: 'all', 'feeds' or 'shorts';
// Instagram: 'all', 'feeds' or 'reels'; TikTok: 'all' or 'feeds').
const choiceInputs = Array.from(document.querySelectorAll('input[type="radio"][data-setting]'));
// What each choice blocks, shown under the platform's name.
const CHOICE_DETAIL = {
  youtube: { all: 'All of YouTube blocked', feeds: 'Home feed, Up next and Shorts off', shorts: 'Shorts off' },
  instagram: { all: 'All of Instagram blocked', feeds: 'Feed, Explore, Reels and Stories off', reels: 'Reels off' },
  tiktok: { all: 'All of TikTok blocked', feeds: 'All feeds and LIVE off' },
};
// A focus session raises the lightest choice to 'feeds' (duringFocus in content/<platform>.js).
const FOCUS_RAISES = { shorts: 'feeds', reels: 'feeds' };

// Monday first. 5 January 2026 is a Monday.
const WEEK = [1, 2, 3, 4, 5, 6, 0].map((day) => {
  const date = new Date(2026, 0, 4 + (day === 0 ? 7 : day));
  const name = (weekday) => new Intl.DateTimeFormat(undefined, { weekday }).format(date);
  return { day, letter: name('narrow'), short: name('short'), long: name('long') };
});

/*
 * settings: sync storage (switches, options, `schedules`).
 * Local storage, this device only:
 *   pending        { platform: { kind: 'schedule', at, windows } } a waiting allowed-times change,
 *                  or { kind: 'allow', at, name } an allowed account waiting to be added
 *   scheduleSkips  { platform: time } "Block now" ignores allowed times until then
 *   categoryFixes  { platform: { key: { category, label } } } corrections made on the site
 */
const state = { settings: {}, pending: {}, scheduleSkips: {}, categoryFixes: {} };
const LOCAL_KEYS = ['pending', 'scheduleSkips', 'categoryFixes'];
// Kept by the retired pause flow ("Allow 10 minutes", "Turn off..."); removed on load.
const RETIRED_LOCAL_KEYS = ['pendingOff', 'unlocks', 'pauseLog'];
const panels = new Map(); // platform -> { panel, status, buttons }
const schedulers = new Map(); // platform -> the allowed-times controls
const allowBoxes = new Map(); // platform -> the allowed-accounts controls
const categoryBoxes = new Map(); // platform -> the content-preferences controls
const drafts = new Map(); // platform -> allowed times being edited

/* ------------------------------------------------------------------ */
/* State helpers                                                        */
/* ------------------------------------------------------------------ */

function savedWindows(platform) {
  return normalizeWindows(state.settings.schedules && state.settings.schedules[platform]);
}

// 'blocking', 'scheduled' (an allowed time) or 'off'.
function platformState(platform, now) {
  if (inFocus(now)) return { kind: 'focus' };
  if (state.settings[platform] === false) return { kind: 'off' };
  if ((Number(state.scheduleSkips[platform]) || 0) <= now) {
    const allowed = allowedUntil(savedWindows(platform), new Date(now));
    if (allowed) return { kind: 'scheduled', until: allowed };
  }
  return { kind: 'blocking' };
}

// A waiting request ('waiting' then 'ready'), or null once it has lapsed.
function pendingRequest(platform, now) {
  const request = state.pending[platform];
  const requested = request && Number(request.at);
  if (!requested) return null;
  const readyAt = requested + OFF_WAIT_SECONDS * 1000;
  if (now < readyAt) return { ...request, phase: 'waiting', readyAt };
  return now < readyAt + OFF_WINDOW_SECONDS * 1000 ? { ...request, phase: 'ready' } : null;
}

function without(object, key) {
  const copy = { ...object };
  delete copy[key];
  return copy;
}

function formatMinute(minute) {
  return timeFormat.format(new Date(2026, 0, 5, 0, minute));
}

// "until 21:00", "until Sat 01:00", "until midnight", "until the end of
// Sunday", or "all week" when the allowed times never stop.
function describeUntil(ms, now) {
  if (ms - now >= 7 * 24 * 60 * 60 * 1000) return 'all week';
  const date = new Date(ms);
  const today = todayKey(new Date(now));
  if (date.getHours() === 0 && date.getMinutes() === 0) {
    const lastDay = new Date(ms - 1);
    if (todayKey(lastDay) === today) return 'until midnight';
    return `until the end of ${new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(lastDay)}`;
  }
  const time = timeFormat.format(date);
  if (todayKey(date) === today) return `until ${time}`;
  return `until ${new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date)} ${time}`;
}

function describeDays(days) {
  const key = days.join(',');
  if (days.length === 7) return 'Every day';
  if (key === '1,2,3,4,5') return 'Weekdays';
  if (key === '0,6') return 'Weekends';
  return WEEK.filter((entry) => days.includes(entry.day))
    .map((entry) => entry.short)
    .join(', ');
}

function describeWindow(slot) {
  const time = slot.start === slot.end ? 'all day' : `${formatMinute(slot.start)}–${formatMinute(slot.end)}`;
  return `${describeDays(slot.days)}, ${time}`;
}

/* ------------------------------------------------------------------ */
/* Saving                                                               */
/* ------------------------------------------------------------------ */

function showStatus(message) {
  document.getElementById('status').textContent = message;
}

function localState() {
  return Object.fromEntries(LOCAL_KEYS.map((key) => [key, state[key]]));
}

// Shows the new state at once, then saves it. If saving fails (most likely the
// sync write quota), reload from storage so the switches tell the truth.
async function commit({ sync = false, local = false } = {}) {
  render();
  try {
    if (sync) await chrome.storage.sync.set({ settings: state.settings });
    if (local) await chrome.storage.local.set(localState());
    showStatus('');
  } catch (error) {
    showStatus('Could not save that change. Try again in a minute.');
    await load();
  }
}

/* ------------------------------------------------------------------ */
/* Actions                                                              */
/* ------------------------------------------------------------------ */

function cancel(platform) {
  state.pending = without(state.pending, platform);
  return commit({ local: true });
}

function confirmRequest(platform) {
  const request = pendingRequest(platform, Date.now());
  if (!request || request.phase !== 'ready') return Promise.resolve(); // Too early: nothing happens.
  state.pending = without(state.pending, platform);
  if (request.kind === 'allow') setAllowed(platform, [...savedAllowed(platform), request.name]);
  else setSchedule(platform, request.windows);
  return commit({ sync: true, local: true });
}

// Off in one click. A waiting change to the allowed times is left alone.
function turnOff(platform) {
  state.settings = { ...state.settings, [platform]: false };
  return commit({ sync: true });
}

// Back to blocking, from off or an allowed time. Always instant. A waiting
// change to the allowed times is left alone.
function blockAgain(platform) {
  const now = Date.now();
  const wasOff = state.settings[platform] === false;
  if (wasOff) state.settings = { ...state.settings, [platform]: true };
  let allowed = allowedUntil(savedWindows(platform), new Date(now));
  // Allowed all week: blocking now means for the rest of today, not a week.
  if (allowed - now >= 7 * 24 * 60 * 60 * 1000) {
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    allowed = midnight.getTime();
  }
  if (allowed) state.scheduleSkips = { ...state.scheduleSkips, [platform]: allowed };
  return commit({ sync: wasOff, local: true });
}

function saveOption(key, value) {
  state.settings = { ...state.settings, [key]: value };
  return commit({ sync: true });
}

function savedAllowed(platform) {
  return normalizeList(platform, state.settings[ALLOW_SITES[platform].setting]);
}

function setAllowed(platform, names) {
  state.settings = { ...state.settings, [ALLOW_SITES[platform].setting]: normalizeList(platform, names) };
}

function setSchedule(platform, windows) {
  state.settings = { ...state.settings, schedules: { ...state.settings.schedules, [platform]: windows } };
}

/* ------------------------------------------------------------------ */
/* Building the per-platform panel                                      */
/* ------------------------------------------------------------------ */

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(label, variant, action) {
  const node = element('button', `btn btn-${variant}`, label);
  node.type = 'button';
  node.dataset.action = action;
  return node;
}

// The panel under a platform's row: a waiting change to its allowed times, or
// "Block now" during an allowed time. It is built once and only updated
// afterwards, so focus stays put.
function buildPanel(platform, input) {
  const panel = element('div', 'unlock');
  panel.dataset.platform = platform;
  panel.hidden = true;
  const status = element('p', 'unlock-status');
  const buttons = {
    confirm: button('Save now', 'primary', 'confirm'),
    block: button('Block now', 'primary', 'block'),
    cancel: button('Cancel', 'quiet', 'cancel'),
  };
  const actions = element('div', 'unlock-actions');
  actions.append(...Object.values(buttons));
  panel.append(status, actions);

  buttons.confirm.addEventListener('click', () => confirmRequest(platform));
  buttons.block.addEventListener('click', () => blockAgain(platform));
  buttons.cancel.addEventListener('click', () => cancel(platform));

  input.closest('.platform-row').after(panel);
  panels.set(platform, { panel, status, buttons });
}

/* ------------------------------------------------------------------ */
/* Allowed accounts                                                     */
/* ------------------------------------------------------------------ */

// "Allowed channels" / "Allowed accounts" under a platform: the list, each with
// a remove button, and a field to add one.
function buildAllowlist(platform, item) {
  const rules = ALLOW_SITES[platform];
  const box = element('div', 'allow');
  box.dataset.platform = platform;
  const heading = `Allowed ${rules.noun}s`;
  const title = element('span', 'schedule-title', heading);
  title.id = `allow-title-${platform}`;
  const head = element('div', 'schedule-row');
  head.append(title);
  const list = element('ul', 'allow-list');
  list.setAttribute('aria-labelledby', title.id);
  const summary = element('p', 'schedule-summary');
  const form = element('form', 'allow-form');
  form.noValidate = true;
  const input = element('input', 'allow-input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = `${rules.example} or a link`;
  input.setAttribute('aria-label', `Add an allowed ${NAMES[platform]} ${rules.noun}`);
  const add = element('button', 'btn btn-plain', 'Add');
  add.type = 'submit';
  form.append(input, add);
  const note = element(
    'p',
    'schedule-note',
    `${ALLOW_NOTES[platform]} Adding one takes a ${OFF_WAIT_SECONDS}-second wait. Removing one is instant.`
  );
  const error = element('p', 'schedule-error');
  error.setAttribute('role', 'alert');
  box.append(head, list, summary, form, note, error);
  item.append(box);

  const controls = { box, list, summary, form, input, add, error, key: '' };
  allowBoxes.set(platform, controls);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    requestAllow(platform);
  });
  input.addEventListener('input', () => setText(error, ''));
}

// Adding an account loosens blocking, so it waits like an allowed time does.
function requestAllow(platform) {
  const controls = allowBoxes.get(platform);
  const rules = ALLOW_SITES[platform];
  const name = rules.parse(controls.input.value);
  const saved = savedAllowed(platform);
  if (!name) {
    setText(
      controls.error,
      `That doesn't look like a ${NAMES[platform]} ${rules.noun}. Try ${rules.example} or a link to the ${rules.noun}.`
    );
    controls.input.focus();
    return Promise.resolve();
  }
  if (saved.includes(name)) {
    setText(controls.error, `${rules.label(name)} is already allowed.`);
    controls.input.focus();
    return Promise.resolve();
  }
  if (saved.length >= MAX_ACCOUNTS) {
    setText(controls.error, `You can allow up to ${MAX_ACCOUNTS} ${rules.noun}s. Remove one first.`);
    return Promise.resolve();
  }
  controls.input.value = '';
  setText(controls.error, '');
  state.pending = { ...state.pending, [platform]: { kind: 'allow', at: Date.now(), name } };
  return commit({ local: true });
}

// Removing an account tightens blocking, so it is saved straight away.
function removeAllowed(platform, name) {
  setAllowed(
    platform,
    savedAllowed(platform).filter((entry) => entry !== name)
  );
  return commit({ sync: true });
}

function renderAllowlist(platform, now) {
  const controls = allowBoxes.get(platform);
  if (!controls) return;
  const rules = ALLOW_SITES[platform];
  const names = savedAllowed(platform);
  const request = pendingRequest(platform, now);
  const off = state.settings[platform] === false;
  const focus = inFocus(now);

  // Rebuild the list only when it changes, so focus isn't lost while typing.
  const key = names.join('\n');
  if (key !== controls.key) {
    controls.key = key;
    controls.list.replaceChildren();
    for (const name of names) {
      const entry = element('li', 'allow-item');
      const remove = button('\u00d7', 'quiet', 'remove-allowed');
      remove.classList.add('allow-remove');
      remove.setAttribute('aria-label', `Remove ${rules.label(name)}`);
      remove.title = `Remove ${rules.label(name)}`;
      remove.addEventListener('click', () => {
        removeAllowed(platform, name);
        controls.input.focus();
      });
      entry.append(element('span', null, rules.label(name)), remove);
      controls.list.append(entry);
    }
  }
  controls.list.hidden = names.length === 0;

  let summary = names.length ? '' : 'None';
  if (request && request.kind === 'allow') summary = `${summary ? `${summary}. ` : ''}Adding ${rules.label(request.name)} (waiting).`;
  if (focus && names.length) summary = 'Ignored during the focus session.';
  setText(controls.summary, summary);
  controls.summary.hidden = !summary;

  // Nothing to allow while off; one waiting request at a time; locked in a focus session.
  const locked = off || Boolean(request) || focus;
  controls.input.disabled = locked;
  controls.add.disabled = locked;
  controls.form.hidden = names.length >= MAX_ACCOUNTS;
  controls.box.classList.toggle('is-disabled', off);
}

/* ------------------------------------------------------------------ */
/* Content preferences                                                  */
/* ------------------------------------------------------------------ */

function savedCategories(platform) {
  return normalizePrefs(state.settings[CATEGORY_SITES[platform].setting]);
}

function savedFixes(platform) {
  return normalizeFixes(state.categoryFixes[platform]);
}

// Shapes what is shown rather than switching blocking off, so it is saved at once.
function setCategories(platform, prefs) {
  state.settings = { ...state.settings, [CATEGORY_SITES[platform].setting]: normalizePrefs(prefs) };
  return commit({ sync: true });
}

function setCategory(platform, category, mode) {
  const prefs = savedCategories(platform);
  if (mode === 'allow') delete prefs[category];
  else prefs[category] = mode;
  return setCategories(platform, prefs);
}

function removeFix(platform, key) {
  const fixes = savedFixes(platform);
  delete fixes[key];
  state.categoryFixes = { ...state.categoryFixes, [platform]: fixes };
  return commit({ local: true });
}

// "Gaming, Comedy and Sports", or "Gaming, Comedy, Sports and 4 more".
function listLabels(ids) {
  const labels = ids.map((id) => CATEGORY_LABELS[id]);
  if (labels.length <= 1) return labels.join('');
  if (labels.length <= 4) return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  return `${labels.slice(0, 3).join(', ')} and ${labels.length - 3} more`;
}

// One line saying what the choices do.
function describeCategories(prefs) {
  const preset = PRESETS.find((entry) => entry.id === matchingPreset(prefs));
  if (preset && preset.id !== 'all') return `${preset.label}: ${preset.detail} shown. The rest is hidden.`;
  const hidden = CATEGORIES.filter((category) => prefs[category.id] === 'hide').map((category) => category.id);
  const reduced = CATEGORIES.filter((category) => prefs[category.id] === 'reduce').map((category) => category.id);
  if (!hidden.length && !reduced.length) return 'Every category is allowed. Pick a preset or choose your own.';
  const parts = [];
  if (hidden.length) parts.push(`Hiding ${listLabels(hidden)}.`);
  if (reduced.length) parts.push(`Fewer ${listLabels(reduced)}.`);
  return parts.join(' ');
}

// Under "Filter video categories": presets, a summary, the list behind
// "Choose", a note, and the corrections made on the site. The switches for
// Subscriptions and videos opened directly are in popup.html.
function buildCategories(platform) {
  const body = document.getElementById(`categories-body-${platform}`);
  const where = element('p', 'categories-note');

  const presets = element('div', 'categories-presets');
  presets.setAttribute('role', 'group');
  presets.setAttribute('aria-label', 'Presets');
  presets.append(element('span', 'categories-label', 'Presets'));
  const presetButtons = PRESETS.map((preset) => {
    const node = button(preset.label, 'plain', 'preset');
    node.dataset.preset = preset.id;
    node.title = preset.id === 'all' ? preset.detail : `${preset.detail} shown, the rest hidden`;
    node.setAttribute('aria-pressed', 'false');
    node.addEventListener('click', () => setCategories(platform, presetPrefs(preset.id)));
    return node;
  });
  presets.append(...presetButtons);

  const head = element('div', 'schedule-row categories-row');
  const summary = element('p', 'categories-summary');
  summary.setAttribute('aria-live', 'polite');
  const edit = button('Choose', 'quiet', 'edit-categories');
  edit.classList.add('schedule-edit');
  edit.setAttribute('aria-expanded', 'false');
  edit.setAttribute('aria-label', 'Choose categories');
  head.append(summary, edit);

  const list = element('ul', 'category-list');
  list.id = `category-list-${platform}`;
  list.hidden = true;
  edit.setAttribute('aria-controls', list.id);
  const radios = [];
  for (const category of CATEGORIES) {
    const row = element('li', 'category-row');
    const name = element('span', 'category-name', category.label);
    name.id = `category-${platform}-${category.id}`;
    const group = element('div', 'segmented');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', name.id);
    for (const [mode, text] of CATEGORY_MODES) {
      const segment = element('label', 'segment');
      const input = element('input');
      input.type = 'radio';
      input.name = `category-${platform}-${category.id}`;
      input.value = mode;
      input.dataset.category = category.id;
      input.addEventListener('change', () => input.checked && setCategory(platform, category.id, mode));
      radios.push(input);
      segment.append(input, element('span', null, text));
      group.append(segment);
    }
    row.append(name, group);
    list.append(row);
  }
  edit.addEventListener('click', () => {
    const open = list.hidden;
    list.hidden = !open;
    edit.setAttribute('aria-expanded', String(open));
    edit.textContent = open ? 'Done' : 'Choose';
  });

  const note = element(
    'p',
    'schedule-note',
    "Reduce keeps about a third of a category's videos in recommendations. Hidden videos keep a Show anyway button. " +
      'Videos are sorted by their title, channel and description, so it is a best guess: point at a video on YouTube to correct its category.'
  );

  const fixes = element('div', 'categories-fixes');
  const fixesTitle = element('span', 'categories-label', 'Your corrections');
  fixesTitle.id = `category-fixes-title-${platform}`;
  const fixList = element('ul', 'allow-list');
  fixList.setAttribute('aria-labelledby', fixesTitle.id);
  fixes.append(fixesTitle, fixList);

  body.prepend(where, presets, head, list, note);
  body.append(fixes);
  categoryBoxes.set(platform, {
    box: document.getElementById(`categories-${platform}`),
    body,
    where,
    presetButtons,
    summary,
    radios,
    fixes,
    fixList,
    fixesKey: null,
  });
}

function renderCategories(platform, now) {
  const controls = categoryBoxes.get(platform);
  const site = CATEGORY_SITES[platform];
  const off = state.settings[platform] === false;
  controls.body.hidden = state.settings[site.enabled] !== true;
  controls.box.classList.toggle('is-disabled', off);

  const prefs = savedCategories(platform);
  for (const input of controls.radios) {
    input.checked = input.value === (prefs[input.dataset.category] || 'allow');
    input.disabled = off;
  }
  const preset = matchingPreset(prefs);
  for (const node of controls.presetButtons) {
    node.setAttribute('aria-pressed', String(node.dataset.preset === preset));
    node.disabled = off;
  }
  setText(controls.summary, describeCategories(prefs));

  // Where it applies depends on what YouTube's choice already blocks.
  const modeInput = document.querySelector(`input[type="radio"][data-parent="${platform}"]`);
  let mode = modeInput ? choiceValue(modeInput) : 'shorts';
  if (inFocus(now)) mode = FOCUS_RAISES[mode] || mode;
  setText(controls.where, CATEGORY_WHERE[mode] || '');

  // Corrections, newest first: rebuilt only when they change, so focus is kept.
  const fixes = savedFixes(platform);
  const key = JSON.stringify(fixes);
  if (key !== controls.fixesKey) {
    controls.fixesKey = key;
    controls.fixList.replaceChildren();
    for (const [fixKey, fix] of Object.entries(fixes).reverse()) {
      const name = fix.label || fixKey.replace(/^[a-z]+:/, '');
      const entry = element('li', 'allow-item');
      const remove = button('\u00d7', 'quiet', 'remove-fix');
      remove.classList.add('allow-remove');
      remove.setAttribute('aria-label', `Remove the correction for ${name}`);
      remove.title = 'Remove this correction';
      remove.addEventListener('click', () => removeFix(platform, fixKey));
      entry.append(element('span', null, `${name}: ${CATEGORY_LABELS[fix.category]}`), remove);
      controls.fixList.append(entry);
    }
  }
  controls.fixes.hidden = Object.keys(fixes).length === 0;
}

/* ------------------------------------------------------------------ */
/* Allowed times                                                        */
/* ------------------------------------------------------------------ */

const toMinutes = (value) => {
  const match = /^(\d{2}):(\d{2})/.exec(value || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const toTimeValue = (minute) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

// "Allowed times" under each platform: a summary, and an editor behind "Edit".
function buildScheduler(platform, item) {
  const box = element('div', 'schedule');
  box.dataset.platform = platform;
  const head = element('div', 'schedule-row');
  const title = element('span', 'schedule-title', 'Allowed times');
  const edit = button('Edit', 'quiet', 'edit-schedule');
  edit.classList.add('schedule-edit');
  edit.setAttribute('aria-expanded', 'false');
  edit.setAttribute('aria-label', `Edit ${NAMES[platform]} allowed times`);
  head.append(title, edit);
  const summary = element('p', 'schedule-summary');

  const editor = element('div', 'schedule-editor');
  editor.id = `schedule-editor-${platform}`;
  editor.hidden = true;
  edit.setAttribute('aria-controls', editor.id);
  const slots = element('ol', 'slots');
  const empty = element('p', 'schedule-empty', `No allowed times: ${NAMES[platform]} is blocked all day.`);
  const add = button('Add a time', 'plain', 'add-slot');
  const note = element(
    'p',
    'schedule-note',
    `Adding or lengthening a time takes a ${OFF_WAIT_SECONDS}-second wait. Shortening or removing one is instant.`
  );
  const error = element('p', 'schedule-error');
  error.setAttribute('role', 'alert');
  const save = button('Save', 'primary', 'save-schedule');
  const close = button('Cancel', 'quiet', 'cancel-schedule');
  const actions = element('div', 'unlock-actions');
  actions.append(save, close);
  editor.append(slots, empty, add, note, error, actions);
  box.append(head, summary, editor);
  item.append(box);

  const controls = { box, edit, summary, editor, slots, empty, add, error };
  schedulers.set(platform, controls);

  edit.addEventListener('click', () => (drafts.has(platform) ? closeEditor(platform) : openEditor(platform)));
  add.addEventListener('click', () => {
    const draft = drafts.get(platform);
    draft.push({ days: [0, 1, 2, 3, 4, 5, 6], start: 20 * 60, end: 21 * 60 });
    renderEditor(platform);
    const inputs = slots.querySelectorAll('.day');
    if (inputs.length) inputs[inputs.length - 7].focus();
  });
  save.addEventListener('click', () => saveSchedule(platform));
  close.addEventListener('click', () => closeEditor(platform));
}

function openEditor(platform) {
  const controls = schedulers.get(platform);
  drafts.set(platform, savedWindows(platform).map((slot) => ({ ...slot, days: [...slot.days] })));
  controls.error.textContent = '';
  renderEditor(platform);
  controls.editor.hidden = false;
  controls.edit.setAttribute('aria-expanded', 'true');
  controls.edit.textContent = 'Close';
  const first = controls.editor.querySelector('input, button');
  if (first) first.focus();
}

function closeEditor(platform) {
  const controls = schedulers.get(platform);
  drafts.delete(platform);
  controls.editor.hidden = true;
  controls.edit.setAttribute('aria-expanded', 'false');
  controls.edit.textContent = 'Edit';
  controls.edit.focus();
}

// Rebuilds the editor's rows from the draft (only on open, add and remove, so
// typing into a time field is never interrupted).
function renderEditor(platform) {
  const controls = schedulers.get(platform);
  const draft = drafts.get(platform);
  controls.slots.replaceChildren();
  draft.forEach((slot, index) => {
    const row = element('li', 'slot');
    const days = element('fieldset', 'days');
    days.append(element('legend', 'sr-only', 'Days'));
    for (const entry of WEEK) {
      const box = element('input', 'day');
      box.type = 'checkbox';
      box.dataset.letter = entry.letter;
      box.setAttribute('aria-label', entry.long);
      box.title = entry.long;
      box.checked = slot.days.includes(entry.day);
      box.addEventListener('change', () => {
        const chosen = new Set(slot.days);
        if (box.checked) chosen.add(entry.day);
        else chosen.delete(entry.day);
        slot.days = [...chosen].sort((a, b) => a - b);
      });
      days.append(box);
    }

    const times = element('div', 'times');
    const from = element('input', 'time');
    from.type = 'time';
    from.value = toTimeValue(slot.start);
    from.setAttribute('aria-label', 'From');
    const to = element('input', 'time');
    to.type = 'time';
    to.value = toTimeValue(slot.end);
    to.setAttribute('aria-label', 'To');
    from.addEventListener('input', () => (slot.start = toMinutes(from.value)));
    to.addEventListener('input', () => (slot.end = toMinutes(to.value)));
    const remove = button('Remove', 'quiet', 'remove-slot');
    remove.setAttribute('aria-label', `Remove allowed time ${index + 1}`);
    remove.addEventListener('click', () => {
      draft.splice(index, 1);
      renderEditor(platform);
      controls.add.focus();
    });
    times.append(from, element('span', null, 'to'), to, remove);

    row.append(days, times);
    controls.slots.append(row);
  });
  controls.slots.hidden = draft.length === 0;
  controls.empty.hidden = draft.length > 0;
  controls.add.hidden = draft.length >= MAX_WINDOWS;
}

function saveSchedule(platform) {
  const controls = schedulers.get(platform);
  const draft = drafts.get(platform);
  if (draft.some((slot) => !slot.days.length)) {
    controls.error.textContent = 'Choose at least one day for each time.';
    return Promise.resolve();
  }
  if (draft.some((slot) => slot.start === null || slot.end === null)) {
    controls.error.textContent = 'Fill in both times, or remove the row.';
    return Promise.resolve();
  }
  const next = normalizeWindows(draft);
  const looser = isLooser(next, savedWindows(platform));
  closeEditor(platform);
  if (!looser) {
    setSchedule(platform, next);
    return commit({ sync: true });
  }
  state.pending = { ...state.pending, [platform]: { kind: 'schedule', at: Date.now(), windows: next } };
  return commit({ local: true });
}

/* ------------------------------------------------------------------ */
/* Rendering                                                            */
/* ------------------------------------------------------------------ */

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function renderPlatform(input, now) {
  const platform = input.dataset.platform;
  const { panel, status, buttons } = panels.get(platform);
  const current = platformState(platform, now);
  const request = current.kind === 'off' ? null : pendingRequest(platform, now);

  // The switch always shows whether blocking is active right now.
  input.checked = current.kind === 'blocking' || current.kind === 'focus';
  input.disabled = current.kind === 'focus';

  let mode = 'closed';
  if (request) mode = request.phase;
  else if (current.kind === 'scheduled') mode = 'scheduled';

  const allowing = request && request.kind === 'allow' ? ALLOW_SITES[platform].label(request.name) : '';
  const seconds = request && request.readyAt ? Math.ceil((request.readyAt - now) / 1000) : 0;
  const text = {
    closed: '',
    waiting: !seconds
      ? ''
      : allowing
        ? `Allowing ${allowing} in ${seconds}s.`
        : `Saving the new allowed times in ${seconds}s.`,
    ready: allowing ? `Ready. Allow ${allowing} on ${NAMES[platform]}?` : `Ready. Save ${NAMES[platform]}'s new allowed times?`,
    scheduled: current.until ? `Allowed by your schedule ${describeUntil(current.until, now)}.` : '',
  }[mode];

  const visible = {
    waiting: ['cancel'],
    ready: ['confirm', 'cancel'],
    scheduled: ['block'],
    closed: [],
  }[mode];

  panel.hidden = mode === 'closed';
  setText(status, text);
  for (const [key, node] of Object.entries(buttons)) node.hidden = !visible.includes(key);
}

function renderScheduler(platform, now) {
  const controls = schedulers.get(platform);
  const windows = savedWindows(platform);
  const request = pendingRequest(platform, now);
  let summary = windows.length ? windows.map(describeWindow).join('; ') : 'None';
  if (request && request.kind === 'schedule') summary += ' (a change is waiting)';
  setText(controls.summary, summary);
  // Off platforms have nothing to allow; a waiting request has to finish first.
  const locked = state.settings[platform] === false || Boolean(request) || inFocus(now);
  controls.edit.disabled = locked && !drafts.has(platform);
  controls.box.classList.toggle('is-disabled', state.settings[platform] === false);
}

function renderOptions(now) {
  const focus = inFocus(now);
  for (const input of optionSwitches) {
    const stored = state.settings[input.dataset.setting];
    input.checked = typeof stored === 'boolean' ? stored : input.dataset.default === 'true';
    input.disabled = state.settings[input.dataset.parent] === false;
  }
  for (const input of choiceInputs) {
    let chosen = choiceValue(input);
    if (focus) chosen = FOCUS_RAISES[chosen] || chosen; // Shows what the session actually blocks.
    input.checked = input.value === chosen;
    input.disabled = state.settings[input.dataset.parent] === false || focus;
  }
  for (const [platform, details] of Object.entries(CHOICE_DETAIL)) {
    const mode = choiceValue(document.querySelector(`input[type="radio"][data-parent="${platform}"]`));
    setText(document.getElementById(`detail-${platform}`), details[focus ? FOCUS_RAISES[mode] || mode : mode]);
  }
}

// The stored choice for a group of radio buttons, or the group's default.
function choiceValue(input) {
  const stored = state.settings[input.dataset.setting];
  const values = choiceInputs.filter((other) => other.name === input.name).map((other) => other.value);
  return values.includes(stored) ? stored : input.closest('[data-default]').dataset.default;
}

function renderStats(rawStats) {
  const stats = normalizeStats(rawStats, todayKey());
  document.getElementById('today-total').textContent = numberFormat.format(totalOf(stats.today));
  for (const platform of PLATFORMS) {
    document.getElementById(`count-${platform}`).textContent = numberFormat.format(stats.today[platform]);
  }
  const allTime = numberFormat.format(stats.allTime);
  document.getElementById('all-time').textContent = `· ${allTime} since install`;
}

function render() {
  const now = Date.now();
  for (const input of platformSwitches) {
    renderPlatform(input, now);
    renderScheduler(input.dataset.platform, now);
    renderAllowlist(input.dataset.platform, now);
  }
  renderOptions(now);
  for (const platform of categoryBoxes.keys()) renderCategories(platform, now);
  renderFocus(now);
}

// Once a second: refresh the countdowns and tidy up anything that ran out.
function tick() {
  const now = Date.now();
  let stale = false;
  for (const platform of PLATFORMS) {
    if (state.pending[platform] && !pendingRequest(platform, now)) {
      state.pending = without(state.pending, platform);
      stale = true;
    }
    if (state.scheduleSkips[platform] && Number(state.scheduleSkips[platform]) <= now) {
      state.scheduleSkips = without(state.scheduleSkips, platform);
      stale = true;
    }
  }
  render();
  if (stale) chrome.storage.local.set(localState()).catch(() => {});
}

/* ------------------------------------------------------------------ */
/* Focus session                                                        */
/* ------------------------------------------------------------------ */

let focusChoice = 0; // Minutes picked and waiting for "Start", or 0.
let focusShortcut = ''; // The keyboard shortcut for a 1-hour session, if one is set.
let shortcutKnown = false; // The browser has told us whether a shortcut is set.

// The browser's own page for changing or removing extension shortcuts. Extensions
// can't clear a shortcut themselves, so the popup links there. Firefox won't
// open its own pages for an extension, so it gets instructions instead.
function shortcutSettingsUrl() {
  const agent = navigator.userAgent;
  if (agent.includes('Firefox/')) return '';
  const scheme = agent.includes('Edg/') ? 'edge' : navigator.brave ? 'brave' : 'chrome';
  return `${scheme}://extensions/shortcuts`;
}

// What the shortcut line under the focus buttons shows. Pure, so the test page
// can try every case: unknown, no key set, key set and on, key set and off.
function describeShortcut({ known, key, enabled, hasSettingsPage }) {
  if (!known) return { hidden: true };
  if (!key) {
    return {
      hidden: false,
      text: hasSettingsPage
        ? 'No keyboard shortcut is set.'
        : 'No keyboard shortcut is set. In Add-ons, use the gear, then Manage Extension Shortcuts.',
      showSwitch: false,
      link: hasSettingsPage ? 'Set a key' : '',
    };
  }
  return {
    hidden: false,
    text: enabled ? `Or press ${key} twice for 1 hour.` : `The ${key} shortcut is off.`,
    showSwitch: true,
    link: hasSettingsPage ? 'Change or remove the key' : '',
  };
}

function inFocus(now) {
  return (Number(state.settings.focusUntil) || 0) > now;
}

function describeMinutes(minutes) {
  if (minutes < 60) return `${minutes} minutes`;
  return minutes === 60 ? '1 hour' : `${minutes / 60} hours`;
}

// "58:12", or "1:58:12" from an hour up.
function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

function startFocus(minutes) {
  focusChoice = 0;
  state.settings = { ...state.settings, focusUntil: Date.now() + minutes * 60 * 1000 };
  return commit({ sync: true });
}

function renderFocus(now) {
  const box = document.getElementById('focus');
  const until = Number(state.settings.focusUntil) || 0;
  const active = until > now;
  let text = 'Block every site and lock the switches for a while.';
  if (active) {
    text = `${formatRemaining(until - now)} left. Every site is blocked and the switches are locked until ${timeFormat.format(new Date(until))}.`;
  } else if (focusChoice) {
    text = `Block every site for ${describeMinutes(focusChoice)}? The switches stay locked until it ends, and it can't be stopped early.`;
  }
  box.classList.toggle('is-active', active);
  setText(document.getElementById('focus-text'), text);
  // Folded away until a length is picked: the buttons say enough, and the popup stays short.
  document.getElementById('focus-text').hidden = !active && !focusChoice;
  document.getElementById('focus-choices').hidden = active || Boolean(focusChoice);
  document.getElementById('focus-confirm').hidden = active || !focusChoice;
  renderShortcut(active || Boolean(focusChoice));
}

function renderShortcut(busy) {
  const line = describeShortcut({
    known: shortcutKnown,
    key: focusShortcut,
    enabled: state.settings.focusShortcut !== false,
    hasSettingsPage: Boolean(shortcutSettingsUrl()),
  });
  // Out of the way while a session runs or a length is being confirmed.
  document.getElementById('focus-shortcut').hidden = busy || line.hidden;
  if (line.hidden) return;
  setText(document.getElementById('focus-hint'), line.text);
  const toggle = document.getElementById('option-focus-shortcut');
  toggle.hidden = !line.showSwitch;
  toggle.setAttribute('aria-label', `Keyboard shortcut ${focusShortcut}`);
  const link = document.getElementById('focus-shortcut-link');
  link.hidden = !line.link;
  setText(link, line.link);
}

function openShortcutSettings(event) {
  event.preventDefault();
  const url = shortcutSettingsUrl();
  if (url && chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url }).catch(() => {});
}

function initFocus() {
  // The shortcut the browser actually assigned (people can change it, or it can
  // clash with another extension's and be left unset).
  if (chrome.commands && chrome.commands.getAll) {
    chrome.commands
      .getAll()
      .then((commands) => {
        const command = commands.find((entry) => entry.name === 'start-focus-session');
        focusShortcut = (command && command.shortcut) || '';
        shortcutKnown = true;
        render();
      })
      .catch(() => {});
  }
  for (const choice of document.querySelectorAll('[data-focus-minutes]')) {
    choice.addEventListener('click', () => {
      focusChoice = Number(choice.dataset.focusMinutes);
      render();
      document.getElementById('focus-start').focus();
    });
  }
  document.getElementById('focus-shortcut-link').addEventListener('click', openShortcutSettings);
  document.getElementById('focus-start').addEventListener('click', () => startFocus(focusChoice));
  document.getElementById('focus-cancel').addEventListener('click', () => {
    focusChoice = 0;
    render();
    document.querySelector('[data-focus-minutes]').focus();
  });
}

/* ------------------------------------------------------------------ */
/* Folding each site's options away                                     */
/* ------------------------------------------------------------------ */

// Each site is one line until its name is clicked; which sites are open is
// remembered on this device (a convenience only, so failures are ignored).
const OPEN_KEY = 'shortstop.openSites';

function readOpenSites() {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'));
  } catch (error) {
    return new Set();
  }
}

function setOpen(button, open) {
  button.setAttribute('aria-expanded', String(open));
  document.getElementById(button.getAttribute('aria-controls')).hidden = !open;
}

function initFolds() {
  const open = readOpenSites();
  for (const button of document.querySelectorAll('.platform-expand')) {
    const platform = button.getAttribute('aria-controls').replace('details-', '');
    setOpen(button, open.has(platform));
    button.addEventListener('click', () => {
      const opening = button.getAttribute('aria-expanded') !== 'true';
      setOpen(button, opening);
      if (opening) open.add(platform);
      else open.delete(platform);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
      } catch (error) {
        /* Not remembered this time. */
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/* Start-up                                                             */
/* ------------------------------------------------------------------ */

async function load() {
  const [sync, local] = await Promise.all([
    chrome.storage.sync.get('settings'),
    chrome.storage.local.get(['stats', ...RETIRED_LOCAL_KEYS, ...LOCAL_KEYS]),
  ]);
  state.settings = sync.settings || {};
  for (const key of LOCAL_KEYS) state[key] = local[key] || {};
  // Tidy up after the retired pause flow: its stored pauses, and any of its
  // "turn off" or pause waits that were still counting down.
  const retired = RETIRED_LOCAL_KEYS.filter((key) => key in local);
  if (retired.length) chrome.storage.local.remove(retired).catch(() => {});
  const waits = Object.entries(state.pending).filter(
    ([, request]) => request && (request.kind === 'schedule' || request.kind === 'allow')
  );
  if (waits.length !== Object.keys(state.pending).length) {
    state.pending = Object.fromEntries(waits);
    chrome.storage.local.set(localState()).catch(() => {});
  }
  render();
  renderStats(local.stats);
}

async function init() {
  for (const input of platformSwitches) {
    const platform = input.dataset.platform;
    buildPanel(platform, input);
    const details = document.getElementById(`details-${platform}`);
    if (CATEGORY_SITES[platform]) buildCategories(platform);
    if (ALLOW_SITES[platform]) buildAllowlist(platform, details);
    buildScheduler(platform, details);
    input.addEventListener('click', (event) => {
      // The switch never flips by itself: state decides what it shows.
      event.preventDefault();
      const now = Date.now();
      if (inFocus(now)) return; // Locked until the focus session ends.
      if (platformState(platform, now).kind === 'blocking') turnOff(platform);
      else blockAgain(platform);
    });
  }
  for (const input of optionSwitches) {
    input.addEventListener('change', () => saveOption(input.dataset.setting, input.checked));
  }
  for (const input of choiceInputs) {
    input.addEventListener('change', () => input.checked && saveOption(input.dataset.setting, input.value));
  }
  initFocus();
  initFolds();

  await load();
  setInterval(tick, 1000);

  // Keep everything live while the popup is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.stats) renderStats(changes.stats.newValue);
    if (area === 'local') {
      for (const key of LOCAL_KEYS) if (changes[key]) state[key] = changes[key].newValue || {};
    }
    if (area === 'sync' && changes.settings) state.settings = changes.settings.newValue || {};
    render();
  });
}

init();
