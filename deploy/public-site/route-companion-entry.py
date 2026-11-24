import argparse
import re
from pathlib import Path

# Keep product and installation information while routing all public entry
# links through the Web account and leaving private arbiter invitations alone.
COMPANION_LINK = re.compile(
    r'(<a\b[^>]*\bhref=["\'])https://web\.chess-publisher\.org/?(["\'][^>]*>)([^<]*)(</a>)',
    re.IGNORECASE,
)


def route_entry(html):
    def replace(link):
        if 'data-site-build="2026-11-23-web-portal"' in html and link[3] == 'Arbiter Companion':
            return ''
        return f'{link[1]}/app/{link[2]}Open ChessPublisher Web{link[4]}'

    return COMPANION_LINK.sub(replace, html)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    for page in args.directory.glob('*.html'):
        html = page.read_text(encoding='utf-8')
        if (updated := route_entry(html)) != html:
            page.write_text(updated, encoding='utf-8')
