from pathlib import Path
import sys


page = Path(sys.argv[1])
html = page.read_text(encoding="utf-8")
legacy_button = '<a class="button button-secondary" href="/pairing-preview/">Try online pairings</a>'
html = html.replace(legacy_button + "\n", "")

nav_link = '<a data-pairing-entry="nav" href="/pairing-preview/">Online pairings</a>'
nav_start = '<nav aria-label="Primary navigation" class="site-nav" id="site-nav">'
if nav_link not in html:
    if html.count(nav_start) != 1:
        raise SystemExit("Unable to locate the primary site navigation.")
    html = html.replace(nav_start, nav_start + "\n" + nav_link, 1)

section = """<section class="section" id="online-pairings" aria-labelledby="online-pairings-title">
<div class="shell">
<div class="section-heading compact">
<h2 id="online-pairings-title">Online pairings</h2>
<p>Sign in with your Organizer Token and prepare FIDE Dutch pairings in your browser. Your TRF file stays on your device.</p>
<a class="button button-primary" data-pairing-entry="section" href="/pairing-preview/">Organizer sign-in</a>
</div>
</div>
</section>
"""
feature_anchor = '<section class="section" id="features">'
if 'id="online-pairings"' not in html:
    if html.count(feature_anchor) != 1:
        raise SystemExit("Unable to locate the features section.")
    html = html.replace(feature_anchor, section + feature_anchor, 1)

if html.count(nav_link) != 1 or html.count('data-pairing-entry="section"') != 1:
    raise SystemExit("Expected exactly one menu link and one section sign-in link.")
page.write_text(html, encoding="utf-8")
