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
  a.cloud = { internalId: 'tournament:abc', localKey: 'install-a', baseRevision: 10, baseFingerprint: 'x' };
  a.online = { hubTournamentId: 'hub_abc', revision: 9 };
  a.savedAt = '2026-09-03T10:00:00Z';

  const b = baseTournament();
  b.cloud = { internalId: 'tournament:abc', localKey: 'install-b', baseRevision: 99, baseFingerprint: 'y' };
  b.online = { hubTournamentId: 'hub_abc', revision: 42 };
  b.savedAt = '2026-09-03T11:00:00Z';
  b.dgt = { boardMapping: [{ tournamentBoard: 99, serial: 'DEVICE-B' }] };

  assert.equal(fingerprintPayload(a), fingerprintPayload(b));
}

function testInternalIdentity() {
  const tournament = baseTournament();
  tournament.online = { hubTournamentId: 'hub_existing' };

  const generated = chooseInternalTournamentId(tournament);
  assert.match(generated, /^tournament:/, 'Public Hub ID must never seed Private Cloud identity.');
  assert.notEqual(generated, 'hub_existing');

  const identified: any = ensureLocalIdentity(tournament);
  assert.match(identified.cloud.internalId, /^tournament:/);
  assert.notEqual(identified.cloud.internalId, 'hub_existing');
  assert.match(identified.cloud.localKey, /^web-install:/);
  assert.notEqual(identified.cloud.internalId, identified.cloud.localKey);

  const trusted = chooseInternalTournamentId(tournament, ['tournament:trusted-private']);
  assert.equal(trusted, 'tournament:trusted-private', 'Explicit private identity candidate must remain supported.');

  const rejectedPublicCandidate = chooseInternalTournamentId(tournament, ['hub_existing']);
  assert.match(rejectedPublicCandidate, /^tournament:/);
  assert.notEqual(rejectedPublicCandidate, 'hub_existing', 'Even an explicit compatibility candidate may not reuse the known Public Hub ID.');
}

function testPrivateSnapshotSanitization() {
  const tournament: any = ensureLocalIdentity(baseTournament(), { internalIdCandidates: ['tournament:legacy-private'] });
  tournament.cloud.baseRevision = 12;
  tournament.cloud.baseFingerprint = 'secret-no-content';
  tournament.cloud.autoBackup = true;
  tournament.telegram.token = 'must-not-travel';
  const clean: any = stripForPrivateCloud(tournament);

  assert.equal(clean.cloud.internalId, 'tournament:legacy-private');
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
