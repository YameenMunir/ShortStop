/*
 * ShortStop: YouTube
 * ==================
 * While YouTube's switch is on, the popup offers three choices (`mode`):
 *
 *   'all'     Block all of YouTube: every page shows the ShortStop panel over
 *             the whole window, media is paused and feed keys are swallowed.
 *   'feeds'   Block feeds and Shorts (the default):
 *             - the home page's recommended grid, Trending/Explore and Gaming
 *               are covered by the panel (with a YouTube search box);
 *             - on the watch page "Up next", end screens, end cards and the
 *               autoplay countdown are hidden, and autoplay is switched off;
 *             - search results lose their "For you" / "People also watched"
 *               shelves;
 *             - and Shorts are removed, as below.
 *             Search, subscriptions, playlists, channels, history and any video
 *             you open keep working, and the miniplayer keeps playing.
 *   'shorts'  Block YouTube Shorts only: YouTube works normally, minus Shorts.
 *
 * Shorts are removed in every choice: /shorts/VIDEO_ID opens in the normal
 * player (/watch?v=VIDEO_ID), and Shorts shelves, cards, the sidebar and
 * mobile Shorts tabs, the channel Shorts tab and the search chip are hidden.
 * Switched off, YouTube is left completely alone, Shorts included.
 *
 * A focus session raises 'shorts' to 'feeds' (it never leaves the home feed
 * open); 'all' stays 'all'.
 *
 * Allowed channels (shared/allowlist.js): an allowed channel's own pages
 * (/@handle and its tabs) and its videos are never covered, even with 'all',
 * and its Shorts cards stay in lists. They still open in the normal player,
 * because the Shorts player would scroll straight on into other channels.
 * The home feed, Trending and Up next stay blocked: they are recommendations.
 *
 * Content preferences (`categories`, off by default): where videos are still
 * shown (home and Up next with 'shorts', search, and Subscriptions if chosen),
 * each card is sorted into a category from its title, channel and description
 * snippet, then allowed, reduced or hidden as chosen in the popup. A video
 * opened directly is only checked with the stricter option, from the watch
 * page's own details (which include YouTube's category).
 *
 * WHEN YOUTUBE CHANGES: open DevTools on the page, inspect the Shorts element
 * that slipped through, and add or adjust a rule below. See README.md.
 */
// The channel that owns the video on a /watch page, read from the player itself.
// The URL doesn't say, and during YouTube's in-page navigation the owner link
// can still be the previous video's, so only a player showing THIS video counts.
function youtubeVideoOwner(url) {
  const video = url.pathname === '/watch' ? url.searchParams.get('v') : null;
  if (!video || !/^[\w-]+$/.test(video)) return null;
  const player = document.querySelector(`ytd-watch-flexy[video-id="${video}"]`);
  const link = player && player.querySelector('ytd-video-owner-renderer a[href^="/@"], #owner a[href^="/@"]');
  return link ? ShortStopAllowlist.sites.youtube.hrefOwner(link.getAttribute('href')) : null;
}

// The video id in a /watch link, or null.
function youtubeVideoId(href) {
  try {
    const id = new URL(href, 'https://www.youtube.com').searchParams.get('v');
    return id && /^[\w-]{6,}$/.test(id) ? id : null;
  } catch (error) {
    return null;
  }
}

// What a video card shows about its video, for content preferences: search
// results (ytd-video-renderer), the new lockups (home, Up next, search) and
// the mobile site's cards. Null until the card has rendered.
function youtubeCardVideo(card) {
  const link = card.querySelector('a[href*="/watch?v="]');
  const id = link && youtubeVideoId(link.getAttribute('href'));
  if (!id) return null;
  const heading = card.querySelector('#video-title, h3[title], h3, .media-item-headline');
  const channel = card.querySelector(
    'ytd-channel-name #text, ytd-channel-name a, .ytContentMetadataViewModelMetadataText, .yt-content-metadata-view-model__metadata-text, .ytm-badge-and-byline-item-byline'
  );
  const channelLink = card.querySelector('ytd-channel-name a[href^="/@"], a[href^="/@"]');
  const snippet = card.querySelector('.metadata-snippet-text, #description-text');
  return {
    id,
    title: heading ? (heading.getAttribute('title') || heading.textContent).trim() : '',
    channel: channel ? channel.textContent.trim() : '',
    owner: channelLink ? ShortStopAllowlist.sites.youtube.hrefOwner(channelLink.getAttribute('href')) : null,
    text: snippet ? snippet.textContent : '',
  };
}

// The video on a /watch page, from the page's structured data, which also
// carries YouTube's own category. It is only trusted once it describes THIS
// video: during in-page navigation it can still be the previous one's.
function youtubeWatchVideo(url) {
  const id = url.pathname === '/watch' ? youtubeVideoId(url.href) : null;
  const script = id && document.querySelector('ytd-player-microformat-renderer script, #microformat script');
  if (!script) return null;
  let data;
  try {
    data = JSON.parse(script.textContent);
  } catch (error) {
    return null;
  }
  const embedded = String((data && data.embedUrl) || '').split('/embed/')[1] || '';
  if (embedded.split(/[?&#]/)[0] !== id) return null;
  const author = data.author && typeof data.author === 'object' ? data.author.name : data.author;
  return {
    id,
    title: String(data.name || ''),
    channel: String(author || ''),
    owner: youtubeVideoOwner(url),
    text: String(data.description || ''),
    genre: String(data.genre || ''),
  };
}

// Rules and covered pages for the feeds: on in 'feeds' and 'all', off in 'shorts'.
const youtubeBlocksFeeds = (options) => options.mode !== 'shorts';

// 'all': the panel covers the whole window on every YouTube page.
const youtubeBlockedPage = (options) =>
  options.mode === 'all'
    ? {
        title: 'YouTube is blocked.',
        message: 'Switch YouTube off in ShortStop, or choose a lighter setting under it, to use YouTube.',
        target: [], // No content area: the full-window panel covers everything.
        pauseMedia: true,
        blockKeys: true,
        search: null,
        links: () => [],
      }
    : null;

ShortStop.start({
  id: 'youtube',
  hosts: ['youtube.com'],

  // Allowed channels, chosen in the popup under YouTube.
  allowlist: {
    ...ShortStopAllowlist.sites.youtube,
    viewOwner: youtubeVideoOwner,
    itemOwners: 'a[href^="/@"]', // A card's channel name and avatar link to /@handle.
  },

  // YouTube's own SPA events (desktop, then m.youtube.com).
  navigationEvents: ['yt-navigate-finish', 'yt-page-data-updated', 'state-navigateend'],

  // What YouTube's switch blocks, chosen in the popup under YouTube.
  options: {
    mode: {
      setting: 'youtubeMode',
      default: 'feeds',
      values: ['all', 'feeds', 'shorts'],
      duringFocus: (mode) => (mode === 'shorts' ? 'feeds' : mode),
    },
    // Content preferences (see `categories` below).
    categoryFilter: { setting: 'youtubeCategoryFilter', default: false },
    categorySubscriptions: { setting: 'youtubeCategorySubscriptions', default: false },
    categoryWatch: { setting: 'youtubeCategoryWatch', default: false },
  },

  // Content preferences, chosen in the popup under YouTube: which categories
  // of video to allow, reduce or hide where videos are still shown.
  categories: {
    setting: 'youtubeCategories',
    enabled: (options) => options.categoryFilter,
    items:
      'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model, ytm-video-with-context-renderer, ytm-compact-video-renderer, ytm-rich-item-renderer',
    skip: 'ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytm-promoted-video-renderer',
    areas: [
      // YouTube keeps pages it has shown in memory, so each area is scoped to its own page.
      { page: 'home', within: 'ytd-browse[page-subtype="home"], ytm-browse', reduce: true },
      {
        page: 'watch',
        within:
          'ytd-watch-next-secondary-results-renderer, ytm-item-section-renderer[section-identifier="related-items"], ytm-watch-next-secondary-results-renderer',
        reduce: true,
      },
      // Search is asked for, so "reduce" leaves it alone; "hide" still applies.
      { page: 'search', within: 'ytd-search, ytm-search', reduce: false },
      {
        page: 'subscriptions',
        within: 'ytd-browse[page-subtype="subscriptions"], ytm-browse',
        onlyIf: (options) => options.categorySubscriptions,
        reduce: true,
      },
    ],
    read: youtubeCardVideo,
    // Videos opened directly: only with the stricter option.
    view: { page: 'watch', onlyIf: (options) => options.categoryWatch, read: youtubeWatchVideo },
  },

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
    subscriptions: /^\/feed\/subscriptions\/?$/,
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
    // A page's panel depends on the choice under YouTube's switch.
    pages: {
      home: (options) =>
        youtubeBlockedPage(options) ||
        (youtubeBlocksFeeds(options) ? { message: "YouTube's recommended videos are switched off." } : null),
      explore: (options) =>
        youtubeBlockedPage(options) ||
        (youtubeBlocksFeeds(options) ? { message: 'Trending, Explore and Gaming are switched off.' } : null),
      watch: youtubeBlockedPage,
      search: youtubeBlockedPage,
      subscriptions: youtubeBlockedPage,
      other: youtubeBlockedPage, // Every page no pattern above names: channels, feeds, playlists...
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
      onlyIf: youtubeBlocksFeeds,
      run: () => {
        const toggle = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
        if (toggle) (toggle.closest('button') || toggle).click();
      },
    },
    {
      name: 'Cancel the autoplay countdown',
      onlyIf: youtubeBlocksFeeds,
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
      allowOwner: 'page',
      selector: 'ytd-reel-shelf-renderer',
      count: true,
    },
    {
      name: 'Shorts section on the home page',
      allowOwner: 'page',
      selector: 'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
      count: true,
    },
    {
      name: 'Shorts rich shelf (outside a section)',
      allowOwner: 'page',
      selector: 'ytd-rich-shelf-renderer[is-shorts]',
      count: true,
    },
    {
      name: 'Shorts grid shelf in search (2025 layout)',
      allowOwner: 'page',
      selector:
        'grid-shelf-view-model:has(ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, a[href^="/shorts/"])',
      count: true,
    },
    {
      name: 'Mobile: Shorts section on the home page',
      allowOwner: 'page',
      selector:
        'ytm-rich-section-renderer:has(ytm-reel-shelf-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2)',
      count: true,
    },
    {
      name: 'Mobile: Shorts shelf (outside a section)',
      allowOwner: 'page',
      selector: 'ytm-reel-shelf-renderer',
      count: true,
    },

    /* ---- Individual Shorts mixed into normal video lists ---- */
    {
      name: 'Short in the home / subscriptions grid',
      allowOwner: true,
      selector: 'ytd-rich-item-renderer:has(a[href^="/shorts/"])',
      count: true,
    },
    {
      name: 'Short in search results',
      allowOwner: true,
      selector: 'ytd-video-renderer:has(a[href^="/shorts/"])',
      count: true,
    },
    {
      name: 'Short in a channel or legacy grid',
      allowOwner: true,
      selector: 'ytd-grid-video-renderer:has(a[href^="/shorts/"])',
      count: true,
    },
    {
      name: 'Short in watch-page suggestions',
      allowOwner: true,
      selector: 'ytd-compact-video-renderer:has(a[href^="/shorts/"])',
      count: true,
    },
    {
      name: 'Mobile: Short in a video list',
      allowOwner: true,
      selector:
        'ytm-video-with-context-renderer:has(a[href^="/shorts/"]), ytm-rich-item-renderer:has(a[href^="/shorts/"])',
      count: true,
    },
    {
      name: 'Short as a new-style lockup card',
      allowOwner: true,
      selector: 'yt-lockup-view-model:has(a[href^="/shorts/"])',
      count: true,
    },
    {
      name: 'Short marked by the SHORTS badge on its thumbnail',
      allowOwner: true,
      // Some lists link a Short as /watch?v=; the thumbnail badge still says SHORTS.
      selector:
        ':is(ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer):has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
      count: true,
    },
    {
      name: 'Any leftover Shorts tile',
      allowOwner: true,
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
      allowOwner: 'page',
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

    /* ---- Recommendations ('feeds' and 'all'; left alone in 'shorts') ---- */
    {
      name: '"Up next" recommendations beside or below the video',
      onlyIf: youtubeBlocksFeeds,
      // Only the recommendations list: the playlist panel and live chat share
      // the same column and stay.
      selector: 'ytd-watch-next-secondary-results-renderer',
      count: true,
    },
    {
      name: 'Mobile: related videos under the video',
      onlyIf: youtubeBlocksFeeds,
      selector:
        'ytm-item-section-renderer[section-identifier="related-items"], ytm-watch-next-secondary-results-renderer',
      count: true,
    },
    {
      name: 'End screen: video wall, end cards and autoplay countdown',
      onlyIf: youtubeBlocksFeeds,
      selector: '.html5-endscreen, .ytp-ce-element, .ytp-autonav-endscreen-countdown-overlay',
    },
    {
      name: 'Paused-video "More videos" overlay',
      onlyIf: youtubeBlocksFeeds,
      selector: '.ytp-pause-overlay, .ytp-pause-overlay-container',
    },
    {
      name: 'Recommendation shelves in search results (English titles)',
      onlyIf: youtubeBlocksFeeds,
      selector: 'ytd-shelf-renderer #title, ytd-horizontal-card-list-renderer #title',
      text: /^(For you|People also watched|Channels new to you|From related searches|Explore more)$/i,
      closest: 'ytd-shelf-renderer, ytd-horizontal-card-list-renderer',
      page: 'search',
      count: true,
    },
    {
      name: 'Sidebar links to Trending, Explore and Gaming',
      onlyIf: youtubeBlocksFeeds,
      selector:
        'ytd-guide-entry-renderer:has(a[href^="/feed/trending"], a[href^="/feed/explore"], a[href^="/gaming"])',
    },
  ],
});
