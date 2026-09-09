from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'src/cloud/onlineCloudSync.ts'
source = path.read_text(encoding='utf-8')
old = "  const source: any = sanitizePortableValue(clone(tournament || {}));"
new = "  const source: any = stripVolatileSyncMetadata(sanitizePortableValue(clone(tournament || {})));"
if new in source:
    print('Portable private snapshot volatile stripping already present.')
    raise SystemExit(0)
count = source.count(old)
if count != 1:
    raise SystemExit(f'private snapshot sanitizer anchor mismatch: expected 1, found {count}')
path.write_text(source.replace(old, new, 1), encoding='utf-8')
print('Private Web snapshots now omit volatile sync metadata.')
