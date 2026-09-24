/*
 * ShortStop test harness
 * ======================
 * Loaded by each fixture page between core.js and a platform config. It swaps
 * in a fake environment (fake URL, in-memory settings, recorded redirects and
 * counts), lets the real engine run against the fixture markup, then checks:
 *
 *   data-expect="hidden|visible|blurred"   state on the fixture's main URL
 *   data-count                             element should add 1 to the counter
 *   <template id="dynamic">                content added later (infinite scroll)
 *   data-recycle-href="/watch?v=x"         swap the inner link, expect it to reappear
 *   plan.phases[]                          SPA-navigate to another URL, check data-expect-<name>
 *   plan.redirects[]                       [from, to|null] pairs for resolveRedirect
 *   plan.spaRedirect                       [from, to]: pushState to `from` must redirect to `to`
 *   plan.cover / phase.cover               { title, links } if the page must be covered, false if not
 *   phase.settings                         settings to apply before that phase's navigation
 *   plan.initialWait                       ms to wait before the first checks (default 500)
 *
 * Results are written as JSON into <pre id="results"> for tests/run_tests.py.
 */
(function () {
  'use strict';

  const plan = JSON.parse(document.getElementById('plan').textContent);
  const state = {
    url: plan.url,
    counted: 0,
    navigations: [],
    listeners: [],
  };

  ShortStop.useEnv({
    href: () => state.url,
    navigate: (url, replace) => state.navigations.push({ url, replace }),
    getSettings: () => Promise.resolve({}),
    onSettingsChanged: (callback) => state.listeners.push(callback),
    count: (platform, amount) => {
      state.counted += amount;
      return Promise.resolve();
    },
  });

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail: detail || '' });

  function stateOf(element) {
    if (element.hasAttribute('data-shortstop-blurred')) return 'blurred';
    return element.checkVisibility() ? 'visible' : 'hidden';
  }

  function describe(element) {
    return element.getAttribute('data-name') || element.outerHTML.slice(0, 90);
  }

  // data-expect-attr-<phase>="name=value": the element's attribute must equal value.
  function checkAttributes(attribute, label) {
    for (const element of document.querySelectorAll(`[${attribute}]`)) {
      const [name, value] = element.getAttribute(attribute).split('=');
      const actual = element.getAttribute(name);
      check(`${label}: ${describe(element)} has ${name}="${value}"`, actual === value, `got "${actual}"`);
    }
  }

  function checkExpectations(attribute, label) {
    for (const element of document.querySelectorAll(`[${attribute}]`)) {
      const expected = element.getAttribute(attribute);
      const actual = stateOf(element);
      check(`${label}: ${describe(element)} is ${expected}`, actual === expected, `got ${actual}`);
    }
  }

  function applySettings(settings) {
    for (const listener of state.listeners) listener(settings);
  }

  function setSettings(enabled) {
    applySettings({ [plan.platform]: enabled });
  }

  // Count media pauses, so we can check covered feeds stop playing.
  let pauses = 0;
  const originalPause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function () {
    pauses += 1;
    return originalPause.call(this);
  };

  // `expected` is false (no panel) or { title, links } (panel with that content).
  function checkCover(expected, label) {
    const host = document.querySelector('shortstop-cover');
    const shown = Boolean(host && host.isConnected && host.checkVisibility());
    check(`${label}: cover panel ${expected ? 'shown' : 'absent'}`, shown === Boolean(expected));
    const main = document.querySelector('main');
    if (!expected) {
      if (main) check(`${label}: content area visible`, main.checkVisibility());
      return;
    }
    if (!shown) return;
    if (main) check(`${label}: content area hidden behind the panel`, !main.checkVisibility());
    const title = host.shadowRoot.querySelector('.title').textContent;
    if (expected.title) check(`${label}: panel title`, title === expected.title, `got "${title}"`);
    if (expected.message) {
      const message = host.shadowRoot.querySelector('.message').textContent;
      check(`${label}: panel message`, message === expected.message, `got "${message}"`);
    }
    if (expected.links) {
      const links = Array.from(host.shadowRoot.querySelectorAll('.links a')).map((a) => a.textContent);
      check(`${label}: panel links`, JSON.stringify(links) === JSON.stringify(expected.links), JSON.stringify(links));
    }
    if (expected.search !== undefined) {
      const form = host.shadowRoot.querySelector('form');
      const shownSearch = !form.hidden;
      check(`${label}: panel search box ${expected.search ? 'shown' : 'absent'}`, shownSearch === Boolean(expected.search));
      if (expected.search && typeof expected.search === 'string') {
        const placeholder = form.querySelector('input').placeholder;
        check(`${label}: panel search placeholder`, placeholder === expected.search, `got "${placeholder}"`);
      }
    }
    if (expected.mode) {
      check(`${label}: panel mode`, host.getAttribute('mode') === expected.mode, `got ${host.getAttribute('mode')}`);
    }
  }

  function navigateTo(url) {
    state.url = url;
    window.dispatchEvent(new Event('shortstop:navigate')); // What nav-hook.js fires.
  }

  async function run() {
    await wait(plan.initialWait || 500);
    const engine = ShortStop.engines[0];
    check('engine started for this host', engine);
    if (!engine) return;

    check('generated stylesheet injected', document.getElementById(`shortstop-${plan.platform}`));
    checkExpectations('data-expect', 'initial');
    checkAttributes('data-expect-attr', 'initial');
    if (plan.cover !== undefined) checkCover(plan.cover, 'initial');
    if (plan.cover && document.querySelector('video')) check('covered feed media paused', pauses > 0, `${pauses} pauses`);

    // Feed keys (next video / scroll) must not reach the site while covered,
    // but typing in a field must still work.
    if (plan.keyTest) {
      let siteSaw = 0;
      const siteListener = () => (siteSaw += 1);
      document.addEventListener('keydown', siteListener);
      for (const key of ['ArrowDown', 'ArrowUp', 'PageDown', ' ', 'j']) {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      }
      check('covered: feed keys are swallowed', siteSaw === 0, `site saw ${siteSaw}`);
      const field = document.querySelector('input');
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      check('covered: keys still work while typing in a field', siteSaw === 1, `site saw ${siteSaw}`);
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
      check('covered: other keys still reach the site', siteSaw === 2, `site saw ${siteSaw}`);
      document.removeEventListener('keydown', siteListener);

      // A video behind the panel that starts playing is stopped at once.
      const before = pauses;
      document.querySelector('video').dispatchEvent(new Event('play'));
      check('covered: media that starts playing is paused', pauses > before, `${pauses - before} pauses`);
    }

    // The panel's own search box goes to the search results page.
    if (plan.searchTest) {
      const form = document.querySelector('shortstop-cover').shadowRoot.querySelector('form');
      check('panel search box shown', form && !form.hidden);
      form.querySelector('input').value = plan.searchTest.query;
      form.requestSubmit();
      const last = state.navigations[state.navigations.length - 1];
      check('panel search goes to results', last && last.url === plan.searchTest.expect, JSON.stringify(last));
    }

    // The site re-renders and throws the panel away: it must come back.
    if (plan.cover) {
      document.querySelector('shortstop-cover').remove();
      document.body.appendChild(document.createElement('div'));
      await wait(400);
      checkCover(plan.cover, 'after the site removed the panel');
    }

    // Content streamed in later (infinite scroll).
    const template = document.getElementById('dynamic');
    if (template) {
      document.body.appendChild(template.content.cloneNode(true));
      await wait(400);
      checkExpectations('data-expect-dynamic', 'dynamic');
    }

    // Recycled node: YouTube swaps the link inside an existing element.
    for (const element of document.querySelectorAll('[data-recycle-href]')) {
      element.querySelector('a').setAttribute('href', element.getAttribute('data-recycle-href'));
      await wait(400);
      check(`recycled: ${describe(element)} reappears`, stateOf(element) === 'visible', `got ${stateOf(element)}`);
    }

    await wait(1700); // Let the batched counter flush.
    const expectedCount = document.querySelectorAll('[data-count]').length + (plan.cover ? 1 : 0);
    const marked = Array.from(document.querySelectorAll('[data-shortstop-hidden], [data-shortstop-blurred]'))
      .map(describe)
      .join(' | ');
    check(
      'counter matches blocked items',
      state.counted === expectedCount,
      `counted ${state.counted}, expected ${expectedCount}; marked now: ${marked}`
    );

    // Toggle off: everything comes back and the stylesheet is removed.
    setSettings(false);
    await wait(300);
    const stillHidden = Array.from(document.querySelectorAll('[data-expect]')).filter(
      (element) => stateOf(element) !== 'visible'
    );
    check('toggle off restores everything', stillHidden.length === 0, stillHidden.map(describe).join(', '));
    check('toggle off removes the stylesheet', !document.getElementById(`shortstop-${plan.platform}`));
    if (plan.cover) checkCover(false, 'toggled off');

    // Toggle back on: same state as before, no double counting.
    const countBefore = state.counted;
    setSettings(true);
    await wait(400);
    checkExpectations('data-expect', 'toggled on again');
    if (plan.cover !== undefined) checkCover(plan.cover, 'toggled on again');
    // Re-hiding after a toggle counts again; make sure it is exactly one pass worth.
    await wait(1700);
    check('re-enabling counts one pass only', state.counted - countBefore <= expectedCount, `+${state.counted - countBefore}`);

    // Temporary unlock ("allow 10 minutes"): blocking pauses, then comes back by itself.
    const blockingOn = () => Boolean(document.getElementById(`shortstop-${plan.platform}`));
    const notVisible = () =>
      Array.from(document.querySelectorAll('[data-expect]')).filter((element) => stateOf(element) !== 'visible');
    applySettings({ [plan.platform]: true, unlocks: { [plan.platform]: Date.now() + 1500 } });
    await wait(300);
    check('unlocked: blocking is paused', !blockingOn() && !document.querySelector('shortstop-cover'));
    check('unlocked: everything is visible', notVisible().length === 0, notVisible().map(describe).join(', '));
    await wait(1600);
    check('unlock ran out: blocking comes back by itself', blockingOn());
    checkExpectations('data-expect', 'after the unlock ran out');
    if (plan.cover !== undefined) checkCover(plan.cover, 'after the unlock ran out');

    applySettings({ [plan.platform]: true, unlocks: { [plan.platform]: Date.now() - 1000 } });
    await wait(300);
    check('an unlock that already ran out does nothing', blockingOn());
    applySettings({ [plan.platform]: true, unlocks: { somewhere_else: Date.now() + 60000 } });
    await wait(300);
    check("another platform's unlock does nothing", blockingOn());

    applySettings({ [plan.platform]: true, unlocks: { [plan.platform]: Date.now() + 60000 } });
    await wait(300);
    check('long unlock: blocking is paused', !blockingOn());
    applySettings({ [plan.platform]: true, unlocks: {} });
    await wait(300);
    check('"block again" works at once', blockingOn());
    applySettings({ [plan.platform]: false, unlocks: { [plan.platform]: Date.now() + 60000 } });
    await wait(300);
    check('switched off stays off, even with an unlock', !blockingOn());
    applySettings({ [plan.platform]: true, unlocks: {} });
    await wait(300);
    check('switching back on works at once', blockingOn());

    // Allowed times: blocking pauses inside one, like an unlock.
    const platform = plan.platform;
    const today = new Date().getDay();
    const allDayToday = [{ days: [today], start: 0, end: 0 }];
    applySettings({ [platform]: true, schedules: { [platform]: allDayToday } });
    await wait(300);
    check('allowed time: blocking is paused', !blockingOn() && !document.querySelector('shortstop-cover'));
    check('allowed time: everything is visible', notVisible().length === 0, notVisible().map(describe).join(', '));
    applySettings({ [platform]: true, schedules: { [platform]: [{ days: [(today + 3) % 7], start: 0, end: 0 }] } });
    await wait(300);
    check('an allowed time on another day does nothing', blockingOn());
    applySettings({ [platform]: true, schedules: { somewhere_else: allDayToday } });
    await wait(300);
    check("another platform's allowed time does nothing", blockingOn());
    applySettings({ [platform]: true, schedules: { [platform]: [{ days: [today], start: 5000, end: 'x' }] } });
    await wait(300);
    check('a malformed allowed time is ignored', blockingOn());
    applySettings({
      [platform]: true,
      schedules: { [platform]: allDayToday },
      scheduleSkips: { [platform]: Date.now() + 60000 },
    });
    await wait(300);
    check('"block now" skips the current allowed time', blockingOn());

    // Time passing on its own starts and ends an allowed time, with no
    // settings change. A fake clock stands in for the real one.
    const RealDate = Date;
    let offset = 0;
    window.Date = class extends RealDate {
      constructor(...args) {
        if (args.length) super(...args);
        else super(RealDate.now() + offset);
      }
      static now() {
        return RealDate.now() + offset;
      }
    };
    const setClock = (date) => (offset = date.getTime() - RealDate.now());
    const evening = new RealDate(2026, 8, 23, 20, 59, 58);
    const eveningSlot = [{ days: [evening.getDay()], start: 20 * 60, end: 21 * 60 }];
    try {
      setClock(evening);
      applySettings({ [platform]: true, schedules: { [platform]: eveningSlot } });
      await wait(300);
      check('20:59:58 inside 20:00-21:00: blocking is paused', !blockingOn());
      await wait(3000);
      check('allowed time ended: blocking comes back by itself', blockingOn());
      if (plan.cover !== undefined) checkCover(plan.cover, 'after the allowed time ended');
      setClock(new RealDate(2026, 8, 23, 19, 59, 58));
      await wait(300);
      check('19:59:58 before 20:00-21:00: still blocking', blockingOn());
      await wait(3000);
      check('allowed time began: blocking pauses by itself', !blockingOn());
    } finally {
      window.Date = RealDate;
    }
    applySettings({ [platform]: true });
    await wait(1300);
    check('no allowed times: blocking is back', blockingOn());

    for (const phase of plan.phases || []) {
      const navigationsBefore = state.navigations.length;
      if (phase.settings) applySettings(phase.settings);
      const pausesBefore = pauses;
      navigateTo(phase.url);
      await wait(400);
      checkExpectations(`data-expect-${phase.name}`, `on ${phase.name}`);
      checkAttributes(`data-expect-attr-${phase.name}`, `on ${phase.name}`);
      if (phase.cover !== undefined) checkCover(phase.cover, `on ${phase.name} (${phase.url})`);
      if (phase.pauses !== undefined) {
        check(`on ${phase.name}: media pauses`, pauses - pausesBefore === phase.pauses, `${pauses - pausesBefore} pauses`);
      }
      for (const [from, to] of phase.redirects || []) {
        const got = engine.resolveRedirect(from);
        check(`on ${phase.name}: redirect ${from} -> ${to}`, got === to, `got ${got}`);
      }
      // Links whose clicks must reach the site, not be taken over by ShortStop.
      for (const href of phase.passClicks || []) {
        const link = document.createElement('a');
        link.href = href;
        document.body.appendChild(link);
        let reachedSite = false;
        link.addEventListener('click', (event) => {
          reachedSite = !event.defaultPrevented;
          event.preventDefault(); // Keep the fixture page where it is.
        });
        link.click();
        link.remove();
        check(`on ${phase.name}: a click on ${href} reaches the site`, reachedSite);
      }
      // null: nothing navigated during this phase. A URL: ShortStop redirected
      // there, after which the harness plays the part of the new page loading.
      if (phase.navigation !== undefined) {
        const made = state.navigations.slice(navigationsBefore);
        if (phase.navigation === null) {
          check(`on ${phase.name}: no redirect`, made.length === 0, JSON.stringify(made));
        } else {
          const last = made[made.length - 1];
          check(`on ${phase.name}: redirects to ${phase.navigation}`, last && last.url === phase.navigation && last.replace, JSON.stringify(made));
          engine.redirecting = false;
          engine.setCloak(false);
          navigateTo(phase.navigation);
          await wait(400);
        }
      }
    }

    for (const [from, to] of plan.redirects || []) {
      const got = engine.resolveRedirect(from);
      check(`redirect ${from} -> ${to}`, got === to, `got ${got}`);
    }

    if (plan.spaRedirect) {
      const [from, to] = plan.spaRedirect;
      navigateTo(from);
      await wait(500);
      const last = state.navigations[state.navigations.length - 1];
      check(`SPA navigation to ${from} redirects`, last && last.url === to && last.replace, JSON.stringify(last));
      check('page is cloaked during redirect', document.getElementById('shortstop-cloak'));
    }
  }

  run()
    .catch((error) => check('harness crashed', false, String(error && error.stack)))
    .finally(() => {
      const output = document.createElement('pre');
      output.id = 'results';
      output.textContent = JSON.stringify(results);
      document.documentElement.appendChild(output);
    });
})();
