import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adapter = readFileSync('production-web/webview/ArbiterResultsDownloadAdapter.js', 'utf8');
const cloudApi = readFileSync('production-web/cloud/client/cloud-workspace-api.js', 'utf8');
const workerPatch = readFileSync('scripts/patch-arbiter-access-worker.py', 'utf8');
const ackGuardPatch = readFileSync('scripts/patch-arbiter-results-ack-guard-worker.py', 'utf8');
const webApi = readFileSync('src/arbiter/arbiterApi.ts', 'utf8');

assert.match(workerPatch, /INSERT INTO cloud_arbiter_results/, 'Arbiter submission must be persisted to D1.');
assert.match(workerPatch, /acknowledged_at\s*\n\s*\) VALUES \([^\n]+NULL\)/, 'New Arbiter submissions must start pending.');
assert.match(workerPatch, /WHERE tournament_id = \? AND organizer_id = \? AND acknowledged_at IS NULL/, 'Organizer download queue must select unacknowledged results only.');
assert.ok(workerPatch.includes('arbiter-results\\/ack') || workerPatch.includes('arbiter-results/ack'), 'Dedicated result acknowledgement route must exist.');

assert.match(ackGuardPatch, /arbiter_results_ack_guard_v1/, 'Version-guarded acknowledgement patch marker is required.');
assert.match(ackGuardPatch, /AND acknowledged_at IS NULL AND updated_at = \?/, 'ACK must require the exact submitted updated_at version.');
assert.match(ackGuardPatch, /body\.submissions/, 'Guarded ACK must accept submission id + updatedAt records.');

assert.match(cloudApi, /desktop_arbiter_results_loader_v1/, 'Desktop Cloud API must load the result downloader.');
assert.match(cloudApi, /ArbiterResultsDownloadAdapter\.js/, 'Desktop result downloader asset must be wired into the Cloud shell.');
assert.match(adapter, /id="cloudDownloadResultsBtn"/, 'Desktop must expose Download Results.');
assert.match(adapter, /button\.textContent="Download Results"/, 'Download Results button label must be stable.');
assert.match(adapter, /window\.cpCloudDownloadArbiterResults=downloadArbiterResults/, 'Desktop downloader must expose a testable entry point.');
assert.match(adapter, /finalizedRounds/, 'Finalized rounds must remain protected.');
assert.match(adapter, /whiteKey/, 'White player identity must be verified before applying a result.');
assert.match(adapter, /blackKey/, 'Black player identity must be verified before applying a result.');
assert.match(adapter, /ALLOWED_RESULTS/, 'Only supported played results may be applied.');
assert.match(adapter, /body:\{submissions:guardedSubmissions\}/, 'Desktop ACK must send id + updatedAt guards.');
assert.match(adapter, /remain pending in Cloud and were not acknowledged/, 'Failed Cloud sync must leave results pending.');

const bodyStart = adapter.indexOf('async function downloadArbiterResults()');
const bodyEnd = adapter.indexOf('\n  function injectButton()', bodyStart);
assert.ok(bodyStart >= 0 && bodyEnd > bodyStart, 'downloadArbiterResults body must be discoverable.');
const body = adapter.slice(bodyStart, bodyEnd);
const positions = {
  pull: body.indexOf('await window.cpCloudPullChanges()'),
  queue: body.indexOf('/arbiter-results`,{token}'),
  save: body.indexOf('await saveLocalTournament()'),
  sync: body.indexOf('await window.cpCloudSyncCurrent'),
  verify: body.indexOf('await verifyCloudSnapshot'),
  ack: body.indexOf('/arbiter-results/ack'),
  reread: body.lastIndexOf('/arbiter-results`,{token}')
};
for (const [name, value] of Object.entries(positions)) assert.ok(value >= 0, `Missing ${name} durability stage.`);
assert.ok(positions.pull < positions.queue, 'Cloud reconcile must happen before pending-result download.');
assert.ok(positions.queue < positions.save, 'Pending results must be validated/applied before local save.');
assert.ok(positions.save < positions.sync, 'Local managed save must complete before Cloud synchronization.');
assert.ok(positions.sync < positions.verify, 'Cloud sync must complete before verification.');
assert.ok(positions.verify < positions.ack, 'ACK must never happen before exact Cloud verification.');
assert.ok(positions.ack < positions.reread, 'Pending queue must be re-read after ACK.');

// Web may display/mirror pending Arbiter results, but Desktop Download Results
// is the only acknowledgement boundary. Otherwise opening Web Companion could
// consume the queue before the installed tournament program downloads it.
assert.match(webApi, /Desktop Download Results is the single acknowledgement boundary/, 'Web Companion must explicitly defer acknowledgement to Desktop.');
assert.match(webApi, /acknowledged: 0/, 'Web Companion must leave Arbiter submissions pending.');
assert.match(webApi, /deferredToDesktop: true/, 'Web acknowledgement API must report Desktop deferral.');
assert.doesNotMatch(webApi, /request\(`\/api\/v1\/cloud\/tournaments\/\$\{enc\(tournamentId\)\}\/arbiter-results\/ack`/, 'Web Companion must never call the result ACK endpoint.');

console.log('DESKTOP_ARBITER_RESULTS_DOWNLOAD_CONTRACT=PASS');
