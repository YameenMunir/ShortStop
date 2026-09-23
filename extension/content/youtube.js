/*
 * ShortStop: YouTube (focus mode)
 * ===============================
 * Shorts:
 * - /shorts/VIDEO_ID opens in the normal player (/watch?v=VIDEO_ID).
 * - Shorts shelves are hidden on search, subscriptions, channel and watch pages.
 * - The Shorts entries in the sidebar, mini sidebar, channel tabs, search filter
 *   chips and the mobile (m.youtube.com) bottom bar are removed.
 *
 * Recommendations, the same way as the other platforms' feeds:
 * - The home page's recommended grid, Trending/Explore and Gaming are covered
 *   by the ShortStop panel (with a YouTube search box).
 * - On the watch page the "Up next" list, end-screen video walls, end cards
 *   and the autoplay countdown are hidden, and autoplay is switched off.
 * - Search results lose their "For you" / "People also watched" shelves.
 *
 * Still available on purpose: search, subscriptions, playlists (including
 * playing through them), channels, history, Watch later and any video you
 * open. The miniplayer keeps playing when you go back to the home page.
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

  // Named pages (matched against location.pathname, first match wins).
  pages: {
    home: /^\/$/,
    explore: /^\/(?:feed\/(?:trending|explore)|gaming)(?:\/|$)/,
    watch: /^\/watch(?:\/|$)/,
    search: /^\/results(?:\/|$)/,
  },

  cover: {
    // Every browse page YouTube keeps in memory is hidden on covered pages;
    // the panel sits in front of them. m.youtube.com uses ytm-browse.
    target: ['ytd-browse', 'ytm-browse'],
    title: 'Scrolling is blocked by your focus settings.',
    // The miniplayer may be playing a video you chose, and its keyboard
    // controls must keep working, so do not pause media or swallow keys here.
    pauseMedia: false,
    blockKeys: false,
    pages: {
      home: { message: "YouTube's recommended videos are switched off." },
      explore: { message: 'Trending, Explore and Gaming are switched off.' },
    },
    search: {
      label: 'Search YouTube',
      placeholder: 'Search for a video or channel',
      url: (query) => `/results?search_query=${encodeURIComponent(query)}`,
    },
    links: () => [
      { label: 'Subscriptions', href: '/feed/subscriptions' },
      { label: 'Watch later', href: '/playlist?list=WL' },
      { label: 'Your playlists', href: '/feed/playlists' },
      { label: 'History', href: '/feed/history' },
    ],
  },

  // Autoplay: switch YouTube's own toggle off, and if an autoplay countdown
  // appears anyway (e.g. the toggle has not rendered yet), cancel it.
  effects: [
    {
      name: 'Switch autoplay off',
      page: 'watch',
      run: () => {
        const toggle = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
        if (toggle) (toggle.closest('button') || toggle).click();
      },
    },
    {
      name: 'Cancel the autoplay countdown',
      run: () => {
        // YouTube keeps the overlay in the page and shows it with an inline
        // style only while counting down (our CSS hides it either way).
        const overlay = document.querySelector('.ytp-autonav-endscreen-countdown-overlay');
        if (!overlay || overlay.style.display === 'none') return;
        const cancel = overlay.querySelector('.ytp-autonav-endscreen-upnext-cancel-button');
        if (cancel) cancel.click();
      },
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

    /* ---- Recommendations (focus mode) ---- */
    {
      name: '"Up next" recommendations beside or below the video',
      // Only the recommendations list: the playlist panel and live chat share
      // the same column and stay.
      selector: 'ytd-watch-next-secondary-results-renderer',
      count: true,
    },
    {
      name: 'Mobile: related videos under the video',
      selector:
        'ytm-item-section-renderer[section-identifier="related-items"], ytm-watch-next-secondary-results-renderer',
      count: true,
    },
    {
      name: 'End screen: video wall, end cards and autoplay countdown',
      selector: '.html5-endscreen, .ytp-ce-element, .ytp-autonav-endscreen-countdown-overlay',
    },
    {
      name: 'Paused-video "More videos" overlay',
      selector: '.ytp-pause-overlay, .ytp-pause-overlay-container',
    },
    {
      name: 'Recommendation shelves in search results (English titles)',
      selector: 'ytd-shelf-renderer #title, ytd-horizontal-card-list-renderer #title',
      text: /^(For you|People also watched|Channels new to you|From related searches|Explore more)$/i,
      closest: 'ytd-shelf-renderer, ytd-horizontal-card-list-renderer',
      page: 'search',
      count: true,
    },
    {
      name: 'Sidebar links to Trending, Explore and Gaming',
      selector:
        'ytd-guide-entry-renderer:has(a[href^="/feed/trending"], a[href^="/feed/explore"], a[href^="/gaming"])',
    },
  ],
});
