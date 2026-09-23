/*
 * ShortStop: YouTube
 * ==================
 * - /shorts/VIDEO_ID opens in the normal player (/watch?v=VIDEO_ID).
 * - Shorts shelves are hidden on home, search, subscriptions, channel and watch pages.
 * - The Shorts entries in the sidebar, mini sidebar, channel tabs, search filter
 *   chips and the mobile (m.youtube.com) bottom bar are removed.
 *
 * WHEN YOUTUBE CHANGES: open DevTools on the page, inspect the Shorts element
 * that slipped through, and add or adjust a rule below. See README.md.
 */
ShortStop.start({
  id: 'youtube',
  hosts: ['youtube.com'],

  // YouTube's own SPA events (desktop, then m.youtube.com).
  navigationEvents: ['yt-navigate-finish', 'yt-page-data-updated', 'state-navigateend'],

  redirects: [
    {
      name: 'Shorts player to the regular player',
      match: /^\/shorts\/([\w-]{5,})/,
      to: (match) => `/watch?v=${match[1]}`,
    },
    {
      name: 'Bare Shorts feed to the home page',
      match: /^\/shorts\/?$/,
      to: () => '/',
    },
  ],

  rules: [
    /* ---- Shelves and sections (containers first) ---- */
    {
      name: 'Shorts shelf on search, watch and channel pages',
      selector: 'ytd-reel-shelf-renderer',
      count: true,
    },
    {
      name: 'Shorts section on the home page',
      selector: 'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
      count: true,
    },
    {
      name: 'Shorts rich shelf (outside a section)',
      selector: 'ytd-rich-shelf-renderer[is-shorts]',
      count: true,
    },
    {
      name: 'Shorts grid shelf in search (2025 layout)',
      selector:
        'grid-shelf-view-model:has(ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, a[href^="/shorts/"])',
      count: true,
    },
    {
      name: 'Mobile: Shorts section on the home page',
      selector:
        'ytm-rich-section-renderer:has(ytm-reel-shelf-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2)',
      count: true,
    },
    {
      name: 'Mobile: Shorts shelf (outside a section)',
      selector: 'ytm-reel-shelf-renderer',
      count: true,
    },

    /* ---- Individual Shorts mixed into normal video lists ---- */
    {
      name: 'Short in the home / subscriptions grid',
      selector: 'ytd-rich-item-renderer:has(a[href^="/shorts/"])',
      count: true,
    },
    {
      name: 'Short in search results',
      selector: 'ytd-video-renderer:has(a[href^="/shorts/"])',
      count: true,
    },
    {
      name: 'Short in a channel or legacy grid',
      selector: 'ytd-grid-video-renderer:has(a[href^="/shorts/"])',
      count: true,
    },
    {
      name: 'Short in watch-page suggestions',
      selector: 'ytd-compact-video-renderer:has(a[href^="/shorts/"])',
      count: true,
    },
    {
      name: 'Mobile: Short in a video list',
      selector:
        'ytm-video-with-context-renderer:has(a[href^="/shorts/"]), ytm-rich-item-renderer:has(a[href^="/shorts/"])',
      count: true,
    },
    {
      name: 'Any leftover Shorts tile',
      selector: 'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ytd-reel-item-renderer',
      count: true,
    },

    /* ---- Navigation entry points ---- */
    {
      name: 'Sidebar "Shorts" entry',
      selector:
        'ytd-guide-entry-renderer:has(a[title="Shorts"]), ytd-guide-entry-renderer:has(a[href^="/shorts"])',
    },
    {
      name: 'Mini sidebar "Shorts" entry',
      selector:
        'ytd-mini-guide-entry-renderer[aria-label="Shorts"], ytd-mini-guide-entry-renderer:has(a[title="Shorts"])',
    },
    {
      name: 'Channel page "Shorts" tab',
      selector: 'yt-tab-shape[tab-title="Shorts"], tp-yt-paper-tab:has(a[href$="/shorts"])',
    },
    {
      name: 'Search filter chip "Shorts"',
      selector: 'yt-chip-cloud-chip-renderer, chip-shape',
      text: /^Shorts$/i, // Text match needs JS, so this rule is not in the CSS.
    },
    {
      name: 'Mobile: bottom bar "Shorts" tab',
      selector: 'ytm-pivot-bar-item-renderer:has(.pivot-shorts)',
    },
  ],
});
