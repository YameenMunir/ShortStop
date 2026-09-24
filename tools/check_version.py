"""
Check that every copy of the version number agrees, and that a release tag matches it.

    python tools/check_version.py            # manifest.json, core.js and the userscript agree
    python tools/check_version.py v1.1.0     # ...and the tag is "v" + the manifest version

extension/manifest.json holds the version. extension/content/core.js repeats it,
and the userscript's @version is generated from it by tools/build_userscript.py.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    errors = []
    version = json.loads((ROOT / "extension" / "manifest.json").read_text(encoding="utf-8"))["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        errors.append(f'manifest.json version "{version}" should look like 1.2.3.')

    core = re.search(r"version: '([^']+)'", (ROOT / "extension" / "content" / "core.js").read_text(encoding="utf-8"))
    if not core or core.group(1) != version:
        errors.append(f"extension/content/core.js says {core and core.group(1)!r}; set it to '{version}'.")

    userscript = re.search(r"^// @version\s+(\S+)", (ROOT / "userscript" / "shortstop.user.js").read_text(encoding="utf-8"), re.M)
    if not userscript or userscript.group(1) != version:
        errors.append(f"the userscript says {userscript and userscript.group(1)!r}; run python tools/build_userscript.py.")

    if len(sys.argv) > 1 and sys.argv[1] != f"v{version}":
        errors.append(f'tag "{sys.argv[1]}" doesn\'t match manifest.json version {version}; the tag should be "v{version}".')

    for error in errors:
        print(f"::error::{error}")
    if errors:
        sys.exit(f"Version check: {len(errors)} problem(s).")
    print(f"Version {version}: manifest.json, core.js and the userscript agree" + (f", and the tag matches." if len(sys.argv) > 1 else "."))


if __name__ == "__main__":
    main()
