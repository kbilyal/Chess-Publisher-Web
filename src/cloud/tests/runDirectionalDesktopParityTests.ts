import assert from 'node:assert/strict';
import {
  buildPrivateSnapshot,
  extractPrivateTournament,
  fingerprintTournament,
  preserveInstallationLocalFields,
  PORTABLE_FINGERPRINT_SCHEMA
} from '../onlineCloudSync';

const players = Array.from({ length: 83 }, (_, i) => ({
  id: `p${i + 1}`,
  localKey: `player:${i + 1}`,
  pairingNumber: i + 1,
  name: `Player ${String(i + 1).padStart(2, '0')}`,
  fideId: String(1000000 + i),
  fed: i % 2 ? 'BUL' : 'TUR',
  rating: 2400 - i
}));

const desktop: any = {
  name: 'Tournament Ubuntu',
  settings: {
    organizer: 'Chess Club',
    chiefArbiter: 'Kyamran Bilyal',
    arbiter: 'Deputy Arbiter',
    director: 'Director',
    venue: 'Hall A',
    city: 'Sofia',
    country: 'BUL',
    timeControl: '90+30',
    startDate: '2026-10-01',
    endDate: '2026-10-05',
    rounds: 7,
    tournamentFormat: 'Individual Swiss',
    pairingSystem: 'FIDE Dutch System',
    fideRated: 'Yes',
    tournamentRatingType: 'Standard',
    tournamentType: 'Test',
    fideEventId: '497756'
  },
  regulations: { text: 'Regulations', additional: 'Portable attachment metadata' },
  schedule: { rounds: [{ round: 1, date: '2026-10-01' }] },
  players,
  pairings: { rounds: [] },
  requestedByes: {},
  attendance: {},
  standings: {},
  specialPrizeConfig: { groups: [{ name: 'U18' }] },
  chessResults: { tnr: '123456' },
  online: { hubTournamentId: 'hub-42', publicSlug: 'ubuntu-open', revision: 7 },
  hub: { tournamentId: 'hub-42', publicSlug: 'ubuntu-open', manageToken: 'LOCAL-MANAGE-SECRET' },
  dgt: { port: '/dev/ttyUSB0', boardMapping: [{ serial: 'LOCAL-DGT' }] },
  telegram: { chatId: '123', token: 'LOCAL-TG-SECRET' },
  cloud: {
    schemaVersion: 4,
    internalId: 'tournament:ABC',
    localKey: 'desktop-install:1',
    cloudTournamentId: 'cloud-77',
    baseRevision: 18,
    baseFingerprint: 'desktop-base'
  }
};

const snapshot = buildPrivateSnapshot(desktop.name, desktop);
const portable: any = snapshot.data.tournaments['Tournament Ubuntu'];
assert.equal(snapshot.data.currentTournament, 'Tournament Ubuntu');
assert.equal(portable.name, 'Tournament Ubuntu');
assert.equal(portable.players.length, 83);
assert.equal(portable.settings.chiefArbiter, 'Kyamran Bilyal');
assert.equal(portable.settings.city, 'Sofia');
assert.equal(portable.settings.country, 'BUL');
assert.equal(portable.settings.timeControl, '90+30');
assert.equal(portable.settings.rounds, 7);
assert.equal(portable.settings.tournamentType, 'Test');
assert.deepEqual(portable.regulations, desktop.regulations);
assert.deepEqual(portable.schedule, desktop.schedule);
assert.equal(portable.cloud.internalId, 'tournament:ABC');
assert.equal(portable.cloud.cloudTournamentId, 'cloud-77');
assert.equal(snapshot.cloudWorkspace.internalId, 'tournament:ABC');
assert.equal(snapshot.cloudWorkspace.cloudTournamentId, 'cloud-77');
assert.equal(snapshot.cloudWorkspace.fingerprintContentSchema, PORTABLE_FINGERPRINT_SCHEMA);
assert.equal(portable.hub.tournamentId, 'hub-42');
assert.equal(portable.hub.manageToken, undefined);
assert.equal(portable.telegram.token, undefined);
assert.equal(portable.dgt, undefined);
assert.deepEqual(
  portable.players.map((p: any) => [p.id, p.localKey, p.pairingNumber]),
  desktop.players.map((p: any) => [p.id, p.localKey, p.pairingNumber])
);

const legacy = JSON.parse(JSON.stringify(snapshot));
delete legacy.data.tournaments['Tournament Ubuntu'].name;
assert.equal(extractPrivateTournament(legacy).tournament.name, 'Tournament Ubuntu');

const hydrated: any = preserveInstallationLocalFields(portable, desktop, {
  cloudTournamentId: 'cloud-77',
  baseRevision: 19,
  baseFingerprint: await fingerprintTournament(portable)
});
assert.equal(hydrated.cloud.internalId, 'tournament:ABC');
assert.equal(hydrated.cloud.cloudTournamentId, 'cloud-77');
assert.equal(hydrated.cloud.localKey, 'desktop-install:1');
assert.equal(hydrated.dgt.port, '/dev/ttyUSB0');
assert.equal(hydrated.hub.manageToken, 'LOCAL-MANAGE-SECRET');
assert.equal(hydrated.telegram.token, 'LOCAL-TG-SECRET');

console.log('DESKTOP_WEB_FULL_SNAPSHOT_PARITY=PASS');
console.log('ROSTER_83_PARITY=PASS');
console.log('TOURNAMENT_IDENTITY_RENAME_SAFE=PASS');
console.log('INSTALLATION_LOCAL_FIELDS_PRESERVED=PASS');
