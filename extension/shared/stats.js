/*
 * ShortStop: shared counter helpers
 * =================================
 * Used by the background worker, the popup and the blocked page. The counter
 * lives in chrome.storage.local (this device only, never synced or sent anywhere):
 *
 *   stats = {
 *     date: '2026-09-23',                                   // local calendar day
 *     today: { youtube: 3, instagram: 0, facebook: 1, tiktok: 2, reddit: 0, x: 4, snapchat: 0 },
 *     allTime: 1204,
 *   }
 */
(function (global) {
  'use strict';

  const PLATFORMS = ['youtube', 'instagram', 'facebook', 'tiktok', 'reddit', 'x', 'snapchat'];

  // YYYY-MM-DD in the user's own time zone, so "today" resets at local midnight.
  function todayKey(date = new Date()) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  // Returns a well-formed stats object for `key`, zeroing "today" if the stored
  // numbers belong to an earlier day.
  function normalizeStats(stats, key = todayKey()) {
    const today = {};
    for (const platform of PLATFORMS) today[platform] = 0;
    const sameDay = stats && stats.date === key && stats.today;
    if (sameDay) {
      for (const platform of PLATFORMS) today[platform] = Number(stats.today[platform]) || 0;
    }
    const allTime = stats && Number.isFinite(stats.allTime) ? stats.allTime : 0;
    return { date: key, today, allTime };
  }

  function totalOf(today) {
    return PLATFORMS.reduce((sum, platform) => sum + (today[platform] || 0), 0);
  }

  global.ShortStopStats = { PLATFORMS, todayKey, normalizeStats, totalOf };
})(globalThis);
