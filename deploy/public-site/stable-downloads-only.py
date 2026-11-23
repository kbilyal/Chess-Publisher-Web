from pathlib import Path
import re
import sys

site = Path(sys.argv[1])
page = site / "index.html"
html = page.read_text(encoding="utf-8")
html = re.sub(r'\s*<script\b[^>]*\bsrc=["\x27]/?pre-fide-r12\.js(?:\?[^"\x27]*)?["\x27][^>]*>\s*</script>', "", html)
html = html.replace(
    "The release information and download links update automatically when a newer published release is available.",
    "Current stable release 1.06.00 is available as a Windows installer and portable ZIP.",
)
page.write_text(html, encoding="utf-8")

app = site / "app.js"
source = app.read_text(encoding="utf-8")
source = source.replace(
    "https://api.github.com/repos/kbilyal/ChessPublisher/releases/latest",
    "https://api.github.com/repos/kbilyal/ChessPublisher/releases/tags/v1.06.00",
)
app.write_text(source, encoding="utf-8")

history = site / "release-live.js"
source = history.read_text(encoding="utf-8")
hook = "  function assetButtons(release) {"
if source.count(hook) != 1:
    raise SystemExit("Cannot locate release-history download buttons.")
if 'if (release.tag_name !== "v1.06.00") return "";' not in source:
    source = source.replace(hook, hook + '\n    if (release.tag_name !== "v1.06.00") return "";', 1)
history.write_text(source, encoding="utf-8")
# Retire the old public entry point for clients with a cached script tag.
(site / "pre-fide-r12.js").write_text(
    "/* Retired release selector. Current stable is 1.06.00. */\n", encoding="utf-8"
)
assert "pre-fide-r12.js" not in html
assert "/releases/tags/v1.06.00" in app.read_text()
download_ids = ("installerDownload", "portableDownload") if 'data-site-build="2026-11-23-web-portal"' in html else ("heroDownload", "installerDownload", "portableDownload")
for name in download_ids:
    match = re.search(r'<a\b[^>]*\bid="' + name + r'"[^>]*>', html)
    if not match or "/releases/download/v1.06.00/" not in match[0]:
        raise SystemExit(f"Expected a 1.06.00 download for {name}.")

