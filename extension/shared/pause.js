/*
 * ShortStop: pause timings
 * ========================
 * How long the popup's "Allow 10 minutes" lasts, how many of those a day are
 * instant, and how long the wait is for everything else that loosens blocking
 * ("Turn off...", extra pauses, adding allowed times). Shared by the popup
 * (which enforces them) and the welcome page (which explains them), so the two
 * can never disagree. Change them here.
 */
(function (global) {
  'use strict';

  global.ShortStopPause = {
    UNLOCK_MINUTES: 10, // "Allow 10 minutes"
    DAILY_PAUSES: 3, // Instant pauses per platform per day; after that, each one waits.
    OFF_WAIT_SECONDS: 30, // How long loosening blocking makes you wait.
    OFF_WINDOW_SECONDS: 120, // How long you then have to confirm before it lapses.
  };
})(globalThis);
