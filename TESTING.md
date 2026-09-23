# ShortStop testing checklist

Run the automated tests first with `python tests/run_tests.py`. They cover the engine
against mock markup. This checklist covers the real sites, which change without warning.
It takes about 10 minutes. Use a normal (non-incognito) window, signed in where noted,
with DevTools closed unless a step says otherwise.

Before you start: load the extension, open the popup, and check that all four switches
are on. Note today's counter number.

## YouTube (desktop, www.youtube.com)

- [ ] **Home:** no Shorts shelf anywhere while you scroll at least three screens.
- [ ] **Sidebar:** no "Shorts" entry, both expanded (☰) and collapsed (mini sidebar).
- [ ] **Search** for something popular (e.g. "cat videos"): no Shorts shelf, no single Shorts
      among the results, and no "Shorts" filter chip at the top.
- [ ] **Subscriptions** (signed in): no Shorts in the grid.
- [ ] **Channel page** (e.g. youtube.com/@MrBeast): no "Shorts" tab, and no Shorts shelf on the Home tab.
- [ ] **Watch page:** no Shorts shelf under the video or in the right-hand suggestions.
- [ ] **Direct link:** paste `https://www.youtube.com/shorts/aqz-KE-bpKQ` into the address bar.
      It opens as `/watch?v=aqz-KE-bpKQ` in the normal player.
- [ ] **In-app navigation:** from a channel's Videos tab, open any Short link that still
      appears (e.g. from a video description). It opens in the normal player.
- [ ] **Back button:** after that redirect, Back returns to the page you came from, not the Short.
- [ ] **Normal videos** still play, and search, comments and playlists all work.

## YouTube (mobile, m.youtube.com)

Use DevTools device mode (Ctrl+Shift+M, then choose an iPhone) or a real phone with the userscript.

- [ ] No "Shorts" tab in the bottom bar.
- [ ] No Shorts shelf on the home feed or in search.

## Instagram (signed in, www.instagram.com)

Blocked routes should show the ShortStop panel ("Your feed is off", "Explore is off", …)
in place of the content, with Instagram's own sidebar or bottom bar still usable.

- [ ] **Home:** open instagram.com. The panel appears straight away, with no feed flashing
      first. Try the mouse wheel, trackpad, Page Down and Space: nothing scrolls.
- [ ] **Home, Following view:** `https://www.instagram.com/?variant=following` is blocked too.
- [ ] **Stories:** no stories tray on Home. Opening a story (for example from a profile
      photo ring) shows "Stories are off".
- [ ] **Explore:** the sidebar Explore link shows "Explore is off". So do a hashtag
      (`/explore/tags/cats/`) and "See all" suggested people (`/explore/people/`).
- [ ] **Reels:** no Reels link in the sidebar or bottom bar. `/reels/` and any
      `/reel/<id>/` show "Reels are off", and nothing plays or makes sound.
- [ ] **In-app navigation:** from a profile, click the Instagram logo or Home. The panel
      appears without a page reload. Go back to the profile and it works normally again.
- [ ] **Messages:** the panel's Messages button and the sidebar both open DMs normally.
- [ ] **DM Reels:** in a chat where someone shared a Reel, it is blurred with the
      "Reel hidden by ShortStop" label and can't be clicked.
- [ ] **Search:** the sidebar Search panel finds an account, and the panel's "Search for an
      account" works on a narrow window or phone.
- [ ] **Profiles:** open a profile you searched for. The header and posts grid show, with
      no Reels tab. After tapping Follow, no "Suggested for you" block appears.
      `/<username>/reels/` sends you to that profile's grid.
- [ ] **Single post:** a `/p/<id>/` link (for example from a DM) opens normally.
- [ ] **Posting:** Instagram's Create/New post button still works.
- [ ] **Notifications off (default):** no Notifications item in the sidebar or heart icon on
      mobile. `/accounts/activity/` shows "Notifications are off".
- [ ] **Notifications on:** turn on *Allow notifications* in the popup. The Notifications item
      comes back without a reload, and the panel gains a Notifications button. Turn it off again.

## Facebook (signed in, www.facebook.com)

- [ ] **Left sidebar / shortcuts:** no "Reels" entry (you may need to click "See more").
- [ ] **Home feed:** scroll for 30 seconds. No "Reels and short videos" carousel and no Reel posts.
      Text, photo and normal video posts still appear.
- [ ] **A Page** (e.g. facebook.com/natgeo): no "Reels" tab.
- [ ] **Direct link:** `https://www.facebook.com/reel/` sends you to the home feed.
- [ ] **Direct link:** `https://www.facebook.com/<page>/reels/` sends you to the Page.
- [ ] Messenger, Groups, Marketplace and normal videos all still work.

## TikTok

Feeds should show the ShortStop panel ("Scrolling is blocked by your focus settings.")
in place of the videos, with TikTok's sidebar and top bar still usable.

- [ ] **For You:** open tiktok.com. The panel appears straight away and no video plays or
      makes sound. Arrow keys, Page Down, Space, J/K and the mouse wheel don't move to another video.
- [ ] **No switching around it:** the sidebar has no For You, Following, Friends, Explore or
      LIVE links. Typing `/following`, `/friends`, `/live` or `/explore` in the address bar
      shows the panel each time.
- [ ] **Discovery pages:** a hashtag (`/tag/cats`) and a sound page (any `/music/…` link) show the panel.
- [ ] **In-app navigation:** from a profile, click the TikTok logo. The panel appears without a
      page reload. Go back and the profile works normally again.
- [ ] **Search:** the panel's search box and TikTok's own search bar both show results, and
      opening a result plays that video.
- [ ] **Profiles:** a profile you searched for shows its videos, with no "You may like" or
      suggested-accounts section.
- [ ] **Single video:** a `/@user/video/<id>` link (for example from a DM) plays, with comments,
      and without the recommendations panel.
- [ ] **Messages** open from the panel and the top bar.
- [ ] **Upload:** the panel's "Upload a video" opens TikTok Studio.
- [ ] **Notifications off (default):** the inbox/notifications button is gone.
- [ ] **Notifications on:** turn on *Allow notifications* under TikTok in the popup. The button
      comes back without a reload. Turn it off again.

## Popup and switches

- [ ] Switch **YouTube off** with a YouTube tab open. Shorts shelves reappear **without reloading**.
      Switch it back on and they disappear again.
- [ ] Repeat for Instagram, Facebook and TikTok (the panel disappears and the feed returns).
- [ ] With YouTube off, a `/shorts/…` link plays as a Short (no redirect).
- [ ] The **counter** has gone up compared with the number you noted at the start, and the
      per-platform numbers add up to the big number.
- [ ] Close and reopen the browser. Switches keep their state and today's counter is kept.
- [ ] (Optional) Change the system clock to tomorrow. "Today" resets to 0 and the all-time total is kept.
- [ ] Dark mode (switch your OS theme): the popup and the blocking panels are readable,
      and keyboard Tab reaches every switch with a visible focus ring.

## Privacy spot-check

- [ ] Open the popup, right-click → **Inspect** → **Network** tab, then use the popup. Nothing is requested.
- [ ] On `chrome://extensions` → ShortStop → **Details**, site access lists only YouTube,
      Instagram, Facebook and TikTok.

## iPhone (Userscripts app)

- [ ] m.youtube.com: no Shorts tab in the bottom bar and no Shorts shelves, and a
      `/shorts/<id>` link opens in the normal player.
- [ ] instagram.com in Safari: the Home feed shows "Your feed is off", and Messages and search still work.
- [ ] Set `BLOCK_INSTAGRAM_REELS = false`, save and reload Instagram. The feed is back.
- [ ] tiktok.com in Safari: the For You feed shows "Scrolling is blocked by your focus
      settings.", and search still works. (Safari may offer to open the TikTok app. Stay in Safari.)

If something fails, see "When a site changes: updating selectors" in the README.
