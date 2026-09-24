/*
 * ShortStop welcome page
 * ======================
 * Opened once, in a new tab, when ShortStop is first installed (see background.js).
 * It explains the blocking panel and walks through two setup steps that a browser
 * won't do for you:
 *
 *   - Pinning the toolbar icon. Extensions can't pin themselves, but they can
 *     read whether they are pinned (chrome.action.getUserSettings).
 *   - Allowing ShortStop in private windows. Browsers switch extensions off there
 *     unless you opt in, so blocking would not apply. The page reads the setting
 *     (chrome.extension.isAllowedIncognitoAccess) and can open the settings page.
 *
 * Both are re-checked as you change them, so the ticks appear without a refresh.
 * Where a browser can't answer, the step says so and shows the manual instructions.
 * Nothing here reads the sites you visit or sends anything anywhere.
 */
'use strict';

const { OFF_WAIT_SECONDS } = globalThis.ShortStopPause;

const POLL_MS = 1500; // How often to re-check while the page is visible.

/* ------------------------------------------------------------------ */
/* Which browser is this? It decides the wording and the settings link.  */
/* ------------------------------------------------------------------ */

function detectBrowser() {
  const agent = navigator.userAgent;
  if (agent.includes('Firefox/')) return 'firefox';
  if (agent.includes('Edg/')) return 'edge';
  if (navigator.brave) return 'brave';
  return 'chrome';
}

const BROWSER = detectBrowser();

const WORDS = {
  chrome: { privateName: 'Incognito windows', toggle: 'Allow in Incognito', scheme: 'chrome' },
  edge: { privateName: 'InPrivate windows', toggle: 'Allow in InPrivate', scheme: 'edge' },
  brave: { privateName: 'private windows', toggle: 'Allow in Private', scheme: 'brave' },
  firefox: { privateName: 'private windows', toggle: 'Run in Private Windows', scheme: null },
}[BROWSER];

const PIN_STEPS =
  BROWSER === 'firefox'
    ? 'Click the puzzle-piece Extensions button in the toolbar, open the gear next to ShortStop and choose Pin to Toolbar, so the switches are one click away.'
    : 'Click the puzzle-piece Extensions button in the toolbar, then the pin next to ShortStop, so the switches are one click away.';

const PRIVATE_STEPS =
  BROWSER === 'firefox'
    ? `Open the Add-ons page (about:addons), choose ShortStop, and set “${WORDS.toggle}” to Allow.`
    : `Open ShortStop's settings and turn on “${WORDS.toggle}”.`;

const CANT_TELL = "This browser can't tell us. ";

/* ------------------------------------------------------------------ */
/* Reading the browser's state                                          */
/* ------------------------------------------------------------------ */

// true / false, or null when this browser can't answer.
async function readSetup() {
  const setup = { pinned: null, privateAllowed: null };
  try {
    if (chrome.action && chrome.action.getUserSettings) {
      setup.pinned = (await chrome.action.getUserSettings()).isOnToolbar === true;
    }
  } catch (error) {
    /* Leave it as "can't tell". */
  }
  try {
    if (chrome.extension && chrome.extension.isAllowedIncognitoAccess) {
      setup.privateAllowed = Boolean(await chrome.extension.isAllowedIncognitoAccess());
    }
  } catch (error) {
    /* Leave it as "can't tell". */
  }
  return setup;
}

/* ------------------------------------------------------------------ */
/* Showing it                                                           */
/* ------------------------------------------------------------------ */

const STATUS_TEXT = { done: 'Done', todo: 'To do', unknown: 'Check by hand' };

function setStatus(name, state) {
  const status = document.querySelector(`[data-check="${name}"] .status`);
  status.dataset.state = state;
  status.querySelector('.status-text').textContent = STATUS_TEXT[state];
}

function stateOf(value) {
  if (value === null) return 'unknown';
  return value ? 'done' : 'todo';
}

// Called with what the browser reported, on load and every time it changes.
function applySetup({ pinned, privateAllowed }) {
  const pin = stateOf(pinned);
  setStatus('pin', pin);
  document.getElementById('pin-help').textContent = {
    done: 'ShortStop is on your toolbar.',
    todo: PIN_STEPS,
    unknown: CANT_TELL + PIN_STEPS,
  }[pin];

  const priv = stateOf(privateAllowed);
  setStatus('private', priv);
  document.getElementById('private-help').textContent = {
    done: `ShortStop also runs in ${WORDS.privateName}.`,
    todo: `Browsers switch extensions off in ${WORDS.privateName} unless you allow it, so blocking wouldn't apply there. ${PRIVATE_STEPS}`,
    unknown: CANT_TELL + PRIVATE_STEPS,
  }[priv];
  // Only browsers with an extensions page we can link to get the button.
  document.getElementById('open-settings').hidden = !WORDS.scheme || priv === 'done';

  document.getElementById('all-set').hidden = !(pin === 'done' && priv === 'done');
}

async function refresh() {
  applySetup(await readSetup());
}

/* ------------------------------------------------------------------ */
/* Start-up                                                             */
/* ------------------------------------------------------------------ */

function openSettings() {
  const url = `${WORDS.scheme}://extensions/?id=${chrome.runtime.id}`;
  chrome.tabs.create({ url }).catch(() => {
    // Some browsers refuse to open their own settings pages from an extension.
    document.getElementById('private-help').textContent =
      `Open ${WORDS.scheme}://extensions in a new tab, choose ShortStop, then Details, and turn on “${WORDS.toggle}”.`;
  });
}

function init() {
  for (const node of document.querySelectorAll('[data-private-name]')) node.textContent = WORDS.privateName;
  for (const node of document.querySelectorAll('[data-off-wait]')) node.textContent = String(OFF_WAIT_SECONDS);

  document.getElementById('open-settings').addEventListener('click', openSettings);

  refresh();
  // Pick up changes made in another tab (pinning, or the private-window switch).
  setInterval(() => {
    if (document.visibilityState === 'visible') refresh();
  }, POLL_MS);
  window.addEventListener('focus', refresh);
}

init();
