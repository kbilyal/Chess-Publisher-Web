import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('production-web/web/chess-results-browser-adapter.js', 'utf8');
function browser({ config = { apiBaseUrl: 'https://publishing.example' }, token = 'organizer-test-token', status = 200, payload = { ok: true }, html = false, local = false, networkError = false } = {}) {
  const calls: { url: string; init: any }[] = [];
  const desktopCalls: unknown[][] = [];
  const state = { key: '' };
  let creates = 0;
  let opens = 0;
  const window: any = {
    isLocalEnginePage: () => local,
    chessResultsLocalJson: async (...args: unknown[]) => { desktopCalls.push(args); return { ok: true, desktop: true }; },
    cpNativeHubSecretGet: async (key: string) => { assert.equal(key, 'organizer-primary'); return token; },
    chessResultsState: () => state,
    createChessResultsTournament: async () => { creates++; state.key = '123456'; },
    openChessResultsUploadPage: async () => { opens++; }
  };
  vm.runInNewContext(source, {
    window, URL, AbortSignal,
    fetch: async (url: string, init: any) => {
      calls.push({ url, init });
      if (url === '/web/chess-results-config.json') return new Response(JSON.stringify(config));
      if (networkError) throw new Error('Network failure');
      return new Response(html ? '<html>Static host</html>' : JSON.stringify(payload), { status });
    }
  });
  return { window, calls, desktopCalls, state, counts: () => ({ creates, opens }) };
}

const hosted = browser();
for (const operation of ['test', 'create', 'publish', 'admin-link', 'delete-authorize', 'unlink']) {
  const body = { key: '123456', xml: '<?xml version="1.0"?><chessresults/>', clientId: 'stable-client' };
  await hosted.window.chessResultsLocalJson(`/chessresults/${operation}`, body);
  const request = hosted.calls.at(-1)!;
  assert.equal(request.url, `https://publishing.example/api/chess-results/${operation}`);
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers.Authorization, 'Bearer organizer-test-token');
  assert.deepEqual(JSON.parse(request.init.body), body);
  assert.equal(request.init.redirect, 'error');
  assert.equal(request.init.credentials, 'omit');
}
assert.equal(hosted.calls.filter(call => call.url.endsWith('.json')).length, 1);
assert.equal(hosted.desktopCalls.length, 0);
await assert.rejects(hosted.window.chessResultsLocalJson('https://other.example/publish', {}), /Unknown/);

const missing = browser({ config: { apiBaseUrl: '' } });
await assert.rejects(missing.window.chessResultsLocalJson('/chessresults/publish', {}), /backend not connected/);
assert.equal(missing.calls.length, 1, 'Missing configuration must not POST to the static host');

for (const apiBaseUrl of ['http://publishing.example', 'https://user:pass@publishing.example', 'https://publishing.example/api', 'https://publishing.example/?token=bad']) {
  const invalid = browser({ config: { apiBaseUrl } });
  await assert.rejects(invalid.window.chessResultsLocalJson('/chessresults/test', {}), /HTTPS origin/);
  assert.equal(invalid.calls.length, 1);
}
const signedOut = browser({ token: '' });
await assert.rejects(signedOut.window.chessResultsLocalJson('/chessresults/create', {}), /Sign in/);
assert.equal(signedOut.calls.length, 1);

for (const status of [404, 405]) {
  const unsupported = browser({ status, html: true });
  await assert.rejects(unsupported.window.chessResultsLocalJson('/chessresults/create', {}), /does not support/);
  assert.equal(unsupported.calls.length, 2, 'Never automatically retry create');
}
const invalidResponse = browser({ html: true });
await assert.rejects(invalidResponse.window.chessResultsLocalJson('/chessresults/publish', {}), /invalid response/);
const failure = browser({ status: 503, payload: { ok: false, message: 'Official bridge is unavailable.' } as any });
failure.state.key = '123456';
await assert.rejects(failure.window.chessResultsLocalJson('/chessresults/publish', {}), /Official bridge is unavailable/);
assert.equal(failure.state.key, '123456');
const unavailable = browser({ networkError: true });
await assert.rejects(unavailable.window.chessResultsLocalJson('/chessresults/create', {}), /Could not reach/);
assert.equal(unavailable.calls.length, 2);

const desktop = browser({ local: true });
assert.equal((await desktop.window.chessResultsLocalJson('/chessresults/test', {})).desktop, true);
assert.equal(desktop.desktopCalls.length, 1);
assert.equal(desktop.calls.length, 0);

await hosted.window.openChessResultsUploadPage();
await hosted.window.openChessResultsUploadPage();
assert.deepEqual(hosted.counts(), { creates: 1, opens: 2 });
console.log('Chess-Results hosted browser routing, failure handling and Desktop preservation: PASS');
