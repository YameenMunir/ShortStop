/*
 * ShortStop: Facebook (focus mode)
 * ================================
 * Facebook stays usable as a communication and utility tool, but not as an
 * endless-scroll feed. The News Feed, Feeds, Reels, Watch, Stories, the groups
 * feed, Gaming, friend suggestions and Marketplace's recommended listings are
 * all treated the same: the content area is hidden from the first paint and
 * replaced by a ShortStop panel, so moving from one feed to another gets you
 * nowhere. While a feed is covered, feed keys (including Facebook's j/k
 * shortcuts) are swallowed and any video that starts playing is paused.
 *
 * Still available on purpose:
 *   - Messenger
 *   - Search for a person, Page, group or post
 *   - Profiles and Pages you open, including your own for posting (/me/)
 *   - Managing your Pages
 *   - A specific group you open (/groups/<id>)
 *   - Marketplace search, categories, listings, selling and inbox
 *     (search can be switched off with "Allow Marketplace search")
 *   - Notifications, only if "Allow notifications" is on in the popup
 *
 * Routes are re-checked on every pushState, popstate and DOM change, so the
 * block comes straight back whenever Facebook navigates to a feed.
 *
 * Facebook's class names are generated per build, so selectors use URLs,
 * ARIA roles and element structure. See README.md for how to update them.
 */

// Places Facebook is still useful for, offered on every blocked page.
const facebookUtilityLinks = (options) => [
  { label: 'Messenger', href: '/messages/' },
  { label: 'Post from your profile', href: '/me/' },
  { label: 'Your groups', href: '/groups/joins/' },
  { label: 'Pages you manage', href: '/pages/?category=your_pages' },
  options.notifications && { label: 'Notifications', href: '/notifications/' },
];

const marketplaceSearch = {
  label: 'Search Marketplace',
  placeholder: 'Search for a specific item',
  url: (query) => `/marketplace/search/?query=${encodeURIComponent(query)}`,
};

const marketplaceLinks = () => [
  { label: 'Your listings', href: '/marketplace/you/selling/' },
  { label: 'Marketplace inbox', href: '/marketplace/inbox/' },
  { label: 'Messenger', href: '/messages/' },
];

ShortStop.start({
  id: 'facebook',
  hosts: ['facebook.com'],

  // Named pages, first match wins. Covered pages are listed under `cover.pages`.
  pages: {
    // "/" also carries the Feeds filters (?filter=friends, ?sk=h_chr, ...).
    home: /^\/(?:home\.php)?$/,
    feeds: /^\/feeds?(?:\/|$)/,
    reels: /^\/reels?(?:\/|$)/,
    watch: /^\/watch(?:\/|$)/,
    stories: /^\/stories(?:\/|$)/,
    groupsfeed: /^\/groups\/?(?:(?:feed|discover)(?:\/.*)?)?$/, // Not a specific group.
    gaming: /^\/gaming(?:\/|$)/,
    friendsuggestions: /^\/friends\/suggestions(?:\/|$)/,
    // Marketplace, most specific first: tools, then searches/categories, then browsing.
    marketplacetools: /^\/marketplace\/(?:item|you|create|inbox|notifications|saved|profile|selling|buying)(?:\/|$)/,
    marketplacesearch: /^\/marketplace\/(?:[^/]+\/)?(?:search|category)(?:\/|$)|^\/marketplace\/[^/]+\/[^/]+/,
    marketplace: /^\/marketplace(?:\/[^/]+)?\/?$/, // Home, or a city's recommended listings.
    notifications: /^\/notifications(?:\/|$)/,
    messages: /^\/messages(?:\/|$)/,
    search: /^\/search(?:\/|$)/,
    group: /^\/groups\/[^/]+/,
  },

  // Extra switches shown in the popup under Facebook.
  options: {
    notifications: { setting: 'facebookNotifications', default: false },
    marketplaceSearch: { setting: 'facebookMarketplaceSearch', default: true },
  },

  redirects: [
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
    // Feeds themselves are covered rather than redirected: a redirect could
    // loop if Facebook bounced the destination back.
  ],

  cover: {
    // Facebook's centre column. The top bar, left menu and chat sidebar stay.
    target: ['div[role="main"]', 'main'],
    title: 'Scrolling is blocked by your focus settings.',
    search: {
      label: 'Search Facebook',
      placeholder: 'Search for a person, Page, group or post',
      url: (query) => `/search/top/?q=${encodeURIComponent(query)}`,
    },
    links: facebookUtilityLinks,
    pages: {
      home: { message: 'Your News Feed is switched off.' },
      feeds: { message: 'Feeds are switched off.' },
      reels: { message: 'Reels are switched off.' },
      watch: {
        message: 'Watch and video feeds are switched off.',
        // A video someone sent you can still be opened on its own.
        links: (options, url) => {
          const video = url && url.searchParams.get('v');
          return [
            video && { label: 'Open this video only', href: `/video.php?v=${encodeURIComponent(video)}` },
            ...facebookUtilityLinks(options),
          ];
        },
      },
      stories: { message: 'Stories are switched off.' },
      groupsfeed: {
        message: 'The groups feed is switched off. Open a specific group from Your groups.',
      },
      gaming: { message: 'Gaming videos are switched off.' },
      friendsuggestions: {
        message: 'Friend suggestions are switched off.',
        links: (options) => [{ label: 'Friend requests', href: '/friends/requests/' }, ...facebookUtilityLinks(options)],
      },
      marketplace: {
        message: "Marketplace's recommended listings are switched off.",
        search: (options) => (options.marketplaceSearch ? marketplaceSearch : null),
        links: marketplaceLinks,
      },
      marketplacesearch: {
        message: 'Marketplace search is switched off. Turn on "Allow Marketplace search" in the ShortStop menu to use it.',
        onlyIf: (options) => !options.marketplaceSearch,
        search: null,
        links: marketplaceLinks,
      },
      notifications: {
        message: 'Notifications are switched off. Turn on "Allow notifications" in the ShortStop menu if you need them.',
        onlyIf: (options) => !options.notifications,
      },
    },
  },

  rules: [
    /* ---- Menu and top-bar shortcuts into feeds ---- */
    {
      name: 'Feed shortcut in the left menu (whole list item)',
      selector:
        'div[role="navigation"] li:has(a[href*="/reel/"], a[href*="/watch"], a[href*="/gaming"], a[href*="sk=h_chr"], a[href*="/feeds"])',
    },
    {
      name: 'Feed shortcut in the menus or top bar (bare link)',
      selector:
        ':is(div[role="navigation"], div[role="banner"]) :is(a[href*="/reel/"], a[href*="/watch"], a[href*="/gaming"], a[href*="sk=h_chr"], a[href*="/feeds"])',
    },
    {
      name: 'Reels tab on Pages and profiles',
      selector: 'a[role="tab"][href*="/reels"], a[role="tab"][href*="sk=reels_tab"]',
    },
    {
      name: 'Notifications bell and link',
      selector: 'div[role="banner"] :is(a[href*="/notifications"], [aria-label^="Notifications"])',
      onlyIf: (options) => !options.notifications,
    },

    /* ---- Recommendations inside pages that stay open (profiles, groups, search) ---- */
    {
      name: 'Stories tray',
      selector: '[data-pagelet^="Stories"], div[aria-label="Stories"]',
      count: true,
    },
    {
      name: 'Feed post or carousel containing Reels',
      selector: 'div[role="feed"] > div:has(a[href*="/reel/"])',
      count: true,
    },
    {
      name: 'Reels carousel outside a feed (English label)',
      selector: 'div[aria-label="Reels"], div[aria-label="Reels and short videos"]',
      count: true,
    },
    {
      name: 'Suggested posts, people, groups and Pages (English headings)',
      selector: 'div[role="feed"] span, [role="heading"], h2, h3',
      text: /^(Suggested for you|People you may know|Suggested groups|Suggested Pages|Pages you may like|Groups you may like|Reels and short videos)$/i,
      closest: 'div[role="feed"] > div, [role="article"], [data-pagelet*="FeedUnit"]',
      count: true,
    },
    {
      name: 'Leftover Reel link',
      selector: 'a[href*="/reel/"]',
    },
  ],
});
