/*
 * ShortStop popup
 * ===============
 * Shows today's counter and one switch per platform. Switches save to
 * chrome.storage.sync; content scripts listen for that change and apply it to
 * open tabs immediately, so no reload is needed.
 */
'use strict';

const { PLATFORMS, todayKey, normalizeStats, totalOf } = globalThis.ShortStopStats;

const numberFormat = new Intl.NumberFormat();
const switches = Array.from(document.querySelectorAll('.switch[data-platform]'));
let settings = {};

function renderSettings() {
  for (const input of switches) input.checked = settings[input.dataset.platform] !== false;
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

async function saveSetting(platform, enabled) {
  settings = { ...settings, [platform]: enabled };
  try {
    await chrome.storage.sync.set({ settings });
    showStatus('');
  } catch (error) {
    // Most likely the sync write quota; undo the switch so it tells the truth.
    settings = { ...settings, [platform]: !enabled };
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

  for (const input of switches) {
    input.addEventListener('change', () => saveSetting(input.dataset.platform, input.checked));
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
