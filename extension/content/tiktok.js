/*
 * ShortStop: TikTok (focus mode)
 * ==============================
 * While TikTok's switch is on, the popup offers two choices (`mode`):
 *
 *   'all'    Block all of TikTok: every page shows the ShortStop panel over the
 *            whole window, search, messages and single videos included.
 *   'feeds'  Block the feeds (the default), described below.
 *
 * TikTok is short videos all the way through, so there is no "short videos
 * only" choice. A focus session keeps the choice as it is.
 *
 * 'feeds': every algorithmic feed is treated the same: For You, Following, Friends,
 * LIVE, Explore, Short dramas and the discovery pages behind hashtags, sounds
 * and topics.
 * On those routes the feed area is hidden from the first paint and replaced
 * with a ShortStop panel, so there is no feed to switch to as a way around the
 * block. While a feed is covered, the scroll and next-video keys are swallowed
 * and any video that tries to play is paused (see core.js).
 *
 * Still available on purpose:
 *   - Search (TikTok's own search bar, or the search box on the panel)
 *   - Direct messages
 *   - Profiles and single videos you open deliberately
 *     (without "You may like" / suggested-account recommendations)
 *   - Uploading and TikTok Studio
 *   - Your account settings
 *   - Notifications, only if "Allow notifications" is on in the popup
 *
 * Routes are re-checked on every pushState, popstate and DOM change, so this
 * holds up while TikTok navigates without reloading.
 *
 * Selectors prefer TikTok's own data-e2e attributes (they exist for TikTok's
 * automated tests and change far less than its generated class names) and
 * URL patterns. See README.md for how to update them.
 */

// Your own profile link in TikTok's navigation, if it has rendered yet.
// Logged out, TikTok renders it as a bare "/@", which is no use as a link.
function findOwnTikTokProfileHref() {
  const element = document.querySelector('[data-e2e="nav-profile"]');
  const link = element && (element.closest('a[href]') || element.querySelector('a[href]'));
  const href = link && link.getAttribute('href');
  return href && /^\/@[^/?#]+/.test(href) ? href : null;
}

// 'all': the panel covers the whole window on every TikTok page.
const tiktokBlockedPage = (options) =>
  options.mode === 'all'
    ? {
        title: 'TikTok is blocked.',
        message: 'Switch TikTok off in ShortStop, or choose a lighter setting under it, to use TikTok.',
        target: [], // No content area: the full-window panel covers everything.
        search: null,
        links: () => [],
      }
    : null;

// A feed page: blocked in 'all', covered with its own message in 'feeds'.
const tiktokFeedPage = (message) => (options) => tiktokBlockedPage(options) || { message };

ShortStop.start({
  id: 'tiktok',
  hosts: ['tiktok.com'],

  // Named pages (matched against location.pathname, first match wins).
  // Covered pages are listed under `cover.pages` below.
  pages: {
    foryou: /^\/(?:[a-z]{2}\/?)?$|^\/foryou\/?$/, // "/", "/en/", "/foryou"
    following: /^\/following\/?$/,
    friends: /^\/friends\/?$/,
    live: /^\/(?:live(?:\/|$)|@[^/]+\/live(?:\/|$))/, // LIVE feed and individual streams.
    explore: /^\/(?:explore|discover|channel|tag|music|trending|topics?)(?:\/|$)/,
    // Catalog and episodes (/shortdrama/episode/<series>/<n>): episodes play on through a series.
    shortdrama: /^\/shortdrama(?:\/|$)/,
    notifications: /^\/(?:notifications|activity|inbox)(?:\/|$)/,
    video: /^\/@[^/]+\/(?:video|photo)\//, // A single video or photo post.
    search: /^\/search(?:\/|$)/,
    messages: /^\/messages(?:\/|$)/,
  },

  // Extra switches and the choice of what to block, shown in the popup under TikTok.
  options: {
    notifications: { setting: 'tiktokNotifications', default: false },
    mode: { setting: 'tiktokMode', default: 'feeds', values: ['all', 'feeds'] },
  },

  cover: {
    // The feed column. TikTok names it main-content-<page>; <main> is the
    // fallback. The panel goes where the feed was, next to TikTok's sidebar.
    target: ['div[id^="main-content-"]', 'main'],
    title: 'Scrolling is blocked by your focus settings.',
    // A page's panel depends on the choice under TikTok's switch.
    pages: {
      foryou: tiktokFeedPage("TikTok's For You feed is switched off."),
      following: tiktokFeedPage('The Following feed is switched off.'),
      friends: tiktokFeedPage('The Friends feed is switched off.'),
      live: tiktokFeedPage('LIVE is switched off.'),
      explore: tiktokFeedPage('Explore and discovery feeds are switched off.'),
      shortdrama: tiktokFeedPage('Short dramas are switched off.'),
      notifications: (options) =>
        tiktokBlockedPage(options) ||
        (options.notifications
          ? null
          : { message: 'Notifications are switched off. Turn on "Allow notifications" in the ShortStop menu if you need them.' }),
      video: tiktokBlockedPage,
      search: tiktokBlockedPage,
      messages: tiktokBlockedPage,
      other: tiktokBlockedPage, // Profiles, uploading, settings...
    },
    search: {
      label: 'Search TikTok',
      placeholder: 'Search for an account or video',
      url: (query) => `/search?q=${encodeURIComponent(query)}`,
    },
    links: () => [
      { label: 'Messages', href: '/messages' },
      { label: 'Upload a video', href: '/tiktokstudio/upload' },
      { label: 'Your profile', href: findOwnTikTokProfileHref() },
    ],
  },

  rules: [
    /* ---- Sidebar and top-bar links into feeds ---- */
    {
      name: 'For You link (TikTok points it at "/")',
      selector: '[data-e2e="nav-foryou"], a[href^="/foryou"]',
    },
    {
      name: 'Following link',
      selector: '[data-e2e="nav-following"], a[href="/following"], a[href^="/following?"]',
    },
    {
      name: 'Friends link',
      selector: '[data-e2e="nav-friends"], a[href="/friends"], a[href^="/friends?"]',
    },
    {
      name: 'Explore link',
      selector: '[data-e2e="nav-explore"], a[href="/explore"], a[href^="/explore?"]',
    },
    {
      name: 'LIVE link',
      selector: '[data-e2e="nav-live"], a[href="/live"], a[href^="/live?"], a[href^="/live/"]',
    },
    {
      name: 'Short drama link (a short-form series feed shown to some users)',
      selector: '[data-e2e="nav-short-drama"], a[href="/shortdrama"], a[href^="/shortdrama/"], a[href^="/shortdrama?"]',
    },
    {
      name: 'Notifications / inbox button',
      selector: '[data-e2e="inbox-icon"], [data-e2e="nav-activity"], a[href^="/notifications"]',
      onlyIf: (options) => !options.notifications,
    },

    /* ---- Recommendations on pages that stay open ---- */
    {
      name: 'Suggested accounts list',
      selector: '[data-e2e="suggest-accounts"], [data-e2e="suggested-accounts"]',
    },
    {
      name: 'Recommendation sections on profiles and videos (English headings)',
      selector: 'h2, h3, h4, p, span, div[role="heading"]',
      text: /^(You may like|Suggested accounts|Suggested for you|Recommended for you|Related videos|More videos)$/i,
      // The nearest block that holds video/profile links, but never the page's
      // main video player or the profile header.
      closest: 'div:has(a[href*="/video/"], a[href^="/@"]):not(:has(video, [data-e2e="user-page"], h1))',
      page: ['video', 'other'],
      count: true,
    },
  ],
});
