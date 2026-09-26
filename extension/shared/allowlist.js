/*
 * ShortStop: allowed accounts
 * ===========================
 * Some people follow one YouTube channel or Instagram account on purpose and
 * don't want it caught by feed blocking. Each platform below can keep a short
 * list of allowed accounts (stored as lower-case names in the synced settings,
 * under `setting`). An allowed account's OWN pages and items get through: its
 * channel or profile, its videos, LIVE, Stories and Reels tab, and its Shorts
 * cards. Algorithmic feeds (home, For You, Explore) have no single owner, so
 * they stay blocked whatever the list says.
 *
 * Used by the popup (to read what people type or paste) and by the content
 * scripts (to recognise an account's pages and links), so the two agree.
 *
 * Reddit, X and Facebook have no list: their communities, profiles and Pages
 * are never blocked in the first place, only their feeds.
 */
(function (global) {
  'use strict';

  const MAX_ACCOUNTS = 10; // Per platform, to keep the popup and synced settings small.

  // A pasted link, if the text is one for this site (with or without https://).
  function asUrl(text, hosts) {
    const withScheme = /^[a-z]+:\/\//i.test(text) ? text : `https://${text}`;
    try {
      const url = new URL(withScheme);
      const host = url.hostname.toLowerCase();
      return hosts.some((site) => host === site || host.endsWith(`.${site}`)) ? url : null;
    } catch (error) {
      return null;
    }
  }

  function segment(pathname, index) {
    const part = pathname.split('/')[index + 1] || '';
    try {
      return decodeURIComponent(part);
    } catch (error) {
      return part;
    }
  }

  // Builds one platform's rules from: the site's hosts, the pattern a name must
  // fit, and how to find the name in a link's path.
  function site({ setting, noun, example, hosts, pattern, prefix, fromPath }) {
    const clean = (name) => (name && pattern.test(name) ? name.toLowerCase() : null);
    const fromHref = (href) => {
      if (!href) return null;
      try {
        return clean(fromPath(new URL(href, 'https://example.invalid').pathname));
      } catch (error) {
        return null;
      }
    };
    return {
      setting,
      noun, // "channel" or "account", for the popup's wording.
      example, // What the popup's field suggests typing.
      // What someone typed or pasted: a name, "@name", or a link to the account.
      parse(text) {
        const value = String(text || '').trim();
        if (!value) return null;
        // A link to this site ("youtube.com/@name", "https://..."), else a plain name
        // (which may itself contain dots, like "john.doe").
        const url = /[/.]/.test(value) ? asUrl(value, hosts) : null;
        if (url) return clean(fromPath(url.pathname));
        return clean(value.replace(/^@/, ''));
      },
      label: (name) => `${prefix}${name}`,
      href: (name) => (prefix === '@' ? `/@${name}` : `/${name}/`),
      // The account whose own page `url` is (its channel, profile or content), or null.
      owner: (url) => clean(fromPath(url.pathname)),
      // The account a link inside an item points to, or null.
      hrefOwner: fromHref,
    };
  }

  // Instagram paths whose first part is a section, not a username.
  const INSTAGRAM_SECTIONS = new Set([
    'about', 'accounts', 'api', 'ar', 'challenge', 'create', 'developer', 'direct', 'directory',
    'emails', 'explore', 'graphql', 'legal', 'locations', 'notifications', 'p', 'privacy', 'reel',
    'reels', 'session', 'stories', 'terms', 'tv', 'web', 'your_activity',
  ]);

  const SITES = {
    youtube: site({
      setting: 'youtubeAllowed',
      noun: 'channel',
      example: '@veritasium',
      hosts: ['youtube.com'],
      // YouTube handles: 3 to 30 letters, numbers, underscores, hyphens or dots.
      pattern: /^[\p{L}\p{N}_.-]{3,30}$/u,
      prefix: '@',
      // /@handle and everything under it (its videos, Shorts and playlists tabs).
      fromPath: (pathname) => {
        const first = segment(pathname, 0);
        return first.startsWith('@') ? first.slice(1) : null;
      },
    }),
    instagram: site({
      setting: 'instagramAllowed',
      noun: 'account',
      example: 'natgeo',
      hosts: ['instagram.com'],
      // Instagram usernames: up to 30 letters, numbers, dots and underscores.
      pattern: /^[a-z0-9._]{1,30}$/i,
      prefix: '@',
      // /username/, /username/reel/ID, /username/reels/, and /stories/username/...
      fromPath: (pathname) => {
        const first = segment(pathname, 0).toLowerCase();
        if (first === 'stories') {
          const second = segment(pathname, 1);
          return second === 'highlights' ? null : second;
        }
        return first && !INSTAGRAM_SECTIONS.has(first) ? first : null;
      },
    }),
    tiktok: site({
      setting: 'tiktokAllowed',
      noun: 'account',
      example: '@nasa',
      hosts: ['tiktok.com'],
      // TikTok usernames: up to 24 letters, numbers, underscores and dots.
      pattern: /^[a-z0-9._]{2,24}$/i,
      prefix: '@',
      // /@username, its videos and photos, and its LIVE.
      fromPath: (pathname) => {
        const first = segment(pathname, 0);
        return first.startsWith('@') ? first.slice(1) : null;
      },
    }),
    snapchat: site({
      setting: 'snapchatAllowed',
      noun: 'account',
      example: '@nasa',
      hosts: ['snapchat.com'],
      // Snapchat usernames: 3 to 15 letters, numbers, hyphens, underscores and dots.
      pattern: /^[a-z0-9._-]{3,15}$/i,
      prefix: '@',
      // /@username and its Spotlight, and the /add/username profile links.
      fromPath: (pathname) => {
        const first = segment(pathname, 0);
        if (first.startsWith('@')) return first.slice(1);
        return first === 'add' ? segment(pathname, 1) : null;
      },
    }),
  };
  // Instagram's own links and labels have no "@" in the URL.
  SITES.instagram.href = (name) => `/${name}/`;

  // A stored list, cleaned up: known-good names, lower-case, no repeats, at most MAX_ACCOUNTS.
  function normalizeList(platform, list) {
    const rules = SITES[platform];
    if (!rules || !Array.isArray(list)) return [];
    const names = [];
    for (const entry of list) {
      const name = typeof entry === 'string' ? rules.parse(entry) : null;
      if (name && !names.includes(name)) names.push(name);
    }
    return names.slice(0, MAX_ACCOUNTS);
  }

  global.ShortStopAllowlist = { MAX_ACCOUNTS, sites: SITES, normalizeList };
})(globalThis);
