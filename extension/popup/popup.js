/*
 * ShortStop popup
 * ===============
 * Shows today's counter, one switch per platform, and extra options such as
 * "Allow notifications". Everything applies to open tabs immediately, with no
 * reload, because content scripts listen for storage changes.
 *
 * Loosening a platform takes a moment on purpose, so it is hard to do on
 * impulse. Clicking a platform's switch while it is blocking does not switch
 * it off. It offers two choices instead:
 *
 *   - "Allow 10 minutes": a temporary unlock. Blocking pauses, then comes back
 *     by itself when the time runs out (stored on this device only).
 *   - "Turn off...": switching off for good needs a 30-second wait, then a
 *     confirmation within 2 minutes. The wait keeps running if the popup is
 *     closed, because it is stored, not held in memory.
 *
 * Switching blocking back ON is always instant.
 */
'use strict';

const { PLATFORMS, todayKey, normalizeStats, totalOf } = globalThis.ShortStopStats;

// The timings live in shared/pause.js (the welcome page explains them too).
const { UNLOCK_MINUTES, OFF_WAIT_SECONDS, OFF_WINDOW_SECONDS } = globalThis.ShortStopPause;

const NAMES = { youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' };
const numberFormat = new Intl.NumberFormat();
const platformSwitches = Array.from(document.querySelectorAll('.switch[data-platform]'));
const optionSwitches = Array.from(document.querySelectorAll('.switch[data-setting]'));

// settings: sync storage. unlocks and pendingOff: local storage (this device only).
const state = { settings: {}, unlocks: {}, pendingOff: {} };
const chooserOpen = new Set(); // Platforms whose "Allow / Turn off" choice is showing.
const panels = new Map(); // platform -> { panel, status, buttons }

/* ------------------------------------------------------------------ */
/* State helpers                                                        */
/* ------------------------------------------------------------------ */

// 'blocking', 'unlocked' (temporary) or 'off' (for good).
function platformState(platform, now) {
  if (state.settings[platform] === false) return { kind: 'off' };
  const until = Number(state.unlocks[platform]) || 0;
  return until > now ? { kind: 'unlocked', until } : { kind: 'blocking' };
}

// The "turn off for good" request: 'waiting', 'ready' or null.
function offRequest(platform, now) {
  const requested = Number(state.pendingOff[platform]) || 0;
  if (!requested) return null;
  const readyAt = requested + OFF_WAIT_SECONDS * 1000;
  if (now < readyAt) return { phase: 'waiting', readyAt };
  return now < readyAt + OFF_WINDOW_SECONDS * 1000 ? { phase: 'ready' } : null;
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

/* ------------------------------------------------------------------ */
/* Saving                                                               */
/* ------------------------------------------------------------------ */

function showStatus(message) {
  document.getElementById('status').textContent = message;
}

// Shows the new state at once, then saves it. If saving fails (most likely the
// sync write quota), reload from storage so the switches tell the truth.
async function commit({ sync = false, local = false } = {}) {
  render();
  try {
    if (sync) await chrome.storage.sync.set({ settings: state.settings });
    if (local) await chrome.storage.local.set({ unlocks: state.unlocks, pendingOff: state.pendingOff });
    showStatus('');
  } catch (error) {
    showStatus('Could not save that change. Try again in a minute.');
    await load();
  }
}

/* ------------------------------------------------------------------ */
/* Actions                                                              */
/* ------------------------------------------------------------------ */

function allowForAWhile(platform) {
  chooserOpen.delete(platform);
  state.pendingOff = without(state.pendingOff, platform);
  state.unlocks = { ...state.unlocks, [platform]: Date.now() + UNLOCK_MINUTES * 60 * 1000 };
  return commit({ local: true });
}

function requestOff(platform) {
  chooserOpen.delete(platform);
  state.pendingOff = { ...state.pendingOff, [platform]: Date.now() };
  return commit({ local: true });
}

function cancel(platform) {
  chooserOpen.delete(platform);
  state.pendingOff = without(state.pendingOff, platform);
  return commit({ local: true });
}

function confirmOff(platform) {
  const request = offRequest(platform, Date.now());
  if (!request || request.phase !== 'ready') return Promise.resolve(); // Too early: nothing happens.
  state.pendingOff = without(state.pendingOff, platform);
  state.unlocks = without(state.unlocks, platform);
  state.settings = { ...state.settings, [platform]: false };
  return commit({ sync: true, local: true });
}

// Back to blocking: from a temporary unlock or from off. Always instant.
function blockAgain(platform) {
  chooserOpen.delete(platform);
  state.pendingOff = without(state.pendingOff, platform);
  state.unlocks = without(state.unlocks, platform);
  const wasOff = state.settings[platform] === false;
  if (wasOff) state.settings = { ...state.settings, [platform]: true };
  return commit({ sync: wasOff, local: true });
}

function saveOption(key, value) {
  state.settings = { ...state.settings, [key]: value };
  return commit({ sync: true });
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
  buttons.confirm.addEventListener('click', () => confirmOff(platform));
  buttons.block.addEventListener('click', () => blockAgain(platform));
  buttons.cancel.addEventListener('click', () => cancel(platform));

  input.closest('.platform-row').after(panel);
  panels.set(platform, { panel, status, buttons });
}

/* ------------------------------------------------------------------ */
/* Rendering                                                            */
/* ------------------------------------------------------------------ */

function renderPlatform(input, now) {
  const platform = input.dataset.platform;
  const { panel, status, buttons } = panels.get(platform);
  const current = platformState(platform, now);
  const request = current.kind === 'blocking' ? offRequest(platform, now) : null;

  // The switch always shows whether blocking is active right now.
  input.checked = current.kind === 'blocking';

  let mode = 'closed';
  if (current.kind === 'unlocked') mode = 'unlocked';
  else if (request) mode = request.phase;
  else if (chooserOpen.has(platform)) mode = 'choose';

  const name = NAMES[platform];
  const text = {
    closed: '',
    choose: `Pause ${name} blocking?`,
    waiting: request && request.readyAt ? `Turning off in ${Math.ceil((request.readyAt - now) / 1000)}s.` : '',
    ready: `Ready. Turn off ${name} blocking until you switch it back on?`,
    unlocked: current.until ? `Unlocked, ${formatClock(current.until - now)} left. Blocking comes back by itself.` : '',
  }[mode];

  const visible = {
    choose: ['allow', 'request', 'cancel'],
    waiting: ['cancel'],
    ready: ['confirm', 'cancel'],
    unlocked: ['block'],
    closed: [],
  }[mode];

  panel.hidden = mode === 'closed';
  if (status.textContent !== text) status.textContent = text;
  for (const [key, node] of Object.entries(buttons)) node.hidden = !visible.includes(key);
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
  for (const input of platformSwitches) renderPlatform(input, now);
  renderOptions();
}

// Once a second: refresh the countdowns and tidy up anything that ran out.
function tick() {
  const now = Date.now();
  const stale = { unlocks: false, pendingOff: false };
  for (const platform of PLATFORMS) {
    if (state.unlocks[platform] && Number(state.unlocks[platform]) <= now) {
      state.unlocks = without(state.unlocks, platform);
      stale.unlocks = true;
    }
    if (state.pendingOff[platform] && !offRequest(platform, now)) {
      state.pendingOff = without(state.pendingOff, platform);
      stale.pendingOff = true;
    }
  }
  render();
  if (stale.unlocks || stale.pendingOff) {
    chrome.storage.local.set({ unlocks: state.unlocks, pendingOff: state.pendingOff }).catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* Start-up                                                             */
/* ------------------------------------------------------------------ */

async function load() {
  const [sync, local] = await Promise.all([
    chrome.storage.sync.get('settings'),
    chrome.storage.local.get(['stats', 'unlocks', 'pendingOff']),
  ]);
  state.settings = sync.settings || {};
  state.unlocks = local.unlocks || {};
  state.pendingOff = local.pendingOff || {};
  render();
  renderStats(local.stats);
}

async function init() {
  for (const input of platformSwitches) {
    buildPanel(input.dataset.platform, input);
    input.addEventListener('click', (event) => {
      // The switch never flips by itself: state decides what it shows.
      event.preventDefault();
      const platform = input.dataset.platform;
      const now = Date.now();
      if (platformState(platform, now).kind !== 'blocking') {
        blockAgain(platform); // Turning blocking on is instant.
      } else if (!offRequest(platform, now)) {
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
    if (area === 'local' && changes.unlocks) state.unlocks = changes.unlocks.newValue || {};
    if (area === 'local' && changes.pendingOff) state.pendingOff = changes.pendingOff.newValue || {};
    if (area === 'sync' && changes.settings) state.settings = changes.settings.newValue || {};
    render();
  });
}

init();
