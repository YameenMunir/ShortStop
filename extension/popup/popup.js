/*
 * ShortStop popup
 * ===============
 * Shows today's counter, one switch per platform, extra options such as
 * "Allow notifications", and each platform's allowed times. Everything applies
 * to open tabs immediately, with no reload, because content scripts listen for
 * storage changes.
 *
 * Each platform's switch turns off in one click: every platform is listed in
 * INSTANT_OFF in shared/pause.js. A platform removed from that list gets the
 * slower flow instead, where clicking its switch while it is blocking does not
 * switch it off but offers two choices:
 *
 *   - "Allow 10 minutes": a temporary unlock. Blocking pauses, then comes back
 *     by itself when the time runs out (stored on this device only). The first
 *     3 pauses a day per platform are instant; after that, each one waits.
 *   - "Turn off...": switching off for good.
 *
 * Every wait works the same way (a "pending request"): 30 seconds, then a
 * confirmation within 2 minutes. It keeps running if the popup is closed,
 * because it is stored, not held in memory. Adding or lengthening allowed
 * times waits too; shortening or removing them is instant.
 *
 * Switching blocking back ON is always instant, including "Block now" during
 * an allowed time.
 */
'use strict';

const { PLATFORMS, todayKey, normalizeStats, totalOf } = globalThis.ShortStopStats;

// The timings live in shared/pause.js (the welcome page explains them too).
const { UNLOCK_MINUTES, DAILY_PAUSES, OFF_WAIT_SECONDS, OFF_WINDOW_SECONDS } = globalThis.ShortStopPause;
const instantOff = (platform) => globalThis.ShortStopPause.INSTANT_OFF.includes(platform);
const { MAX_WINDOWS, normalizeWindows, allowedUntil, isLooser } = globalThis.ShortStopSchedule;

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

// Monday first. 5 January 2026 is a Monday.
const WEEK = [1, 2, 3, 4, 5, 6, 0].map((day) => {
  const date = new Date(2026, 0, 4 + (day === 0 ? 7 : day));
  const name = (weekday) => new Intl.DateTimeFormat(undefined, { weekday }).format(date);
  return { day, letter: name('narrow'), short: name('short'), long: name('long') };
});

/*
 * settings: sync storage (switches, options, `schedules`).
 * Local storage, this device only:
 *   unlocks        { platform: expiry time } for "Allow 10 minutes"
 *   pending        { platform: { kind: 'off' | 'pause' | 'schedule', at, windows? } }
 *   pauseLog       { date, used: { platform: pauses started that day } }
 *   scheduleSkips  { platform: time } "Block now" ignores allowed times until then
 */
const state = { settings: {}, unlocks: {}, pending: {}, pauseLog: {}, scheduleSkips: {} };
const LOCAL_KEYS = ['unlocks', 'pending', 'pauseLog', 'scheduleSkips'];
const chooserOpen = new Set(); // Platforms whose "Allow / Turn off" choice is showing.
const panels = new Map(); // platform -> { panel, status, buttons }
const schedulers = new Map(); // platform -> the allowed-times controls
const drafts = new Map(); // platform -> allowed times being edited

/* ------------------------------------------------------------------ */
/* State helpers                                                        */
/* ------------------------------------------------------------------ */

function savedWindows(platform) {
  return normalizeWindows(state.settings.schedules && state.settings.schedules[platform]);
}

// 'blocking', 'unlocked' (temporary), 'scheduled' (an allowed time) or 'off' (for good).
function platformState(platform, now) {
  if (state.settings[platform] === false) return { kind: 'off' };
  const until = Number(state.unlocks[platform]) || 0;
  if (until > now) return { kind: 'unlocked', until };
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

function pausesLeft(platform) {
  const log = state.pauseLog;
  const used = log.date === todayKey() && log.used ? Number(log.used[platform]) || 0 : 0;
  return Math.max(0, DAILY_PAUSES - used);
}

function recordPause(platform) {
  const today = todayKey();
  const used = state.pauseLog.date === today ? { ...state.pauseLog.used } : {};
  used[platform] = (Number(used[platform]) || 0) + 1;
  state.pauseLog = { date: today, used };
}

function without(object, key) {
  const copy = { ...object };
  delete copy[key];
  return copy;
}

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
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

function startPause(platform) {
  state.unlocks = { ...state.unlocks, [platform]: Date.now() + UNLOCK_MINUTES * 60 * 1000 };
  recordPause(platform);
}

// Instant while today's free pauses last; after that it waits like "Turn off...".
function allowForAWhile(platform) {
  chooserOpen.delete(platform);
  if (pausesLeft(platform) > 0) {
    state.pending = without(state.pending, platform);
    startPause(platform);
  } else {
    state.pending = { ...state.pending, [platform]: { kind: 'pause', at: Date.now() } };
  }
  return commit({ local: true });
}

function requestOff(platform) {
  chooserOpen.delete(platform);
  state.pending = { ...state.pending, [platform]: { kind: 'off', at: Date.now() } };
  return commit({ local: true });
}

function cancel(platform) {
  chooserOpen.delete(platform);
  state.pending = without(state.pending, platform);
  return commit({ local: true });
}

function confirmRequest(platform) {
  const request = pendingRequest(platform, Date.now());
  if (!request || request.phase !== 'ready') return Promise.resolve(); // Too early: nothing happens.
  state.pending = without(state.pending, platform);
  if (request.kind === 'pause') {
    startPause(platform);
    return commit({ local: true });
  }
  if (request.kind === 'schedule') {
    setSchedule(platform, request.windows);
    return commit({ sync: true, local: true });
  }
  state.unlocks = without(state.unlocks, platform);
  state.settings = { ...state.settings, [platform]: false };
  return commit({ sync: true, local: true });
}

// For INSTANT_OFF platforms (all of them, as shipped): off straight away, no choice or wait.
// A waiting change to the allowed times is left alone.
function turnOffNow(platform) {
  chooserOpen.delete(platform);
  if (state.pending[platform] && state.pending[platform].kind !== 'schedule') {
    state.pending = without(state.pending, platform);
  }
  state.unlocks = without(state.unlocks, platform);
  state.settings = { ...state.settings, [platform]: false };
  return commit({ sync: true, local: true });
}

// Back to blocking: from a temporary unlock, an allowed time or off. Always
// instant. A waiting change to the allowed times is left alone.
function blockAgain(platform) {
  const now = Date.now();
  chooserOpen.delete(platform);
  if (state.pending[platform] && state.pending[platform].kind !== 'schedule') {
    state.pending = without(state.pending, platform);
  }
  state.unlocks = without(state.unlocks, platform);
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

// The panel that appears under a platform's row when it needs a decision or is
// counting down. It is built once and only updated afterwards, so focus stays put.
function buildPanel(platform, input) {
  const panel = element('div', 'unlock');
  panel.dataset.platform = platform;
  panel.hidden = true;
  const status = element('p', 'unlock-status');
  const buttons = {
    allow: button(`Allow ${UNLOCK_MINUTES} minutes`, 'primary', 'allow'),
    request: button('Turn off…', 'plain', 'request'),
    confirm: button('Turn off now', 'primary', 'confirm'),
    block: button('Block again', 'primary', 'block'),
    cancel: button('Cancel', 'quiet', 'cancel'),
  };
  const actions = element('div', 'unlock-actions');
  actions.append(...Object.values(buttons));
  panel.append(status, actions);

  buttons.allow.addEventListener('click', () => allowForAWhile(platform));
  buttons.request.addEventListener('click', () => requestOff(platform));
  buttons.confirm.addEventListener('click', () => confirmRequest(platform));
  buttons.block.addEventListener('click', () => blockAgain(platform));
  buttons.cancel.addEventListener('click', () => cancel(platform));

  input.closest('.platform-row').after(panel);
  panels.set(platform, { panel, status, buttons });
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
  chooserOpen.delete(platform);
  state.pending = { ...state.pending, [platform]: { kind: 'schedule', at: Date.now(), windows: next } };
  return commit({ local: true });
}

/* ------------------------------------------------------------------ */
/* Rendering                                                            */
/* ------------------------------------------------------------------ */

const REQUEST_TEXT = {
  off: {
    waiting: (seconds) => `Turning off in ${seconds}s.`,
    ready: (name) => `Ready. Turn off ${name} blocking until you switch it back on?`,
    confirm: 'Turn off now',
  },
  pause: {
    waiting: (seconds) => `Pausing in ${seconds}s.`,
    ready: (name) => `Ready. Pause ${name} blocking for ${UNLOCK_MINUTES} minutes?`,
    confirm: 'Pause now',
  },
  schedule: {
    waiting: (seconds) => `Saving the new allowed times in ${seconds}s.`,
    ready: (name) => `Ready. Save ${name}'s new allowed times?`,
    confirm: 'Save now',
  },
};

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function renderPlatform(input, now) {
  const platform = input.dataset.platform;
  const { panel, status, buttons } = panels.get(platform);
  const current = platformState(platform, now);
  const request = current.kind === 'off' ? null : pendingRequest(platform, now);
  const words = request && (REQUEST_TEXT[request.kind] || REQUEST_TEXT.off);

  // The switch always shows whether blocking is active right now.
  input.checked = current.kind === 'blocking';

  let mode = 'closed';
  if (request) mode = request.phase;
  else if (current.kind === 'unlocked' || current.kind === 'scheduled') mode = current.kind;
  else if (chooserOpen.has(platform) && current.kind === 'blocking') mode = 'choose';

  const name = NAMES[platform];
  const left = pausesLeft(platform);
  const text = {
    closed: '',
    choose: left
      ? `Pause ${name} blocking? ${left} of ${DAILY_PAUSES} pauses left today.`
      : `Pause ${name} blocking? You've used today's ${DAILY_PAUSES} pauses, so the next one takes a ${OFF_WAIT_SECONDS}-second wait.`,
    waiting: request && request.readyAt ? words.waiting(Math.ceil((request.readyAt - now) / 1000)) : '',
    ready: words ? words.ready(name) : '',
    unlocked: current.until ? `Unlocked, ${formatClock(current.until - now)} left. Blocking comes back by itself.` : '',
    scheduled: current.until ? `Allowed by your schedule ${describeUntil(current.until, now)}.` : '',
  }[mode];

  const visible = {
    choose: ['allow', 'request', 'cancel'],
    waiting: ['cancel'],
    ready: ['confirm', 'cancel'],
    unlocked: ['block'],
    scheduled: ['block'],
    closed: [],
  }[mode];

  panel.hidden = mode === 'closed';
  setText(status, text);
  setText(buttons.allow, `Allow ${UNLOCK_MINUTES} minutes${left ? '' : '…'}`);
  setText(buttons.confirm, words ? words.confirm : REQUEST_TEXT.off.confirm);
  setText(buttons.block, mode === 'scheduled' ? 'Block now' : 'Block again');
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
  const locked = state.settings[platform] === false || Boolean(request);
  controls.edit.disabled = locked && !drafts.has(platform);
  controls.box.classList.toggle('is-disabled', state.settings[platform] === false);
}

function renderOptions() {
  for (const input of optionSwitches) {
    const stored = state.settings[input.dataset.setting];
    input.checked = typeof stored === 'boolean' ? stored : input.dataset.default === 'true';
    input.disabled = state.settings[input.dataset.parent] === false;
  }
}

function renderStats(rawStats) {
  const stats = normalizeStats(rawStats, todayKey());
  document.getElementById('today-total').textContent = numberFormat.format(totalOf(stats.today));
  for (const platform of PLATFORMS) {
    document.getElementById(`count-${platform}`).textContent = numberFormat.format(stats.today[platform]);
  }
  const allTime = numberFormat.format(stats.allTime);
  document.getElementById('all-time').textContent = `${allTime} blocked since you installed ShortStop`;
}

function render() {
  const now = Date.now();
  for (const input of platformSwitches) {
    renderPlatform(input, now);
    renderScheduler(input.dataset.platform, now);
  }
  renderOptions();
}

// Once a second: refresh the countdowns and tidy up anything that ran out.
function tick() {
  const now = Date.now();
  let stale = false;
  for (const platform of PLATFORMS) {
    if (state.unlocks[platform] && Number(state.unlocks[platform]) <= now) {
      state.unlocks = without(state.unlocks, platform);
      stale = true;
    }
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
/* Start-up                                                             */
/* ------------------------------------------------------------------ */

async function load() {
  const [sync, local] = await Promise.all([
    chrome.storage.sync.get('settings'),
    chrome.storage.local.get(['stats', 'pendingOff', ...LOCAL_KEYS]),
  ]);
  state.settings = sync.settings || {};
  for (const key of LOCAL_KEYS) state[key] = local[key] || {};
  // Version 1.0 kept "turn off" requests under `pendingOff`. They last two
  // minutes at most, so they are simply dropped.
  if (local.pendingOff) chrome.storage.local.remove('pendingOff').catch(() => {});
  // A "turn off" or pause wait started before a platform became instant-off
  // would otherwise still count down; drop it.
  let dropped = false;
  for (const platform of PLATFORMS.filter(instantOff)) {
    const request = state.pending[platform];
    if (request && request.kind !== 'schedule') {
      state.pending = without(state.pending, platform);
      dropped = true;
    }
  }
  if (dropped) chrome.storage.local.set(localState()).catch(() => {});
  render();
  renderStats(local.stats);
}

async function init() {
  for (const input of platformSwitches) {
    const platform = input.dataset.platform;
    buildPanel(platform, input);
    buildScheduler(platform, input.closest('.platform'));
    input.addEventListener('click', (event) => {
      // The switch never flips by itself: state decides what it shows.
      event.preventDefault();
      const now = Date.now();
      if (platformState(platform, now).kind !== 'blocking') {
        blockAgain(platform); // Turning blocking on is instant.
      } else if (instantOff(platform)) {
        turnOffNow(platform);
      } else if (!pendingRequest(platform, now)) {
        chooserOpen.add(platform); // Turning it off is a decision.
        render();
        panels.get(platform).buttons.allow.focus();
      }
    });
  }
  for (const input of optionSwitches) {
    input.addEventListener('change', () => saveOption(input.dataset.setting, input.checked));
  }

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
