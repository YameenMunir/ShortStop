/*
 * ShortStop popup
 * ===============
 * Shows today's counter, one switch per platform, and extra options such as
 * Instagram's "Allow notifications". Everything saves to chrome.storage.sync;
 * content scripts listen for that change and apply it to open tabs
 * immediately, so no reload is needed.
 *
 * Platform switches (data-platform) default to on. Options (data-setting)
 * default to off unless marked data-default="true", and are greyed out while
 * their platform (data-parent) is off.
 */
'use strict';

const { PLATFORMS, todayKey, normalizeStats, totalOf } = globalThis.ShortStopStats;

const numberFormat = new Intl.NumberFormat();
const platformSwitches = Array.from(document.querySelectorAll('.switch[data-platform]'));
const optionSwitches = Array.from(document.querySelectorAll('.switch[data-setting]'));
let settings = {};

function renderSettings() {
  for (const input of platformSwitches) input.checked = settings[input.dataset.platform] !== false;
  for (const input of optionSwitches) {
    const stored = settings[input.dataset.setting];
    input.checked = typeof stored === 'boolean' ? stored : input.dataset.default === 'true';
    input.disabled = settings[input.dataset.parent] === false;
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

function showStatus(message) {
  document.getElementById('status').textContent = message;
}

async function saveSetting(key, value) {
  const previous = settings;
  settings = { ...settings, [key]: value };
  renderSettings();
  try {
    await chrome.storage.sync.set({ settings });
    showStatus('');
  } catch (error) {
    // Most likely the sync write quota; undo the switch so it tells the truth.
    settings = previous;
    renderSettings();
    showStatus('Could not save that change. Try again in a minute.');
  }
}

async function init() {
  const [{ settings: stored = {} }, { stats }] = await Promise.all([
    chrome.storage.sync.get('settings'),
    chrome.storage.local.get('stats'),
  ]);
  settings = stored;
  renderSettings();
  renderStats(stats);

  for (const input of platformSwitches) {
    input.addEventListener('change', () => saveSetting(input.dataset.platform, input.checked));
  }
  for (const input of optionSwitches) {
    input.addEventListener('change', () => saveSetting(input.dataset.setting, input.checked));
  }

  // Keep the numbers live while the popup is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.stats) renderStats(changes.stats.newValue);
    if (area === 'sync' && changes.settings) {
      settings = changes.settings.newValue || {};
      renderSettings();
    }
  });
}

init();
