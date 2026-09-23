"""
Zip the extension for sharing, for Chrome/Edge/Brave and for Firefox.

    python tools/package.py

Writes to dist/:
  ShortStop-<version>-chromium.zip   unzip, then "Load unpacked" the ShortStop folder
  ShortStop-<version>-firefox.zip    manifest adjusted for Firefox (see README)
"""

import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXTENSION = ROOT / "extension"
DIST = ROOT / "dist"
FOLDER = "ShortStop"  # Top-level folder inside the zip.


def firefox_manifest(manifest):
    """Firefox MV3 differences: event-page background scripts, a gecko id, and
    the data-collection declaration AMO requires."""
    firefox = json.loads(json.dumps(manifest))
    firefox["background"] = {"scripts": ["shared/stats.js", "background.js"]}
    firefox.pop("minimum_chrome_version", None)
    firefox["browser_specific_settings"] = {
        "gecko": {
            "id": "shortstop@yameen-munir",
            "strict_min_version": "128.0",  # First version with content script "world": "MAIN".
            "data_collection_permissions": {"required": ["none"]},
        }
    }
    return firefox


def build_zip(target, manifest):
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(EXTENSION.rglob("*")):
            if path.is_dir() or path.name == "manifest.json":
                continue
            archive.write(path, f"{FOLDER}/{path.relative_to(EXTENSION).as_posix()}")
        archive.writestr(f"{FOLDER}/manifest.json", json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {target.relative_to(ROOT)}")


def main():
    manifest = json.loads((EXTENSION / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    DIST.mkdir(exist_ok=True)
    build_zip(DIST / f"ShortStop-{version}-chromium.zip", manifest)
    build_zip(DIST / f"ShortStop-{version}-firefox.zip", firefox_manifest(manifest))


if __name__ == "__main__":
    main()
