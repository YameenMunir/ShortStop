"""
Privacy guard: fail if the extension could send data anywhere or run remote code.

    python tools/check_privacy.py

ShortStop promises no data collection, no analytics, no network requests and no
permissions beyond the supported sites. This checks extension/ and the
generated userscript for:

  - network calls: fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon,
    RTCPeerConnection, WebTransport
  - remote code: importScripts/import from a URL, eval, new Function, and
    remote <script>/<link>/<img>/<iframe> sources or .src = "https://..."
  - remote resources in CSS: url(https://...) and @import
  - manifest.json: permissions other than "storage", site access other than
    ALLOWED_HOSTS below, optional permissions, externally_connectable,
    update_url and a custom content_security_policy

Adding a supported site is a deliberate change: add its patterns to
ALLOWED_HOSTS here, in the same pull request as manifest.json.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

ALLOWED_PERMISSIONS = ["storage"]
ALLOWED_HOSTS = {
    "*://www.youtube.com/*",
    "*://m.youtube.com/*",
    "*://www.instagram.com/*",
    "*://www.facebook.com/*",
    "*://web.facebook.com/*",
    "*://m.facebook.com/*",
    "*://*.tiktok.com/*",
    "*://www.reddit.com/*",
    "*://old.reddit.com/*",
    "*://x.com/*",
    "*://mobile.x.com/*",
    "*://twitter.com/*",
    "*://mobile.twitter.com/*",
    "*://www.snapchat.com/*",
}
FORBIDDEN_MANIFEST_KEYS = {
    "optional_permissions": "optional permissions",
    "optional_host_permissions": "optional site access",
    "externally_connectable": "other extensions or websites messaging ShortStop",
    "update_url": "updates from a remote server",
    "content_security_policy": "a custom content security policy",
}

REMOTE = r"""['"`]\s*(?:https?:)?//"""  # A string that starts with a remote URL.
CODE_RULES = [
    (r"\bfetch\s*\(", "a network request (fetch)"),
    (r"\bXMLHttpRequest\b", "a network request (XMLHttpRequest)"),
    (r"\bWebSocket\b", "a network connection (WebSocket)"),
    (r"\bEventSource\b", "a network connection (EventSource)"),
    (r"\bsendBeacon\b", "a network request (sendBeacon)"),
    (r"\bRTCPeerConnection\b", "a network connection (WebRTC)"),
    (r"\bWebTransport\b", "a network connection (WebTransport)"),
    (r"\bimportScripts\s*\(\s*" + REMOTE, "remote code (importScripts from a URL)"),
    (r"\bimport\s*\(\s*" + REMOTE, "remote code (import from a URL)"),
    (r"\bimport\b[^;\n]*\bfrom\s*" + REMOTE, "remote code (import from a URL)"),
    (r"\beval\s*\(", "code run from a string (eval)"),
    (r"\bnew\s+Function\s*\(", "code run from a string (new Function)"),
    (r"\.src\s*=\s*" + REMOTE, "a remote resource (.src set to a URL)"),
    (r"""setAttribute\(\s*['"]src['"]\s*,\s*""" + REMOTE, "a remote resource (src set to a URL)"),
]
HTML_RULES = [
    (r"""<(?:script|img|iframe|source|video|audio|embed)\b[^>]*\bsrc\s*=\s*['"]?(?:https?:)?//""", "a remote resource"),
    (r"""<link\b[^>]*\bhref\s*=\s*['"]?(?:https?:)?//""", "a remote stylesheet or font"),
    (r"<iframe\b", "an embedded page (iframe)"),
]
CSS_RULES = [
    (r"""url\(\s*['"]?(?:https?:)?//""", "a remote resource (url)"),
    (r"@import\b", "an imported stylesheet (@import)"),
]


def scan(path, text, rules):
    findings = []
    for pattern, what in rules:
        for match in re.finditer(pattern, text, re.I):
            line = text.count("\n", 0, match.start()) + 1
            findings.append((path, line, f"{what} is not allowed: ShortStop makes no network requests."))
    return findings


def check_manifest(path):
    findings = []
    manifest = json.loads(path.read_text(encoding="utf-8"))

    def fail(message):
        findings.append((path, 1, message))

    permissions = manifest.get("permissions", [])
    extra = sorted(set(permissions) - set(ALLOWED_PERMISSIONS))
    if extra:
        fail(f"permissions {extra} are not allowed: ShortStop only needs {ALLOWED_PERMISSIONS}.")

    hosts = set(manifest.get("host_permissions", []))
    if hosts - ALLOWED_HOSTS:
        fail(
            f"site access {sorted(hosts - ALLOWED_HOSTS)} is not on the supported list. Adding a site is "
            "deliberate: add it to ALLOWED_HOSTS in tools/check_privacy.py in the same pull request."
        )
    if ALLOWED_HOSTS - hosts:
        fail(f"site access {sorted(ALLOWED_HOSTS - hosts)} is missing; also update ALLOWED_HOSTS in tools/check_privacy.py.")

    for index, entry in enumerate(manifest.get("content_scripts", [])):
        outside = sorted(set(entry.get("matches", [])) - ALLOWED_HOSTS)
        if outside:
            fail(f"content_scripts[{index}] runs on {outside}, which are not supported sites.")
        for script in entry.get("js", []) + entry.get("css", []):
            if re.match(r"(?:https?:)?//", script):
                fail(f"content_scripts[{index}] loads remote code from {script}.")

    for key, what in FORBIDDEN_MANIFEST_KEYS.items():
        if key in manifest:
            fail(f'"{key}" ({what}) is not allowed.')
    return findings


def check(extension=ROOT / "extension", userscript=ROOT / "userscript"):
    """Returns (path, line, message) for everything that breaks the privacy promise."""
    findings = check_manifest(extension / "manifest.json")
    files = sorted(extension.rglob("*")) + sorted(userscript.glob("*.js") if userscript.exists() else [])
    for path in files:
        if path.suffix == ".js":
            findings += scan(path, path.read_text(encoding="utf-8"), CODE_RULES)
        elif path.suffix == ".html":
            text = path.read_text(encoding="utf-8")
            findings += scan(path, text, HTML_RULES + CODE_RULES + CSS_RULES)
        elif path.suffix == ".css":
            findings += scan(path, path.read_text(encoding="utf-8"), CSS_RULES)
    return findings


def main():
    findings = check()
    for path, line, message in findings:
        relative = path.relative_to(ROOT).as_posix()
        print(f"::error file={relative},line={line}::{message}")
        print(f"{relative}:{line}: {message}", file=sys.stderr)
    if findings:
        sys.exit(f"Privacy guard: {len(findings)} problem(s) found.")
    print("Privacy guard: no network requests, remote code or extra permissions found.")


if __name__ == "__main__":
    main()
