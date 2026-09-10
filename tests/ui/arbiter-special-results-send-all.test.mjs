import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const portal = readFileSync('src/arbiter/ArbiterPortal.tsx', 'utf8');
const adapter = readFileSync('production-web/webview/ArbiterResultsDownloadAdapter.js', 'utf8');
const workerPatch = readFileSync('scripts/patch-arbiter-special-results-worker.py', 'utf8');
const clearPatch = readFileSync('scripts/patch-arbiter-clear-result-worker.py', 'utf8');
const deploy = readFileSync('.github/workflows/deploy-hub-arbiter-special-results.yml', 'utf8');
const clearDeploy = readFileSync('.github/workflows/deploy-hub-arbiter-clear-result.yml', 'utf8');
const webApi = readFileSync('src/arbiter/arbiterApi.ts', 'utf8');

for (const result of ['1F - 0F', '0F - 1F', '0F - 0F']) {
  assert.ok(portal.includes(result), `Arbiter Portal must expose special result ${result}.`);
  assert.ok(adapter.includes(result), `Desktop result sync must accept ${result}.`);
  assert.ok(workerPatch.includes(result), `Cloud Worker upgrade must accept ${result}.`);
}

assert.match(portal, /const specialResults = \['1F - 0F', '0F - 1F', '0F - 0F'\] as const;/, 'Special results must match Chess-Publisher core result codes exactly.');
assert.match(portal, /data-unified-arbiter-sync="true"/, 'Arbiter Portal must expose one unified SYNC action.');
assert.match(portal, /↕ SYNC/, 'Unified Arbiter SYNC label must remain visible.');
assert.doesNotMatch(portal, /Send all results/, 'Legacy Send all results action must not return beside unified SYNC.');
assert.doesNotMatch(portal, /className="arbiter-send"/, 'Per-board Send/Update actions must not return beside unified SYNC.');
assert.doesNotMatch(portal, /RefreshCw/, 'Manual Refresh control must not return beside unified SYNC.');
assert.match(portal, /pendingDraftCount/, 'Unified SYNC must count only changed result drafts.');
assert.match(portal, /result === currentResult/, 'Unified SYNC must skip unchanged results.');
assert.match(portal, /const prepared = requested\.map/, 'Unified SYNC must preflight every changed board against fresh Cloud state.');
assert.match(portal, /for \(const item of prepared\)/, 'Unified SYNC must process every preflighted changed board.');
assert.match(portal, /sendWithRevisionGuard/, 'Unified bulk result submission must use the protected revision guard.');
assert.match(portal, /error\?\.code !== 'cloud_revision_conflict'/, 'Revision conflicts must trigger only the guarded retry path.');
assert.match(portal, /const synchronized = await arbiterApi\.tournament\(sessionToken\)/, 'Unified SYNC/retry must fetch the current Cloud tournament automatically.');
assert.match(portal, /matchingBoard\(freshView, round, board, whiteKey, blackKey\)/, 'Every result send must revalidate board/player identity.');
assert.match(portal, /completedKeys\.length/, 'Partial unified-SYNC success must be tracked so unsent drafts remain available for retry.');
assert.match(portal, /const response = await sendAtRevision\(candidateView\.revision\)/, 'Each accepted result must use the current Cloud revision.');
assert.match(portal, /next\.revision = Number\.isInteger\(revision\)/, 'Accepted result responses must advance the local Arbiter revision before the next bulk item.');

assert.match(portal, /const CLEAR_RESULT = '-' as const;/, 'Arbiter clear operation must use the canonical no-result value.');
assert.match(portal, />\s*Clear result\s*</, 'Every editable board must expose Clear result.');
assert.match(adapter, /ALLOWED_RESULTS=new Set\(\["1 - 0","½ - ½","0 - 1","1F - 0F","0F - 1F","0F - 0F","-"\]\)/, 'Desktop result sync must accept all six result codes plus clear-result.');
assert.match(adapter, /body:\{submissions:guardedSubmissions\}/, 'Desktop must keep version-guarded ACK after save/sync/verification.');
assert.match(webApi, /Desktop Download Results is the single acknowledgement boundary/, 'Web Companion must still defer ACK to Desktop.');
assert.match(webApi, /acknowledged: 0/, 'Web Companion must not consume the pending queue.');

assert.match(workerPatch, /arbiter_special_results_v1/, 'Special-result Worker upgrade must be idempotently marked.');
assert.match(workerPatch, /Protected Arbiter Access baseline is required/, 'Special-result Worker upgrade must fail closed on an unexpected baseline.');
assert.match(clearPatch, /arbiter_clear_result_v1/, 'Clear-result Worker upgrade must be idempotently marked.');
assert.match(clearPatch, /currentBoardResult = arbiterText\(board\.result\) \|\| "-"/, 'Clear-result upgrade must normalize legacy empty no-result values.');
assert.match(deploy, /Recover exact live protected Hub Worker/, 'Special-results deployment must patch the exact live Worker, never a stale repository copy.');
assert.match(deploy, /previous_version_id/, 'Special-results deployment must capture the current Worker version for rollback.');
assert.match(deploy, /Roll back previous Worker version if verification fails/, 'Special-results deployment must automatically roll back on verification failure.');
assert.doesNotMatch(deploy, /deploy\/hub-api\/worker\.js/, 'Special-results deployment must never use the stale repository Worker source.');
assert.match(clearDeploy, /BASELINE_SHA256/, 'Clear-result deployment must fail closed against an exact live baseline.');
assert.match(clearDeploy, /Roll back previous Worker version if verification fails/, 'Clear-result deployment must automatically roll back on verification failure.');

console.log('ARBITER_SPECIAL_RESULTS_UNIFIED_SYNC=PASS');
