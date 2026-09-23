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

    for (const phase of plan.phases || []) {
      if (phase.settings) applySettings(phase.settings);
      navigateTo(phase.url);
      await wait(400);
      checkExpectations(`data-expect-${phase.name}`, `on ${phase.name}`);
      if (phase.cover !== undefined) checkCover(phase.cover, `on ${phase.name} (${phase.url})`);
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
