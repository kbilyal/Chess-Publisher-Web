import argparse
import re
from pathlib import Path


def without_beta_badges(html):
    header = re.search(r'<header\b[^>]*\bid="top"[^>]*>.*?</header>', html, re.DOTALL)
    if not header:
        raise ValueError('Homepage header is missing')

    updated = header[0]
    if 'data-site-build="2026-11-23-web-portal"' in html:
        targets = (('/tournaments', 'Tournaments'),)
    else:
        targets = (
            ('https://web.chess-publisher.org', 'WEB Companion'),
            ('/tournaments', 'Tournaments'),
        )
    for href, label in targets:
        link = rf'(<a\b[^>]*\shref="{re.escape(href)}"[^>]*>{label})(?:\s*<sup class="nav-beta-index">BETA</sup>)?(</a>)'
        updated, count = re.subn(link, r'\1\2', updated)
        if count != 1:
            raise ValueError(f'Expected one homepage link for {label}, found {count}')
    updated = re.sub(r'\s*<sup class="nav-beta-index">BETA</sup>', '', updated)

    return html[:header.start()] + updated + html[header.end():]


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('homepage', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    original = args.homepage.read_bytes().decode('utf-8')
    updated = without_beta_badges(original)
    if args.check:
        if updated != original:
            raise SystemExit('Unexpected BETA badges in the homepage navigation')
    elif updated != original:
        args.homepage.write_bytes(updated.encode('utf-8'))
