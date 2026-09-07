import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const workspace = fs.readFileSync('src/companion/CompanionWorkspace.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
const css = fs.readFileSync('src/companion.css', 'utf8');
const publishCss = fs.readFileSync('src/companion-publish-v2.css', 'utf8');
const sync = fs.readFileSync('src/cloud/onlineCloudSync.ts', 'utf8');
const cloudApi = fs.readFileSync('src/cloud/cloudWorkspaceApi.ts', 'utf8');
const hubApi = fs.readFileSync('src/cloud/hubApi.ts', 'utf8');
const chessApi = fs.readFileSync('src/chessResults/api.ts', 'utf8');

const has = (source, marker, message) => assert.ok(source.includes(marker), message || `Missing ${marker}`);
const lacks = (source, marker, message) => assert.ok(!source.includes(marker), message || `Forbidden ${marker}`);

has(app, 'useOnlineCloud()', 'Production App must obtain the authoritative Cloud workspace context.');
has(app, '<CompanionWorkspace cloud={cloud}', 'Production App must delegate presentation to the focused Companion workspace.');

has(workspace, "type CompanionTab = 'setup' | 'players' | 'publish'", 'Web Companion must expose only Setup, Players and Publish workspaces.');
has(workspace, '<TournamentSetupTab', 'Tournament Setup must remain available.');
has(workspace, '<PlayersTab', 'Player Registration must remain available.');
has(workspace, 'publishChessResults', 'Chess-Results publication must remain available.');
has(workspace, 'cloud.publishOnline', 'Online Hub publication must remain available.');
has(workspace, 'cloud.syncNow', 'Web edits must synchronize through the private Cloud Workspace.');
has(workspace, 'cloud.pullChanges', 'Desktop changes must be pullable into Web.');
has(workspace, "window.addEventListener('focus'", 'Returning to the browser must trigger a desktop/cloud revision check.');
has(workspace, 'companion-mobile-nav', 'Mobile must use a dedicated app navigation surface.');
has(workspace, '>Tournaments</span>', 'Mobile must provide a direct return to synchronized tournament list.');

const publishTargets = [...workspace.matchAll(/data-publish-target="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(publishTargets, ['chess-results', 'online-hub'], 'Publish workspace must have exactly two primary publication targets: Chess-Results and Online Hub.');
has(workspace, 'Publish to Chess-Results', 'Primary Chess-Results publication button is missing.');
has(workspace, 'Publish to Online Hub', 'Primary Online Hub publication button is missing.');
has(workspace, 'const current = adoptSynchronizedTournament()', 'Chess-Results must publish the synchronized Desktop/Cloud tournament revision, not stale browser state.');
has(workspace, 'const synchronized = adoptSynchronizedTournament()', 'Online Hub must publish the synchronized Desktop/Cloud tournament revision.');

for (const removedView of [
  "../components/PairingsTab",
  "../components/StandingsTab",
  "../components/TieBreaksTab",
  "../components/ScheduleTab",
  "../components/ExportTrfTab",
  "DGT"
]) lacks(workspace, removedView, `Desktop-only workspace leaked into the Web Companion: ${removedView}`);

has(main, "import './companion.css';", 'Companion responsive design must be loaded.');
has(main, "import './companion-publish-v2.css';", 'Two-target publication design must be loaded.');
lacks(main, "ui-v6-approved.css", 'Legacy UI v6 shell must not be loaded by the new React Companion.');

has(css, '--cp-sidebar: 248px', 'Desktop Companion sidebar is missing.');
has(css, '@media (max-width: 768px)', 'Phone layout breakpoint is missing.');
has(css, 'grid-template-columns: repeat(4, minmax(0, 1fr))', 'Four-slot mobile navigation is missing.');
has(css, 'env(safe-area-inset-bottom)', 'Mobile safe-area support is missing.');
has(css, 'touch-action: manipulation', 'Mobile touch targets are not hardened.');
has(publishCss, 'grid-template-columns: repeat(2, minmax(0, 1fr))', 'Desktop publication actions must be presented as two equal primary targets.');
has(publishCss, '@media (max-width: 900px)', 'Publication actions must collapse reliably on smaller screens.');
has(publishCss, 'touch-action: manipulation', 'Mobile publication buttons must be touch hardened.');

has(sync, 'Desktop beta.4 contract', 'Shared Desktop/Web tournament identity contract must remain present.');
has(sync, "export type ThreeWayDecision = 'equal' | 'cloud-only' | 'local-only' | 'conflict'", 'Three-way sync conflict protection must remain authoritative.');
has(sync, 'buildPrivateSnapshot', 'Full private tournament snapshot must remain the synchronization payload.');
has(sync, 'delete next.dgt', 'DGT remains device-local and excluded from private Web sync.');

has(cloudApi, '/api/v1/cloud/tournaments', 'Private Cloud tournament API is missing.');
has(cloudApi, "'X-Expected-Revision'", 'Cloud optimistic revision guard is missing.');
has(hubApi, 'publishOwnedTournament', 'Organizer-owned Online Hub publication API is missing.');
has(chessApi, '/api/chess-results/', 'Chess-Results must remain behind the server-side product API.');

console.log('PASS Hub Companion v1 contract: Setup + Registration + exactly two guarded publication targets, shared Desktop identity, responsive mobile/desktop shell and secure publication paths.');
