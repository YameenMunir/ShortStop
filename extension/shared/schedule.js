/*
 * ShortStop: allowed times ("focus schedule")
 * ===========================================
 * A platform can be allowed at set times, e.g. YouTube 20:00-21:00 on weekdays,
 * or Instagram all day at weekends. Shared by the content scripts (which stop
 * blocking inside an allowed time) and the popup (which edits the times).
 *
 * Stored in the synced settings as `schedules`, one list per platform:
 *
 *   schedules = {
 *     youtube: [{ days: [1, 2, 3, 4, 5], start: 1200, end: 1260 }],
 *   }
 *
 *   days    0 = Sunday ... 6 = Saturday (the day the window starts on)
 *   start   minutes after local midnight, 0-1439
 *   end     minutes after local midnight, 0-1439. end < start runs past
 *           midnight into the next day; end === start means all day.
 *
 * Times are the device's own local time, so "20:00" means 20:00 wherever the
 * browser is.
 */
(function (global) {
  'use strict';

  const DAY = 1440; // Minutes in a day.
  const WEEK = 7 * DAY;
  const MAX_WINDOWS = 3; // Per platform, to keep the popup small.

  const isMinute = (value) => Number.isInteger(value) && value >= 0 && value < DAY;

  // Drops anything malformed, so a bad sync value can never unblock by accident.
  function normalizeWindows(list) {
    if (!Array.isArray(list)) return [];
    const windows = [];
    for (const item of list) {
      if (!item || !isMinute(item.start) || !isMinute(item.end) || !Array.isArray(item.days)) continue;
      const days = [...new Set(item.days.filter((day) => Number.isInteger(day) && day >= 0 && day < 7))].sort((a, b) => a - b);
      if (days.length) windows.push({ days, start: item.start, end: item.end });
    }
    return windows.slice(0, MAX_WINDOWS);
  }

  // A local time `dayOffset` days after `date`'s day, `minute` minutes after midnight.
  function localTime(date, dayOffset, minute) {
    const result = new Date(date.getTime());
    result.setDate(result.getDate() + dayOffset);
    result.setHours(0, minute, 0, 0);
    return result.getTime();
  }

  // When `slot` stops allowing, if it allows `date`; otherwise 0.
  function slotEnd(slot, date) {
    const day = date.getDay();
    const minute = date.getHours() * 60 + date.getMinutes();
    const startsToday = slot.days.includes(day);
    if (slot.start === slot.end) return startsToday ? localTime(date, 1, 0) : 0;
    if (slot.start < slot.end) {
      return startsToday && minute >= slot.start && minute < slot.end ? localTime(date, 0, slot.end) : 0;
    }
    // Runs past midnight: tonight's slot, or the tail of last night's.
    if (startsToday && minute >= slot.start) return localTime(date, 1, slot.end);
    const startedYesterday = slot.days.includes((day + 6) % 7);
    return startedYesterday && minute < slot.end ? localTime(date, 0, slot.end) : 0;
  }

  // Returns the time (ms) the allowed period around `date` ends, or 0 if
  // `date` is not in an allowed time. Back-to-back windows (Saturday all day,
  // then Sunday all day) count as one period.
  function allowedUntil(list, date = new Date()) {
    const windows = normalizeWindows(list);
    let until = 0;
    let at = date;
    for (let step = 0; step < 8; step += 1) {
      const ends = windows.map((slot) => slotEnd(slot, at));
      const latest = Math.max(0, ...ends);
      if (!latest) break;
      until = latest;
      at = new Date(latest);
    }
    return until;
  }

  function isAllowed(list, date = new Date()) {
    return allowedUntil(list, date) > 0;
  }

  // Every minute of the week (Sunday 00:00 = 0) that the windows allow.
  function allowedMinutes(list) {
    const minutes = new Uint8Array(WEEK);
    const mark = (from, to) => {
      for (let minute = from; minute < to; minute += 1) minutes[minute % WEEK] = 1;
    };
    for (const slot of normalizeWindows(list)) {
      for (const day of slot.days) {
        const base = day * DAY;
        if (slot.start === slot.end) mark(base, base + DAY);
        else if (slot.start < slot.end) mark(base + slot.start, base + slot.end);
        else mark(base + slot.start, base + DAY + slot.end);
      }
    }
    return minutes;
  }

  // True if `next` allows any minute that `current` does not. Loosening the
  // schedule takes the same wait as switching blocking off; tightening it is
  // instant.
  function isLooser(next, current) {
    const before = allowedMinutes(current);
    const after = allowedMinutes(next);
    return after.some((allowed, minute) => allowed && !before[minute]);
  }

  global.ShortStopSchedule = { MAX_WINDOWS, normalizeWindows, allowedUntil, isAllowed, isLooser };
})(globalThis);
