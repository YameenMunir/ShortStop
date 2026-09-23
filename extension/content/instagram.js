/*
 * ShortStop: Instagram
 * ====================
 * - /reels/, /reel/ID and /username/reel/ID go to the home feed;
 *   /username/reels/ goes to that profile's normal grid.
 * - The Reels link (sidebar and mobile bottom bar) and profile Reels tab are hidden.
 * - Reel posts in the home feed and Reel tiles in Explore are hidden.
 * - Reels shared in DMs are blurred and made unclickable.
 *
 * Instagram's class names are generated and change often, so every selector
 * here keys off URLs, ARIA roles/labels or element names. See README.md for
 * how to update them.
 */
ShortStop.start({
  id: 'instagram',
  hosts: ['instagram.com'],

  // Named pages, used to scope rules below (matched against location.pathname).
  pages: {
    home: /^\/$/,
    explore: /^\/explore(\/|$)/,
    direct: /^\/direct(\/|$)/,
  },

  redirects: [
    { name: 'Reels tab', match: /^\/reels(\/|$)/, to: () => '/' },
    { name: 'Single Reel', match: /^\/reel\//, to: () => '/' },
    { name: 'Profile-scoped Reel', match: /^\/[^/]+\/reel\//, to: () => '/' },
    {
      name: "A profile's Reels tab to its main grid",
      match: /^\/([^/]+)\/reels\/?$/,
      to: (match) => `/${match[1]}/`,
    },
  ],

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

    /* ---- Home feed ---- */
    {
      name: 'Reel post in the home feed',
      selector: 'article:has(a[href*="/reel/"])',
      page: 'home',
      count: true,
    },

    /* ---- Explore ---- */
    {
      name: 'Reel tile in Explore',
      selector: 'main a[href*="/reel/"]',
      page: 'explore',
      count: true,
    },
    {
      name: 'Explore tile with the Reel badge',
      selector: 'main a:has(svg[aria-label="Clip"], svg[aria-label="Reel"])',
      page: 'explore',
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
