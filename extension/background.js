/*
 * ShortStop background worker
 * ===========================
 * Its only job is keeping the "blocked today" counter. Content scripts in many
 * tabs report blocks at once, so increments go through one promise queue here
 * instead of each tab doing its own read-modify-write (which would lose counts).
 *
 * No network access, no analytics: everything stays in chrome.storage.local.
 */
'use strict';

// Chrome loads helpers with importScripts; Firefox lists them in manifest "scripts".
if (typeof importScripts === 'function') importScripts('shared/stats.js');

const { PLATFORMS, todayKey, normalizeStats } = globalThis.ShortStopStats;

// Fill in any missing settings on install/update. Every platform defaults to on;
// extra options (e.g. instagramNotifications) default to off and are kept as-is.
chrome.runtime.onInstalled.addListener(async () => {
  const { settings = {} } = await chrome.storage.sync.get('settings');
  const complete = { instagramNotifications: false, ...settings };
  for (const platform of PLATFORMS) complete[platform] = settings[platform] !== false;
  await chrome.storage.sync.set({ settings: complete });
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
