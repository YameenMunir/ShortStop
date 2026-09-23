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
 *   plan.blockSite                         whole site should be sent to the blocked page
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
    blockedPageUrl: (from) => `blocked://${from}`,
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

  function setSettings(enabled) {
    const settings = { [plan.platform]: enabled };
    for (const listener of state.listeners) listener(settings);
  }

  function navigateTo(url) {
    state.url = url;
    window.dispatchEvent(new Event('shortstop:navigate')); // What nav-hook.js fires.
  }

  async function run() {
    await wait(500);
    const engine = ShortStop.engines[0];
    check('engine started for this host', engine);
    if (!engine) return;

    if (plan.blockSite) {
      const [first] = state.navigations;
      check('site is sent to the blocked page', first && first.url === `blocked://${plan.url}`, JSON.stringify(first));
      check('blocked-page redirect replaces history', first && first.replace === true);
      await wait(1600);
      check('block is counted once', state.counted === 1, `counted ${state.counted}`);
      return;
    }

    check('generated stylesheet injected', document.getElementById(`shortstop-${plan.platform}`));
    checkExpectations('data-expect', 'initial');

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
    const expectedCount = document.querySelectorAll('[data-count]').length;
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

    // Toggle back on: same state as before, no double counting.
    const countBefore = state.counted;
    setSettings(true);
    await wait(400);
    checkExpectations('data-expect', 'toggled on again');
    // Re-hiding after a toggle counts again; make sure it is exactly one pass worth.
    await wait(1700);
    check('re-enabling counts one pass only', state.counted - countBefore <= expectedCount, `+${state.counted - countBefore}`);

    for (const phase of plan.phases || []) {
      navigateTo(phase.url);
      await wait(400);
      checkExpectations(`data-expect-${phase.name}`, `on ${phase.name}`);
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
