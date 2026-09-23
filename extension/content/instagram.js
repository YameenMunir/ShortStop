/*
 * ShortStop: Instagram (focus mode)
 * =================================
 * Instagram's Home feed, Explore, Reels and Stories are all built to keep you
 * scrolling, so they are treated the same: the page's content area is hidden
 * from the first paint and replaced with a ShortStop panel. There is nothing
 * left to scroll, so the Home feed is no loophole around blocking Reels.
 *
 * Still available on purpose:
 *   - Direct Messages (Reels shared in DMs are blurred and unclickable)
 *   - Searching for an account (/explore/search/, or the sidebar Search panel)
 *   - Profiles and single posts you open deliberately (minus the Reels tab
 *     and "Suggested for you" accounts)
 *   - Posting
 *   - Notifications, only if "Allow notifications" is on in the popup
 *
 * Routes are re-checked on every pushState, popstate and DOM change (see
 * core.js), so this holds up while Instagram navigates without reloading.
 *
 * Instagram's class names are generated and change often, so every selector
 * here keys off URLs, ARIA roles/labels or element names. See README.md for
 * how to update them.
 */

// Your own profile link in Instagram's navigation (not someone's post avatar).
function findOwnProfileHref() {
  for (const link of document.querySelectorAll('a[href^="/"]:has(img[alt*="profile picture"])')) {
    if (!link.closest('main')) return link.getAttribute('href');
  }
  return null;
}

ShortStop.start({
  id: 'instagram',
  hosts: ['instagram.com'],

  // Named pages (matched against location.pathname, first match wins).
  // Covered pages are listed under `cover.pages` below.
  pages: {
    home: /^\/$/,
    search: /^\/explore\/search\/?$/, // Account search only; checked before "explore".
    explore: /^\/explore(\/|$)/, // Explore grid, hashtags, places, suggested people, keyword results.
    reels: /^\/(reels?|[^/]+\/reel)(\/|$)/, // /reels/, /reel/ID, /username/reel/ID
    stories: /^\/stories(\/|$)/, // Stories and highlights viewer.
    notifications: /^\/(accounts\/activity|notifications)(\/|$)/,
    direct: /^\/direct(\/|$)/,
  },

  // Extra switches shown in the popup under Instagram.
  options: {
    notifications: { setting: 'instagramNotifications', default: false },
  },

  redirects: [
    {
      name: "A profile's Reels tab to its main grid",
      match: /^\/([^/]+)\/reels\/?$/,
      to: (match) => `/${match[1]}/`,
    },
    // Home, Explore, Reels and Stories are covered rather than redirected: a
    // redirect could loop if Instagram bounced the destination back.
  ],

  cover: {
    target: 'main', // Instagram's content area; the navigation lives outside it.
    message:
      "ShortStop has switched off Instagram's feeds, so there's nothing to scroll. " +
      'Messages, search and profiles still work.',
    pages: {
      home: { title: 'Your feed is off' },
      explore: { title: 'Explore is off' },
      reels: { title: 'Reels are off' },
      stories: { title: 'Stories are off' },
      notifications: {
        title: 'Notifications are off',
        message: 'Turn on "Allow notifications" in the ShortStop menu if you need them.',
        onlyIf: (options) => !options.notifications,
      },
    },
    links: (options) => [
      { label: 'Messages', href: '/direct/inbox/' },
      { label: 'Search for an account', href: '/explore/search/' },
      options.notifications && { label: 'Notifications', href: '/accounts/activity/' },
      { label: 'Your profile', href: findOwnProfileHref() },
    ],
  },

  rules: [
    /* ---- Navigation ---- */
    {
      name: 'Reels link in the sidebar / bottom bar',
      selector: 'a[href="/reels/"], a[href^="/reels/?"]',
    },
    {
      name: 'Reels tab on profiles',
      selector: 'a[role="tab"][href$="/reels/"]',
    },
    {
      name: 'Notifications link (mobile top bar)',
      selector: 'a[href^="/accounts/activity"], a[href^="/notifications"]',
      onlyIf: (options) => !options.notifications,
    },
    {
      name: 'Notifications button (desktop sidebar opens a panel, not a page)',
      selector: 'svg[aria-label="Notifications"]',
      closest: 'a, [role="link"], [role="button"]',
      onlyIf: (options) => !options.notifications,
    },

    /* ---- Recommendations on pages that stay open ---- */
    {
      name: '"See all" suggested accounts link',
      selector: 'a[href^="/explore/people"]',
    },
    {
      name: '"Suggested for you" accounts on profiles',
      selector: 'main span, main h2, main h3, main h4, main div[role="heading"]',
      page: 'other', // Profiles and posts. Covered pages are hidden already.
      text: /^Suggested for you$/i,
      // The nearest block that holds the account cards (they have Follow
      // buttons), but never the profile header itself.
      closest: 'div:has(button):not(:has(header, h1, h2))',
      count: true,
    },
    {
      name: 'Post grid on the search page (only account results should show)',
      selector: 'main a[href*="/p/"], main a[href*="/reel/"]',
      page: 'search',
      count: true,
    },

    /* ---- Direct messages: blur rather than hide, so the chat still reads ---- */
    {
      name: 'Reel link shared in a DM',
      selector: 'a[href*="/reel/"]',
      page: 'direct',
      action: 'blur',
      count: true,
    },
    {
      name: 'Reel preview card shared in a DM',
      selector: 'svg[aria-label="Clip"], svg[aria-label="Reel"]',
      closest: 'a, div[role="button"]', // Innermost clickable card around the badge.
      page: 'direct',
      action: 'blur',
      count: true,
    },
  ],
});
