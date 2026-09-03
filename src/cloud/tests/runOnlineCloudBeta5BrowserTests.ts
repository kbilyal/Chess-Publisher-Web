import assert from 'node:assert/strict';
import {
  buildPrivateSnapshot,
  ensureLocalIdentity,
  fingerprintPayload,
  preserveInstallationLocalFields
} from '../onlineCloudSync';
import { decideAutomaticSync, parseContinuationHint, stripContinuationHint } from '../browserSyncPolicy';
import { CloudSyncCoordinator } from '../CloudSyncCoordinator';

function tournament(): any {
  return {
    name: 'Browser Continuation Test',
    settings: { rounds: '7', country: 'BUL' },
    players: [{ localKey: 'p1', name: 'Player One', rating: 2000 }],
    pairings: { liveBoards: {} },
    schedule: { rows: [] },
    regulations: { tieBreaks: [] },
    telegram: { channel: '', language: 'en', signature: '' },
    chessResults: {},
    dgt: { boardMapping: [{ tournamentBoard: 1, serial: 'DEVICE-A' }] }
  };
}

function testDesktopWebFingerprintParity() {
  const desktop = tournament();
  desktop.cloud = {
    schemaVersion: 4,
    internalId: 'tournament:ABC',
    localKey: 'desktop-install:111',
    baseRevision: 4,
    baseFingerprint: 'legacy',
    lastSyncAt: '2026-09-03T10:00:00Z'
  };
  desktop.dgt = { boardMapping: [{ tournamentBoard: 1, serial: 'DESKTOP-DGT' }] };

  const web = tournament();
  web.cloud = {
    schemaVersion: 4,
    internalId: 'tournament:ABC',
    localKey: 'web-install:222',
    baseRevision: 99,
    baseFingerprint: 'different-runtime-metadata',
    lastSyncAt: '2026-09-03T11:00:00Z'
  };
  web.dgt = { boardMapping: [{ tournamentBoard: 9, serial: 'WEB-DGT' }] };

  assert.equal(fingerprintPayload(desktop), fingerprintPayload(web));
}

function testIdentitySurvivesDeviceChange() {
  const desktop: any = ensureLocalIdentity(tournament(), { internalIdCandidates: ['tournament:ABC'] });
  desktop.cloud.localKey = 'desktop-install:111';
  const snapshot = buildPrivateSnapshot(desktop.name, desktop);
  const portable = snapshot.data.tournaments[desktop.name];
  const web: any = preserveInstallationLocalFields(portable, { cloud: { localKey: 'web-install:222' } }, {
    cloudTournamentId: 'cloud-record-1',
    baseRevision: 2,
    baseFingerprint: 'fp'
  });

  assert.equal(web.cloud.internalId, 'tournament:ABC');
  assert.equal(web.cloud.localKey, 'web-install:222');
  assert.notEqual(web.cloud.localKey, desktop.cloud.localKey);
}

function testPrivateSnapshotSanitization() {
  const source: any = ensureLocalIdentity(tournament(), { internalIdCandidates: ['tournament:ABC'] });
  source.cloud.localKey = 'web-install:secret-device';
  source.cloud.baseRevision = 8;
  source.cloud.baseFingerprint = 'runtime-only';
  source.cloud.organizerToken = 'MUST_NOT_TRAVEL';
  source.telegram.token = 'TELEGRAM_SECRET';
  const snapshot = buildPrivateSnapshot(source.name, source);
  const serialized = JSON.stringify(snapshot);
  const portable = snapshot.data.tournaments[source.name];

  assert.equal(portable.cloud.internalId, 'tournament:ABC');
  assert.equal(portable.cloud.localKey, undefined);
  assert.equal(portable.cloud.baseRevision, undefined);
  assert.equal(portable.cloud.baseFingerprint, undefined);
  assert.equal(portable.cloud.organizerToken, undefined);
  assert.equal(portable.dgt, undefined);
  assert.equal(portable.telegram.token, undefined);
  assert.equal(serialized.includes('MUST_NOT_TRAVEL'), false);
  assert.equal(serialized.includes('TELEGRAM_SECRET'), false);
}

function testAutosyncPolicy() {
  assert.equal(decideAutomaticSync('A', 'A', 'A'), 'equal');
  assert.equal(decideAutomaticSync('B', 'A', 'A'), 'push-local');
  assert.equal(decideAutomaticSync('A', 'A', 'B'), 'remote-available');
  assert.equal(decideAutomaticSync('B', 'A', 'C'), 'conflict');
}

function testContinuationHint() {
  assert.equal(parseContinuationHint('?cloudTournamentId=cloud-record-1'), 'cloud-record-1');
  assert.equal(parseContinuationHint('?continue=tournament%3AABC'), 'tournament:ABC');
  assert.equal(parseContinuationHint('?cloudTournamentId=https://evil.example/x'), '');
  assert.equal(stripContinuationHint('https://example.test/Chess-Publisher-Web/?cloudTournamentId=abc&x=1#tab'), '/Chess-Publisher-Web/?x=1#tab');
}

async function testCoordinatorSerializesAndDebounces() {
  const coordinator = new CloudSyncCoordinator();
  const order: string[] = [];

  const a = coordinator.enqueue(async () => {
    order.push('a-start');
    await new Promise(resolve => setTimeout(resolve, 15));
    order.push('a-end');
  });
  const b = coordinator.enqueue(async () => {
    order.push('b');
  });
  await Promise.all([a, b]);
  assert.deepEqual(order, ['a-start', 'a-end', 'b']);

  let count = 0;
  coordinator.schedule(async () => { count += 1; }, 10);
  coordinator.schedule(async () => { count += 1; }, 10);
  coordinator.schedule(async () => { count += 1; }, 10);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(count, 1);
}

async function main() {
  testDesktopWebFingerprintParity();
  testIdentitySurvivesDeviceChange();
  testPrivateSnapshotSanitization();
  testAutosyncPolicy();
  testContinuationHint();
  await testCoordinatorSerializesAndDebounces();
  console.log('Online & Cloud beta.5 Browser Continuation regression: PASS');
}

main();
