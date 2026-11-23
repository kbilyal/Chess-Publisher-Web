from pathlib import Path
import re
import sys


site_dir = Path(sys.argv[1])
css_tag = '<link href="/site-auth.css?v=20261124-sso" rel="stylesheet"/>'
js_tag = '<script defer="" src="/site-auth.js?v=20261124-sso"></script>'

pages = [
    site_dir / "index.html",
    site_dir / "tournaments.html",
    site_dir / "tournaments" / "index.html",
    site_dir / "user-manual.html",
    site_dir / "support.html",
    site_dir / "contact.html",
    site_dir / "news-october-2026.html",
    site_dir / "news-release-1.06.00.html",
    site_dir / "news-web-companion-linux-2026.html",
]

updated = 0
for page in pages:
    if not page.exists():
        continue
    html = page.read_text(encoding="utf-8")
    html = re.sub(r'\s*<link\b[^>]*href=["\']/?site-auth\.css[^"\']*["\'][^>]*/>\s*', "\n", html, flags=re.I)
    html = re.sub(r'\s*<script\b[^>]*src=["\']/?site-auth\.js[^"\']*["\'][^>]*>\s*</script>\s*', "\n", html, flags=re.I)
    if "</head>" not in html:
        raise SystemExit(f"{page} has no </head> insertion point")
    html = html.replace("</head>", f"  {css_tag}\n  {js_tag}\n</head>", 1)
    page.write_text(html, encoding="utf-8")
    updated += 1

if updated == 0:
    raise SystemExit("No public HTML files found to inject site-auth")
print(f"Injected site-auth into {updated} public HTML pages.")
