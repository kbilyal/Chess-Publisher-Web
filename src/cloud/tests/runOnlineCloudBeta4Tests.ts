import assert from 'node:assert/strict';
import {
  classifyThreeWay,
  ensureLocalIdentity,
  fingerprintPayload,
  stripForPrivateCloud,
  chooseInternalTournamentId
} from '../onlineCloudSync';

function baseTournament(): any {
  return {
    name: 'Sync Test',
    settings: { rounds: '7' },
    players: [{ localKey: 'p1', name: 'Player One', rating: 2000 }],
    pairings: { liveBoards: {} },
    schedule: { rows: [] },
    regulations: { tieBreaks: [] },
    telegram: { channel: '', language: 'en', signature: '' },
    chessResults: {},
    dgt: { boardMapping: [{ tournamentBoard: 1, serial: 'DEVICE-A' }] }
  };
}

function testThreeWay() {
  assert.equal(classifyThreeWay('A', 'A', 'A'), 'equal');
  assert.equal(classifyThreeWay('A', 'A', 'B'), 'cloud-only');
  assert.equal(classifyThreeWay('B', 'A', 'A'), 'local-only');
  assert.equal(classifyThreeWay('B', 'A', 'C'), 'conflict');
}

function testVolatileMetadataExcluded() {
  const a = baseTournament();
  a.cloud = { internalId: 'hub_abc', localKey: 'install-a', baseRevision: 10, baseFingerprint: 'x' };
  a.online = { hubTournamentId: 'hub_abc', revision: 9 };
  a.savedAt = '2026-09-03T10:00:00Z';

  const b = baseTournament();
  b.cloud = { internalId: 'hub_abc', localKey: 'install-b', baseRevision: 99, baseFingerprint: 'y' };
  b.online = { hubTournamentId: 'hub_abc', revision: 42 };
  b.savedAt = '2026-09-03T11:00:00Z';
  b.dgt = { boardMapping: [{ tournamentBoard: 99, serial: 'DEVICE-B' }] };

  assert.equal(fingerprintPayload(a), fingerprintPayload(b));
}

function testInternalIdentity() {
  const tournament = baseTournament();
  tournament.online = { hubTournamentId: 'hub_existing' };
  assert.equal(chooseInternalTournamentId(tournament), 'hub_existing');

  const identified: any = ensureLocalIdentity(tournament);
  assert.equal(identified.cloud.internalId, 'hub_existing');
  assert.match(identified.cloud.localKey, /^web-install:/);
  assert.notEqual(identified.cloud.internalId, identified.cloud.localKey);
}

function testPrivateSnapshotSanitization() {
  const tournament: any = ensureLocalIdentity(baseTournament(), { internalIdCandidates: ['cloud_legacy'] });
  tournament.cloud.baseRevision = 12;
  tournament.cloud.baseFingerprint = 'secret-no-content';
  tournament.cloud.autoBackup = true;
  tournament.telegram.token = 'must-not-travel';
  const clean: any = stripForPrivateCloud(tournament);

  assert.equal(clean.cloud.internalId, 'cloud_legacy');
  assert.equal(clean.cloud.localKey, undefined);
  assert.equal(clean.cloud.baseRevision, undefined);
  assert.equal(clean.cloud.baseFingerprint, undefined);
  assert.equal(clean.cloud.autoBackup, undefined);
  assert.equal(clean.telegram.token, undefined);
  assert.equal(clean.dgt, undefined);
}

function main() {
  testThreeWay();
  testVolatileMetadataExcluded();
  testInternalIdentity();
  testPrivateSnapshotSanitization();
  console.log('Online & Cloud beta.4 regression: PASS');
}

main();
