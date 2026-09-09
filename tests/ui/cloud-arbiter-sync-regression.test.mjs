import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regression bundle for the production workflow:
// one Cloud identity, refresh-free Arbiter submit, desktop-only result ACK.
const arbiterPortal = readFileSync('src/arbiter/ArbiterPortal.tsx', 'utf8');
const arbiterApi = readFileSync('src/arbiter/arbiterApi.ts', 'utf8');
const cloudApi = readFileSync('production-web/cloud/client/cloud-workspace-api.js', 'utf8');
const downloader = readFileSync('production-web/webview/ArbiterResultsDownloadAdapter.js', 'utf8');

assert.match(cloudApi, /cloud_tournament_create_idempotent_v1/, 'Cloud create must carry the idempotency marker.');
assert.match(cloudApi, /exactKey=rows\.filter\(row=>text\(row\?\.localKey\)===localKey\)/, 'Cloud create must recover by stable localKey before POST.');
assert.match(cloudApi, /exactName=rows\.filter\(row=>!row\?\.archivedAt&&normalizedName\(row\?\.name\)===targetName\)/, 'Cloud create must recover an existing exact-name active tournament when linkage metadata was lost.');
assert.ok(cloudApi.indexOf('const exactKey=') < cloudApi.indexOf('return request("/api/v1/cloud/tournaments",{\n          method:"POST"'), 'Recovery lookup must run before tournament POST creation.');

assert.match(arbiterPortal, /Checking current Cloud revision/, 'Arbiter submit must refresh the Cloud revision automatically.');
assert.match(arbiterPortal, /freshResponse = await arbiterApi\.tournament\(sessionToken\)/, 'Arbiter submit must fetch a fresh tournament before sending.');
assert.match(arbiterPortal, /if \(error\?\.code !== 'cloud_revision_conflict'\) throw error;/, 'Arbiter submit must explicitly handle revision races.');
assert.match(arbiterPortal, /await sendWithRevision\(freshView\.revision\)/, 'Arbiter submit must automatically retry with the refreshed revision.');
assert.match(arbiterPortal, /matchingBoard\(freshView, round, board, whiteKey, blackKey\)/, 'Automatic retry must verify board/player identity.');
assert.doesNotMatch(arbiterPortal, /Refresh before sending this result/, 'Manual refresh must not be required after a revision conflict.');

assert.match(arbiterApi, /Desktop Download Results is the single acknowledgement boundary/, 'Web Companion must defer result acknowledgement to desktop.');
assert.match(arbiterApi, /acknowledged: 0/, 'Web Companion must not ACK pending results.');
assert.doesNotMatch(arbiterApi, /request\(`\/api\/v1\/cloud\/tournaments\/\$\{enc\(tournamentId\)\}\/arbiter-results\/ack`/, 'Web Companion must not call the ACK endpoint.');

const save = downloader.indexOf('await saveLocalTournament()');
const sync = downloader.indexOf('await window.cpCloudSyncCurrent');
const verify = downloader.indexOf('await verifyCloudSnapshot');
const ack = downloader.indexOf('/arbiter-results/ack');
assert.ok(save >= 0 && sync > save && verify > sync && ack > verify, 'Desktop Download Results must save, sync and verify before ACK.');
assert.match(downloader, /body:\{submissions:guardedSubmissions\}/, 'Desktop ACK must remain version-guarded by id + updatedAt.');

console.log('CLOUD_ARBITER_SYNC_REGRESSION=PASS');
