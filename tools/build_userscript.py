"""
Build userscript/shortstop.user.js from the extension's own source files.

The userscript is the extension's core engine plus the YouTube, Instagram and
Facebook configs, stitched into one file with an iOS-friendly environment
(toggles as constants, no storage, no counter). Selectors therefore only ever
need updating in extension/content/*.js; run this afterwards:

    python tools/build_userscript.py
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "extension" / "content"
OUTPUT = ROOT / "userscript" / "shortstop.user.js"

PLATFORM_FILES = ("youtube.js", "instagram.js", "facebook.js")

HEADER = """// ==UserScript==
// @name         ShortStop: Shorts & Reels Blocker
// @namespace    https://github.com/YOUR_GITHUB_USERNAME/shortstop
// @version      __VERSION__
// @description  Blocks YouTube Shorts, Facebook Reels, and Instagram's feed, Explore, Reels and Stories while keeping the useful parts usable. No tracking.
// @author       Yameen Munir
// @license      MIT
// @match        *://www.youtube.com/*
// @match        *://m.youtube.com/*
// @match        *://www.instagram.com/*
// @match        *://www.facebook.com/*
// @match        *://web.facebook.com/*
// @match        *://m.facebook.com/*
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
/* Set any of these to false to stop blocking on that site.        */
const BLOCK_YOUTUBE_SHORTS = true;
const BLOCK_INSTAGRAM_REELS = true;
const BLOCK_FACEBOOK_REELS = true;
/* Instagram blocks the Home feed, Explore, Reels and Stories.      */
/* Set this to true to keep Instagram notifications reachable.      */
const ALLOW_INSTAGRAM_NOTIFICATIONS = false;
/* ================================================================ */

(function () {
  'use strict';

  const SETTINGS = {
    youtube: BLOCK_YOUTUBE_SHORTS,
    instagram: BLOCK_INSTAGRAM_REELS,
    facebook: BLOCK_FACEBOOK_REELS,
    instagramNotifications: ALLOW_INSTAGRAM_NOTIFICATIONS,
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
  blockedPageUrl: () => 'about:blank',
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
