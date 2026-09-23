<p align="center">
  <img src="extension/icons/icon128.png" width="96" height="96" alt="ShortStop icon: a stop-sign octagon around a vertical video frame">
</p>

<h1 align="center">ShortStop</h1>

<p align="center">
  A free, open-source browser extension that blocks short-form video and endless feeds
  (YouTube Shorts, Facebook Reels, and every scrolling feed on Instagram and TikTok)
  while keeping the useful parts of each site working.
</p>

<p align="center">
  Chrome · Edge · Brave · Firefox (small tweak) · iPhone Safari (userscript)
</p>

---

## What it does

| Platform | What ShortStop changes |
| --- | --- |
| **YouTube** | `/shorts/VIDEO_ID` opens in the normal player (`/watch?v=VIDEO_ID`) instead. Shorts shelves are removed from home, search, subscriptions, channel and watch pages. The Shorts entries in the sidebar, mini sidebar, channel tabs, search filter chips and the m.youtube.com bottom bar are removed. |
| **Instagram** | **Focus mode.** The Home feed, Explore (including hashtag, place and suggested-people pages), Reels and Stories are all blocked the same way. Their content is replaced by a ShortStop panel before it paints, so there's nothing to scroll and no way round it through the Home feed. The panel links to what still works: **Messages**, **account search**, **your profile**, and posting through Instagram's own menu. Profiles and single posts you open on purpose still work, minus the Reels tab and "Suggested for you" accounts. Reels shared in DMs are blurred and can't be opened. **Notifications** are blocked unless you turn on *Allow notifications* in the popup. |
| **Facebook** | The Reels shortcut and Page/profile Reels tabs are hidden. Feed posts and "Reels and short videos" carousels are removed. `/reel/…` and `/reels/` URLs send you to your home feed. |
| **TikTok** | **Focus mode.** Every algorithmic feed is blocked the same way: For You, Following, Friends, LIVE (the feed and individual streams), Explore, and the discovery pages behind hashtags, sounds, topics and channels. The feed is replaced by a panel saying *"Scrolling is blocked by your focus settings."*, so switching from For You to Following or LIVE gets you nowhere. The panel has a search box and links to **Messages**, **Upload** and **your profile**. The sidebar links into feeds are hidden. On a blocked feed, the arrow, Page Up/Down, Space and J/K keys are swallowed, and any video that starts playing is paused. **Search**, **messages**, **profiles and single videos** you open on purpose (minus "You may like" and suggested accounts), **uploading** and **account settings** keep working. **Notifications** are blocked unless you turn on *Allow notifications* in the popup. |

The popup has an on/off switch per platform, plus *Allow notifications* under Instagram and TikTok.
Changes apply to open tabs straight away, without a reload. It also shows how many
Shorts, Reels and feeds were blocked today.

<p align="center">
  <img src="docs/popup.png" width="300" alt="The ShortStop popup: 17 Shorts and Reels blocked today, with per-platform switches and counts">
</p>

## Privacy

- **No data collection, no analytics, no network requests.** The extension never
  calls `fetch`, loads no remote code and uses no third-party libraries.
- **Minimum permissions:** `storage`, plus host access to the four sites it works on.
  It can't see any other website.
- Your on/off switches are saved with `chrome.storage.sync`, so they follow your
  browser profile. The daily counter lives in `chrome.storage.local` on your device only.

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
5. Pin ShortStop from the puzzle-piece menu so the switches are one click away.

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
userscript: [`userscript/shortstop.user.js`](userscript/shortstop.user.js). It covers
YouTube, Facebook, and the same Instagram and TikTok focus modes.

1. Install **Userscripts** (by Justin Wasack, free) from the App Store.
2. Open the Userscripts app and choose a folder for your scripts, for example
   `iCloud Drive/Userscripts`.
3. Turn the extension on: **Settings → Apps → Safari → Extensions → Userscripts**.
   Enable it and set **youtube.com, instagram.com, facebook.com and tiktok.com** (or All Websites) to **Allow**.
   On older iOS versions this is under **Settings → Safari → Extensions**.
4. Put `shortstop.user.js` in that folder. Either:
   - open the raw file on GitHub in Safari, tap the **Userscripts** icon in the address
     bar menu and choose **Install**, or
   - download it and move it into the folder with the Files app.
5. Visit m.youtube.com. The Userscripts menu should show ShortStop as active.

**Changing settings on iPhone:** edit the constants at the very top of the file, then save:

```js
const BLOCK_YOUTUBE_SHORTS = true;
const BLOCK_INSTAGRAM_REELS = true;          // Instagram focus mode: feed, Explore, Reels, Stories
const BLOCK_FACEBOOK_REELS = false;          // Facebook Reels allowed
const ALLOW_INSTAGRAM_NOTIFICATIONS = false; // true keeps Instagram notifications reachable
const BLOCK_TIKTOK_FEEDS = true;             // TikTok focus mode: For You, Following, LIVE, Explore
const ALLOW_TIKTOK_NOTIFICATIONS = false;    // true keeps TikTok notifications reachable
```

The userscript has no popup or daily counter, because Safari userscripts have no shared storage.

## How it works

```
extension/
├── manifest.json            MV3 manifest: storage + the four sites, nothing else
├── background.js            Service worker: keeps the daily counter (one write queue for all tabs)
├── shared/stats.js          Counter helpers shared by the background worker and popup
├── content/
│   ├── core.js              The engine: CSS generation, MutationObserver, SPA navigation, redirects
│   ├── nav-hook.js          Runs in the page's own JS world; wraps history.pushState/replaceState
│   ├── youtube.js           YouTube selectors + redirects (one config object)
│   ├── instagram.js         Instagram focus mode: covered routes, selectors, redirects
│   ├── facebook.js          Facebook selectors + redirects
│   └── tiktok.js            TikTok focus mode: covered feeds, panel search, selectors
├── popup/                   On/off switches, notification options and today's counter
└── icons/                   16, 32, 48 and 128 px PNGs
userscript/shortstop.user.js Generated from content/*.js for iOS Safari
tools/                       Icon generator, userscript builder, zip packager (Python, no dependencies)
tests/                       Fixture pages + a headless-Chrome test runner
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
4. **Covered routes.** A config can list whole routes to cover (Instagram's Home, Explore,
   Reels and Stories, and every TikTok feed). On those, the content area (Instagram's `main`,
   TikTok's `div#main-content-…` or `main`) is hidden by the same
   `document_start` stylesheet, and a ShortStop panel takes its place. The panel is built in
   a shadow root so the site's CSS can't touch it. Any playing media is paused. The route is
   re-checked on every navigation and every DOM change, so the panel comes back if the site
   re-renders it away. If the site has no `main` element, for example while loading or after
   a redesign, the panel covers the whole viewport and locks scrolling instead.
5. **Live settings.** Content scripts listen to `chrome.storage.onChanged`. Switching a
   platform or option off removes the stylesheet, un-hides everything and removes the panel.
   Switching it on re-applies everything. No reload needed.

## When a site changes: updating selectors

YouTube, Instagram and Facebook change their markup regularly. When something slips
through, the fix is usually one line in one file.

1. **Find the element.** Right-click the Short/Reel that got through → **Inspect**. Walk up
   the DOM to the element that wraps the whole thing (the shelf, card or list item).
2. **Pick a stable selector.** In order of preference:
   - a custom element name: `ytd-reel-shelf-renderer`
   - an attribute: `[is-shorts]`, `[tab-title="Shorts"]`, `[role="tab"]`
   - a URL pattern: `a[href^="/shorts/"]`, `a[href*="/reel/"]`
   - `:has()` to target a container by what's inside it:
     `ytd-rich-item-renderer:has(a[href^="/shorts/"])`
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

   **To block a whole route instead** (Instagram), add its pathname pattern to `pages` and
   list it under `cover.pages` with a title. If the site stops using `<main>` for its content
   area, update `cover.target`. Put container rules (shelves, sections)
   **above** item rules so items inside them aren't counted twice.
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
python tests/run_tests.py          # 354 checks in headless Chrome/Edge against mock site markup
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
- Instagram's and TikTok's covered routes: the panel's title, message and links, media
  paused, the panel re-mounting after the site removes it, the full-viewport fallback, and
  the notifications options
- TikTok's feed keys being swallowed (but not while typing), autoplay being stopped, and the
  panel's search box
- every redirect rule
- redirects triggered by SPA navigation

A manual checklist for real accounts is in [TESTING.md](TESTING.md).

## Known limitations

- Instagram and Facebook selectors that use ARIA labels (the DM Reel badge, the
  "Reels and short videos" carousel) match English labels. URL-based rules work in
  any language.
- On Facebook, a feed post is hidden if it contains any link to a Reel, including
  a Reel shared in a normal post.
- Instagram's desktop Search opens as a side panel from its own sidebar, which stays
  available. The panel's "Search for an account" link goes to `/explore/search/`, the
  search page Instagram uses on phones.
- Instagram profile grids stay visible so you can look at an account on purpose. Opening a
  Reel from one shows the "Reels are off" panel.
- The "Suggested for you" block on profiles is found by its English heading.
- TikTok's "You may like" and similar recommendation sections on profiles and video pages
  are found by their English headings. The sidebar's suggested accounts use TikTok's
  `data-e2e` attribute and work in any language.
- TikTok shows a "Short drama" feed to some users. Its sidebar link is hidden, but its URL
  wasn't visible during testing, so the route itself isn't covered yet.
- m.facebook.com gets the redirects but its hiding rules are less complete than on www.

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
Meta or TikTok.
