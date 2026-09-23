# ShortStop testing checklist

Run the automated tests first with `python tests/run_tests.py`. They cover the engine
against mock markup. This checklist covers the real sites, which change without warning.
It takes about 10 minutes. Use a normal (non-incognito) window, signed in where noted,
with DevTools closed unless a step says otherwise.

Before you start: load the extension, open the popup, and check that all four switches
are on. Note today's counter number.

## YouTube (desktop, www.youtube.com)

- [ ] **Home:** the panel ("Scrolling is blocked by your focus settings.") replaces the
      recommended grid straight away. The sidebar has no Shorts, Trending or Gaming entries.
- [ ] **Panel:** its search box shows results. Subscriptions, Watch later, Your playlists and
      History all open.
- [ ] **Trending / Explore / Gaming:** `/feed/trending` and `/gaming` show the panel (YouTube
      may send Trending to Home, which is also covered).
- [ ] **Search** for something popular (e.g. "cat videos"): results show, with no Shorts shelf,
      no single Shorts, no "Shorts" filter chip, and no "For you" / "People also watched" shelves.
- [ ] **Subscriptions** (signed in): the grid shows, without Shorts.
- [ ] **Channel page** (e.g. youtube.com/@MrBeast): no "Shorts" tab. The Videos tab works.
- [ ] **Watch page:** no "Up next" list beside or below the video. The description and
      comments are still there.
- [ ] **Autoplay:** the autoplay switch in the player shows **off**. Let a short video finish.
      Nothing plays next and there's no end-screen video wall or countdown.
- [ ] **Playlists:** play a playlist. The playlist panel shows on the right, and the next
      playlist video plays after each one ends.
- [ ] **Live stream:** the live chat still shows beside the video.
- [ ] **Miniplayer:** start a video, press the miniplayer button, then go to Home. The panel
      shows and the miniplayer keeps playing. Its play/pause and keyboard controls work.
- [ ] **Direct link:** paste `https://www.youtube.com/shorts/aqz-KE-bpKQ` into the address bar.
      It opens as `/watch?v=aqz-KE-bpKQ` in the normal player, and Back skips the Short.

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

Feeds should show the ShortStop panel ("Scrolling is blocked by your focus settings.")
in the centre column, with the top bar, left menu and chat sidebar still usable.

- [ ] **News Feed:** open facebook.com. The panel appears straight away and nothing plays.
      Scrolling, Page Down, Space and J/K do nothing.
- [ ] **No switching around it:** the menu and top bar have no Video/Watch, Reels, Feeds or
      Gaming shortcuts. Typing `/watch`, `/reel/`, `/reels/`, `/stories/…`, `/feeds/`,
      `/gaming/` or `/?filter=friends&sk=h_chr` in the address bar shows the panel each time.
- [ ] **Groups:** the Groups tab shows the panel (groups feed). Its "Your groups" link lists
      your groups, and opening one works normally, without Reels or "Suggested for you" posts.
- [ ] **Friends:** friend requests work. `/friends/suggestions/` shows the panel.
- [ ] **In-app navigation:** from a profile, click the Facebook logo or Home. The panel appears
      without a reload. Press Back and the profile works again.
- [ ] **Search:** the panel's search box and Facebook's own search both find a person or Page.
- [ ] **Profiles and Pages:** open one. It works, with no Reels tab. Pages you manage open
      from the panel's "Pages you manage".
- [ ] **Posting:** "Post from your profile" opens your profile, and creating a post works.
- [ ] **Messenger:** chats open from the panel, the top bar and the chat sidebar.
- [ ] **Watch link from a friend:** a `/watch/?v=…` link shows the panel with
      "Open this video only", which plays that video.
- [ ] **Marketplace home:** the panel appears with a Marketplace search box. Searching for an
      item shows results, and opening a listing works. Your listings and the Marketplace inbox work.
- [ ] **Marketplace search off:** turn off *Allow Marketplace search* in the popup. Searches
      now show the panel, but a listing link (for example from Messenger) still opens.
      Turn it back on.
- [ ] **Notifications off (default):** no bell in the top bar. `/notifications/` shows the panel.
- [ ] **Notifications on:** turn on *Allow notifications* under Facebook. The bell comes back
      without a reload. Turn it off again.

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

- [ ] With a YouTube tab open, click YouTube's switch in the popup. It does **not** switch off.
      It offers **Allow 10 minutes**, **Turn off…** and **Cancel**. Cancel closes it.
- [ ] **Allow 10 minutes:** the switch turns off and the popup counts down ("Unlocked, 9:59
      left"). The YouTube tab unblocks **without reloading**.
- [ ] **Block again** blocks the tab again at once.
- [ ] **Blocking returns by itself:** start another pause, then wait it out (or, to save time,
      run `chrome.storage.local.set({unlocks:{youtube:Date.now()+15000}})` in the popup's DevTools
      console). Blocking comes back in the open tab with no reload, and the popup goes back to normal.
- [ ] **Turn off…** starts a 30-second wait ("Turning off in 29s.") with only Cancel available.
      Close the popup, reopen it a few seconds later, and the wait is still counting.
- [ ] After 30 seconds the popup offers **Turn off now**. Click it: YouTube stays off (Shorts
      play as Shorts, with no redirect) until you click the switch again, which turns
      blocking back on **instantly**.
- [ ] Leave a finished wait unconfirmed for over 2 minutes. It lapses by itself.
- [ ] Repeat a pause for Instagram, Facebook and TikTok (the panel disappears, the feed
      returns, and it's blocked again when the time is up).
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
- [ ] facebook.com in Safari: the News Feed shows the panel, and Messenger and search still work.
- [ ] tiktok.com in Safari: the For You feed shows "Scrolling is blocked by your focus
      settings.", and search still works. (Safari may offer to open the TikTok app. Stay in Safari.)

If something fails, see "When a site changes: updating selectors" in the README.
