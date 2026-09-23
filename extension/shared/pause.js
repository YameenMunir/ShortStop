/*
 * ShortStop: pause timings
 * ========================
 * How long the popup's "Allow 10 minutes" lasts, and how long "Turn off..." makes
 * you wait. Shared by the popup (which enforces them) and the welcome page (which
 * explains them), so the two can never disagree. Change them here.
 */
(function (global) {
  'use strict';

  global.ShortStopPause = {
    UNLOCK_MINUTES: 10, // "Allow 10 minutes"
    OFF_WAIT_SECONDS: 30, // How long "turn off for good" makes you wait.
    OFF_WINDOW_SECONDS: 120, // How long you then have to confirm before it lapses.
  };
})(globalThis);
