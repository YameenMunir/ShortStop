/*
 * ShortStop: Reddit (focus mode)
 * ==============================
 * Reddit's algorithmic feeds are treated like the other platforms' feeds:
 * the Home feed (every sort order), Popular, All, and Explore / topic pages.
 * On those routes the content area is hidden from the first paint and
 * replaced with a ShortStop panel, with a Reddit search box.
 *
 * Still available on purpose:
 *   - A community (subreddit) you open, like a Facebook group you open
 *   - Posts and their comments
 *   - Search, profiles, saved posts, chat and messages
 *
 * Works on www.reddit.com and old.reddit.com (same URLs, different markup),
 * so selectors key off URLs rather than either layout's class names.
 * See README.md for how to update them.
 */
ShortStop.start({
  id: 'reddit',
  hosts: ['reddit.com'],

  // Named pages (matched against location.pathname, first match wins).
  pages: {
    home: /^\/(?:best|hot|new|top|rising)?\/?$/, // The Home feed and its sort orders.
    popular: /^\/r\/(?:popular|all)(?:\/|$)/, // r/popular and r/all, any sort.
    explore: /^\/(?:explore|t)(?:\/|$)/, // Explore and topic pages.
    search: /^\/search(?:\/|$)/,
  },

  cover: {
    // www.reddit.com's <main>; old.reddit.com's content column.
    target: ['main', 'div.content[role="main"]'],
    title: 'Scrolling is blocked by your focus settings.',
    pages: {
      home: { message: 'Your Reddit Home feed is switched off.' },
      popular: { message: 'Popular and All are switched off.' },
      explore: { message: 'Explore and topic feeds are switched off.' },
    },
    search: {
      label: 'Search Reddit',
      placeholder: 'Search for a community or post',
      url: (query) => `/search/?q=${encodeURIComponent(query)}`,
    },
    links: () => [
      { label: 'Your profile', href: '/user/me/' },
      { label: 'Saved posts', href: '/user/me/saved/' },
      { label: 'Chat', href: 'https://chat.reddit.com/' },
    ],
  },

  rules: [
    /* ---- Navigation into feeds ---- */
    {
      name: 'Popular and All links',
      // Exact paths, so communities like r/allthingsX or r/popularmemes stay.
      selector:
        'a[href="/r/popular"], a[href^="/r/popular/"], a[href^="/r/popular?"], a[href="/r/all"], a[href^="/r/all/"], a[href^="/r/all?"]',
    },
    {
      name: 'Explore link',
      selector: 'a[href="/explore"], a[href^="/explore/"]',
    },

    /* ---- Recommendations on pages that stay open (English headings) ---- */
    {
      name: 'Recommended posts and communities',
      selector: 'h2, h3, span, faceplate-tracker span',
      text: /^(More posts you may like|Related posts|Similar posts|Popular posts|Trending today|Popular communities|Recommended for you)$/i,
      closest: 'aside, section, [role="complementary"]',
      count: true,
    },
  ],
});
