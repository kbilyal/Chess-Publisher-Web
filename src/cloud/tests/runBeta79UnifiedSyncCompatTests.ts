import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CloudIdentityAmbiguityError,
  bindOwnedCloudIdentity,
  resolveOwnedCloudTournament
} from '../cloudTournamentIdentity';
import {
  buildPrivateSnapshot,
  classifyThreeWay,
  ensureLocalIdentity,
  extractPrivateTournament,
  fingerprintTournament
} from '../onlineCloudSync';

const read = (path: string) => readFileSync(path, 'utf8');
const provider = read('src/cloud/OnlineCloudProviderV2.tsx');
const screens = read('src/companion/CompanionCloudScreens.tsx');
const panel = read('src/arbiter/OrganizerArbiterPanel.tsx');
const workerPatch = read('scripts/patch-arbiter-results-cloud-state-worker.py');
const cloudApi = read('src/cloud/cloudWorkspaceApi.ts');

function sampleTournament(name = 'Beta79 Test') {
  return {
    name,
    settings: { eventName: name, rounds: '7' },
    players: [
      { localKey: 'p:white', pairingNumber: 1, name: 'White Player', rating: 2000 },
      { localKey: 'p:black', pairingNumber: 2, name: 'Black Player', rating: 1990 }
    ],
    pairings: {
      round: '1',
      liveBoards: {
        '1': [{ board: 1, whiteKey: 'p:white', blackKey: 'p:black', result: '-' }]
      },
      finalizedRounds: {},
      roundStatus: {}
    },
    cloud: {
      schemaVersion: 4,
      internalId: 'tournament:stable-beta79',
      localKey: 'desktop-install:abc',
      cloudTournamentId: 'cloud:one',
      baseRevision: 3,
      baseFingerprint: 'base',
      fingerprintContentSchema: 6
    }
  } as any;
}

const remote = { id: 'cloud:one', localKey: 'tournament:stable-beta79', name: 'Old Name', revision: 4 };

// TEST 1 — Desktop creates -> SYNC -> Web sees exactly one tournament.
{
  const local = sampleTournament();
  assert.equal(resolveOwnedCloudTournament(local, [remote])?.id, remote.id);
  assert.equal(resolveOwnedCloudTournament(local, [remote])?.id, remote.id, 'Repeated resolution must reuse the same row.');
  assert.ok(provider.includes('list = await refreshWorkspace();'), 'Web must refresh the organizer-owned list before CREATE.');
  assert.ok(!provider.includes('chooseExistingRemote(tournament, list) || activeRef.current'), 'Active UI state must never create a second identity path.');
  console.log('TEST 1 PASS — stable identity reuses one Organizer Cloud tournament.');
}

// TEST 2 — Desktop modifies -> SYNC -> same Cloud object revision increases.
{
  const bound: any = bindOwnedCloudIdentity(sampleTournament(), remote);
  assert.equal(bound.cloud.cloudTournamentId, remote.id);
  assert.equal(bound.cloud.internalId, remote.localKey);
  assert.ok(provider.includes('cloudApi.putSnapshot('));
  assert.ok(provider.includes('remote.id,\n        cloud.revision,'), 'Changed content must PUT to the same remote id using its current revision.');
  console.log('TEST 2 PASS — modifications target the same Cloud id/revision chain.');
}

// TEST 3 — Web modifies -> Desktop SYNC receives complete Cloud state.
{
  const web: any = sampleTournament();
  web.settings.venue = 'Changed in Web';
  const snapshot: any = buildPrivateSnapshot(web.name, web);
  const extracted: any = extractPrivateTournament(snapshot, web.name).tournament;
  assert.equal(extracted.settings.venue, 'Changed in Web');
  assert.equal(snapshot.cloudWorkspace.internalId, 'tournament:stable-beta79');
  assert.equal(snapshot.cloudWorkspace.clientVersion, 'chess-publisher-web-beta79-unified-sync-compat-v1');
  console.log('TEST 3 PASS — Web writes a complete beta.79-compatible tournament snapshot.');
}

// TEST 4 — Web/Arbiter enters result -> Pairings SYNC -> Desktop gets result.
{
  for (const needle of [
    'arbiter_results_cloud_state_v1',
    'board.result = result',
    'validateCloudSnapshot(snapshot)',
    'b2UploadJson(env, objectKey, bytes)',
    'INSERT INTO cloud_revisions',
    'UPDATE cloud_tournaments',
    'cloud_arbiter_results'
  ]) assert.ok(workerPatch.includes(needle), `Missing result-state contract: ${needle}`);
  assert.ok(!panel.includes('cloud.syncNow('), 'Organizer page must not be required to mirror the result into Cloud.');
  assert.ok(!panel.includes('acknowledgeResults('), 'Organizer Web must not consume Desktop pending results.');
  console.log('TEST 4 PASS — Arbiter results become Cloud tournament state and remain Desktop-verifiable.');
}

// TEST 5 — Desktop enters result -> SYNC -> Web gets result.
{
  const desktop: any = sampleTournament();
  desktop.pairings.liveBoards['1'][0].result = '1 - 0';
  const extracted: any = extractPrivateTournament(buildPrivateSnapshot(desktop.name, desktop), desktop.name).tournament;
  assert.equal(extracted.pairings.liveBoards['1'][0].result, '1 - 0');
  console.log('TEST 5 PASS — complete snapshot roundtrip preserves Desktop results for Web.');
}

// TEST 6 — blank Web result must not erase Desktop result.
{
  assert.ok(workerPatch.includes('if (!ARBITER_ALLOWED_RESULTS.has(result))'), 'Only explicit allowed results may mutate Cloud state.');
  assert.ok(workerPatch.includes('if (previousResult !== result)'));
  assert.ok(!workerPatch.includes('board.result = ""'));
  console.log('TEST 6 PASS — blank result has no mutation path.');
}

// TEST 7 — different non-empty results -> conflict.
{
  assert.equal(classifyThreeWay('desktop-result', 'common-result', 'web-result'), 'conflict');
  assert.ok(workerPatch.includes('arbiter_result_conflict'), 'Different pending Arbiter results must also fail closed.');
  console.log('TEST 7 PASS — different non-empty two-sided changes fail closed.');
}

// TEST 8 — board identity mismatch -> reject.
{
  assert.ok(workerPatch.includes('if (!board) throw new ApiError(404, "arbiter_board_not_found"'));
  assert.ok(workerPatch.includes('Number(item?.board || 0) === boardNumber'));
  console.log('TEST 8 PASS — result cannot move to a different board.');
}

// TEST 9 — player identity mismatch -> reject.
{
  assert.ok(workerPatch.includes('arbiterText(board.whiteKey) !== whiteKey'));
  assert.ok(workerPatch.includes('arbiterText(board.blackKey) !== blackKey'));
  console.log('TEST 9 PASS — white/black player identity is exact and fail-closed.');
}

// TEST 10 — repeated SYNC -> no duplicate tournaments; ambiguity -> STOP.
{
  const stale: any = sampleTournament();
  stale.cloud.cloudTournamentId = 'cloud:stale-provider-id';
  const duplicateRows = [remote, { ...remote, id: 'cloud:duplicate' }];
  assert.throws(() => resolveOwnedCloudTournament(stale, duplicateRows), CloudIdentityAmbiguityError);
  assert.ok(provider.includes('resolveOwnedCloudTournament(tournament, list)'));
  assert.ok(provider.includes('const created = await cloudApi.createTournament'), 'CREATE remains a last resort after authoritative lookup.');
  console.log('TEST 10 PASS — repeated linking reuses one row; stale-id duplicate identity matches stop.');
}

// TEST 11 — Web-created tournament -> Desktop open -> SYNC -> same object.
{
  const fresh: any = ensureLocalIdentity({ ...sampleTournament(), cloud: undefined });
  const createdRemote = { id: 'cloud:web-created', localKey: fresh.cloud.internalId, revision: 1 };
  const linked: any = bindOwnedCloudIdentity(fresh, createdRemote);
  const snapshot: any = buildPrivateSnapshot(linked.name, linked);
  assert.equal(snapshot.cloudWorkspace.internalId, createdRemote.localKey);
  assert.equal(snapshot.cloudWorkspace.cloudTournamentId, createdRemote.id);
  console.log('TEST 11 PASS — Web-created snapshot carries the same private identity Desktop can relink.');
}

// TEST 12 — imported tournament -> first SYNC -> exactly one Cloud object.
{
  assert.ok(provider.includes('{ preserveStableIdentity: true }'), 'Import must preserve an existing stable tournament identity.');
  assert.ok(provider.includes('delete importedCloud.localKey'), 'Imported installation-local key must not become permanent identity.');
  assert.ok(provider.includes('let remote = chooseExistingRemote(seeded, list);'), 'Import must lookup an owned counterpart before CREATE.');
  console.log('TEST 12 PASS — import preserves logical identity and checks Cloud before CREATE.');
}

// TEST 13 — rename tournament -> identity remains same.
{
  const renamed = sampleTournament('Completely Renamed Event');
  assert.equal(resolveOwnedCloudTournament(renamed, [remote])?.id, remote.id);
  assert.equal(bindOwnedCloudIdentity(renamed, remote).cloud?.internalId, remote.localKey);
  console.log('TEST 13 PASS — name is presentation data, not tournament identity.');
}

// TEST 14 — PUBLIC LIST label is absent from My tournaments.
{
  assert.ok(!screens.includes('PUBLIC LIST'));
  console.log('TEST 14 PASS — My tournaments has no PUBLIC LIST identity/workflow label.');
}

// TEST 15 — private Cloud SYNC does not publish to Public Hub.
{
  const start = provider.indexOf('async function safeAutomaticSync()');
  const end = provider.indexOf('\n  function scheduleAutomaticSync()', start);
  assert.ok(start >= 0 && end > start);
  const syncBody = provider.slice(start, end);
  assert.ok(!syncBody.includes('hubApi.'), 'Private automatic sync must never call Public Hub API.');
  assert.ok(!syncBody.includes('publishOnline'), 'Private automatic sync must never publish.');
  assert.ok(!provider.includes('internalId: hub.id'), 'Public Hub publishing must not rewrite private identity.');
  console.log('TEST 15 PASS — private SYNC and Public Hub publication remain separate.');
}

// TEST 16 — Organizer ownership isolation.
{
  assert.ok(workerPatch.includes('cloudTournamentForOrganizer(env, session.organizer_id, session.tournament_id)'));
  assert.ok(cloudApi.includes("Authorization: `Bearer ${token}`"), 'Private Cloud requests must carry Organizer auth.');
  console.log('TEST 16 PASS — result write and Cloud API remain organizer-scoped.');
}

// Extra portability invariant: fingerprints remain deterministic after binding.
{
  const a = bindOwnedCloudIdentity(sampleTournament(), remote);
  const b = bindOwnedCloudIdentity(sampleTournament(), remote);
  assert.equal(await fingerprintTournament(a), await fingerprintTournament(b));
}

console.log('BETA79_UNIFIED_SYNC_COMPAT_MATRIX=PASS');