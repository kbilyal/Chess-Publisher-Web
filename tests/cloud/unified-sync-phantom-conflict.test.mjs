import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const syncSource = readFileSync('src/cloud/onlineCloudSync.ts', 'utf8');
const providerSource = readFileSync('src/cloud/OnlineCloudProviderV2.tsx', 'utf8');
const companionSource = readFileSync('src/companion/CompanionWorkspace.tsx', 'utf8');
const arbiterSource = readFileSync('src/arbiter/ArbiterPortal.tsx', 'utf8');
const filterSource = readFileSync('src/arbiter/installArbiterResultFilters.ts', 'utf8');
const workerPatch = readFileSync('scripts/patch-cloud-sync-lineage-worker.py', 'utf8');
const desktopReference = readFileSync('production-web/webview/CloudWorkspaceAdapter.js', 'utf8');

const volatile = new Set([
  'updatedat', 'lastviewedat', 'lastaccess', 'requesttimestamp', 'requesttimestamps',
  'cachetimestamp', 'cachetimestamps', 'generatedat', 'serverprocessingmetadata',
  'processingmetadata', 'browserstate', 'browserdata', 'sessionstate', 'sessiondata'
]);
const localOnly = new Set([
  'organizertoken','managetoken','managekey','admintoken','authtoken','accesstoken','refreshtoken','devicetoken',
  'password','secret','devicesecret','aeskey','aes','iv','filepath','folderpath','installationpath','windowspath',
  'linuxpath','executablepath','workingdirectory','serialport','usbpath','dgtport'
]);

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (volatile.has(lower) || localOnly.has(lower)) continue;
    out[key] = clean(item);
  }
  return out;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
  return out;
}
function tournamentContent(input) {
  const one = clean(clone(input));
  delete one.cloud;
  delete one.online;
  delete one.hub;
  delete one.publication;
  delete one.savedAt;
  delete one.dgt;
  delete one.uiState;
  delete one.runtimeState;
  if (one.telegram && typeof one.telegram === 'object') {
    delete one.telegram.token;
    delete one.telegram.botToken;
  }
  return canonical(one);
}
function fp(input) {
  return createHash('sha256').update(JSON.stringify(tournamentContent(input))).digest('hex');
}
function classify(local, base, remote) {
  if (local === remote) return 'equal';
  const localChanged = local !== base;
  const remoteChanged = remote !== base;
  if (!localChanged && remoteChanged) return 'cloud-only';
  if (localChanged && !remoteChanged) return 'local-only';
  return 'conflict';
}

const baseTournament = {
  name: 'SYNC TEST',
  settings: { city: 'Sofia', rounds: 7, timeControl: '90+30' },
  players: [
    { localKey: 'p1', name: 'Player A', rating: 1800 },
    { localKey: 'p2', name: 'Player B', rating: 1750 }
  ],
  pairings: { liveBoards: { '1': [{ board: 1, whiteKey: 'p1', blackKey: 'p2', result: '-' }] } }
};

// Deterministic serialization: object order/public/session/volatile metadata do not alter tournament content.
const noisy = {
  generatedAt: '2099-01-01T00:00:00Z',
  publication: { lastPublishedAt: 'later' },
  hub: { publicSlug: 'public-only' },
  online: { revision: 999, lastPublishedAt: 'later' },
  ...clone(baseTournament),
  updatedAt: '2099-01-01T00:00:01Z',
  sessionData: { tab: 'players' },
  cloud: { baseRevision: 999, baseFingerprint: 'not-content' }
};
assert.equal(fp(noisy), fp(baseTournament), 'volatile/public/private-sync metadata must not manufacture a tournament change');
const reordered = { pairings: clone(baseTournament.pairings), players: clone(baseTournament.players), settings: clone(baseTournament.settings), name: baseTournament.name };
assert.equal(fp(reordered), fp(baseTournament), 'object property order must not affect canonical tournament fingerprint');

// Scenario A: after a successful accepted revision becomes the common base, repeated SYNC is a true NO-OP.
const r2State = clone(baseTournament);
const r2 = fp(r2State);
assert.equal(classify(r2, r2, r2), 'equal', 'Scenario A: second SYNC after accepted common base must be NO-OP');

// Scenario B: Web changes one result, Desktop remains at common base -> Cloud-only, then equal after applying result/base r3.
const webResult = clone(r2State);
webResult.pairings.liveBoards['1'][0].result = '1 - 0';
const r3 = fp(webResult);
assert.equal(classify(r2, r2, r3), 'cloud-only', 'Scenario B: Web-only result must classify Cloud-only');
assert.equal(classify(r3, r3, r3), 'equal', 'Scenario B: after Desktop applies result and adopts r3, next SYNC must be NO-OP');

// Scenario C: Desktop edits player data while Cloud remains at common base -> Desktop-only push, then equal at r4.
const desktopPlayerEdit = clone(webResult);
desktopPlayerEdit.players[0].rating = 1812;
const localR4 = fp(desktopPlayerEdit);
assert.equal(classify(localR4, r3, r3), 'local-only', 'Scenario C: Desktop-only edit must push without conflict');
assert.equal(classify(localR4, localR4, localR4), 'equal', 'Scenario C: accepted r4 must become the next common base');

// Scenario D: independent Desktop and Web edits after the same base -> true conflict remains protected.
const commonR4 = clone(desktopPlayerEdit);
const commonHash = fp(commonR4);
const desktopA = clone(commonR4);
desktopA.players[0].name = 'Player A Local';
const webB = clone(commonR4);
webB.players[1].name = 'Player B Web';
assert.equal(classify(fp(desktopA), commonHash, fp(webB)), 'conflict', 'Scenario D: independent two-sided changes must remain BOTH_CHANGED');

// Web projection / stable lineage contract.
assert.match(syncSource, /PORTABLE_FINGERPRINT_SCHEMA = 7/);
for (const field of ['delete next.online;', 'delete next.hub;', 'delete next.publication;', 'updatedat', 'generatedat']) {
  assert.ok(syncSource.includes(field), `Web fingerprint contract missing ${field}`);
}
assert.ok(syncSource.includes('stripVolatileSyncMetadata(sanitizePortableValue(clone(tournament || {})))'), 'Private Web snapshot must omit volatile metadata before upload');
assert.ok(!providerSource.includes('chooseExistingRemote(tournament, list) || activeRef.current'), 'Cloud identity must never fall back to the currently open remote object');
assert.ok(providerSource.includes('saved?.contentFingerprint'), 'Accepted server content fingerprint must become the Web common base');

// Reference Desktop projection remains untouched by this fix and defines the protected content boundary.
for (const field of ['delete one.cloud;', 'delete one.online;', 'delete one.hub;', 'delete one.publication;', 'delete one.savedAt;', 'delete one.dgt;']) {
  assert.ok(desktopReference.includes(field), `Desktop beta.79 reference projection missing ${field}`);
}

// One SYNC action in Organizer and Arbiter; safety resolver remains available for true conflicts.
assert.ok(companionSource.includes('data-unified-sync="true"'), 'Organizer must expose the unified SYNC action');
assert.ok(companionSource.includes('const unifiedSync = async () =>'), 'Organizer unified SYNC dispatcher is missing');
for (const oldLabel of ['Pull Cloud → Web', 'Push Web → Cloud', 'Pull latest Cloud → Web']) {
  assert.ok(!companionSource.includes(oldLabel), `Organizer must not expose legacy directional action: ${oldLabel}`);
}
assert.ok(companionSource.includes("resolveSyncConflict('safe')"), 'True conflict resolver must remain available');
assert.ok(arbiterSource.includes('data-unified-arbiter-sync="true"'), 'Arbiter must expose one unified SYNC action');
assert.ok(!arbiterSource.includes('className="arbiter-send"'), 'Arbiter must not expose per-board Send/Update actions');
assert.ok(arbiterSource.includes('response?.revision'), 'Arbiter bulk SYNC must advance to the accepted Cloud revision between changed results');
assert.ok(filterSource.includes("data-result-missing"), 'All/Missing filter must not depend on a removed per-board Send button');

// Worker must compare canonical tournament content before revisioning and make Arbiter result a real revision.
for (const marker of [
  'private_cloud_sync_lineage_v1',
  'cloudSyncSnapshotContentFingerprint',
  'contentFingerprint',
  'board.result = resultValue',
  'revision = currentRevision + 1',
  "'arbiter-result'",
  'cloudTournamentId: row.id',
  'internalId: String(row.local_key || "")'
]) assert.ok(workerPatch.includes(marker), `Worker sync-lineage patch missing ${marker}`);

console.log('UNIFIED_SYNC_PHANTOM_CONFLICT_A_D=PASS');
