/*
 * ShortStop background worker
 * ===========================
 * It keeps the "blocked today" counter, and handles the focus-session keyboard
 * shortcut (below). Content scripts in many
 * tabs report blocks at once, so increments go through one promise queue here
 * instead of each tab doing its own read-modify-write (which would lose counts).
 *
 * No network access, no analytics: everything stays in chrome.storage.local.
 */
'use strict';

// Chrome loads helpers with importScripts; Firefox lists them in manifest "scripts".
if (typeof importScripts === 'function') importScripts('shared/stats.js');

const { PLATFORMS, todayKey, normalizeStats } = globalThis.ShortStopStats;

// Open the welcome page once, when ShortStop is first installed.
function openWelcomePage(details) {
  if (details.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
}

// Fill in any missing settings on install/update. Every platform defaults to on;
// extra options keep their stored value, or get the default below.
chrome.runtime.onInstalled.addListener(async (details) => {
  openWelcomePage(details);
  const { settings = {} } = await chrome.storage.sync.get('settings');
  const complete = {
    instagramNotifications: false,
    tiktokNotifications: false,
    facebookNotifications: false,
    facebookMarketplaceSearch: true,
    xNotifications: false,
    youtubeHideShorts: true,
    ...settings,
  };
  for (const platform of PLATFORMS) complete[platform] = settings[platform] !== false;
  await chrome.storage.sync.set({ settings: complete });
});

/*
 * Keyboard shortcut (Alt+Shift+F by default; see "commands" in manifest.json).
 * A focus session can't be stopped early, so one stray key press must not
 * start one: the first press arms it and shows "1h?" on the toolbar icon, and
 * a second press within 5 seconds starts a 1-hour session. During a session,
 * a press just shows the minutes left.
 */
const SHORTCUT_FOCUS_MINUTES = 60;
const SHORTCUT_CONFIRM_MS = 5000;
const BADGE_ARMED = '#b7791f';
const BADGE_FOCUS = '#d62839';
let shortcutArmedUntil = 0;
let badgeTimer = 0;

function flashBadge(text, color, ms) {
  clearTimeout(badgeTimer);
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  badgeTimer = setTimeout(() => chrome.action.setBadgeText({ text: '' }), ms);
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'start-focus-session') return;
  const now = Date.now();
  const { settings = {} } = await chrome.storage.sync.get('settings');
  const until = Number(settings.focusUntil) || 0;
  if (until > now) {
    flashBadge(`${Math.ceil((until - now) / 60000)}m`, BADGE_FOCUS, 3000);
    return;
  }
  if (shortcutArmedUntil < now) {
    shortcutArmedUntil = now + SHORTCUT_CONFIRM_MS;
    flashBadge(`${SHORTCUT_FOCUS_MINUTES / 60}h?`, BADGE_ARMED, SHORTCUT_CONFIRM_MS);
    return;
  }
  shortcutArmedUntil = 0;
  await chrome.storage.sync.set({ settings: { ...settings, focusUntil: now + SHORTCUT_FOCUS_MINUTES * 60 * 1000 } });
  flashBadge(`${SHORTCUT_FOCUS_MINUTES}m`, BADGE_FOCUS, 3000);
});

let queue = Promise.resolve();

async function addToStats(platform, amount) {
  const { stats } = await chrome.storage.local.get('stats');
  const next = normalizeStats(stats, todayKey());
  next.today[platform] += amount;
  next.allTime += amount;
  await chrome.storage.local.set({ stats: next });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'shortstop:count') return false;
  if (sender.id !== chrome.runtime.id) return false;

  const platform = PLATFORMS.includes(message.platform) ? message.platform : null;
  const amount = Math.min(Math.max(Math.floor(Number(message.amount)) || 0, 0), 1000);
  if (!platform || amount === 0) {
    sendResponse({ ok: false });
    return false;
  }

  queue = queue
    .then(() => addToStats(platform, amount))
    .catch((error) => console.warn('[ShortStop] Could not save the counter:', error));
  queue.then(() => sendResponse({ ok: true }));
  return true; // Keep the channel open for the async response.
});
