import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildPrivateSnapshot,
  extractPrivateTournament,
  fingerprintPayload,
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

const goldenFingerprintTournament: any = {
  name: 'Tournament Ubuntu',
  settings: { organizer: 'Chess Club', city: 'Sofia' },
  players: [{ id: 'p1', localKey: 'player:1', pairingNumber: 1, name: 'Alpha' }],
  online: { hubTournamentId: 'hub-42', revision: 19, lastPublishedAt: '2026-09-08T16:31:00Z' },
  hub: { tournamentId: 'hub-42', manageToken: 'LOCAL-HUB' },
  telegram: { chatId: '123', token: 'LOCAL-TG' },
  dgt: { port: '/dev/ttyUSB0' },
  cloud: { schemaVersion: 4, internalId: 'tournament:ABC', cloudTournamentId: 'cloud-77' },
  adminToken: 'LOCAL-ADMIN'
};
// Desktop beta.79 explicitly excludes private-cloud linkage and public Hub/
// publication metadata from the tournament-content hash. Keep this vector tied
// to production-web/webview/CloudWorkspaceAdapter.js, not to transport content.
const GOLDEN_PAYLOAD = '{"name":"Tournament Ubuntu","players":[{"id":"p1","localKey":"player:1","name":"Alpha","pairingNumber":1}],"settings":{"city":"Sofia","organizer":"Chess Club"},"telegram":{"chatId":"123"}}';
const GOLDEN_HASH = '9e01b268585f29a680087aad3039ddea06e50468d5e3fb714225e0256c43b781';
assert.equal(fingerprintPayload(goldenFingerprintTournament), GOLDEN_PAYLOAD, 'Web fingerprint payload must exactly match the protected Desktop beta.79 content projection');
assert.equal(await fingerprintTournament(goldenFingerprintTournament), GOLDEN_HASH, 'Web golden fingerprint hash mismatch');

console.log('DESKTOP_WEB_FULL_SNAPSHOT_PARITY=PASS');
console.log('ROSTER_83_PARITY=PASS');
console.log('TOURNAMENT_IDENTITY_RENAME_SAFE=PASS');
console.log('INSTALLATION_LOCAL_FIELDS_PRESERVED=PASS');
console.log('DESKTOP_WEB_GOLDEN_FINGERPRINT=PASS');

const providerSource = readFileSync('src/cloud/OnlineCloudProviderV2.tsx', 'utf8');
const desktopTabSource = readFileSync('src/cloud/OnlineCloudTabV2.tsx', 'utf8');
const companionActionsSource = readFileSync('src/companion/companionCloudActions.ts', 'utf8');
const pullBody = providerSource.split('async function pullChanges(tournamentInput: Tournament) {', 2)[1]?.split('async function syncNow(tournamentInput: Tournament) {', 1)[0] || '';
assert.ok(pullBody.includes('Pull Cloud → Desktop found no remote snapshot; no upload occurred.'), 'Pull must fail directionally when Cloud has no snapshot.');
assert.ok(pullBody.includes('Pull Cloud → Desktop detected local-only changes and did not upload them.'), 'Pull must leave Desktop-only edits local.');
assert.equal(pullBody.includes('cloudApi.putSnapshot('), false, 'Pull Cloud → Desktop must never upload a snapshot.');
assert.ok(desktopTabSource.includes('Pull Cloud → Desktop'));
assert.ok(desktopTabSource.includes('Push Desktop → Cloud'));
assert.ok(desktopTabSource.includes('Check Cloud Status'));
assert.ok(desktopTabSource.includes('Resolve Conflict'));
assert.ok(desktopTabSource.includes('Open in Web'));
assert.ok(companionActionsSource.includes('export async function checkCloudStatusOnly'), 'Cloud status check must be read-only and reusable by Desktop/Web.');
const resolveBody = companionActionsSource.split('async function smartPullChanges(cloud: any, tournament: Tournament) {', 2)[1]?.split('async function syncNowConfirmed(cloud: any, tournament: Tournament) {', 1)[0] || '';
assert.equal(resolveBody.includes('cloudApi.putSnapshot('), false, 'Resolve Conflict must save a safe merge locally and require an explicit Push afterwards.');
assert.ok(resolveBody.includes('Resolve Conflict is intentionally local-only.'));
console.log('DESKTOP_DIRECTIONAL_CONTROL_PANEL=PASS');
