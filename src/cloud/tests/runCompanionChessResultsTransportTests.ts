import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function storage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key: string) { return values.has(key) ? values.get(key)! : null; },
    setItem(key: string, value: string) { values.set(key, String(value)); },
    removeItem(key: string) { values.delete(key); }
  };
}

type Call = { url: string; init: RequestInit; body: any };
const calls: Call[] = [];
const tournament = {
  name: 'Desktop synced tournament',
  cloud: { cloudTournamentId: 'cloud-123', internalId: 'desktop-local-123' },
  chessResults: { key: '1492376', clientId: 'cr-client-123' },
  settings: { tnr: '1492376' }
};

(globalThis as any).window = { location: { hostname: 'web.chess-publisher.org' } };
(globalThis as any).sessionStorage = storage({ 'cpstudio.organizerToken.session': 'test-organizer-token' });
(globalThis as any).localStorage = storage({ fide_tournament_manager_v2: JSON.stringify(tournament) });
(globalThis as any).fetch = async (url: string, init: RequestInit = {}) => {
  const parsedBody = init.body ? JSON.parse(String(init.body)) : {};
  calls.push({ url: String(url), init, body: parsedBody });
  const operation = String(url).split('/').pop();
  const payload = operation === 'claim'
    ? { ok: true, key: parsedBody.key, ownershipProof: `auto-continuity-${parsedBody.key}` }
    : operation === 'create'
      ? { ok: true, key: '1555001', ownershipProof: 'created-continuity-1555001', federation: 'XXX', mode: 'test' }
      : operation === 'admin-link'
        ? { ok: true, key: parsedBody.key, url: 'https://chess-results.com/admin-test' }
        : operation === 'unlink'
          ? { ok: true, key: parsedBody.key, canUnlink: true }
          : operation === 'publish'
            ? { ok: true, key: parsedBody.key, uploaded: true }
            : { ok: true, sidVerified: true };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

const { chessResultsApi, REMOTE_CHESS_RESULTS_API_PREFIX, ChessResultsApiError } = await import('../../chessResults/api');

await chessResultsApi.test();
assert.equal(calls.length, 1);
assert.equal(calls[0].url, `${REMOTE_CHESS_RESULTS_API_PREFIX}test`, 'Production Companion must call the deployed Chess-Results Worker, not GitHub Pages /api.');
const productionHeaders = new Headers(calls[0].init.headers);
assert.equal(productionHeaders.get('Authorization'), 'Bearer test-organizer-token', 'Production Worker call must use the authenticated Organizer Token.');
assert.equal(productionHeaders.get('Content-Type'), 'application/json');
assert.equal(calls[0].init.method, 'POST');

calls.length = 0;
await chessResultsApi.publish({ key: '1492376', xml: '<chessresults />' });
assert.equal(calls.length, 2, 'Existing Desktop TNR must transparently recover continuity before first Web publish.');
assert.equal(calls[0].url, `${REMOTE_CHESS_RESULTS_API_PREFIX}claim`);
assert.equal(calls[0].body.key, '1492376');
assert.equal(calls[0].body.cloudTournamentId, 'cloud-123', 'Automatic continuity must use the synchronized Desktop/Cloud tournament identity.');
assert.equal(calls[0].body.clientId, 'cr-client-123');
assert.equal(calls[1].url, `${REMOTE_CHESS_RESULTS_API_PREFIX}publish`);
assert.equal(calls[1].body.ownershipProof, 'auto-continuity-1492376', 'Recovered continuity must be supplied internally to the protected Worker contract.');
assert.equal(calls[1].body.cloudTournamentId, 'cloud-123');

calls.length = 0;
await chessResultsApi.adminLink({ key: '1492376', section: 'admin' });
assert.equal(calls.length, 1, 'Recovered TNR continuity should remain transiently cached for the current authenticated session.');
assert.equal(calls[0].url, `${REMOTE_CHESS_RESULTS_API_PREFIX}admin-link`);
assert.equal(calls[0].body.ownershipProof, 'auto-continuity-1492376');

calls.length = 0;
const created = await chessResultsApi.create({ tournament: 'Test tournament', federation: 'BUL', mode: 'test', clientId: 'new-client' });
assert.equal(created.key, '1555001');
await chessResultsApi.publish({ key: '1555001', xml: '<chessresults />' });
assert.equal(calls.filter(call => call.url.endsWith('/claim')).length, 0, 'A newly created TNR must use the transient continuity returned by GETKEY without a separate ownership step.');
assert.equal(calls.at(-1)?.body.ownershipProof, 'created-continuity-1555001');

const workspaceSource = readFileSync(resolve(process.cwd(), 'src/companion/CompanionWorkspace.tsx'), 'utf8');
assert.match(
  workspaceSource,
  /const modeChanged = isTnr\(key\)[\s\S]*requestedMode !== linkedMode;/,
  'Publish must detect a Real/Test mode change on an already linked Chess-Results TNR.'
);
assert.match(
  workspaceSource,
  /const requiresFreshTnr = Boolean\(current\.chessResults\?\.freshTnrRequired \|\| modeChanged\);/,
  'A mode mismatch must mark the existing Chess-Results identity as requiring a fresh TNR.'
);
assert.match(
  workspaceSource,
  /if \(!isTnr\(key\) \|\| requiresFreshTnr\)/,
  'Publish must request GETKEY for a new TNR instead of reusing a Real TNR for a Test tournament.'
);
assert.match(
  workspaceSource,
  /federation: initial\.federation,[\s\S]*mode: current\.settings\.tournamentType/,
  'Fresh TNR creation must use the current tournament mode and the exporter federation (XXX for Test).'
);

(globalThis as any).window.location.hostname = 'localhost';
calls.length = 0;
await chessResultsApi.test();
assert.equal(calls[0].url, '/api/chess-results/test', 'Local/dev Companion must keep the same-origin product API route.');
assert.equal(new Headers(calls[0].init.headers).get('Authorization'), 'Bearer test-organizer-token');

(globalThis as any).sessionStorage = storage();
(globalThis as any).localStorage = storage();
await assert.rejects(
  () => chessResultsApi.test(),
  (error: unknown) => error instanceof ChessResultsApiError && error.code === 'organizer_token_required' && error.status === 401,
  'Chess-Results publication must fail closed without an authenticated Organizer Token.'
);

console.log('PASS Companion Chess-Results transport: Organizer Token auth + automatic Desktop/Cloud TNR continuity + Test/Real TNR identity replacement + no user-facing ownership step + local route + fail-closed token guard.');
