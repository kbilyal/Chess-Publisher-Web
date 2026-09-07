import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const production = join(root, 'production-web');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const index = read('production-web/index.html');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const shell = index.replace(/<!-- cpProductionWeb .*?<\/body>/s, '</body>');
assert(
  createHash('sha256').update(shell).digest('hex') === '436f9e5c95f55a0163fb8c3256fadb0cd723ceec5054f2df1bb94f2dfece8f51',
  'protected desktop beta.34-aligned Web shell changed'
);

for (const file of [
  'production-web/web/linux-native-engine-adapter.js',
  'production-web/web/fide-browser-adapter.js',
  'production-web/web/player-registration-enhancements.js',
  'production-web/web/chess-results-browser-adapter.js',
  'production-web/web/tournament-setup-enhancements.js',
]) {
  assert(statSync(join(root, file)).isFile(), `missing recovered production adapter: ${file}`);
  assert(index.includes(`/${file.replace('production-web/', '')}`), `production shell does not load ${file}`);
}

const bridge = read('production-web/web/browser-dev-host.js');
const duplicateBridge = read('production-web/browser-dev-host.js');
const hub = read('production-web/webview/HubAdapter.js');
assert(bridge === duplicateBridge, 'browser bridge copies diverged');
assert(bridge.includes('window.__cpBrowserHostBridge=browserBridge'), 'browser-only credential bridge missing');
assert(!/window\.chrome\.webview\s*=/.test(bridge), 'browser bridge fakes Windows WebView2');
assert(hub.includes('window.chrome?.webview||window.__cpBrowserHostBridge'), 'Hub does not accept the browser-only credential bridge');

const engine = read('production-web/web/linux-native-engine-adapter.js');
assert(
  engine.includes('https://web.chess-publisher.org') &&
  engine.includes('https://engine.chess-publisher.org') &&
  engine.includes('https://chess-publisher-web-engine.kyamranbilyal.workers.dev') &&
  engine.includes('location.origin===CANONICAL_WEB_ORIGIN?CUSTOM_ENGINE_BASE:DIRECT_ENGINE_BASE') &&
  engine.includes('${ENGINE_PREFIX}/capabilities') &&
  engine.includes('${ENGINE_PREFIX}/pair'),
  'verified first-party Web engine wiring with direct fallback missing'
);
assert(engine.includes('Web engine is unavailable') && engine.includes('Pairing was not generated'), 'Web engine fail-closed message missing');
assert(engine.includes('nativeTransportError') && engine.includes('usedFallback:true'), 'Web engine transport/fallback diagnostics missing');
assert(!engine.includes('operations are Desktop only'), 'obsolete Desktop-only Web pairing blocker returned');
assert(!engine.includes('/api/prototype') && !engine.includes('generateLocalSwissFallback'), 'browser adapter contains a synthetic pairing fallback');

const players = read('production-web/web/player-registration-enhancements.js');
assert(players.includes('addManualPlayer') && players.includes('event.key!=="Enter"'), 'Add Player recovery missing');
assert(players.includes('manualFide'), 'FIDE ID input wiring missing');
assert(/Select all/i.test(index) && index.includes('Import Players') && index.includes('Export TRF Starting List'), 'existing selection/import/export controls were removed');

const fide = read('production-web/web/fide-browser-adapter.js');
assert(fide.includes('updateFideDatabaseNow({manual:true})'), 'Web FIDE button still uses the desktop-only updater');
assert(fide.includes('originalFetchFideZip(type)'), 'verified browser FIDE mirror fallback missing');
assert(fide.includes('fideMainDb.size'), 'FIDE browser adapter does not preserve the protected database state checks');
assert(!/SAMPLE_FIDE_PLAYERS|mock FIDE|prototype FIDE/i.test(fide), 'FIDE adapter contains sample or prototype player data');

const setup = read('production-web/web/tournament-setup-enhancements.js');
assert(setup.includes('Setup review') && setup.includes('Tie-break review'), 'Tournament Setup review recovery missing');
assert(index.includes('Generate Schedule') && index.includes('Smart Schedule'), 'existing Smart Schedule is missing');

const chessResults = read('production-web/web/chess-results-browser-adapter.js');
assert(chessResults.includes('window.chessResultsLocalJson=request'), 'Chess-Results browser transport wiring missing');
assert(chessResults.includes('await window.createChessResultsTournament()'), 'automatic new-TNR flow missing');
assert(chessResults.includes('Chess-Results backend not connected'), 'Chess-Results fail-clear message missing');
assert(!/AES_KEY|AES_IV|CreatorID 100|7695CF0579445A78A642DCA0316407FF/.test(chessResults), 'Chess-Results secret/core material entered the browser patch');

for (const marker of ['cpProductionWeb', 'cpLinuxWebDev', 'Create New Tournament', 'cloudTournamentId', 'params.get("continue")', 'cpCloudSyncCurrent']) {
  assert(index.includes(marker), `missing production/beta.7 marker: ${marker}`);
}

// The recovered desktop-aligned Web shell remains byte/regression protected as
// the rollback source, but Pages now intentionally publishes the focused Vite
// Companion validated by the new production candidate gate.
const workflow = read('.github/workflows/deploy-web.yml');
assert(workflow.includes('Build clean Vite Companion production artifact'), 'Pages workflow does not build the validated Vite Companion');
assert(workflow.includes("source: 'vite-dist'"), 'Pages build-info source is not the Vite Companion');
assert(workflow.includes('Preserve legacy production shell as rollback artifact'), 'legacy production-web rollback archive is missing');
assert(workflow.includes('path: production-web'), 'legacy production-web rollback source is not archived');
assert(!workflow.includes('cp -R production-web/. dist/'), 'Pages workflow still publishes the legacy production-web shell');
assert(!workflow.includes('vite build --outDir production-web'), 'workflow overwrites production-web with a generated UI');

console.log('Recovered last-night Web functions regression: PASS — legacy shell is preserved intact as rollback while Pages deploys the validated Companion.');
