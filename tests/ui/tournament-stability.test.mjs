import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');

const arbiterApi = read('src/arbiter/arbiterApi.ts');
const arbiterPortal = read('src/arbiter/ArbiterPortal.tsx');
const organizerPanel = read('src/arbiter/OrganizerArbiterPanel.tsx');
const crAdapter = read('production-web/web/chess-results-browser-adapter.js');
const fideCache = read('deploy/public-site/desktop-web/fide-cache.js');
const pdfExport = read('deploy/public-site/desktop-web/pdf-export.js');
const pairingWorker = read('deploy/public-site/pairing-preview/pairing-worker.mjs');
const buildPy = read('deploy/public-site/desktop-web/build-workspace.py');

assert.match(arbiterApi, /AbortSignal\.timeout\(20000\)/);
assert.match(arbiterApi, /error\?\.name === 'TimeoutError'/);

assert.match(arbiterPortal, /safeReadStorage/);
assert.match(arbiterPortal, /loadSavedDrafts/);
assert.match(arbiterPortal, /draftsStorageKey/);
assert.match(arbiterPortal, /beforeunload/);
assert.match(arbiterPortal, /loadInFlightRef/);
assert.match(arbiterPortal, /Retry connection/);
assert.match(arbiterPortal, /window\.setInterval\(\(\) => void loadTournament\(sessionToken, true\)\.catch\(\(\) => undefined\), 5000\)/);
assert.doesNotMatch(arbiterPortal, /window\.confirm|confirm\(/);

assert.doesNotMatch(organizerPanel, /cdn\.jsdelivr\.net/);
assert.match(organizerPanel, /createQrSvgMarkup/);
assert.match(organizerPanel, /refreshInFlightRef/);
assert.match(organizerPanel, /document\.visibilityState !== 'hidden' && navigator\.onLine/);
assert.match(organizerPanel, /Could not copy automatically/);

assert.match(crAdapter, /AbortSignal\.timeout\(45000\)/);
assert.match(crAdapter, /Chess-Results request timed out/);

assert.match(fideCache, /transaction\.onerror/);
assert.match(fideCache, /transaction\.onabort/);

assert.match(pdfExport, /if \(restored\) return;/);
assert.match(pdfExport, /activePrintRestore\?\.\(\)/);

assert.doesNotMatch(pairingWorker, /[\u0400-\u04FF]/);
assert.match(pairingWorker, /AbortSignal\.timeout\(30_000\)/);

assert.match(buildPy, /asset_version\("fide-cache\.js"\)/);
assert.match(buildPy, /asset_version\("chess-results-browser-adapter\.js"\)/);
assert.match(buildPy, /asset_version\("engine-adapter\.js"\)/);
assert.match(buildPy, /asset_version\("pdf-export\.css"\)/);
assert.match(buildPy, /asset_version\("pdf-export\.js"\)/);

console.log('TOURNAMENT_STABILITY_CONTRACT=PASS');
