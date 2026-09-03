import assert from 'node:assert/strict';
import { CloudSyncCoordinator } from '../CloudSyncCoordinator';
import { decideAutomaticSync } from '../browserSyncPolicy';
import {
  buildPrivateSnapshot,
  ensureLocalIdentity,
  extractPrivateTournament,
  fingerprintTournament,
  preserveInstallationLocalFields,
  withUpdatedBase
} from '../onlineCloudSync';

const INTERNAL_ID = 'tournament:TEST-ROUNDTRIP';
const CLOUD_ID = 'cloud-record-TEST-ROUNDTRIP';
const NAME = 'Desktop Web Roundtrip';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function baseTournament() {
  return {
    name: NAME,
    settings: { rounds: '7', country: 'BUL', venue: 'Initial venue' },
    players: [{ localKey: 'player:1', name: 'Player One', rating: 2000 }],
    schedule: { rows: [] },
    pairings: { rounds: [] },
    regulations: { tieBreaks: [] },
    telegram: { channel: '', language: 'en', signature: '', token: 'LOCAL-SECRET' },
    chessResults: {},
    dgt: { boardMapping: [{ tournamentBoard: 1, serial: 'LOCAL-DGT' }] },
    savedAt: '2026-09-04T00:00:00Z'
  } as any;
}

class RevisionConflict extends Error {
  code = 'cloud_revision_conflict';
  constructor(public currentRevision: number) {
    super(`Revision conflict; current revision is ${currentRevision}.`);
  }
}

class InMemoryRevisionStore {
  constructor(public revision: number, private snapshot: any) {}

  read() {
    return { revision: this.revision, snapshot: clone(this.snapshot) };
  }

  put(expectedRevision: number, snapshot: any) {
    if (expectedRevision !== this.revision) throw new RevisionConflict(this.revision);
    this.revision += 1;
    this.snapshot = clone(snapshot);
    return this.read();
  }
}

async function remoteTournament(store: InMemoryRevisionStore) {
  const remote = store.read();
  const parsed = extractPrivateTournament(remote.snapshot, NAME);
  return {
    ...remote,
    tournament: parsed.tournament,
    fingerprint: await fingerprintTournament(parsed.tournament)
  };
}

async function expectControlledRevisionConflict(action: () => unknown, expectedRevision: number) {
  let caught: unknown;
  try { action(); }
  catch (error) { caught = error; }
  assert.ok(caught instanceof RevisionConflict);
  assert.equal(caught.code, 'cloud_revision_conflict');
  assert.equal(caught.currentRevision, expectedRevision);
}

async function testDesktopWebRoundtripAndConflicts() {
  const portableBase: any = ensureLocalIdentity(baseTournament(), { internalIdCandidates: [INTERNAL_ID] });
  portableBase.cloud.localKey = 'desktop-install:one';
  const baseFingerprint = await fingerprintTournament(portableBase);
  const store = new InMemoryRevisionStore(1, buildPrivateSnapshot(NAME, portableBase));

  let desktop: any = withUpdatedBase(portableBase, CLOUD_ID, 1, baseFingerprint);
  let web: any = preserveInstallationLocalFields(
    (await remoteTournament(store)).tournament,
    { cloud: { localKey: 'web-install:one', autoBackup: true }, dgt: { boardMapping: [{ serial: 'WEB-DGT' }] } },
    { cloudTournamentId: CLOUD_ID, baseRevision: 1, baseFingerprint }
  );

  assert.equal(desktop.cloud.internalId, INTERNAL_ID);
  assert.equal(web.cloud.internalId, INTERNAL_ID);
  assert.equal(web.cloud.localKey, 'web-install:one');

  // Scenario 1: Desktop local-only change -> r2 -> Web explicit Pull Changes.
  desktop.players[0].club = 'Desktop Club';
  let remote = await remoteTournament(store);
  let desktopFingerprint = await fingerprintTournament(desktop);
  assert.equal(
    decideAutomaticSync(desktopFingerprint, desktop.cloud.baseFingerprint, remote.fingerprint),
    'push-local'
  );
  let saved = store.put(desktop.cloud.baseRevision, buildPrivateSnapshot(NAME, desktop));
  assert.equal(saved.revision, 2);
  desktop = withUpdatedBase(desktop, CLOUD_ID, saved.revision, desktopFingerprint);

  remote = await remoteTournament(store);
  assert.equal(
    decideAutomaticSync(await fingerprintTournament(web), web.cloud.baseFingerprint, remote.fingerprint),
    'remote-available'
  );
  web = preserveInstallationLocalFields(remote.tournament, web, {
    cloudTournamentId: CLOUD_ID,
    baseRevision: remote.revision,
    baseFingerprint: remote.fingerprint
  });
  assert.equal(web.players[0].club, 'Desktop Club');
  assert.equal(web.cloud.localKey, 'web-install:one');

  // Scenario 2: Web local-only change -> autosync/Sync Now r3 -> Desktop Pull Changes.
  web.settings.venue = 'Venue changed in Web';
  remote = await remoteTournament(store);
  const webFingerprint = await fingerprintTournament(web);
  assert.equal(decideAutomaticSync(webFingerprint, web.cloud.baseFingerprint, remote.fingerprint), 'push-local');
  saved = store.put(web.cloud.baseRevision, buildPrivateSnapshot(NAME, web));
  assert.equal(saved.revision, 3);
  web = withUpdatedBase(web, CLOUD_ID, saved.revision, webFingerprint);

  remote = await remoteTournament(store);
  assert.equal(
    decideAutomaticSync(await fingerprintTournament(desktop), desktop.cloud.baseFingerprint, remote.fingerprint),
    'remote-available'
  );
  desktop = preserveInstallationLocalFields(remote.tournament, desktop, {
    cloudTournamentId: CLOUD_ID,
    baseRevision: remote.revision,
    baseFingerprint: remote.fingerprint
  });
  assert.equal(desktop.settings.venue, 'Venue changed in Web');
  assert.equal(desktop.cloud.localKey, 'desktop-install:one');

  // Scenario 3: Desktop A and Web B diverge from r3. Desktop reaches r4;
  // Web classifies a conflict and an attempted stale revision cannot overwrite r4.
  desktop.settings.chiefArbiter = 'Desktop change A';
  web.settings.deputyArbiter = 'Web change B';
  remote = await remoteTournament(store);
  desktopFingerprint = await fingerprintTournament(desktop);
  assert.equal(decideAutomaticSync(desktopFingerprint, desktop.cloud.baseFingerprint, remote.fingerprint), 'push-local');
  saved = store.put(desktop.cloud.baseRevision, buildPrivateSnapshot(NAME, desktop));
  desktop = withUpdatedBase(desktop, CLOUD_ID, saved.revision, desktopFingerprint);
  assert.equal(saved.revision, 4);

  remote = await remoteTournament(store);
  const webBState = clone(web);
  assert.equal(
    decideAutomaticSync(await fingerprintTournament(web), web.cloud.baseFingerprint, remote.fingerprint),
    'conflict'
  );
  await expectControlledRevisionConflict(
    () => store.put(web.cloud.baseRevision, buildPrivateSnapshot(NAME, web)),
    4
  );
  assert.equal(store.revision, 4);
  assert.equal((await remoteTournament(store)).tournament.settings.chiefArbiter, 'Desktop change A');
  assert.deepEqual(web, webBState);

  // Scenario 4: two browsers share r4; A reaches r5 and B's stale write is rejected.
  remote = await remoteTournament(store);
  let webA: any = preserveInstallationLocalFields(remote.tournament, { cloud: { localKey: 'web-install:A' } }, {
    cloudTournamentId: CLOUD_ID,
    baseRevision: remote.revision,
    baseFingerprint: remote.fingerprint
  });
  const webB: any = preserveInstallationLocalFields(remote.tournament, { cloud: { localKey: 'web-install:B' } }, {
    cloudTournamentId: CLOUD_ID,
    baseRevision: remote.revision,
    baseFingerprint: remote.fingerprint
  });
  webA.settings.venue = 'Browser A venue';
  webB.settings.venue = 'Browser B venue';
  const webAFingerprint = await fingerprintTournament(webA);
  assert.equal(decideAutomaticSync(webAFingerprint, webA.cloud.baseFingerprint, remote.fingerprint), 'push-local');
  saved = store.put(webA.cloud.baseRevision, buildPrivateSnapshot(NAME, webA));
  webA = withUpdatedBase(webA, CLOUD_ID, saved.revision, webAFingerprint);
  assert.equal(saved.revision, 5);

  remote = await remoteTournament(store);
  assert.equal(
    decideAutomaticSync(await fingerprintTournament(webB), webB.cloud.baseFingerprint, remote.fingerprint),
    'conflict'
  );
  await expectControlledRevisionConflict(
    () => store.put(webB.cloud.baseRevision, buildPrivateSnapshot(NAME, webB)),
    5
  );
  assert.equal((await remoteTournament(store)).tournament.settings.venue, 'Browser A venue');
  assert.equal(webB.settings.venue, 'Browser B venue');

  const uploaded: any = store.read().snapshot.data.tournaments[NAME];
  assert.deepEqual(Object.keys(uploaded.cloud).sort(), ['internalId', 'schemaVersion']);
  assert.equal(uploaded.cloud.internalId, INTERNAL_ID);
  assert.equal(uploaded.cloud.localKey, undefined);
  assert.equal(uploaded.dgt, undefined);
  assert.equal(uploaded.telegram.token, undefined);
}

async function testPullChangesConcurrency() {
  const pendingCoordinator = new CloudSyncCoordinator();
  let autosyncRuns = 0;
  let pullRuns = 0;
  pendingCoordinator.schedule(async () => { autosyncRuns += 1; }, 15);
  pendingCoordinator.cancelScheduled();
  await pendingCoordinator.enqueue(async () => { pullRuns += 1; });
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(autosyncRuns, 0);
  assert.equal(pullRuns, 1);

  const activeCoordinator = new CloudSyncCoordinator();
  const order: string[] = [];
  let releaseSync!: () => void;
  const syncBarrier = new Promise<void>(resolve => { releaseSync = resolve; });
  const activeSync = activeCoordinator.enqueue(async () => {
    order.push('sync-start');
    await syncBarrier;
    order.push('sync-end');
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  const queuedPull = activeCoordinator.enqueue(async () => { order.push('pull'); });
  assert.deepEqual(order, ['sync-start']);
  releaseSync();
  await Promise.all([activeSync, queuedPull]);
  assert.deepEqual(order, ['sync-start', 'sync-end', 'pull']);
  assert.equal(order.filter(item => item === 'pull').length, 1);
}

async function main() {
  await testDesktopWebRoundtripAndConflicts();
  await testPullChangesConcurrency();
  console.log('Desktop <-> Web Cloud roundtrip regression: PASS');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
