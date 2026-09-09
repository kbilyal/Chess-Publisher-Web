import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const portal = readFileSync('src/arbiter/ArbiterPortal.tsx', 'utf8');
const css = readFileSync('src/arbiter/arbiter-ui-fixes.css', 'utf8');
const adapter = readFileSync('production-web/webview/ArbiterResultsDownloadAdapter.js', 'utf8');
const workerPatch = readFileSync('scripts/patch-arbiter-clear-result-worker.py', 'utf8');
const deploy = readFileSync('.github/workflows/deploy-hub-arbiter-clear-result.yml', 'utf8');

const count = (source, pattern) => (source.match(pattern) || []).length;

assert.equal(count(portal, /data-unified-arbiter-sync="true"/g), 1, 'Arbiter must expose exactly one visible unified SYNC action.');
assert.equal(count(portal, /arbiterApi\.submitResult/g), 1, 'All Arbiter writes must share one protected submit transport path.');
assert.doesNotMatch(portal, /RefreshCw/, 'Manual Refresh icon/control must not return.');
assert.doesNotMatch(portal, />\s*Refresh\s*</, 'Manual Refresh button must not return.');
assert.doesNotMatch(portal, /const submit = async/, 'Legacy per-board submit function must not return.');
assert.doesNotMatch(portal, /className="arbiter-send"/, 'Legacy per-board Send button must not return.');
assert.match(portal, /window\.setInterval\(\(\) => void loadTournament\(sessionToken, true\)/, 'Arbiter page must keep background Cloud observation without manual refresh.');
assert.match(portal, /const synchronized = await arbiterApi\.tournament\(sessionToken\)/, 'Unified SYNC must reconcile against current Cloud state before writes.');
assert.match(portal, /error\?\.code !== 'cloud_revision_conflict'/, 'Unified SYNC must keep fail-closed revision retry semantics.');
assert.match(portal, /matchingBoard\(freshView, round, board, whiteKey, blackKey\)/, 'Unified SYNC must revalidate board and player identity.');

assert.match(portal, /const CLEAR_RESULT = '-' as const;/, 'Clear result must use canonical no-result value.');
assert.match(portal, /className={`arbiter-clear-result\$\{clearSelected \? ' selected' : ''\}`}/, 'Each editable pairing must have a Clear result control.');
assert.match(portal, />\s*Clear result\s*</, 'Clear result label must remain explicit.');
assert.match(adapter, /ALLOWED_RESULTS=new Set\(\["1 - 0","½ - ½","0 - 1","1F - 0F","0F - 1F","0F - 0F","-"\]\)/, 'Desktop result reconciliation must accept clear-result submissions.');
assert.match(workerPatch, /arbiter_clear_result_v1/, 'Live Worker clear-result upgrade must be idempotently marked.');
assert.match(workerPatch, /currentBoardResult = arbiterText\(board\.result\) \|\| "-"/, 'Worker must treat legacy empty and canonical dash as the same no-result state.');
assert.match(workerPatch, /"0F - 0F", "-"/, 'Worker whitelist must explicitly accept clear-result.');

assert.match(portal, /arbiter-color-badge white[^>]*aria-label="White">W</, 'White player must have a visible W badge.');
assert.match(portal, /arbiter-color-badge black[^>]*aria-label="Black">B</, 'Black player must have a visible B badge.');
assert.match(css, /\.arbiter-result-buttons button \{[\s\S]*?min-height: 58px !important;/, 'Desktop/tablet result buttons must be at least 58px high.');
assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.arbiter-result-buttons button \{ min-height: 62px !important;/, 'Phone result buttons must be at least 62px high.');
assert.match(css, /\.arbiter-clear-result \{[\s\S]*?min-height: 52px;/, 'Clear result must be a large touch target.');
assert.match(css, /\.arbiter-color-badge\.white/, 'White badge styling must exist.');
assert.match(css, /\.arbiter-color-badge\.black/, 'Black badge styling must exist.');

assert.match(deploy, /BASELINE_SHA256: 70239cf8323b3ca86604c128d66ac2acb0823854297451f429901b8a35a0181b/, 'First clear-result deployment must start from the exact protected lineage baseline.');
assert.match(deploy, /Refusing unknown\/drifted live Worker SHA256/, 'Worker deployment must fail closed on live drift.');
assert.match(deploy, /Roll back previous Worker version if verification fails/, 'Worker deployment must preserve automatic rollback.');

console.log('ARBITER_BETA83_ONE_SYNC_UX=PASS');
