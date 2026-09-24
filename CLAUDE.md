# ShortStop: notes for Claude

ShortStop is a Chrome Manifest V3 extension (plain JavaScript and CSS, no build step, no
libraries) that blocks Shorts, Reels and endless recommendation feeds on YouTube, Instagram,
Facebook, TikTok, Reddit, X and Snapchat. `extension/` is the extension, `userscript/` is a
generated iPhone version, `tests/` has fixture pages and a headless-browser runner, and
`tools/` has the Python helpers. See [README.md](README.md) for how it works.

## Git workflow: one branch per feature or improvement

**Every new feature, improvement or fix gets its own branch. Never build it on `main`.**
This keeps each change reviewable and easy to revert on its own.

1. Start from an up-to-date `main`: `git switch main && git pull`.
2. Create the branch before writing any code: `git switch -c <type>/<short-description>`.
3. Name it with a type prefix and a short kebab-case description:
   - `feature/` for new features, e.g. `feature/first-run-welcome-page`
   - `improvement/` for changes to something that already exists
   - `fix/` for bug fixes, e.g. `fix/instagram-explore-selector`
   - `docs/` for documentation-only changes
4. Keep the branch to **one** feature or fix. If a second idea comes up, finish or park the
   first, then branch again from `main`.
5. Keep the change complete on its branch: code, tests, and the README and TESTING.md
   updates for that change.
6. **Only commit or push when asked.** Merging into `main` is done by the owner, not by
   Claude, unless they say otherwise.

## Before calling a change done

- `python tools/build_userscript.py` (the userscript is generated from `extension/content/`).
- `python tests/run_tests.py` must pass.
- `python tools/check_privacy.py` must pass (it also runs on every pull request).
- Check UI changes in a real browser, in light and dark mode, and say what could not be verified.
- Selectors live in one config object per platform in `extension/content/<platform>.js`.
  Prefer URL patterns, ARIA labels and tag names over generated class names.

## Constraints that must not be broken

- Zero data collection, zero analytics, zero network requests, no third-party libraries.
- Permissions stay minimal: `storage`, plus host access to the supported sites (listed in
  `extension/manifest.json`). Adding a site is a deliberate change to that list, and to
  `ALLOWED_HOSTS` in `tools/check_privacy.py`.
