import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { installProductionApi } from '../productionApi';

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
const configError: { code?: string } = await response.json();
assert.equal(configError.code, 'CHESS_RESULTS_BRIDGE_NOT_CONFIGURED');

let received: { path?: string; auth?: string; body?: any } = {};
let bridgeCalls = 0;
let bridgeStatus = 200;
let bridgeBody = JSON.stringify({ ok: true, key: '789012' });
const bridge = http.createServer(async (req, res) => {
  bridgeCalls++;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  received = { path: req.url, auth: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') };
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = bridgeStatus;
  res.end(bridgeBody);
});
const bridgePort = await listen(bridge);
process.env.CHESS_RESULTS_BRIDGE_URL = `http://127.0.0.1:${bridgePort}`;
process.env.CHESS_RESULTS_BRIDGE_TOKEN = 'test-token';

response = await fetch(`${appUrl}/api/chess-results/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournament: 'Bridge test' }) });
assert.equal(response.status, 200);
const createdPayload: { key?: string } = await response.json();
assert.equal(createdPayload.key, '789012');
assert.deepEqual(received, { path: '/chessresults/create', auth: 'Bearer test-token', body: { tournament: 'Bridge test' } });

response = await fetch(`${appUrl}/api/chess-results/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'bad', xml: 'not xml' }) });
assert.equal(response.status, 400);
const publicationError: { code?: string } = await response.json();
assert.equal(publicationError.code, 'INVALID_PUBLICATION_PAYLOAD');

// Exercise the actual production authentication mount, including prefix and CORS.
const production = express();
let authCalls = 0;
installProductionApi(production, app, async authorization => {
  authCalls++;
  return authorization === 'Bearer organizer-test'
    ? { ok: true }
    : { ok: false, status: 401, message: 'Organizer Token required.' };
});
const productionServer = http.createServer(production);
const productionPort = await listen(productionServer);
const endpoint = `http://127.0.0.1:${productionPort}/api/chess-results`;
const origin = 'https://web.chess-publisher.org';
response = await fetch(`${endpoint}/test`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
assert.equal(response.status, 204);
assert.equal(response.headers.get('access-control-allow-origin'), origin);
assert.equal(authCalls, 0);
const callsBeforeAuth = bridgeCalls;
response = await fetch(`${endpoint}/create`, { method: 'POST', headers: { Origin: origin } });
assert.equal(response.status, 401);
assert.equal(response.headers.get('access-control-allow-origin'), origin);
assert.equal(bridgeCalls, callsBeforeAuth);
response = await fetch(`${endpoint}/create`, { method: 'POST', headers: { Origin: 'https://untrusted.example', Authorization: 'Bearer organizer-test' } });
assert.equal(response.status, 403);
assert.equal(response.headers.get('access-control-allow-origin'), null);
assert.equal(bridgeCalls, callsBeforeAuth);
for (const operation of ['test', 'create', 'publish', 'admin-link', 'delete-authorize', 'unlink']) {
  const body = { key: '789012', xml: '<?xml version="1.0"?><chessresults/>', clientId: 'stable-client' };
  response = await fetch(`${endpoint}/${operation}`, { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer organizer-test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 200, operation);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const operationResult: { ok?: boolean } = await response.json();
  assert.equal(operationResult.ok, true);
  assert.deepEqual(received, { path: `/chessresults/${operation}`, auth: 'Bearer test-token', body });
}
for (const invalidBody of ['<html>Static host</html>', '{}', 'null', '']) {
  bridgeBody = invalidBody;
  response = await fetch(`${endpoint}/test`, { method: 'POST', headers: { Authorization: 'Bearer organizer-test' } });
  assert.equal(response.status, 502);
  const invalidBridgeResponse: { code?: string } = await response.json();
  assert.equal(invalidBridgeResponse.code, 'INVALID_CHESS_RESULTS_BRIDGE_RESPONSE');
}
bridgeStatus = 503;
bridgeBody = JSON.stringify({ ok: false, error: 'Official service unavailable' });
response = await fetch(`${endpoint}/test`, { method: 'POST', headers: { Authorization: 'Bearer organizer-test' } });
assert.equal(response.status, 503);
const unavailableBridge: { error?: string } = await response.json();
assert.equal(unavailableBridge.error, 'Official service unavailable');
await close(productionServer);
await close(bridge);
await close(appServer);
console.log('Chess-Results bridge route, production authentication and CORS contracts: PASS');
