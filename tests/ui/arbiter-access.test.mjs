import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const portal = read('src/arbiter/ArbiterPortal.tsx');
const panel = read('src/arbiter/OrganizerArbiterPanel.tsx');
const api = read('src/arbiter/arbiterApi.ts');
const main = read('src/main.tsx');
const app = read('src/App.tsx');
const patch = read('scripts/patch-arbiter-access-worker.py');
const deploy = read('.github/workflows/deploy-hub-arbiter-access.yml');

function has(source, needle, message) {
  assert.ok(source.includes(needle), message || `Missing: ${needle}`);
}
function lacks(source, needle, message) {
  assert.ok(!source.includes(needle), message || `Forbidden: ${needle}`);
}

has(main, "new URLSearchParams(window.location.search).has('arbiter')", 'QR query must route before Organizer Cloud login.');
has(main, '<ArbiterPortal />', 'Restricted portal must be a separate entry path.');
has(app, '<OrganizerArbiterPanel cloud={cloud} />', 'Organizer must have an Arbiter Access management panel.');

has(portal, '<h1>Enter your name</h1>', 'Arbiter must identify themselves before first access.');
has(portal, 'localStorage.setItem(storageKey, response.sessionToken)', 'Arbiter session must persist on that device.');
has(portal, "const allowedResults = ['1 - 0', '½ - ½', '0 - 1'] as const", 'Arbiter result controls must be limited to played results.');
has(portal, 'baseRevision', 'Every result submission must carry a Cloud revision guard.');
has(portal, 'freshView.revision', 'Result submission must use the freshly read Cloud revision.');
has(portal, "'Update result' : 'Send result'", 'Arbiter must get explicit Send/Update result actions.');
has(portal, 'Publishing is disabled for Arbiter Access', 'Restricted role must clearly expose no publishing permission.');
lacks(portal, 'chessResultsApi', 'Arbiter portal must never import Chess-Results administration.');
lacks(portal, 'publishOnline', 'Arbiter portal must never expose Hub publishing.');
lacks(portal, 'Organizer Token', 'Arbiter portal must not request the Organizer Token.');

has(panel, 'Tournament arbiters', 'Organizer must see joined arbiters.');
has(panel, 'Last active', 'Organizer must see arbiter activity.');
has(panel, 'Generate QR', 'Organizer must be able to create a tournament-scoped QR.');
has(panel, 'Revoke', 'Organizer must be able to revoke all sessions immediately.');
has(panel, 'board.whiteKey', 'Organizer application must verify white-player identity.');
has(panel, 'board.blackKey', 'Organizer application must verify black-player identity.');
has(panel, 'cloud.syncNow(next)', 'Accepted result queue must synchronize through protected Cloud sync.');

has(api, '/api/v1/arbiter/join', 'Client API must have a dedicated join route.');
has(api, '/api/v1/arbiter/tournament', 'Client API must have a restricted tournament route.');
has(api, '/api/v1/arbiter/results', 'Client API must have a dedicated result route.');
has(api, 'publish: false', 'Arbiter API contract must explicitly deny publishing.');

has(patch, 'arbiter_access_v1', 'Worker patch must have an idempotent marker.');
has(patch, 'organizerFromBearer(request, env)', 'Grant management must require Organizer authentication.');
has(patch, 'arbiterSessionFromBearer', 'Arbiter operations must authenticate a separate session token.');
has(patch, 'access_code_hash', 'Raw QR access secrets must not be stored in D1.');
has(patch, 'token_hash', 'Raw Arbiter session tokens must not be stored in D1.');
has(patch, 'ARBITER_ALLOWED_RESULTS', 'Worker must server-side validate result values.');
has(patch, 'baseRevision !== currentRevision', 'Worker must reject stale tournament revisions.');
has(patch, 'board.whiteKey', 'Worker must validate white-player identity for the board.');
has(patch, 'board.blackKey', 'Worker must validate black-player identity for the board.');
has(patch, 'arbiter_result_conflict', 'Conflicting results from different arbiters must fail closed.');
has(patch, 'permissions: { pairings: true, results: true, publish: false }', 'Server must issue only the restricted role.');
has(patch, '`${origin}/?arbiter=${encodeURIComponent(accessCode)}`', 'QR URL must contain only the tournament grant, never the Organizer Token.');

has(deploy, 'Recover exact live protected Hub Worker', 'Worker deployment must patch the actual live protected source.');
has(deploy, "'private_cloud_hard_delete_v1'", 'Arbiter deployment must preserve permanent private Cloud deletion.');
has(deploy, 'Roll back previous Worker version if verification fails', 'Worker deployment must automatically roll back on verification failure.');
lacks(deploy, 'deploy/hub-api/worker.js', 'Deployment must never overwrite the live Worker from a stale repository copy.');

console.log('ARBITER_ACCESS_CONTRACT=PASS');
