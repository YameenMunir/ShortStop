/*
 * ShortStop: X, formerly Twitter (focus mode)
 * ============================================
 * The Home timeline ("For you" and "Following" share /home), Explore and
 * topic timelines are treated like the other platforms' feeds: the content
 * area is hidden from the first paint and replaced with a ShortStop panel,
 * with an X search box. While a feed is covered, X's j/k and space shortcuts
 * are swallowed and any video that starts playing is paused.
 *
 * Still available on purpose:
 *   - Search results
 *   - Messages and chat
 *   - Profiles and single posts you open, bookmarks and lists
 *   - Notifications, only if "Allow notifications" is on in the popup
 *
 * Selectors prefer X's data-testid attributes (used by its own tests, so
 * they change far less than its generated class names) and URL patterns.
 * See README.md for how to update them.
 */

// Your own profile link in X's navigation, if it has rendered yet.
function findOwnXProfileHref() {
  const link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
  const href = link && link.getAttribute('href');
  return href && /^\/[A-Za-z0-9_]+$/.test(href) ? href : null;
}

ShortStop.start({
  id: 'x',
  hosts: ['x.com', 'twitter.com'],

  // Named pages (matched against location.pathname, first match wins).
  pages: {
    home: /^\/home\/?$/,
    explore: /^\/(?:explore(?:\/|$)|i\/topics\/)/, // Explore, its tabs and topic timelines.
    notifications: /^\/notifications(?:\/|$)/,
    search: /^\/search(?:\/|$)/,
    messages: /^\/(?:messages|i\/chat)(?:\/|$)/,
  },

  // Extra switches shown in the popup under X.
  options: {
    notifications: { setting: 'xNotifications', default: false },
  },

  cover: {
    // X's content area (the timeline and the right-hand column); the left
    // navigation sits outside it.
    target: ['main[role="main"]', 'main'],
    title: 'Scrolling is blocked by your focus settings.',
    pages: {
      home: { message: 'Your X timeline is switched off, For you and Following both.' },
      explore: { message: 'Explore and trending are switched off.' },
      notifications: {
        message: 'Notifications are switched off. Turn on "Allow notifications" in the ShortStop menu if you need them.',
        onlyIf: (options) => !options.notifications,
      },
    },
    search: {
      label: 'Search X',
      placeholder: 'Search for a person or post',
      url: (query) => `/search?q=${encodeURIComponent(query)}&src=typed_query`,
    },
    links: (options) => [
      { label: 'Messages', href: '/messages' },
      { label: 'Bookmarks', href: '/i/bookmarks' },
      options.notifications && { label: 'Notifications', href: '/notifications' },
      { label: 'Your profile', href: findOwnXProfileHref() },
    ],
  },

  rules: [
    /* ---- Navigation into feeds ---- */
    {
      name: 'Home link in the navigation',
      selector: 'a[data-testid="AppTabBar_Home_Link"], nav a[href="/home"]',
    },
    {
      name: 'Explore link in the navigation',
      selector: 'a[data-testid="AppTabBar_Explore_Link"], nav a[href="/explore"]',
    },
    {
      name: 'Notifications link',
      selector: 'a[data-testid="AppTabBar_Notifications_Link"], nav a[href="/notifications"]',
      onlyIf: (options) => !options.notifications,
    },

    /* ---- Recommendations beside pages that stay open ---- */
    {
      name: 'Trends in the right-hand column',
      selector: '[aria-label="Timeline: Trending now"], [data-testid="sidebarColumn"] section:has([data-testid="trend"])',
    },
    {
      name: '"Who to follow" in the right-hand column',
      // Only the labelled box: "Relevant people" on a post also lists accounts, and stays.
      selector: 'aside[aria-label="Who to follow"]',
    },
    {
      name: 'Other recommendation boxes in the right-hand column (English headings)',
      selector: '[data-testid="sidebarColumn"] :is(h2, span)',
      text: /^(What's happening|Trends for you|Who to follow|You might like|Today's News|Live on X)$/i,
      closest: 'section, aside',
    },
  ],
});
