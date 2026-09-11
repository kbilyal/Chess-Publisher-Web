import assert from 'node:assert/strict';
import { decideAutomaticSync } from '../browserSyncPolicy';
import {
  buildPrivateSnapshot,
  ensureLocalIdentity,
  extractPrivateTournament,
  fingerprintTournament,
  preserveInstallationLocalFields,
  withUpdatedBase
} from '../onlineCloudSync';
import { preservePrivateIdentityAfterPublicPublish } from '../../companion/webCloudLineageHandoff';

const INTERNAL_ID = 'tournament:FULL-LIFECYCLE';
const CLOUD_ID = 'cloud-record-FULL-LIFECYCLE';
const NAME = 'Desktop Web Publish Lifecycle';
const PUBLIC_HUB_ID = 'hub-public-FULL-LIFECYCLE';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function baseTournament() {
  return {
    name: NAME,
    settings: {
      rounds: '7',
      country: 'BUL',
      city: 'Sofia',
      venue: 'Initial venue'
    },
    players: [{ localKey: 'player:1', name: 'Player One', rating: 2000 }],
    schedule: { rows: [] },
    pairings: { rounds: [] },
    regulations: { tieBreaks: [] },
    telegram: { channel: '', language: 'en', signature: '', token: 'LOCAL-SECRET' },
    chessResults: {},
    dgt: { boardMapping: [{ tournamentBoard: 1, serial: 'LOCAL-DGT' }] },
    savedAt: '2026-09-11T00:00:00Z'
  } as any;
}

class InMemoryRevisionStore {
  constructor(public revision: number, private snapshot: any) {}

  read() {
    return { revision: this.revision, snapshot: clone(this.snapshot) };
  }

  put(expectedRevision: number, snapshot: any) {
    assert.equal(
      expectedRevision,
      this.revision,
      `Expected Cloud revision ${this.revision}, got stale base ${expectedRevision}.`
    );
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

async function main() {
  const initial: any = ensureLocalIdentity(baseTournament(), { internalIdCandidates: [INTERNAL_ID] });
  initial.cloud.localKey = 'desktop-install:one';
  const initialFingerprint = await fingerprintTournament(initial);
  const store = new InMemoryRevisionStore(1, buildPrivateSnapshot(NAME, initial));

  let desktop: any = withUpdatedBase(initial, CLOUD_ID, 1, initialFingerprint);
  let remote = await remoteTournament(store);
  let web: any = preserveInstallationLocalFields(
    remote.tournament,
    { cloud: { localKey: 'web-install:one' } },
    {
      cloudTournamentId: CLOUD_ID,
      baseRevision: remote.revision,
      baseFingerprint: remote.fingerprint
    }
  );

  assert.equal(desktop.cloud.internalId, INTERNAL_ID);
  assert.equal(web.cloud.internalId, INTERNAL_ID);
  assert.equal(desktop.cloud.cloudTournamentId, CLOUD_ID);
  assert.equal(web.cloud.cloudTournamentId, CLOUD_ID);

  // 1. Desktop edit -> SYNC -> Cloud.
  desktop.players[0].club = 'Desktop Club';
  remote = await remoteTournament(store);
  let localFingerprint = await fingerprintTournament(desktop);
  assert.equal(
    decideAutomaticSync(localFingerprint, desktop.cloud.baseFingerprint, remote.fingerprint),
    'push-local',
    'Desktop-only edit must push to Cloud.'
  );
  let saved = store.put(desktop.cloud.baseRevision, buildPrivateSnapshot(NAME, desktop));
  assert.equal(saved.revision, 2);
  desktop = withUpdatedBase(desktop, CLOUD_ID, saved.revision, localFingerprint);

  // 2. Web opens the same tournament -> receives Desktop change.
  remote = await remoteTournament(store);
  assert.equal(
    decideAutomaticSync(await fingerprintTournament(web), web.cloud.baseFingerprint, remote.fingerprint),
    'remote-available',
    'Web must see the Desktop change as Cloud-only.'
  );
  web = preserveInstallationLocalFields(remote.tournament, web, {
    cloudTournamentId: CLOUD_ID,
    baseRevision: remote.revision,
    baseFingerprint: remote.fingerprint
  });
  assert.equal(web.players[0].club, 'Desktop Club');
  assert.equal(web.cloud.internalId, INTERNAL_ID);
  assert.equal(web.cloud.localKey, 'web-install:one');

  // 3. Web edit -> SYNC -> Cloud.
  web.settings.venue = 'Venue changed in Web';
  remote = await remoteTournament(store);
  localFingerprint = await fingerprintTournament(web);
  assert.equal(
    decideAutomaticSync(localFingerprint, web.cloud.baseFingerprint, remote.fingerprint),
    'push-local',
    'Web-only edit must push to Cloud.'
  );
  saved = store.put(web.cloud.baseRevision, buildPrivateSnapshot(NAME, web));
  assert.equal(saved.revision, 3);
  web = withUpdatedBase(web, CLOUD_ID, saved.revision, localFingerprint);

  // 4. Desktop receives the Web edit on the same private identity.
  remote = await remoteTournament(store);
  assert.equal(
    decideAutomaticSync(await fingerprintTournament(desktop), desktop.cloud.baseFingerprint, remote.fingerprint),
    'remote-available',
    'Desktop must see the Web change as Cloud-only.'
  );
  desktop = preserveInstallationLocalFields(remote.tournament, desktop, {
    cloudTournamentId: CLOUD_ID,
    baseRevision: remote.revision,
    baseFingerprint: remote.fingerprint
  });
  assert.equal(desktop.settings.venue, 'Venue changed in Web');
  assert.equal(desktop.cloud.internalId, INTERNAL_ID);
  assert.equal(desktop.cloud.localKey, 'desktop-install:one');

  // 5. Publish Online is a separate public identity. Simulate the historical
  // bug where an older publish path writes the Hub ID into cloud.internalId;
  // the guard must restore the private identity and publication-only metadata
  // must not manufacture a Cloud content change or revision.
  const beforePublishFingerprint = await fingerprintTournament(web);
  const buggyPublished: any = clone(web);
  buggyPublished.online = {
    ...(buggyPublished.online || {}),
    hubTournamentId: PUBLIC_HUB_ID,
    publicSlug: 'desktop-web-publish-lifecycle',
    revision: 9,
    lastPublishedAt: '2026-09-11T12:00:00.000Z'
  };
  buggyPublished.cloud.internalId = PUBLIC_HUB_ID;

  web = preservePrivateIdentityAfterPublicPublish(web, buggyPublished) as any;
  assert.equal(web.cloud.internalId, INTERNAL_ID, 'Publish Online must preserve permanent private internalId.');
  assert.equal(web.cloud.cloudTournamentId, CLOUD_ID, 'Publish Online must preserve private Cloud record identity.');
  assert.equal(web.online.hubTournamentId, PUBLIC_HUB_ID, 'Public Hub identity must remain in online metadata.');
  assert.equal(
    await fingerprintTournament(web),
    beforePublishFingerprint,
    'Publish-only metadata must be excluded from private Cloud content fingerprint.'
  );
  assert.equal(store.revision, 3, 'Publish Online alone must not increment private Cloud revision.');

  // Web content edit after Publish Online must still SYNC through the same
  // private record, without a phantom BOTH_CHANGED conflict.
  web.settings.city = 'Plovdiv';
  remote = await remoteTournament(store);
  localFingerprint = await fingerprintTournament(web);
  assert.equal(
    decideAutomaticSync(localFingerprint, web.cloud.baseFingerprint, remote.fingerprint),
    'push-local',
    'Web content edit after Publish Online must remain a normal Web-only change.'
  );
  saved = store.put(web.cloud.baseRevision, buildPrivateSnapshot(NAME, web));
  assert.equal(saved.revision, 4);
  web = withUpdatedBase(web, CLOUD_ID, saved.revision, localFingerprint);
  assert.equal(web.cloud.internalId, INTERNAL_ID);

  // 6. Desktop receives the post-publish Web change, still on the exact same
  // private tournament identity and without creating a duplicate tournament.
  remote = await remoteTournament(store);
  assert.equal(
    decideAutomaticSync(await fingerprintTournament(desktop), desktop.cloud.baseFingerprint, remote.fingerprint),
    'remote-available',
    'Desktop must receive the post-publish Web edit without conflict.'
  );
  desktop = preserveInstallationLocalFields(remote.tournament, desktop, {
    cloudTournamentId: CLOUD_ID,
    baseRevision: remote.revision,
    baseFingerprint: remote.fingerprint
  });

  assert.equal(desktop.settings.city, 'Plovdiv');
  assert.equal(desktop.settings.venue, 'Venue changed in Web');
  assert.equal(desktop.players[0].club, 'Desktop Club');
  assert.equal(desktop.cloud.internalId, INTERNAL_ID);
  assert.equal(desktop.cloud.cloudTournamentId, CLOUD_ID);
  assert.equal(desktop.cloud.localKey, 'desktop-install:one');
  assert.equal(desktop.cloud.baseRevision, 4);

  const finalPortable: any = store.read().snapshot.data.tournaments[NAME];
  assert.equal(finalPortable.cloud.internalId, INTERNAL_ID);
  assert.equal(finalPortable.cloud.cloudTournamentId, CLOUD_ID);
  assert.equal(finalPortable.cloud.localKey, undefined, 'Installation-local key must never leak into Cloud snapshot.');
  assert.equal(Object.keys(store.read().snapshot.data.tournaments).length, 1, 'Lifecycle must keep exactly one private tournament record.');

  console.log('SYNC_FULL_LIFECYCLE_GATE=PASS');
  console.log('DESKTOP_WEB_DESKTOP_AFTER_PUBLIC_PUBLISH=PASS');
  console.log('PRIVATE_INTERNAL_ID_STABLE=PASS');
  console.log('PUBLICATION_METADATA_FINGERPRINT_ISOLATED=PASS');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
