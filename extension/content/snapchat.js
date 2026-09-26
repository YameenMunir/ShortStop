/*
 * ShortStop: Snapchat (focus mode)
 * ================================
 * Spotlight is Snapchat's short-video feed. It is covered like the other
 * platforms' feeds, together with the Discover and Explore pages that lead
 * into it. A single Spotlight link is covered too, because its player goes
 * straight on to the next video. While covered, feed keys are swallowed and
 * any video that starts playing is paused.
 *
 * Still available on purpose:
 *   - Snapchat for web (chat), at /web
 *   - Public profiles you open (their Spotlight links are hidden)
 *
 * See README.md for how to update the selectors.
 */
ShortStop.start({
  id: 'snapchat',
  hosts: ['snapchat.com'],

  // Named pages (matched against location.pathname, first match wins).
  pages: {
    spotlight: /^\/(?:@[^/]+\/)?spotlight(?:\/|$)/, // The feed, single videos and a profile's Spotlight.
    discover: /^\/(?:discover|explore)(?:\/|$)/,
  },

  // Allowed accounts, chosen in the popup under Snapchat: a profile's own
  // Spotlight (/@username/spotlight). The Spotlight feed stays blocked.
  allowlist: { ...ShortStopAllowlist.sites.snapchat, itemOwners: 'a[href^="/@"]' },

  cover: {
    // With no content area to find, the panel covers the whole viewport.
    target: ['main'],
    title: 'Scrolling is blocked by your focus settings.',
    pages: {
      spotlight: { message: 'Spotlight is switched off.' },
      discover: { message: 'Discover and Explore are switched off.' },
    },
    links: () => [{ label: 'Chat on Snapchat for web', href: '/web' }],
  },

  rules: [
    {
      name: 'Links into Spotlight, Discover and Explore',
      selector:
        'a[href^="/spotlight"], a[href*="/spotlight/"], a[href^="/discover"], a[href^="/explore"], a[href*="snapchat.com/spotlight"]',
    },
  ],
});
