"""
Tests for tools/check_privacy.py: it passes the real extension, and catches each
kind of privacy break planted in a copy of it.

    python -m unittest tests/test_privacy_guard.py -v
"""

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import check_privacy  # noqa: E402


class PrivacyGuard(unittest.TestCase):
    def setUp(self):
        self.folder = Path(tempfile.mkdtemp())
        self.extension = self.folder / "extension"
        self.userscript = self.folder / "userscript"
        shutil.copytree(ROOT / "extension", self.extension)
        shutil.copytree(ROOT / "userscript", self.userscript)

    def tearDown(self):
        shutil.rmtree(self.folder)

    def findings(self):
        return [message for _, _, message in check_privacy.check(self.extension, self.userscript)]

    def append(self, relative, text):
        path = self.extension / relative
        path.write_text(path.read_text(encoding="utf-8") + "\n" + text + "\n", encoding="utf-8")

    def edit_manifest(self, change):
        path = self.extension / "manifest.json"
        manifest = json.loads(path.read_text(encoding="utf-8"))
        change(manifest)
        path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    def assertCaught(self, words):
        found = self.findings()
        self.assertTrue(any(words in message for message in found), f"expected {words!r} in {found}")

    # The real code must pass.
    def test_the_real_extension_passes(self):
        self.assertEqual(check_privacy.check(), [])

    # Things that look like URLs but make no request stay allowed.
    def test_links_and_local_scripts_are_fine(self):
        self.append("content/core.js", "const link = { href: 'https://example.com/' };")
        self.append("content/core.js", "const ns = 'http://www.w3.org/2000/svg';")
        self.append("background.js", "importScripts('shared/stats.js');")
        self.append("welcome/welcome.html", '<a href="https://example.com/" target="_blank">site</a>')
        self.assertEqual(self.findings(), [])

    # Network calls in the extension's JavaScript.
    def test_fetch(self):
        self.append("content/core.js", "fetch('https://tracker.example/hit');")
        self.assertCaught("(fetch)")

    def test_xmlhttprequest(self):
        self.append("popup/popup.js", "const request = new XMLHttpRequest();")
        self.assertCaught("(XMLHttpRequest)")

    def test_websocket(self):
        self.append("background.js", "new WebSocket('wss://tracker.example');")
        self.assertCaught("(WebSocket)")

    def test_send_beacon(self):
        self.append("content/youtube.js", "navigator.sendBeacon('/collect', data);")
        self.assertCaught("(sendBeacon)")

    def test_event_source(self):
        self.append("content/core.js", "new EventSource('https://tracker.example/stream');")
        self.assertCaught("(EventSource)")

    # Remote code.
    def test_remote_import_scripts(self):
        self.append("background.js", "importScripts('https://cdn.example/lib.js');")
        self.assertCaught("importScripts from a URL")

    def test_remote_dynamic_import(self):
        self.append("content/core.js", "import('https://cdn.example/lib.js');")
        self.assertCaught("import from a URL")

    def test_eval(self):
        self.append("content/core.js", "eval(code);")
        self.assertCaught("(eval)")

    def test_new_function(self):
        self.append("content/core.js", "const run = new Function(code);")
        self.assertCaught("(new Function)")

    def test_remote_src_in_code(self):
        self.append("content/core.js", "image.src = 'https://tracker.example/pixel.gif';")
        self.assertCaught(".src set to a URL")

    def test_remote_script_tag(self):
        self.append("popup/popup.html", '<script src="https://cdn.example/lib.js"></script>')
        self.assertCaught("a remote resource")

    def test_remote_stylesheet_link(self):
        self.append("welcome/welcome.html", '<link rel="stylesheet" href="https://fonts.example/font.css">')
        self.assertCaught("a remote stylesheet or font")

    def test_remote_css_url(self):
        self.append("popup/popup.css", "body { background: url(https://tracker.example/pixel.gif); }")
        self.assertCaught("a remote resource (url)")

    def test_css_import(self):
        self.append("popup/popup.css", "@import 'https://fonts.example/font.css';")
        self.assertCaught("(@import)")

    def test_generated_userscript_is_checked_too(self):
        path = self.userscript / "shortstop.user.js"
        path.write_text(path.read_text(encoding="utf-8") + "\nfetch('/x');\n", encoding="utf-8")
        self.assertCaught("(fetch)")

    # The manifest.
    def test_extra_permission(self):
        self.edit_manifest(lambda m: m["permissions"].append("tabs"))
        self.assertCaught("permissions ['tabs'] are not allowed")

    def test_extra_site(self):
        self.edit_manifest(lambda m: m["host_permissions"].append("*://*/*"))
        self.assertCaught("is not on the supported list")

    def test_content_script_on_another_site(self):
        self.edit_manifest(lambda m: m["content_scripts"][1]["matches"].append("*://example.com/*"))
        self.assertCaught("which are not supported sites")

    def test_remote_content_script(self):
        self.edit_manifest(lambda m: m["content_scripts"][1]["js"].append("https://cdn.example/lib.js"))
        self.assertCaught("loads remote code")

    def test_optional_permissions(self):
        self.edit_manifest(lambda m: m.update(optional_permissions=["history"]))
        self.assertCaught('"optional_permissions"')

    def test_externally_connectable(self):
        self.edit_manifest(lambda m: m.update(externally_connectable={"matches": ["*://*.example.com/*"]}))
        self.assertCaught('"externally_connectable"')

    def test_update_url(self):
        self.edit_manifest(lambda m: m.update(update_url="https://updates.example/"))
        self.assertCaught('"update_url"')

    def test_content_security_policy(self):
        self.edit_manifest(lambda m: m.update(content_security_policy={"extension_pages": "script-src 'self' https:"}))
        self.assertCaught('"content_security_policy"')


if __name__ == "__main__":
    unittest.main()
