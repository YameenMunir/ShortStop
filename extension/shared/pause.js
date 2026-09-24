/*
 * ShortStop: the wait before loosening allowed times
 * ==================================================
 * Adding or lengthening an allowed time waits before it is saved, so a site
 * can't be opened up on impulse. Shared by the popup (which enforces the wait)
 * and the welcome page (which explains it), so the two can never disagree.
 * Change it here.
 */
(function (global) {
  'use strict';

  global.ShortStopPause = {
    OFF_WAIT_SECONDS: 30, // How long adding or lengthening an allowed time waits.
    OFF_WINDOW_SECONDS: 120, // How long you then have to confirm before it lapses.
  };
})(globalThis);
