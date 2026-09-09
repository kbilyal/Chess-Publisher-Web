from pathlib import Path
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else 'worker.js')
source = path.read_text(encoding='utf-8')
marker = 'arbiter_clear_result_v1'

if marker in source:
    print('Arbiter clear-result upgrade already present.')
    raise SystemExit(0)

required = [
    'private_cloud_hard_delete_v1',
    'arbiter_access_v1',
    'arbiter_special_results_v1',
    'private_cloud_sync_lineage_v1',
    'async function submitArbiterResult(',
    'ARBITER_ALLOWED_RESULTS',
    'cloudSyncSnapshotContentFingerprint',
]
for item in required:
    if item not in source:
        raise SystemExit(f'Required protected live Worker baseline is missing: {item}')

old_set = 'const ARBITER_ALLOWED_RESULTS = new Set(["1 - 0", "½ - ½", "0 - 1", "1F - 0F", "0F - 1F", "0F - 0F"]);'
new_set = '// arbiter_clear_result_v1\nconst ARBITER_ALLOWED_RESULTS = new Set(["1 - 0", "½ - ½", "0 - 1", "1F - 0F", "0F - 1F", "0F - 0F", "-"]);'
if source.count(old_set) != 1:
    raise SystemExit('Protected Arbiter result whitelist anchor is missing or duplicated.')
source = source.replace(old_set, new_set, 1)

old_change = '  const currentBoardResult = arbiterText(board.result);\n  const changed = currentBoardResult !== resultValue;'
new_change = '  // Clear result is represented canonically by "-". Empty legacy values are treated as the same no-result state.\n  const currentBoardResult = arbiterText(board.result) || "-";\n  const changed = currentBoardResult !== resultValue;'
if source.count(old_change) != 1:
    raise SystemExit('Protected Arbiter result-change anchor is missing or duplicated.')
source = source.replace(old_change, new_change, 1)

old_message = 'Arbiter Access accepts 1-0, 1/2-1/2, 0-1, 1F-0F, 0F-1F or 0F-0F results.'
new_message = 'Arbiter Access accepts the six supported results or Clear result.'
if source.count(old_message) != 1:
    raise SystemExit('Protected Arbiter validation message anchor is missing or duplicated.')
source = source.replace(old_message, new_message, 1)

old_conflict = 'The organizer changed the tournament. Refresh before sending this result.'
new_conflict = 'The organizer changed the tournament. The Arbiter ↕ SYNC must reconcile before retrying this result.'
if old_conflict in source:
    source = source.replace(old_conflict, new_conflict, 1)

path.write_text(source, encoding='utf-8')
print('Applied revision-safe Arbiter Clear result support.')
