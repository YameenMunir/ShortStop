"""
Build userscript/shortstop.user.js from the extension's own source files.

The userscript is the extension's core engine (with the allowed-times helper
it uses) plus the YouTube, Instagram, Facebook, TikTok, Reddit, X and Snapchat
configs, stitched into one file with an iOS-friendly environment (toggles as constants, no
storage, no counter, no allowed times). Selectors therefore only ever
need updating in extension/content/*.js; run this afterwards:

    python tools/build_userscript.py
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "extension" / "content"
SCHEDULE = ROOT / "extension" / "shared" / "schedule.js"  # core.js needs it.
OUTPUT = ROOT / "userscript" / "shortstop.user.js"

PLATFORM_FILES = ("youtube.js", "instagram.js", "facebook.js", "tiktok.js", "reddit.js", "x.js", "snapchat.js")

HEADER = """// ==UserScript==
// @name         ShortStop: Block Shorts, Reels & Endless Feeds
// @namespace    https://github.com/YameenMunir/ShortStop
// @version      __VERSION__
// @description  Blocks Shorts, Reels, Spotlight and endless feeds on YouTube, Instagram, Facebook, TikTok, Reddit, X and Snapchat, while keeping search, messages and profiles usable. No tracking.
// @author       Yameen Munir
// @license      MIT
// @match        *://www.youtube.com/*
// @match        *://m.youtube.com/*
// @match        *://www.instagram.com/*
// @match        *://www.facebook.com/*
// @match        *://web.facebook.com/*
// @match        *://m.facebook.com/*
// @match        *://*.tiktok.com/*
// @match        *://www.reddit.com/*
// @match        *://old.reddit.com/*
// @match        *://x.com/*
// @match        *://mobile.x.com/*
// @match        *://twitter.com/*
// @match        *://mobile.twitter.com/*
// @match        *://www.snapchat.com/*
// @run-at       document-start
// @inject-into  content
// @noframes
// @grant        none
// ==/UserScript==

/*
 * GENERATED FILE: edit extension/content/*.js, then run
 * `python tools/build_userscript.py`. Only the settings block below is meant
 * to be edited by hand.
 */

/* ===================== SETTINGS: edit these ===================== */
/* true = block, false = allow. Save the file, then reload the site. */

// YouTube: Shorts open in the normal player; the home feed, Up next,
// end screens and autoplay are switched off.
const BLOCK_YOUTUBE_SHORTS = true;

// Instagram: the Home feed, Explore, Reels and Stories are blocked.
const BLOCK_INSTAGRAM_REELS = true;
const ALLOW_INSTAGRAM_NOTIFICATIONS = false;

// Facebook: the News Feed, Reels, Watch, Stories and other recommendation
// feeds are blocked. Messenger, search, profiles and groups keep working.
const BLOCK_FACEBOOK_FEEDS = true;
const ALLOW_FACEBOOK_NOTIFICATIONS = false;
const ALLOW_FACEBOOK_MARKETPLACE_SEARCH = true;

// TikTok: For You, Following, Friends, LIVE and Explore are blocked.
const BLOCK_TIKTOK_FEEDS = true;
const ALLOW_TIKTOK_NOTIFICATIONS = false;

// Reddit: the Home feed, Popular, All and Explore are blocked. Communities,
// posts, search and chat keep working.
const BLOCK_REDDIT_FEEDS = true;

// X: the Home timeline (For you and Following) and Explore are blocked.
const BLOCK_X_FEEDS = true;
const ALLOW_X_NOTIFICATIONS = false;

// Snapchat: Spotlight, Discover and Explore are blocked.
const BLOCK_SNAPCHAT_SPOTLIGHT = true;

/* ================================================================ */

(function () {
  'use strict';

  const SETTINGS = {
    youtube: BLOCK_YOUTUBE_SHORTS,
    instagram: BLOCK_INSTAGRAM_REELS,
    facebook: BLOCK_FACEBOOK_FEEDS,
    facebookNotifications: ALLOW_FACEBOOK_NOTIFICATIONS,
    facebookMarketplaceSearch: ALLOW_FACEBOOK_MARKETPLACE_SEARCH,
    instagramNotifications: ALLOW_INSTAGRAM_NOTIFICATIONS,
    tiktok: BLOCK_TIKTOK_FEEDS,
    tiktokNotifications: ALLOW_TIKTOK_NOTIFICATIONS,
    reddit: BLOCK_REDDIT_FEEDS,
    x: BLOCK_X_FEEDS,
    xNotifications: ALLOW_X_NOTIFICATIONS,
    snapchat: BLOCK_SNAPCHAT_SPOTLIGHT,
  };
"""

ENV = """
/* ---- Userscript environment: fixed settings, no storage, no counter ---- */
ShortStop.useEnv({
  href: () => location.href,
  navigate(url, replace) {
    if (replace) location.replace(url);
    else location.assign(url);
  },
  getSettings: () => Promise.resolve(SETTINGS),
  onSettingsChanged() {},
  count: () => Promise.resolve(),
});
"""

FOOTER = "})();\n"


def indent(source):
    return "".join(("  " + line) if line.strip() else line for line in source.splitlines(keepends=True))


def section(title, source):
    return f"\n  /* ======== {title} ======== */\n" + indent(source.rstrip() + "\n")


def main():
    manifest = json.loads((ROOT / "extension" / "manifest.json").read_text(encoding="utf-8"))
    parts = [HEADER.replace("__VERSION__", manifest["version"])]
    parts.append(section("shared/schedule.js", SCHEDULE.read_text(encoding="utf-8")))
    parts.append(section("core.js", (CONTENT / "core.js").read_text(encoding="utf-8")))
    parts.append(indent(ENV))
    for name in PLATFORM_FILES:
        parts.append(section(name, (CONTENT / name).read_text(encoding="utf-8")))
    parts.append(FOOTER)

    output = "".join(parts)
    output = re.sub(r"[ \t]+\n", "\n", output)  # No trailing whitespace.
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(output, encoding="utf-8", newline="\n")
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(output):,} bytes)")


if __name__ == "__main__":
    main()
