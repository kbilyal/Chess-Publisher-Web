from pathlib import Path
import re
import sys


page = Path(sys.argv[1])
html = page.read_text(encoding="utf-8")
if 'data-site-build="2026-11-23-web-portal"' in html and 'href="/app/"' in html and 'id="chesspublisher-web"' in html:
    print("2026-11-23-web-portal homepage already includes /app/ portal links.")
    raise SystemExit(0)
html = re.sub(r'<a data-pairing-entry="nav"[^>]*>[^<]+</a>\n?', "", html, count=1)
html = re.sub(r'<section class="section" id="online-pairings"[^>]*>.*?</section>\n?', "", html, count=1, flags=re.S)

nav_link = '<a data-desktop-web="nav" href="/app/">ChessPublisher Web</a>'
nav_start = '<nav aria-label="Primary navigation" class="site-nav" id="site-nav">'
if nav_link not in html:
    if html.count(nav_start) != 1:
        raise SystemExit("Unable to locate the primary site navigation.")
    html = html.replace(nav_start, nav_start + "\n" + nav_link, 1)

section = """<section class="section" id="chesspublisher-web" aria-labelledby="chesspublisher-web-title">
<div class="shell">
<div class="section-heading compact">
<h2 id="chesspublisher-web-title">ChessPublisher Web</h2>
<p>Open the tournament workspace in your browser to manage players, pairings, results, standings and reports. Sign in with your Organizer Token.</p>
<a class="button button-primary" data-desktop-web="section" href="/app/">Open the web application</a>
</div>
</div>
</section>
"""
feature_anchor = '<section class="section" id="features">'
if 'id="chesspublisher-web"' not in html:
    if html.count(feature_anchor) != 1:
        raise SystemExit("Unable to locate the features section.")
    html = html.replace(feature_anchor, section + feature_anchor, 1)

if html.count(nav_link) != 1 or html.count('data-desktop-web="section"') != 1:
    raise SystemExit("Expected exactly one menu link and one section sign-in link.")
page.write_text(html, encoding="utf-8")
