/*
 * ShortStop: Facebook
 * ===================
 * - /reel/ID and /reels/ go to the home feed; a Page's /name/reels/ tab and
 *   profile.php?sk=reels_tab go back to the Page/profile.
 * - The Reels shortcut in the navigation and the Reels tab on Pages are hidden.
 * - Feed posts and "Reels and short videos" carousels that link to Reels are hidden.
 *
 * Facebook's class names are generated per build, so selectors use URLs and
 * ARIA roles only. See README.md for how to update them.
 */
ShortStop.start({
  id: 'facebook',
  hosts: ['facebook.com'],

  redirects: [
    { name: 'Reel viewer', match: /^\/reels?(\/|$)/, to: () => '/' },
    {
      name: "A Page's Reels tab to the Page",
      match: /^\/([^/]+)\/reels\/?$/,
      to: (match) => `/${match[1]}/`,
    },
    {
      name: 'Profile Reels tab to the profile',
      match: /^\/profile\.php$/,
      when: (url) => url.searchParams.get('sk') === 'reels_tab',
      to: (match, url) => `/profile.php?id=${encodeURIComponent(url.searchParams.get('id') || '')}`,
    },
  ],

  rules: [
    /* ---- Navigation ---- */
    {
      name: 'Reels shortcut in the navigation (whole list item)',
      selector: 'div[role="navigation"] li:has(a[href*="/reel/"])',
    },
    {
      name: 'Reels shortcut in the navigation (bare link)',
      selector: 'div[role="navigation"] a[href*="/reel/"]',
    },
    {
      name: 'Reels tab on Pages and profiles',
      selector: 'a[role="tab"][href*="/reels"], a[role="tab"][href*="sk=reels_tab"]',
    },

    /* ---- Feed ---- */
    {
      name: 'Feed post or carousel containing Reels',
      selector: 'div[role="feed"] > div:has(a[href*="/reel/"])',
      count: true,
    },
    {
      name: 'Reels carousel outside the main feed (English label)',
      selector: 'div[aria-label="Reels"], div[aria-label="Reels and short videos"]',
      count: true,
    },

    /* ---- Anything else that links to a Reel (search, Watch, profiles) ---- */
    {
      name: 'Leftover Reel link',
      selector: 'a[href*="/reel/"]',
    },
  ],
});
