import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'test';
const { app } = await import('../../../server');

const listen = (server: http.Server) => new Promise<number>(resolve => server.listen(0, '127.0.0.1', () => resolve((server.address() as any).port)));
const close = (server: http.Server) => new Promise<void>(resolve => server.close(() => resolve()));

const appServer = http.createServer(app);
const appPort = await listen(appServer);
const appUrl = `http://127.0.0.1:${appPort}`;

delete process.env.CHESS_RESULTS_BRIDGE_URL;
let response = await fetch(`${appUrl}/api/chess-results/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
assert.equal(response.status, 503);
assert.equal((await response.json()).code, 'CHESS_RESULTS_BRIDGE_NOT_CONFIGURED');

let received: { path?: string; auth?: string; body?: any } = {};
const bridge = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  received = { path: req.url, auth: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') };
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, key: '789012' }));
});
const bridgePort = await listen(bridge);
process.env.CHESS_RESULTS_BRIDGE_URL = `http://127.0.0.1:${bridgePort}`;
process.env.CHESS_RESULTS_BRIDGE_TOKEN = 'test-token';

response = await fetch(`${appUrl}/api/chess-results/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournament: 'Bridge test' }) });
assert.equal(response.status, 200);
assert.equal((await response.json()).key, '789012');
assert.deepEqual(received, { path: '/chessresults/create', auth: 'Bearer test-token', body: { tournament: 'Bridge test' } });

response = await fetch(`${appUrl}/api/chess-results/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'bad', xml: 'not xml' }) });
assert.equal(response.status, 400);
assert.equal((await response.json()).code, 'INVALID_PUBLICATION_PAYLOAD');

await close(bridge);
await close(appServer);
console.log('Chess-Results bridge route contract: 7/7 PASS');
