from pathlib import Path
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else 'worker.js')
source = path.read_text(encoding='utf-8')
marker = 'arbiter_canonical_snapshot_read_v1'

if marker in source:
    print('Arbiter canonical snapshot read fix already present.')
    raise SystemExit(0)

required = [
    'arbiter_access_v1',
    'arbiter_snapshot_b2_v1',
    'private_cloud_sync_lineage_v1',
    'arbiter_clear_result_v1',
    'async function buildRestrictedArbiterTournament(',
]
for item in required:
    if item not in source:
        raise SystemExit(f'Required live Worker baseline is missing: {item}')

old = '''  const liveBoards = JSON.parse(JSON.stringify(tournament?.pairings?.liveBoards || {}));

  const queued = await env.DB.prepare(`
    SELECT * FROM cloud_arbiter_results
    WHERE tournament_id = ? AND organizer_id = ? AND acknowledged_at IS NULL
    ORDER BY updated_at ASC
  `).bind(row.id, row.organizer_id).all();
  for (const submission of queued?.results || []) {
    const roundKey = String(Number(submission.round_number || 0));
    const boards = Array.isArray(liveBoards[roundKey]) ? liveBoards[roundKey] : [];
    const board = boards.find(item => Number(item?.board || 0) === Number(submission.board_number || 0));
    if (!board) continue;
    if (arbiterText(board.whiteKey) !== arbiterText(submission.white_key) || arbiterText(board.blackKey) !== arbiterText(submission.black_key)) continue;
    board.result = arbiterText(submission.result);
  }
'''

new = '''  // arbiter_canonical_snapshot_read_v1
  // Arbiter writes are already revisioned into the authoritative private B2
  // tournament snapshot by submitArbiterResult(). The D1 result queue remains
  // a Desktop delivery/ACK channel only and must never override canonical
  // tournament state on Arbiter GET. Otherwise an older unacknowledged queue
  // entry can resurrect a result that was already corrected or cleared.
  const liveBoards = JSON.parse(JSON.stringify(tournament?.pairings?.liveBoards || {}));
'''

count = source.count(old)
if count != 1:
    raise SystemExit(f'Arbiter pending-overlay anchor mismatch: expected 1, found {count}.')

source = source.replace(old, new, 1)
path.write_text(source, encoding='utf-8')
print('Applied canonical Arbiter snapshot read; D1 remains delivery/ACK only.')
