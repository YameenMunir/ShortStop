/*
 * ShortStop blocked page (shown instead of TikTok)
 * ================================================
 * - Shows today's counter.
 * - "Go back" returns to the page before TikTok (hidden when there is none).
 * - If TikTok blocking is switched off, reopens the TikTok URL that was blocked.
 */
'use strict';

const { todayKey, normalizeStats, totalOf } = globalThis.ShortStopStats;

// Only ever send the user back to TikTok itself (never an arbitrary URL from the query string).
function blockedTikTokUrl() {
  try {
    const from = new URL(new URLSearchParams(location.search).get('from') || '');
    const isTikTok = from.hostname === 'tiktok.com' || from.hostname.endsWith('.tiktok.com');
    if (isTikTok && (from.protocol === 'https:' || from.protocol === 'http:')) return from.href;
  } catch (error) {
    /* Fall through to the default. */
  }
  return 'https://www.tiktok.com/';
}

function reopenIfAllowed(settings) {
  if (settings && settings.tiktok === false) location.replace(blockedTikTokUrl());
}

function renderCount(rawStats) {
  const total = totalOf(normalizeStats(rawStats, todayKey()).today);
  const element = document.getElementById('count');
  if (total > 0) {
    const noun = total === 1 ? 'Short or Reel' : 'Shorts and Reels';
    element.textContent = `ShortStop has blocked ${new Intl.NumberFormat().format(total)} ${noun} for you today.`;
    element.hidden = false;
  }
}

const backButton = document.getElementById('back');
if (history.length > 1) {
  backButton.addEventListener('click', () => history.back());
} else {
  backButton.hidden = true; // Opened in a fresh tab: there is nothing to go back to.
}

chrome.storage.sync.get('settings').then(({ settings }) => reopenIfAllowed(settings));
chrome.storage.local.get('stats').then(({ stats }) => renderCount(stats));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) reopenIfAllowed(changes.settings.newValue);
  if (area === 'local' && changes.stats) renderCount(changes.stats.newValue);
});
