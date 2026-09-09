import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const portal = read('src/arbiter/ArbiterPortal.tsx');
const panel = read('src/arbiter/OrganizerArbiterPanel.tsx');
const api = read('src/arbiter/arbiterApi.ts');
const main = read('src/main.tsx');
const app = read('src/App.tsx');
const patch = read('scripts/patch-arbiter-access-worker.py');
const specialPatch = read('scripts/patch-arbiter-special-results-worker.py');
const deploy = read('.github/workflows/deploy-hub-arbiter-access.yml');
const specialDeploy = read('.github/workflows/deploy-hub-arbiter-special-results.yml');
const uiFixes = read('src/arbiter/arbiter-ui-fixes.css');

function has(source, needle, message) {
  assert.ok(source.includes(needle), message || `Missing: ${needle}`);
}
function lacks(source, needle, message) {
  assert.ok(!source.includes(needle), message || `Forbidden: ${needle}`);
}

has(main, "new URLSearchParams(window.location.search).has('arbiter')", 'QR query must route before Organizer Cloud login.');
has(main, '<ArbiterPortal />', 'Restricted portal must be a separate entry path.');
has(main, "import './arbiter/arbiter-ui-fixes.css'", 'Arbiter static-action and print hardening overrides must load last.');
has(app, '<OrganizerArbiterPanel cloud={cloud} />', 'Organizer must have an Arbiter Access management panel.');

has(portal, '<h1>Enter your name</h1>', 'Arbiter must identify themselves before first access.');
has(portal, 'localStorage.setItem(storageKey, response.sessionToken)', 'Arbiter session must persist on that device.');
has(portal, "const standardResults = ['1 - 0', '½ - ½', '0 - 1'] as const", 'Arbiter must preserve the three standard game results.');
has(portal, "const specialResults = ['1F - 0F', '0F - 1F', '0F - 0F'] as const", 'Arbiter must expose exactly the Chess-Publisher special forfeit result codes.');
has(portal, 'const allowedResults = [...standardResults, ...specialResults] as const', 'All Arbiter result controls must remain on one explicit whitelist.');
has(portal, 'baseRevision', 'Every result submission must carry a Cloud revision guard.');
has(portal, 'sendWithRevisionGuard', 'Single and bulk result submission must share the same Cloud revision guard.');
has(portal, 'await sendAtRevision(candidateView.revision)', 'Initial result submission must use the freshly loaded Cloud revision.');
has(portal, "error?.code !== 'cloud_revision_conflict'", 'Only Cloud revision conflicts may enter the automatic retry path.');
has(portal, 'const refreshed = await arbiterApi.tournament(sessionToken)', 'Revision retry must refresh the restricted tournament before resubmission.');
has(portal, 'await sendAtRevision(retryView.revision)', 'Automatic retry must use the newly refreshed Cloud revision.');
has(portal, 'matchingBoard(freshView, round, board, whiteKey, blackKey)', 'Every result submission must remain bound to the exact board and player identities.');
has(portal, "'Update result' : 'Send result'", 'Arbiter must get explicit Send/Update result actions.');
has(portal, 'Send all results', 'Arbiter must have an explicit bulk-send action for changed results.');
has(portal, 'onClick={() => void submitAll()}', 'Static bulk action must continue to use the protected submitAll implementation.');
has(uiFixes, '.arbiter-send-all {', 'Send All must have a dedicated permanent action style.');
has(uiFixes, 'position: fixed;', 'Send All must stay visible while the Arbiter scrolls boards.');
has(uiFixes, 'env(safe-area-inset-bottom)', 'Fixed mobile Send All must respect the device safe area.');
has(uiFixes, '.arbiter-shell .arbiter-main { padding-bottom:', 'Board list must reserve space so the fixed Send All button does not cover results.');
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

has(specialPatch, 'arbiter_special_results_v1', 'Special-result Worker upgrade must be idempotently marked.');
has(specialPatch, '1F - 0F', 'Worker upgrade must accept white forfeit wins.');
has(specialPatch, '0F - 1F', 'Worker upgrade must accept black forfeit wins.');
has(specialPatch, '0F - 0F', 'Worker upgrade must accept double-forfeit results.');

has(deploy, 'Recover exact live protected Hub Worker', 'Worker deployment must patch the actual live protected source.');
has(deploy, "'private_cloud_hard_delete_v1'", 'Arbiter deployment must preserve permanent private Cloud deletion.');
has(deploy, 'Roll back previous Worker version if verification fails', 'Worker deployment must automatically roll back on verification failure.');
lacks(deploy, 'deploy/hub-api/worker.js', 'Deployment must never overwrite the live Worker from a stale repository copy.');
has(specialDeploy, 'Recover exact live protected Hub Worker', 'Special-result deployment must patch the actual live protected source.');
has(specialDeploy, 'Roll back previous Worker version if verification fails', 'Special-result deployment must preserve automatic rollback.');
lacks(specialDeploy, 'deploy/hub-api/worker.js', 'Special-result deployment must never use a stale repository Worker source.');

console.log('ARBITER_ACCESS_CONTRACT=PASS');