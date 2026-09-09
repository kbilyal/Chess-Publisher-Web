from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str, label: str):
    src = path.read_text(encoding='utf-8')
    if new in src:
        return False
    count = src.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 anchor, found {count}')
    path.write_text(src.replace(old, new, 1), encoding='utf-8')
    return True

changed = False

sync = ROOT / 'src/cloud/onlineCloudSync.ts'
changed |= replace_once(
    sync,
    "  const source: any = sanitizePortableValue(clone(tournament || {}));\n  const internalId = chooseInternalTournamentId(tournament || source);",
    "  const source: any = stripVolatileSyncMetadata(sanitizePortableValue(clone(tournament || {})));\n  const internalId = chooseInternalTournamentId(tournament || source);",
    'private snapshot volatile stripping'
)

workspace = ROOT / 'src/companion/CompanionWorkspace.tsx'
replacements = [
    (
        'Conflict resolved. Web values were kept for overlapping fields and Cloud-only changes were merged. Push Web → Cloud when ready.',
        'Conflict resolved. Web values were kept for overlapping fields and Cloud-only changes were merged. Press ↕ SYNC to store the merged state.'
    ),
    (
        'Conflict resolved. Cloud values were kept for overlapping fields and Web-only changes were merged. Push Web → Cloud when ready.',
        'Conflict resolved. Cloud values were kept for overlapping fields and Web-only changes were merged. Press ↕ SYNC to store the merged state.'
    ),
    (
        'Safe conflict resolution completed where fields did not overlap. No same-field conflicts remain. Push Web → Cloud when ready.',
        'Safe conflict resolution completed where fields did not overlap. No same-field conflicts remain. Press ↕ SYNC to store the merged state.'
    ),
]
src = workspace.read_text(encoding='utf-8')
for old, new in replacements:
    if new in src:
        continue
    if src.count(old) != 1:
        raise SystemExit(f'legacy directional copy anchor mismatch for: {old}')
    src = src.replace(old, new, 1)
    changed = True
workspace.write_text(src, encoding='utf-8')

print('Applied final unified SYNC cleanup.' if changed else 'Unified SYNC cleanup already present.')
