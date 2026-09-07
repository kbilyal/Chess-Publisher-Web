import assert from 'node:assert/strict';

function storage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key: string) { return values.has(key) ? values.get(key)! : null; },
    setItem(key: string, value: string) { values.set(key, String(value)); },
    removeItem(key: string) { values.delete(key); }
  };
}

const calls: Array<{ url: string; init: RequestInit }> = [];
(globalThis as any).window = { location: { hostname: 'web.chess-publisher.org' } };
(globalThis as any).sessionStorage = storage({ 'cpstudio.organizerToken.session': 'test-organizer-token' });
(globalThis as any).localStorage = storage();
(globalThis as any).fetch = async (url: string, init: RequestInit = {}) => {
  calls.push({ url: String(url), init });
  return new Response(JSON.stringify({ ok: true, sidVerified: true }), {
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

console.log('PASS Companion Chess-Results transport: production Worker routing + Organizer Token auth + local /api route + fail-closed token guard.');
