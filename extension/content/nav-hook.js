/*
 * ShortStop navigation hook (runs in the page's own JavaScript world)
 * ===================================================================
 * Content scripts live in an isolated world, so wrapping history.pushState
 * there would not see the site's own calls. The manifest loads this tiny file
 * with "world": "MAIN" instead. It wraps pushState/replaceState and fires a
 * plain DOM event that the isolated content script (core.js) listens for.
 *
 * It reads nothing, sends nothing, and passes every call straight through.
 */
(() => {
  'use strict';

  const FLAG = Symbol.for('shortstop.navHook');
  if (history[FLAG]) return;
  Object.defineProperty(history, FLAG, { value: true });

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    if (typeof original !== 'function') continue;
    history[method] = function (...args) {
      const result = original.apply(this, args);
      try {
        window.dispatchEvent(new Event('shortstop:navigate'));
      } catch (error) {
        /* Never let ShortStop break the site's navigation. */
      }
      return result;
    };
  }
})();
