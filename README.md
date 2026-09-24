<p align="center">
  <img src="extension/icons/icon128.png" width="96" height="96" alt="ShortStop icon: a stop-sign octagon around a vertical video frame">
</p>

<h1 align="center">ShortStop</h1>

<p align="center"><strong>Block Shorts, Reels &amp; Endless Feeds</strong></p>

<p align="center">
  A free, open-source browser extension that blocks short-form video and endless
  recommendation feeds on YouTube, Instagram, Facebook, TikTok, Reddit, X and Snapchat,
  while keeping the useful parts of each site working.
</p>

<p align="center">
  Chrome · Edge · Brave · Firefox (small tweak) · iPhone Safari (userscript)
</p>

---

## At a glance

- **Focus mode on YouTube, Instagram, Facebook, TikTok, Reddit, X and Snapchat.** Endless
  feeds, Shorts, Reels, Spotlight, Stories, LIVE and autoplay are replaced by a calm panel, so
  there's nothing to scroll.
- **Still useful.** Search, messages, profiles, groups, uploading and a video you open on
  purpose keep working, so the sites stay usable as communication tools.
- **Hard to switch off on impulse.** Blocking pauses for 10 minutes and comes back by itself,
  with 3 instant pauses a day, and turning it off for good takes a 30-second wait.
- **Allowed times.** Let a site through at set times, like YouTube from 8 to 9pm on weekdays
  or Instagram at weekends. Blocking switches off and on by itself.
- **Private by design.** No data collection, no analytics, no network requests, and only
  the permissions it needs.
- **Plain JavaScript and CSS.** Chrome Manifest V3, no build step, no libraries, and 695
  automated checks. Built for Chrome, Edge and Brave, with a Firefox build and an iPhone
  Safari userscript.

## What it does

| Platform | What ShortStop changes |
| --- | --- |
| **YouTube** | **Focus mode.** `/shorts/VIDEO_ID` opens in the normal player (`/watch?v=VIDEO_ID`), and Shorts shelves, tabs, chips and sidebar entries are removed everywhere. The **home page's recommended grid**, Trending/Explore and Gaming are replaced by the panel (*"Scrolling is blocked by your focus settings."*), with a YouTube search box and links to Subscriptions, Watch later, Your playlists and History. On the watch page, the **"Up next"** list is hidden (the playlist panel and live chat stay), **end-screen** video walls, end cards and the "More videos" overlay are removed, and **autoplay** is switched off, with any autoplay countdown cancelled. Search results lose their "For you" / "People also watched" shelves. Search, subscriptions, playlists, channels, history and any video you open keep working, and the miniplayer keeps playing when you go back to Home. |
| **Instagram** | **Focus mode.** The Home feed, Explore (including hashtag, place and suggested-people pages), Reels and Stories are all blocked the same way. Their content is replaced by a ShortStop panel before it paints, so there's nothing to scroll and no way round it through the Home feed. The panel links to what still works: **Messages**, **account search**, **your profile**, and posting through Instagram's own menu. Profiles and single posts you open on purpose still work, minus the Reels tab and "Suggested for you" accounts. Reels shared in DMs are blurred and can't be opened. **Notifications** are blocked unless you turn on *Allow notifications* in the popup. |
| **Facebook** | **Focus mode.** Facebook stays a communication and utility tool, not an endless feed. The News Feed (including the Feeds filters), Reels, Watch, Stories, the groups feed and Discover, Gaming, friend suggestions and **Marketplace's recommended listings** are all blocked the same way. Each shows *"Scrolling is blocked by your focus settings."* where the feed was, with a Facebook search box and links to **Messenger**, **your profile** (to post), **your groups** and **Pages you manage**. A Watch link someone sent you gets an *Open this video only* button. Menu and top-bar shortcuts into feeds are hidden. On a blocked feed, feed keys (including Facebook's own J/K) are swallowed and videos are paused. Inside pages that stay open (profiles, a specific group, search), Reels, the Stories tray and "Suggested for you" / "People you may know" units are removed. **Marketplace:** searching and categories, listings, selling and the inbox work, and *Allow Marketplace search* in the popup can turn search off too. **Notifications** are blocked unless you turn on *Allow notifications*. |
| **TikTok** | **Focus mode.** Every algorithmic feed is blocked the same way: For You, Following, Friends, LIVE (the feed and individual streams), Explore, Short dramas (the catalog and its episodes), and the discovery pages behind hashtags, sounds, topics and channels. The feed is replaced by a panel saying *"Scrolling is blocked by your focus settings."*, so switching from For You to Following or LIVE gets you nowhere. The panel has a search box and links to **Messages**, **Upload** and **your profile**. The sidebar links into feeds are hidden. On a blocked feed, the arrow, Page Up/Down, Space and J/K keys are swallowed, and any video that starts playing is paused. **Search**, **messages**, **profiles and single videos** you open on purpose (minus "You may like" and suggested accounts), **uploading** and **account settings** keep working. **Notifications** are blocked unless you turn on *Allow notifications* in the popup. |
| **Reddit** | **Focus mode.** The **Home feed** (every sort order: Best, Hot, New, Top, Rising), **Popular**, **All**, and **Explore** and topic pages are replaced by the panel, with a Reddit search box and links to **your profile**, **saved posts** and **chat**. The Popular, All and Explore links are hidden (communities with similar names, like r/allthingsdnd, are not). A **community you open on purpose** still works, like a Facebook group, and so do **posts and comments**, **search** and **profiles**. "More posts you may like", "Popular communities" and similar boxes are removed. Works on www.reddit.com and old.reddit.com. |
| **X** | **Focus mode.** The **Home timeline** (For you and Following both live at `/home`), **Explore** with its trending tabs, and topic timelines are replaced by the panel, with an X search box and links to **Messages**, **Bookmarks** and **your profile**. The Home and Explore links are hidden, and so are "What's happening" and "Who to follow" in the right-hand column. On a blocked timeline, X's J/K and Space shortcuts are swallowed and videos are paused. **Search**, **messages**, **profiles**, **single posts**, **bookmarks** and **lists** keep working. **Notifications** are blocked unless you turn on *Allow notifications* in the popup. Works on x.com and twitter.com. |
| **Snapchat** | **Focus mode.** **Spotlight** (the feed, single Spotlight links, which play on into the next video, and a profile's Spotlight) and the **Discover** and **Explore** pages are replaced by the panel, with a link to **Snapchat for web** (chat). Links into Spotlight, Discover and Explore are hidden. Chat and public profiles keep working. |

The popup has a switch per platform, plus *Allow notifications* under Instagram,
Facebook, TikTok and X, *Allow Marketplace search* under Facebook, and *Allowed times* under each.
Changes apply to open tabs straight away, without a reload. It also shows how many
Shorts, Reels and feeds were blocked today (visiting a blocked feed page counts once).

### Pausing blocking on purpose

Switching a platform off is deliberately not a single click, so it's hard to do on impulse.
Clicking a platform's switch while it's blocking offers two choices:

- **Allow 10 minutes** pauses blocking, then **switches it back on by itself** when the time
  runs out, in every open tab, with no reload. The first **3 pauses a day** per platform start
  straight away. After that a pause still works, but only after the same 30-second wait as
  *Turn off…*, so ten pauses in a row are no longer a quick way round blocking. Pauses and their
  daily count are stored on this device only, and the count resets at local midnight.
  **Block again** ends a pause early.
- **Turn off…** switches it off until you turn it back on, but only after a **30-second wait**,
  then a confirmation within 2 minutes. The wait keeps counting if you close the popup, and
  confirming early does nothing.

Turning blocking **back on** is always instant. To change the 10 minutes, the 3 pauses or the
wait, edit [shared/pause.js](extension/shared/pause.js), which the popup and the welcome page
both read.

### Allowed times

Under each platform, **Allowed times** lets it through at set times, for example YouTube from
20:00 to 21:00 on weekdays, or Instagram all day at weekends. Each platform can have up to 3
times. Pick the days, then a start and end time:

- The same start and end time means **all day**, and an end time earlier than the start runs
  **past midnight** (Friday 23:00 to 01:00 ends early on Saturday).
- Inside an allowed time, blocking switches off by itself in every open tab, and it comes back
  on by itself when the time ends. Times follow the clock of the device you're on.
- **Adding or lengthening** a time takes the same 30-second wait and confirmation as
  *Turn off…*, so you can't open up a site on impulse. **Shortening or removing** one is saved
  straight away.
- **Block now** during an allowed time blocks the site again until that time ends (or until
  midnight, if the site is allowed all week).

Allowed times are saved with your other settings, so they follow your browser profile.

### First-run welcome page

The first time ShortStop is installed, it opens a welcome page in a new tab. It shows what a
blocked page looks like and walks through the two setup steps a browser won't do for you:

- **Pin the toolbar icon**, so the switches are one click away. The page reads whether the
  icon is pinned and shows a tick once it is.
- **Allow it in private windows.** Browsers switch extensions off in private/incognito windows
  unless you opt in, so blocking wouldn't apply there. The page shows whether it's allowed,
  names your browser's own setting ("Allow in Incognito", "Allow in InPrivate"), and has a
  button that opens ShortStop's settings page.

Both steps update by themselves while the page is open, with no refresh. Where a browser can't
report the state, the step says so and shows the manual instructions instead. The page only opens
on a fresh install (not on updates), and you can reopen it any time from **How ShortStop works**
at the bottom of the popup. It needs no extra permission and makes no network requests.

<p align="center">
  <img src="docs/welcome.png" width="520" alt="The ShortStop welcome page: an illustration of the blocking panel, and a checklist for pinning the icon and allowing private windows">
</p>

<p align="center">
  <img src="docs/popup.png" width="300" alt="The ShortStop popup: 17 blocked today, with per-platform switches, options and counts">
</p>

## Privacy

- **No data collection, no analytics, no network requests.** The extension never
  calls `fetch`, loads no remote code and uses no third-party libraries.
- **Minimum permissions:** `storage`, plus host access to the seven sites it works on
  (YouTube, Instagram, Facebook, TikTok, Reddit, X and Snapchat). It can't see any other
  website.
- Your platform switches, options and allowed times are saved with `chrome.storage.sync`, so
  they follow your browser profile. The daily counter, temporary pauses, today's pause count,
  any waiting request and any *Block now* live in `chrome.storage.local`, on your device only.

## Install

### Chrome, Edge or Brave (load unpacked)

1. Download `ShortStop-1.0.0-chromium.zip` from the
   [Releases page](../../releases) (or `dist/` if you built it yourself) and unzip it.
   You get a folder called `ShortStop`.
2. Open the extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. Turn on **Developer mode** (top right in Chrome and Brave, left sidebar in Edge).
4. Click **Load unpacked** and choose the unzipped `ShortStop` folder (the one containing `manifest.json`).
5. A welcome page opens by itself. It shows how to pin ShortStop to the toolbar (so the
   switches are one click away) and how to allow it in private windows.

If you cloned the repo, you can also load the `extension/` folder directly.

Requires Chrome/Edge/Brave 111 or newer.

### Firefox

Firefox runs Manifest V3 slightly differently, so there is a separate build:

1. Run `python tools/package.py` (or download `ShortStop-1.0.0-firefox.zip` from Releases).
2. Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**
   and pick the Firefox zip (or `manifest.json` inside the unzipped folder).
3. Open `about:addons` → ShortStop → **Permissions** and allow access to the sites.
   Firefox treats MV3 host permissions as opt-in.

What the Firefox build changes, and why:

| Change | Reason |
| --- | --- |
| `background.scripts` instead of `background.service_worker` | Firefox MV3 uses event pages, not service workers. `background.js` already handles both. |
| `browser_specific_settings.gecko.id` | Firefox needs a stable add-on ID. |
| `strict_min_version: 128.0` | Content scripts with `"world": "MAIN"` (the pushState hook) need Firefox 128+. `:has()` needs 121+. |
| `data_collection_permissions: { required: ["none"] }` | This is how you declare "no data collection" to addons.mozilla.org. |

Temporary add-ons are removed when Firefox restarts. To keep it installed, sign it
(free) through addons.mozilla.org.

### iPhone and iPad (Safari + the free Userscripts app)

iOS Safari extensions can't be side-loaded, so ShortStop also ships as a single
userscript: [`userscript/shortstop.user.js`](userscript/shortstop.user.js), with the same
focus modes for YouTube, Instagram, Facebook, TikTok, Reddit, X and Snapchat.

1. Install **Userscripts** (by Justin Wasack, free) from the App Store.
2. Open the Userscripts app and choose a folder for your scripts, for example
   `iCloud Drive/Userscripts`.
3. Turn the extension on: **Settings → Apps → Safari → Extensions → Userscripts**.
   Enable it and set **youtube.com, instagram.com, facebook.com, tiktok.com, reddit.com, x.com,
   twitter.com and snapchat.com** (or All Websites) to **Allow**.
   On older iOS versions this is under **Settings → Safari → Extensions**.
4. Put `shortstop.user.js` in that folder. Either:
   - open the raw file on GitHub in Safari, tap the **Userscripts** icon in the address
     bar menu and choose **Install**, or
   - download it and move it into the folder with the Files app.
5. Visit m.youtube.com. The Userscripts menu should show ShortStop as active.

**Changing settings on iPhone:** edit the constants at the very top of the file, then save:

```js
const BLOCK_YOUTUBE_SHORTS = true;              // Shorts, home feed, Up next, autoplay

const BLOCK_INSTAGRAM_REELS = true;             // Home feed, Explore, Reels, Stories
const ALLOW_INSTAGRAM_NOTIFICATIONS = false;

const BLOCK_FACEBOOK_FEEDS = true;              // News Feed, Reels, Watch, Stories, Marketplace browsing
const ALLOW_FACEBOOK_NOTIFICATIONS = false;
const ALLOW_FACEBOOK_MARKETPLACE_SEARCH = true;

const BLOCK_TIKTOK_FEEDS = true;                // For You, Following, Friends, LIVE, Explore
const ALLOW_TIKTOK_NOTIFICATIONS = false;

const BLOCK_REDDIT_FEEDS = true;                // Home, Popular, All, Explore

const BLOCK_X_FEEDS = true;                     // Home timeline, Explore
const ALLOW_X_NOTIFICATIONS = false;

const BLOCK_SNAPCHAT_SPOTLIGHT = true;          // Spotlight, Discover, Explore
```

The userscript has no popup, daily counter, pause flow or allowed times, because Safari
userscripts have no shared storage. To pause a platform, set its constant to `false` and set it back later.

## How it works

```
extension/
├── manifest.json            MV3 manifest: storage + the seven sites, nothing else
├── background.js            Service worker: keeps the daily counter (one write queue for all tabs)
├── shared/stats.js          Counter helpers shared by the background worker and popup
├── shared/pause.js          The pause timings (10 minutes, 3 a day, 30-second wait), shared by popup and welcome page
├── shared/schedule.js       Allowed times: is a platform allowed now, until when, and is a change looser
├── content/
│   ├── core.js              The engine: CSS generation, MutationObserver, SPA navigation, redirects
│   ├── nav-hook.js          Runs in the page's own JS world; wraps history.pushState/replaceState
│   ├── youtube.js           YouTube focus mode: Shorts redirects, covered home feed, autoplay effects
│   ├── instagram.js         Instagram focus mode: covered routes, selectors, redirects
│   ├── facebook.js          Facebook focus mode: covered feeds, Marketplace rules, selectors
│   ├── tiktok.js            TikTok focus mode: covered feeds, panel search, selectors
│   ├── reddit.js            Reddit focus mode: Home, Popular, All and Explore covered
│   ├── x.js                 X focus mode: Home timeline and Explore covered, sidebar trends
│   └── snapchat.js          Snapchat focus mode: Spotlight, Discover and Explore covered
├── popup/                   Platform switches, pause flow, options, allowed times and today's counter
├── welcome/                 First-run page: the panel explained, pin and private-window checklist
└── icons/                   16, 32, 48 and 128 px PNGs
userscript/shortstop.user.js Generated from content/*.js for iOS Safari
tools/                       Icon generator, userscript builder, zip packager (Python, no dependencies)
tests/                       Fixture pages, a test harness and a headless-Chrome test runner
docs/                        Screenshots used in this README
```

Each platform file is a single config object, and `core.js` does the work:

1. **No flash of Shorts.** At `document_start`, before the site paints anything,
   the engine turns every rule into a CSS rule and injects it. Rules that only apply
   on one page (like Instagram Explore) are scoped with a `data-shortstop-page`
   attribute on `<html>`.
2. **Dynamic content.** A `MutationObserver` re-scans as the site streams in more
   content, throttled to one scan per 120 ms. Matches get a `data-shortstop-hidden` or
   `data-shortstop-blurred` attribute, which is what the daily counter counts. It also
   handles rules CSS can't express, such as "a chip whose text is exactly *Shorts*". Items
   YouTube recycles for a different video are un-hidden automatically.
3. **SPA navigation.** These sites change pages without reloading. The engine listens
   for a `pushState`/`replaceState` hook (`nav-hook.js`), YouTube's `yt-navigate-finish`,
   `popstate`, and a one-second URL check as a safety net. It also catches clicks on
   Short/Reel links before the site's router plays them.
4. **Covered routes.** A config can list whole routes to cover: every feed on each of the
   seven sites. A route is a pathname pattern, or a test on the whole URL
   when the site keeps the feed choice in the query string. On those routes the content area
   (`main`, Facebook's `div[role="main"]`, TikTok's `div#main-content-…`, YouTube's
   `ytd-browse`) is hidden by the same `document_start` stylesheet, and a ShortStop panel takes
   its place.
   - The panel is built in a shadow root, so the site's CSS can't touch it. It can carry a
     search box and links that differ per page (Marketplace search, "Open this video only").
   - While a feed is covered, feed keys are swallowed (except when typing) and any media that
     starts playing is paused. A platform can opt out of either: YouTube does, so its
     miniplayer keeps playing and working.
   - The route is re-checked on every navigation and DOM change, so the panel comes back if
     the site re-renders it away. If there is no content area (still loading, or after a
     redesign), the panel covers the whole viewport and locks scrolling instead.
5. **Effects.** Some things can't be hidden, only changed: YouTube's autoplay is switched off
   through its own toggle, and a running autoplay countdown is cancelled. Effects run after
   every scan and are safe to repeat.
6. **Live settings and pauses.** Content scripts listen to `chrome.storage.onChanged`.
   Switching a platform or option off removes the stylesheet, un-hides everything and
   removes the panel, and switching it on re-applies everything. No reload needed. A
   temporary pause is stored as an expiry time, and each tab sets a timer for it (backed up
   by the one-second check, in case the computer slept), so blocking returns by itself.
   Allowed times (`shared/schedule.js`, loaded before `core.js`) are checked the same way:
   the one-second check re-applies the settings whenever an allowed time starts or ends.

## When a site changes: updating selectors

All seven sites change their markup regularly. When something slips through, the fix is
usually one line in one file.

1. **Find the element.** Right-click the Short, Reel or recommendation that got through →
   **Inspect**. Walk up the DOM to the element that wraps the whole thing (the shelf, card or
   list item).
2. **Pick a stable selector.** In order of preference:
   - a custom element name: `ytd-reel-shelf-renderer`
   - an attribute: `[is-shorts]`, `[tab-title="Shorts"]`, `[role="tab"]`
   - a URL pattern: `a[href^="/shorts/"]`, `a[href*="/reel/"]`
   - `:has()` to target a container by what's inside it:
     `ytd-rich-item-renderer:has(a[href^="/shorts/"])`
   - a test attribute the site uses for its own testing, such as TikTok's
     `[data-e2e="nav-foryou"]` (these change far less than class names)
   - ARIA labels (`[aria-label="Reels"]`) work, but depend on the site's language

   Avoid generated class names like `.x1lliihq` or `.style-scope-abc123`. They change with every deploy.
3. **Test it in the Console first.** Paste the selector and make sure it matches only what you want:
   ```js
   document.querySelectorAll('ytd-rich-item-renderer:has(a[href^="/shorts/"])')
   ```
4. **Add a rule** to the platform's config in `extension/content/<platform>.js`:
   ```js
   {
     name: 'Shorts carousel on the watch page',   // shows up in console warnings
     selector: 'ytd-reel-shelf-renderer',
     count: true,                                 // counts toward "blocked today"
   },
   ```
   Options: `page: 'explore'` scopes the rule to a named page, `action: 'blur'` blurs
   instead of hiding, `closest: 'div[role="button"]'` hides an ancestor of the match,
   `text: /^Shorts$/` requires the matched element's text to match, and
   `onlyIf: (options) => !options.notifications` ties the rule to a popup option.

   **To block a whole route instead**, add a pattern to `pages` (a pathname RegExp, or a
   function of the URL) and list that name under `cover.pages` with a message. A page can
   override the panel's `search` and `links`. If the site stops using the same content area,
   update `cover.target` (a list of selectors, first match wins). `cover.pauseMedia` and
   `cover.blockKeys` can be set to `false` where a site needs its own playback and keys.
   For something that has to be *done* rather than hidden, add an entry to `effects`.
   Put container rules (shelves, sections) **above** item rules so items inside them aren't
   counted twice.
5. **Reload the extension** (the ↻ button on `chrome://extensions`), then refresh the site.
6. **Rebuild the userscript** so iPhone gets the same fix:
   `python tools/build_userscript.py`
7. **Run the tests**, and add the new markup to `tests/fixtures/<platform>.html`
   with `data-expect="hidden"` so it stays fixed:
   `python tests/run_tests.py`

If a selector is invalid, the engine logs `[ShortStop] Invalid selector in rule "…"`
once and carries on with the other rules.

## Development

All tooling is Python 3 standard library, with no `pip install` needed.

```bash
python tests/run_tests.py          # 695 checks in headless Chrome/Edge against mock site markup
python tools/build_userscript.py   # regenerate userscript/shortstop.user.js from extension/content/
python tools/make_icons.py         # regenerate extension/icons/*.png
python tools/package.py            # build dist/ShortStop-<version>-{chromium,firefox}.zip
```

The test fixtures in `tests/fixtures/` mimic each site's markup. `tests/harness.js`
runs the real engine against them with a fake URL and in-memory settings. For each
platform it checks:

- what is hidden and what stays visible, including content added later (infinite scroll)
- recycled YouTube items reappearing when they become a normal video
- the counter total, with no double counting
- switching off and back on
- page-scoped rules (Explore, DMs)
- covered routes on every platform: the panel's title, message, links and search box,
  the panel re-mounting after the site removes it, the full-viewport fallback, and the
  notification options
- feed keys being swallowed (but not while typing), media being paused, and the panel's
  search box going to the right results page
- Temporary pauses on every platform: blocking pauses, comes back by itself when the time
  runs out, ignores an expired pause or another platform's, and "block again" is instant
- Allowed times on every platform: blocking pauses inside one, ignores another day's,
  another platform's or a malformed one, respects *Block now*, and (with a fake clock)
  switches off and back on by itself when an allowed time starts and ends

Two more pages have no site markup. `schedule.html` unit-tests
[shared/schedule.js](extension/shared/schedule.js): weekday, all-day and past-midnight times,
back-to-back times, bad data, and which edits count as looser. `popup.html` loads the real
popup with an in-memory `chrome.storage` and clicks through it: the 3 instant pauses, the
wait for the 4th, a new day resetting them, *Turn off…*, adding a time (waits), shortening
and removing one (instant), a time with no days, and *Block now*.
- Facebook Marketplace: home and city browsing blocked; search, categories, listings and
  selling allowed; everything but listings and selling blocked when search is switched off
- YouTube: Up next hidden while the playlist panel and live chat stay, end screens removed,
  the autoplay toggle switched off exactly once, the countdown cancelled, and the
  miniplayer left playing on the covered home page
- every redirect rule
- redirects triggered by SPA navigation

A manual checklist for real accounts is in [TESTING.md](TESTING.md).

## Known limitations

- **Testing coverage.** The engine is tested against mock pages for every platform, and
  YouTube and TikTok were also checked on the live sites (signed out) in Edge. Instagram and
  Facebook need a signed-in account, so run their sections of [TESTING.md](TESTING.md) on real
  accounts. The Firefox build and the iPhone userscript haven't been run on a real Firefox or
  iPhone yet, so treat them as untested.
- **This is friction, not a lock.** The pause and 30-second wait stop impulsive switching-off.
  Someone determined can still change settings in the browser's developer tools or uninstall
  the extension.
- Allowed times follow each device's own clock and time zone, and the 3-pauses-a-day count is
  kept per device, like the pauses themselves.
- **Private windows.** Browsers don't run extensions in private/incognito windows unless you
  allow it under the extension's details, so blocking doesn't apply there by default.
- Pauses are stored per device. Your platform switches sync with your browser profile, but a
  10-minute pause on one computer doesn't pause your others.
- The smaller options (*Allow notifications*, *Allow Marketplace search*) switch instantly,
  without the pause flow.
- YouTube's "For you" / "People also watched" shelves in search are matched by their English
  titles, and the m.youtube.com "related videos" rule hasn't been checked on a phone.
- Instagram and Facebook selectors that use ARIA labels (the DM Reel badge, the
  "Reels and short videos" carousel) match English labels. URL-based rules work in
  any language.
- On Facebook, a post inside a group or profile is hidden if it links to a Reel,
  including a Reel shared in a normal post.
- Facebook's "Suggested for you" and "People you may know" units are found by their
  English headings. The feeds themselves are blocked by URL, which works in any language.
- *Open this video only* uses Facebook's `video.php?v=` link. If Facebook sends that
  back to Watch, you get the Watch panel again (no redirect loop).
- Instagram's desktop Search opens as a side panel from its own sidebar, which stays
  available. The panel's "Search for an account" link goes to `/explore/search/`, the
  search page Instagram uses on phones.
- Instagram profile grids stay visible so you can look at an account on purpose. Opening a
  Reel from one shows the "Reels are off" panel.
- The "Suggested for you" block on profiles is found by its English heading.
- TikTok's "You may like" and similar recommendation sections on profiles and video pages
  are found by their English headings. The sidebar's suggested accounts use TikTok's
  `data-e2e` attribute and work in any language.
- TikTok shows a "Short drama" feed to some users. `/shortdrama` and its episodes
  (`/shortdrama/episode/…`) are covered, but that URL pattern comes from public reports rather
  than a live check, because the feed wasn't shown to the test account.
- m.facebook.com uses a different layout. Its feeds are still blocked by URL, with the
  panel covering the whole screen.
- **Reddit, X and Snapchat are new and haven't been checked on the live sites yet.** Their
  feeds are blocked by URL, which is the dependable part. The selectors for links,
  sidebars and recommendation boxes come from their known markup and are tested against
  mock pages only, so run their sections of [TESTING.md](TESTING.md) and adjust
  `extension/content/<site>.js` where something slips through.
- Reddit keeps communities you open on purpose, so a community's own post list can still be
  scrolled, just as a Facebook group can. Reddit's "More posts you may like", "Popular
  communities" and similar boxes, and X's right-hand-column boxes other than "Who to
  follow" and trends, are found by their English headings.
- On X, the "Discover more" posts under a post's replies aren't removed yet.
- Snapchat's web markup has no reliable content area, so on Spotlight the panel may cover
  the whole window rather than just the feed.
- Adding sites means new host permissions. A store-installed copy would ask you to approve
  them on update; a loaded-unpacked copy just needs reloading.

## License

Released under the [MIT License](LICENSE). You're free to use, copy, modify and
distribute it, as long as you include the copyright and license notice.

```
MIT License

Copyright (c) 2026 Yameen Munir

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

ShortStop isn't affiliated with or endorsed by YouTube, Google, Instagram, Facebook,
Meta, TikTok, Reddit, X or Snap.
