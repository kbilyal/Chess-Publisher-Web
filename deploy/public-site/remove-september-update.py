from pathlib import Path
import re
import sys

page = Path(sys.argv[1])
html = page.read_text(encoding="utf-8")
for section_id in ("september-update", "september-notes"):
    pattern = r'<section\b(?=[^>]*\bid="' + re.escape(section_id) + r'")[^>]*>.*?</section>\s*'
    html = re.sub(pattern, "", html, flags=re.S)
    link = r'<a\b[^>]*\bhref="#' + re.escape(section_id) + r'"[^>]*>.*?</a>\s*'
    html = re.sub(link, "", html, flags=re.S)
if re.search(r'\b(?:id|href)="#?september-(?:update|notes)"', html):
    raise SystemExit("September update removal is incomplete.")
page.write_text(html, encoding="utf-8")
