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
  createHash('sha256').update(shell).digest('hex') === 'f6427a3c2ade30ec2799bdbcbf69688a3247e969c6f03e82daf11901386f791a',
  'protected desktop shell changed'
);

for (const file of [
  'production-web/web/linux-native-engine-adapter.js',
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
assert(engine.includes('/native/capabilities') && engine.includes('/pair'), 'verified native service wiring missing');
assert(engine.includes('Engine backend not connected'), 'native backend fail-clear message missing');
assert(!engine.includes('/api/prototype') && !engine.includes('generateLocalSwissFallback'), 'browser adapter contains a synthetic pairing fallback');

const players = read('production-web/web/player-registration-enhancements.js');
assert(players.includes('addManualPlayer') && players.includes('event.key!=="Enter"'), 'Add Player recovery missing');
assert(players.includes('manualFide'), 'FIDE ID input wiring missing');
assert(/Select all/i.test(index) && index.includes('Import Players') && index.includes('Export TRF Starting List'), 'existing selection/import/export controls were removed');

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

const workflow = read('.github/workflows/deploy-web.yml');
assert(workflow.includes('cp -R production-web/. dist/'), 'Pages workflow no longer assembles from production-web');
assert(workflow.includes("source: 'production-web'"), 'build-info source is no longer production-web');
assert(!workflow.includes('vite build --outDir production-web'), 'workflow overwrites production-web with a generated UI');

console.log('Recovered last-night Web functions regression: PASS');
