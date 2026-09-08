import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPrivateSnapshot, extractPrivateTournament } from '../onlineCloudSync';

const legacyTournament: any = {
  settings: {
    organizer: 'Organizer X', chiefArbiter: 'Kyamran Bilyal', arbiter: 'Deputy', director: 'Director',
    tnr: '', venue: 'Hall A', city: 'Sofia', country: 'BUL', timeControl: '90+30', timeControlPreset: '90+30',
    customTimeControl: '', startDate: '2026-09-07T09:00', endDate: '2026-09-07T23:01', generalRegistrationDeadline: '',
    rounds: '7', lastSwissRounds: '', roundRobinCycles: '1', tournamentFormat: 'Individual Swiss', pairingSystem: 'FIDE Dutch System',
    fideRated: 'No', tournamentRatingType: 'Standard', initialRankSorting: 'automatic', initialRatingSource: 'fide', pairingScoreSystem: 'Game points (1, ½, 0)',
    tournamentType: 'test', liveLink: 'https://example.test/live', website: 'https://example.test', email: 'arbiter@example.test', phone: '+359000', fideEventId: '490658', generalNotes: 'Notes'
  },
  telegram: { channel: '', language: 'en', signature: '' },
  chessResults: { sourceId: 21, creatorId: 0, clientId: '', key: '', mode: 'test', federation: 'XXX', createdAt: '', lastUpload: '', uploadStatus: '', lastError: '', publishCount: 0, lastConnectionTest: '', sidVerified: false, freshTnrRequired: false, pinBoardEnabled: false, pinBoardText: '', activityLog: [] },
  pairings: { server: '', round: '', results: '', showScheduleOnPrint: false, liveBoards: {}, finalStandingsPromptedRound: 0, engine: { mode: '', excluded: [], lastGeneratedRound: 0, lastEngineMessage: '', excludeRemaining: {}, excludeRounds: {}, manualByes: {}, fixedBoards: {}, roundActivationConfirmed: {}, playerStatusCollapsed: false, needsResort: false, registrationsDirty: false, syncedAbsent: {}, registrationSyncedAt: '', registrationSyncedForRound: 0, registrationSyncedSignature: '', firstRoundRegistrationLocked: false, firstRoundRegistrationSyncedSignature: '', firstRoundRegistrationNeedsResort: false, firstRoundRegistrationSyncedAt: '' } },
  schedule: { registrationOpens: '', registrationCloses: '', technicalMeeting: '', openingCeremony: '', closingCeremony: '', awardCeremony: '', notes: 'Schedule note', rows: [{ no: '1', dateTime: '2026-09-07T09:00', event: 'Round 1', description: '' }] },
  regulations: { eligibility: 'Open', format: 'Individual Swiss', rounds: '7', timeControl: '90+30', pairingSystem: 'FIDE Dutch System', rating: 'Unrated', defaultTime: '', drawRules: '', pabPoints: '1.0', tieBreaks: ['Buchholz'], tieBreakOptions: {}, entryFee: '10', registrationDeadline: '', maximumPlayers: '100', fideInfo: '', totalPrizeFund: '1000', mainPrizes: '', specialPrizes: '', categoryPrizes: '', additional: 'Regulations' },
  players: [
    { id: 1, localKey: 'p1', name: 'Zulu, Player', rating: 1800, fed: 'BUL', fideId: '1', birth: '1990', gender: 'm', title: '', attendance: 'present', pairingNumber: 2, joinedFromRound: 1 },
    { id: 2, localKey: 'p2', name: 'Alpha, Player', rating: 2200, fed: 'BUL', fideId: '2', birth: '1991', gender: 'm', title: 'FM', attendance: 'present', pairingNumber: 1, joinedFromRound: 1 }
  ]
};

const legacySnapshot: any = {
  version: 'V99',
  data: { currentTournament: 'Tournament Ubuntu', tournaments: { 'Tournament Ubuntu': legacyTournament }, preferences: {} },
  currentTournament: 'Tournament Ubuntu'
};
const parsed = extractPrivateTournament(legacySnapshot, 'fallback');
assert.equal(parsed.name, 'Tournament Ubuntu');
assert.equal(parsed.tournament.name, 'Tournament Ubuntu', 'Desktop map-key tournament name must hydrate into Web tournament.name.');
assert.deepEqual(parsed.tournament.settings, legacyTournament.settings, 'Every Tournament Setup setting must survive Desktop -> Web extraction unchanged.');
assert.deepEqual(parsed.tournament.regulations, legacyTournament.regulations, 'Regulations must survive Desktop -> Web extraction unchanged.');
assert.deepEqual(parsed.tournament.schedule, legacyTournament.schedule, 'Schedule must survive Desktop -> Web extraction unchanged.');
assert.deepEqual(parsed.tournament.players, legacyTournament.players, 'Player roster must survive Desktop -> Web extraction unchanged.');

const rebuilt: any = buildPrivateSnapshot('Tournament Ubuntu', parsed.tournament);
const roundtrip = rebuilt.data.tournaments['Tournament Ubuntu'];
assert.equal(roundtrip.name, 'Tournament Ubuntu');
assert.deepEqual(roundtrip.settings, legacyTournament.settings, 'Every setup field must survive Web -> Cloud serialization unchanged.');
assert.deepEqual(roundtrip.regulations, legacyTournament.regulations);
assert.deepEqual(roundtrip.schedule, legacyTournament.schedule);
assert.deepEqual(roundtrip.players, legacyTournament.players);

const setup = readFileSync(resolve(process.cwd(), 'src/companion/CompanionSetup.tsx'), 'utf8');
const registration = readFileSync(resolve(process.cwd(), 'src/companion/CompanionRegistration.tsx'), 'utf8');
const workspace = readFileSync(resolve(process.cwd(), 'src/companion/CompanionWorkspace.tsx'), 'utf8');
const actions = readFileSync(resolve(process.cwd(), 'src/companion/companionCloudActions.ts'), 'utf8');
assert.doesNotMatch(setup, /organizer:\s*previous\.settings\.organizer\s*\|\|\s*name/, 'Editing tournament name must never populate Organizer implicitly.');
assert.match(registration, /'starting' \| 'rating' \| 'name'/, 'Web roster must expose Starting #, Rating and Name sort modes.');
assert.match(registration, /Rating ↓/);
assert.match(registration, /Name A–Z/);
assert.match(registration, /sorting never changes official starting numbers or pairing numbers/);
assert.match(workspace, /Pull Cloud → Web/);
assert.match(workspace, /Push Web → Cloud/);
assert.doesNotMatch(workspace, /window\.addEventListener\('focus', onFocus\)/, 'Web must not silently Pull merely because the browser regained focus.');
assert.match(actions, /async function pullChangesOnly/);
assert.match(actions, /A Pull command must never upload Web changes/);
assert.match(actions, /Cloud has newer Desktop changes or a synchronization conflict\. Pull Cloud → Web before pushing or publishing\./);
assert.match(actions, /resolveConflict: \(tournament: Tournament\) => smartPullChanges/);
console.log('PASS Companion sync contract: full Desktop/Web tournament parity + directional Pull/Push + safe roster view sorting.');
