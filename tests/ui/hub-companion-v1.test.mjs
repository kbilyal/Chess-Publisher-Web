import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const workspace = fs.readFileSync('src/companion/CompanionWorkspace.tsx', 'utf8');
const cloudActions = fs.readFileSync('src/companion/companionCloudActions.ts', 'utf8');
const cloudProvider = fs.readFileSync('src/cloud/OnlineCloudProviderV2.tsx', 'utf8');
const setup = fs.readFileSync('src/companion/CompanionSetup.tsx', 'utf8');
const registration = fs.readFileSync('src/companion/CompanionRegistration.tsx', 'utf8');
const cloudScreens = fs.readFileSync('src/companion/CompanionCloudScreens.tsx', 'utf8');
const browserFide = fs.readFileSync('src/companion/fideBrowserDatabase.ts', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
const vite = fs.readFileSync('vite.config.ts', 'utf8');
const css = fs.readFileSync('src/companion.css', 'utf8');
const cloudCss = fs.readFileSync('src/companion-cloud.css', 'utf8');
const publishCss = fs.readFileSync('src/companion-publish-v2.css', 'utf8');
const conflictCss = fs.readFileSync('src/companion-conflict.css', 'utf8');
const registrationCss = fs.readFileSync('src/companion-registration.css', 'utf8');
const setupCss = fs.readFileSync('src/companion-setup.css', 'utf8');
const sync = fs.readFileSync('src/cloud/onlineCloudSync.ts', 'utf8');
const cloudApi = fs.readFileSync('src/cloud/cloudWorkspaceApi.ts', 'utf8');
const hubApi = fs.readFileSync('src/cloud/hubApi.ts', 'utf8');
const chessApi = fs.readFileSync('src/chessResults/api.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

const has = (source, marker, message) => assert.ok(source.includes(marker), message || `Missing ${marker}`);
const lacks = (source, marker, message) => assert.ok(!source.includes(marker), message || `Forbidden ${marker}`);

has(app, 'useOnlineCloud()', 'Production App must obtain the authoritative Cloud workspace context.');
has(app, 'createCompanionCloudFacade(cloud)', 'Production App must layer only Companion-safe cloud actions over the authoritative provider.');
has(app, '<CompanionWorkspace cloud={companionCloud}', 'Production App must delegate presentation to the focused Companion workspace facade.');

has(workspace, "type CompanionTab = 'setup' | 'players' | 'publish'", 'Web Companion must expose only Setup, Players and Publish workspaces.');
has(workspace, '<CompanionSetup', 'Focused Tournament Setup workspace must remain available.');
lacks(workspace, '<TournamentSetupTab', 'Desktop Tournament Setup workspace must not be embedded in the focused Web Companion.');
has(workspace, '<CompanionRegistration', 'Focused Player Registration workspace must remain available.');
lacks(workspace, '<PlayersTab', 'Desktop Players workspace must not be embedded in the focused Web Companion.');
has(workspace, 'publishChessResults', 'Chess-Results publication must remain available.');
has(workspace, 'cloud.publishOnline', 'Online Hub publication must remain available.');
has(workspace, 'cloud.syncNow', 'Web edits must synchronize through the private Cloud Workspace.');
has(workspace, 'cloud.pullChanges', 'Desktop changes must be pullable into Web.');
lacks(workspace, "window.addEventListener('focus'", 'Returning to the browser must not silently Pull Cloud data over the open tournament.');
has(workspace, 'Pull Cloud → Web', 'Web must expose an explicit Cloud-to-Web Pull action.');
has(workspace, 'Push Web → Cloud', 'Web must expose an explicit Web-to-Cloud Push action.');
has(workspace, 'companion-mobile-nav', 'Mobile must use a dedicated app navigation surface.');
has(workspace, '>Tournaments</span>', 'Mobile must provide a direct return to synchronized tournament list.');
has(workspace, 'companion-conflict-action', 'A sync conflict must expose an actionable phone-friendly resolver.');
has(workspace, 'Resolve conflict', 'Conflict resolution must be an explicit separate action.');
has(workspace, 'Safe conflict resolution completed where fields did not overlap.', 'Conflict resolution result must be explained to the user.');

has(cloudActions, 'mergeCompanionTournamentChanges', 'Companion-safe three-way merge helper is missing.');
has(cloudActions, 'cloudApi.getRevisionSnapshot', 'Smart merge must reconstruct the exact common base revision.');
has(cloudActions, 'cloudApi.getSnapshot', 'Smart merge must read the latest remote tournament before merging.');
lacks(cloudActions, 'cloudApi.putSnapshot', 'Resolve Conflict must never auto-Push a merged tournament; Push remains an explicit user action.');
has(cloudActions, 'return cloud.pullChanges(hydrated)', 'Existing provider must refresh conflict state after a local-only safe merge without uploading it.');
has(cloudActions, 'return cloud.pullChanges(tournament)', 'Unproven merges must fail closed through the existing three-way workflow.');
has(cloudActions, 'hubApi.listOrganizerTournaments', 'Open public Hub page must recover an existing organizer-owned Hub link.');
has(cloudActions, 'text(item.localKey) === internalId', 'Hub page recovery must use the shared Desktop/Web tournament identity.');

has(setup, "updateSetting('country'", 'Focused setup must edit the tournament federation on the same Tournament object.');
has(setup, 'changeFormat', 'Focused setup must preserve tournament format/pairing-system linkage.');
has(setup, 'changeTimeControlPreset', 'Focused setup must preserve time-control/rating-type linkage.');
has(setup, 'generalRegistrationDeadline', 'Focused setup must retain registration timing metadata.');
has(setup, 'chiefArbiter', 'Focused setup must retain official tournament staff metadata.');
has(setup, 'Additional regulations', 'Focused setup must retain public regulations text.');

has(registration, '/api/fide/search', 'Registration must try the product FIDE service first.');
has(registration, 'searchFideBrowserDatabase', 'Registration must keep a static official FIDE database fallback for Pages/mobile production.');
has(registration, 'executeRegisterPlayerTransaction', 'Registration must reuse protected player registration transactions.');
has(registration, 'executeDeletePlayerTransaction', 'Registration must reuse protected deletion/history guards.');
has(registration, 'executeBulkStatusTransaction', 'Registration must reuse protected attendance/status transactions.');
has(registration, 'rankLocked ? latestRound + 1 : 1', 'Late registration must respect starting-rank lock and round history.');
has(registration, 'Manual player', 'Manual player registration fallback is required.');
has(browserFide, "const DATABASE_URL = '/fide/fide_ratings.sqlite'", 'Browser FIDE fallback must use the packaged official SQLite database.');
has(browserFide, "const SQL_WASM_URL = '/vendor/sql-wasm.wasm'", 'Browser FIDE fallback must load sql.js WASM from a deterministic packaged path.');
has(vite, 'data/fide/fide_ratings.sqlite', 'Production Vite build must package the official FIDE SQLite database.');
has(vite, 'node_modules/sql.js/dist/sql-wasm.wasm', 'Production Vite build must package the sql.js WASM runtime.');

has(cloudScreens, 'CompanionLoginScreen', 'Focused Organizer login surface is missing.');
has(cloudScreens, 'CompanionTournamentSelectScreen', 'Focused My Tournaments surface is missing.');
has(cloudScreens, 'My tournaments', 'My Tournaments navigation wording is missing.');
has(cloudScreens, 'New tournament', 'Web start page must create a new private tournament.');
has(cloudScreens, 'Import tournament', 'Web start page must expose unified tournament import.');
has(cloudScreens, '.trf,.trf16,.trf26,.txt,.tunx,.TUNX', 'Unified TRF/TUNX import file picker is missing.');
has(cloudProvider, 'async function continueWithLocal()', 'Underlying browser-local continuation logic must remain available even though its old UI card is removed.');
has(cloudProvider, 'const local = readLocalTournament();', 'Local continuation must still read the existing browser-local tournament state.');
lacks(cloudScreens, 'onContinueLocal', 'My Tournaments must not re-expose the obsolete local continuation action.');
lacks(cloudScreens, 'THIS BROWSER', 'The obsolete This Browser section must stay removed.');
lacks(cloudScreens, 'companion-local-continuation', 'The obsolete local continuation card must stay removed.');

const publishTargets = [...workspace.matchAll(/data-publish-target="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(publishTargets, ['chess-results', 'online-hub'], 'Publish workspace must have exactly two primary publication targets: Chess-Results and Online Hub.');
has(workspace, 'Publish to Chess-Results', 'Primary Chess-Results publication button is missing.');
has(workspace, 'Publish to Online Hub', 'Primary Online Hub publication button is missing.');
has(workspace, 'data-hub-public-page-action', 'Public Hub page quick action must be visible in the main Publish panel.');
has(workspace, 'Open public Hub page', 'Open public Hub page action is missing.');
has(workspace, 'onClick={openHubPage}', 'Public Hub page action must use the recoverable Hub page resolver.');
lacks(workspace, 'disabled={!publicHubUrl', 'Public Hub page action must not be disabled only because this browser lacks cached Hub metadata.');
has(workspace, 'already exists on the Hub', 'Missing local Hub metadata must explain automatic Hub link recovery.');
has(workspace, 'const current = adoptSynchronizedTournament()', 'Chess-Results must publish the synchronized Desktop/Cloud tournament revision, not stale browser state.');
has(workspace, 'const synchronized = adoptSynchronizedTournament()', 'Online Hub must publish the synchronized Desktop/Cloud tournament revision.');

const publishOnlineBody = cloudProvider.split('async function publishOnline(tournamentInput: Tournament) {', 2)[1]?.split('function openPublicPage', 1)[0] || '';
has(publishOnlineBody, 'commitLocal(tournament, false)', 'Successful Online Hub publish must persist metadata without remounting the Companion workspace.');
lacks(publishOnlineBody, 'commitLocal(tournament, true)', 'Online Hub publish must not remount the workspace and reset Publish back to Setup.');

has(workspace, 'isSourceIdMismatch', 'Chess-Results source mismatch must be recognized explicitly instead of surfacing the raw bridge error.');
has(workspace, 'data-chess-results-source-recovery', 'Incompatible external TNR must expose a dedicated recovery action.');
has(workspace, 'Create new Chess-Publisher TNR', 'Source mismatch recovery must require an explicit one-tap new-TNR action.');
has(workspace, 'Chess-Publisher Source 21 is fixed by the official interface.', 'Recovery UI must keep the assigned Chess-Publisher source fixed rather than changing the bridge source.');
has(workspace, 'sourceId: Number(created?.sourceId || 21)', 'Fresh GETKEY assignment must record Chess-Publisher Source 21 in the synchronized tournament.');
has(workspace, 'GETKEY keys must be saved immediately', 'A newly issued replacement TNR must be persisted before the first upload attempt.');
has(workspace, 'Replaced incompatible TNR ${oldKey} with Chess-Publisher TNR ${freshKey}.', 'Replacement must leave an audit trail instead of silently discarding the previous TNR.');
lacks(workspace.toLowerCase(), 'swiss-manager', 'The Web Companion must not leak another program name in source-mismatch recovery UI or code.');

for (const removedView of [
  '../components/PairingsTab',
  '../components/StandingsTab',
  '../components/TieBreaksTab',
  '../components/ScheduleTab',
  '../components/ExportTrfTab',
  'DGT'
]) lacks(workspace, removedView, `Desktop-only workspace leaked into the Web Companion: ${removedView}`);

has(main, "import './companion.css';", 'Companion responsive design must be loaded.');
has(main, "import './companion-cloud.css';", 'Organizer login and My Tournaments design must be loaded.');
has(main, "import './companion-publish-v2.css';", 'Two-target publication design must be loaded.');
has(main, "import './companion-registration.css';", 'Focused registration design must be loaded.');
has(main, "import './companion-setup.css';", 'Focused setup design must be loaded.');
has(main, "import './companion-conflict.css';", 'Conflict resolver mobile presentation must be loaded.');
lacks(main, 'ui-v6-approved.css', 'Legacy UI v6 shell must not be loaded by the new React Companion.');

has(css, '--cp-sidebar: 248px', 'Desktop Companion sidebar is missing.');
has(css, '@media (max-width: 768px)', 'Phone layout breakpoint is missing.');
has(css, 'grid-template-columns: repeat(4, minmax(0, 1fr))', 'Four-slot mobile navigation is missing.');
has(css, 'env(safe-area-inset-bottom)', 'Mobile safe-area support is missing.');
has(css, 'touch-action: manipulation', 'Mobile touch targets are not hardened.');
has(cloudCss, '@media (max-width: 560px)', 'My Tournaments/login surfaces must have a dedicated phone layout.');
has(cloudCss, '.companion-tournament-grid { grid-template-columns:1fr;', 'My Tournaments cards must collapse to one column on mobile.');
has(cloudCss, 'font-size:16px', 'Organizer Token input must avoid mobile browser zoom.');
has(publishCss, 'grid-template-columns: repeat(2, minmax(0, 1fr))', 'Desktop publication actions must be presented as two equal primary targets.');
has(publishCss, '.companion-publish-quick-actions', 'Public Hub quick action layout is missing.');
has(publishCss, '@media (max-width: 900px)', 'Publication actions must collapse reliably on smaller screens.');
has(publishCss, 'touch-action: manipulation', 'Mobile publication buttons must be touch hardened.');
has(conflictCss, '.companion-conflict-action', 'Conflict action styling is missing.');
has(conflictCss, 'grid-column: 1 / -1', 'Conflict action must become a full-width phone action.');
has(conflictCss, 'min-height: 46px', 'Conflict action must remain finger-friendly on mobile.');
has(registrationCss, '@media (max-width: 640px)', 'Registration must have a dedicated phone layout.');
has(registrationCss, 'grid-template-areas:', 'Registration rows must reflow instead of horizontally overflowing on phones.');
has(registrationCss, 'font-size: 16px', 'Mobile registration inputs must avoid browser zoom and remain finger-friendly.');
has(setupCss, '@media (max-width: 640px)', 'Setup must have a dedicated phone layout.');
has(setupCss, 'grid-template-columns: 1fr', 'Setup fields must collapse to one column on phones.');
has(setupCss, 'font-size: 16px', 'Mobile setup inputs must avoid browser zoom and remain finger-friendly.');

has(sync, 'PORTABLE_FINGERPRINT_SCHEMA = 6', 'Shared Desktop/Web directional tournament fingerprint contract must remain present.');
has(sync, "export type ThreeWayDecision = 'equal' | 'cloud-only' | 'local-only' | 'conflict'", 'Three-way sync conflict protection must remain authoritative.');
has(sync, 'buildPrivateSnapshot', 'Full private tournament snapshot must remain the synchronization payload.');
has(sync, 'delete next.dgt', 'DGT remains device-local and excluded from private Web sync.');
has(pkg, 'runCompanionConflictMergeTests.ts', 'Cloud roundtrip gate must execute the Companion smart-merge regression.');

has(cloudApi, '/api/v1/cloud/tournaments', 'Private Cloud tournament API is missing.');
has(cloudApi, "'X-Expected-Revision'", 'Cloud optimistic revision guard is missing.');
has(hubApi, 'publishOwnedTournament', 'Organizer-owned Online Hub publication API is missing.');
has(chessApi, '/api/chess-results/', 'Chess-Results must remain behind the server-side product API.');

console.log('PASS Hub Companion v1 contract: focused Setup + Registration + My Tournaments + exactly two guarded publication targets, safe Desktop/Web conflict merge, source-safe Chess-Results TNR recovery, recoverable public Hub page action, browser FIDE fallback and responsive mobile/desktop shell.');
