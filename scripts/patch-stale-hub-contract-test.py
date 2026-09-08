from pathlib import Path

p = Path('tests/ui/hub-companion-v1.test.mjs')
s = p.read_text()
s = s.replace(
    "has(sync, 'Desktop beta.4 contract', 'Shared Desktop/Web tournament identity contract must remain present.');",
    "has(sync, 'PORTABLE_FINGERPRINT_SCHEMA = 6', 'Shared Desktop/Web directional tournament fingerprint contract must remain present.');"
)
p.write_text(s)
