import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPrivateSnapshot, extractPrivateTournament } from '../onlineCloudSync';
import { FEDERATIONS, getFederationFlagUrl } from '../../data/initialData';

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
const provider = readFileSync(resolve(process.cwd(), 'src/cloud/OnlineCloudProviderV2.tsx'), 'utf8');
assert.doesNotMatch(setup, /organizer:\s*previous\.settings\.organizer\s*\|\|\s*name/, 'Editing tournament name must never populate Organizer implicitly.');
assert.match(registration, /'starting' \| 'rating' \| 'name'/, 'Web roster must expose Starting #, Rating and Name sort modes.');
assert.match(registration, /Rating ↓/);
assert.match(registration, /Name A–Z/);
assert.match(registration, /sorting never changes official starting numbers or pairing numbers/);

// Visible Organizer UI has one safe bidirectional action. Directional Pull/Push
// remain internal primitives only, so the dispatcher can preserve beta.79 safety.
assert.match(workspace, /const unifiedSync = async \(\) =>/);
assert.match(workspace, /data-unified-sync="true"/);
assert.match(workspace, /Unified ↕ SYNC/);
assert.doesNotMatch(workspace, /Pull Cloud → Web/, 'Legacy visible Pull action must not return beside unified SYNC.');
assert.doesNotMatch(workspace, /Push Web → Cloud/, 'Legacy visible Push action must not return beside unified SYNC.');
assert.doesNotMatch(workspace, /Pull latest Cloud → Web/, 'Legacy publish-page Pull action must not return.');
assert.match(workspace, /state\?\.kind === 'remote-changes'[\s\S]*cloud\.pullChanges\(current\)/, 'Unified SYNC must Pull a proven Cloud-only change.');
assert.match(workspace, /state\?\.kind === 'local-changes'[\s\S]*cloud\.syncNow\(current\)/, 'Unified SYNC must Push a proven Web-only change.');
assert.match(workspace, /state\?\.kind === 'in-sync'[\s\S]*↕ SYNC: no changes/, 'Unified SYNC must have an explicit no-op path.');
assert.match(workspace, /Desktop\/Cloud and Web both changed after the common base/, 'Unified SYNC must stop safely on a true two-sided conflict.');
assert.doesNotMatch(workspace, /window\.addEventListener\('focus', onFocus\)/, 'Web must not silently Pull merely because the browser regained focus.');

// Internal directional helpers remain protected and are not exposed as competing UI actions.
assert.match(actions, /async function pullChangesOnly/);
assert.match(actions, /A Pull command must never upload Web changes/);
assert.match(actions, /Cloud has newer Desktop changes or a synchronization conflict\. Pull Cloud → Web before pushing or publishing\./);
assert.match(actions, /resolveConflict: \(tournament: Tournament\) => smartPullChanges/);
assert.match(actions, /resolveConflictWithStrategy: \(tournament: Tournament, strategy: 'web' \| 'cloud'\)/);
assert.match(provider, /const FINGERPRINT_SCHEMA = PORTABLE_FINGERPRINT_SCHEMA;/, 'Provider fingerprint schema must track the portable-content fingerprint schema.');
assert.match(provider, /cloud\.fingerprintContentSchema \|\| cloud\.fingerprintSchema/, 'Provider must reject stale base fingerprints from older content schemas.');
assert.ok((provider.match(/cloud\.revision === baseRevision/g) || []).length >= 2, 'Automatic sync and Pull must use revision equality to avoid false two-sided conflicts.');
assert.match(actions, /revision === baseRevision[\s\S]*baseFingerprint = remoteFingerprint/, 'Directional Pull/status must use revision equality to recover the common base after a fingerprint-schema upgrade.');
assert.match(actions, /if \(cloud\?\.conflict\) await cloud\.pullChanges\(local\);/, 'A stale false-positive conflict flag must be clearable through the pull-only provider path without uploading local edits.');
assert.ok(FEDERATIONS.length >= 201, 'Web/Desktop federation catalogue must include the full FIDE member set, not a short curated subset.');
assert.equal(FEDERATIONS.find(item => item[0] === 'GRE')?.[2], 'GR', 'GRE must map to the Greece flag asset.');
assert.equal(getFederationFlagUrl('GRE'), 'https://flagcdn.com/gr.svg', 'Web Companion must use a real image flag for Greece instead of Windows regional-letter glyphs.');
assert.match(setup, /getFederationFlagUrl\(settings\.country\)/, 'Companion federation selector must render a real selected flag image.');
assert.doesNotMatch(setup, /getFederationFlag\(code\)/, 'Companion native select text must not render Windows GR-style regional-letter glyphs.');
assert.match(workspace, /Keep Web/, 'Same-field conflict UI must expose an explicit Web winner.');
assert.match(workspace, /Use Cloud/, 'Same-field conflict UI must expose an explicit Cloud winner.');
assert.match(actions, /kind: 'needs-choice'/, 'Safe conflict resolution must stop for explicit same-field choice.');
console.log('PASS Companion sync contract: full Desktop/Web tournament parity + one unified SYNC UI + protected directional internals + safe roster sorting.');
