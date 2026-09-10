import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const patchPath = 'scripts/patch-arbiter-canonical-read-worker.py';
const patch = readFileSync(patchPath, 'utf8');
const lineage = readFileSync('scripts/patch-cloud-sync-lineage-worker.py', 'utf8');
const deploy = readFileSync('.github/workflows/deploy-hub-arbiter-canonical-read.yml', 'utf8');

assert.match(patch, /arbiter_canonical_snapshot_read_v1/, 'Canonical Arbiter read fix must be idempotently marked.');
assert.match(patch, /arbiter_snapshot_b2_v1/, 'Fix must require the authoritative B2 snapshot reader.');
assert.match(patch, /private_cloud_sync_lineage_v1/, 'Fix must require revisioned Arbiter write-through.');
assert.match(patch, /arbiter_clear_result_v1/, 'Fix must require canonical Clear result support.');
assert.match(lineage, /board\.result = resultValue;/, 'Arbiter writes must continue to mutate authoritative snapshot content.');
assert.match(lineage, /await b2UploadJson\(env, objectKey, bytes\);/, 'Arbiter writes must continue to persist authoritative B2 content.');
assert.match(lineage, /INSERT INTO cloud_arbiter_results/, 'Desktop result delivery queue must remain intact.');
assert.match(deploy, /BASELINE_SHA256: f15f1ff4a967c53b119d304c978ee0439fac4fc4e43e1a5cd5e0123610523605/, 'Production patch must start from the exact diagnosed Worker source.');
assert.match(deploy, /arbiter_snapshot_b2_v1/, 'Deployment must protect the B2 snapshot marker.');
assert.match(deploy, /private_cloud_sync_lineage_v1/, 'Deployment must protect the canonical sync lineage marker.');
assert.match(deploy, /arbiter_clear_result_v1/, 'Deployment must protect Clear result semantics.');

const oldOverlay = `  const liveBoards = JSON.parse(JSON.stringify(tournament?.pairings?.liveBoards || {}));

  const queued = await env.DB.prepare(\`
    SELECT * FROM cloud_arbiter_results
    WHERE tournament_id = ? AND organizer_id = ? AND acknowledged_at IS NULL
    ORDER BY updated_at ASC
  \`).bind(row.id, row.organizer_id).all();
  for (const submission of queued?.results || []) {
    const roundKey = String(Number(submission.round_number || 0));
    const boards = Array.isArray(liveBoards[roundKey]) ? liveBoards[roundKey] : [];
    const board = boards.find(item => Number(item?.board || 0) === Number(submission.board_number || 0));
    if (!board) continue;
    if (arbiterText(board.whiteKey) !== arbiterText(submission.white_key) || arbiterText(board.blackKey) !== arbiterText(submission.black_key)) continue;
    board.result = arbiterText(submission.result);
  }
`;

const fixture = `// arbiter_access_v1\n// arbiter_snapshot_b2_v1\n// private_cloud_sync_lineage_v1\n// arbiter_clear_result_v1\nasync function buildRestrictedArbiterTournament(env, row) {\n${oldOverlay}  return { pairings: { liveBoards } };\n}\n`;
const dir = mkdtempSync(join(tmpdir(), 'cp-arbiter-canonical-read-'));
try {
  const worker = join(dir, 'worker.js');
  writeFileSync(worker, fixture);
  execFileSync('python', [patchPath, worker], { stdio: 'pipe' });
  const fixed = readFileSync(worker, 'utf8');
  assert.match(fixed, /arbiter_canonical_snapshot_read_v1/, 'Patched Worker must carry canonical read marker.');
  assert.doesNotMatch(fixed, /SELECT \* FROM cloud_arbiter_results/, 'Arbiter GET must not overlay pending D1 results onto canonical Cloud state.');
  assert.doesNotMatch(fixed, /board\.result = arbiterText\(submission\.result\)/, 'Pending D1 rows must not rewrite Arbiter-visible results.');
  assert.match(fixed, /const liveBoards = JSON\.parse\(JSON\.stringify\(tournament\?\.pairings\?\.liveBoards \|\| \{\}\)\);/, 'Arbiter GET must still clone canonical live boards.');
  execFileSync('python', [patchPath, worker], { stdio: 'pipe' });
  assert.equal(readFileSync(worker, 'utf8'), fixed, 'Patch must be idempotent.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('ARBITER_CANONICAL_SNAPSHOT_READ=PASS');
