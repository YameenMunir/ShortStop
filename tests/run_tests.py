"""
Run the ShortStop fixture tests in headless Chrome (or Edge).

Each tests/fixtures/*.html page loads the real engine and platform config
against mock site markup; tests/harness.js writes pass/fail results into the
page, which we read back with --dump-dom.

    python tests/run_tests.py            # auto-detects Chrome/Edge
    CHROME=/path/to/chrome python tests/run_tests.py
"""

import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CANDIDATES = [
    os.environ.get("CHROME"),
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    shutil.which("google-chrome"),
    shutil.which("chromium"),
    shutil.which("chromium-browser"),
]


def find_browser():
    for candidate in CANDIDATES:
        if candidate and Path(candidate).exists():
            return candidate
    sys.exit("No Chrome/Edge found. Set the CHROME environment variable.")


def run_fixture(browser, fixture):
    with tempfile.TemporaryDirectory() as profile:
        output = subprocess.run(
            [
                browser,
                "--headless=new",
                "--disable-gpu",
                "--no-first-run",
                f"--user-data-dir={profile}",
                "--allow-file-access-from-files",
                "--virtual-time-budget=20000",
                "--dump-dom",
                fixture.as_uri(),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=120,
        ).stdout
    match = re.search(r'<pre id="results">(.*?)</pre>', output, re.S)
    if not match:
        return [{"name": "harness produced results", "pass": False, "detail": "no <pre id=results> in DOM"}]
    return json.loads(html.unescape(match.group(1)))


def main():
    browser = find_browser()
    failures = total = 0
    for fixture in sorted((ROOT / "fixtures").glob("*.html")):
        results = run_fixture(browser, fixture)
        passed = sum(result["pass"] for result in results)
        print(f"\n{fixture.stem}: {passed}/{len(results)} passed")
        for result in results:
            if not result["pass"]:
                print(f"  FAIL  {result['name']}  ({result['detail']})")
        failures += len(results) - passed
        total += len(results)
    print(f"\n{total - failures}/{total} checks passed")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
