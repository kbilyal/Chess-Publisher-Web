import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import smokeWorker from './smoke-worker.js';

const source = await readFile(new URL('./smoke-worker.js', import.meta.url), 'utf8');
assert.match(source, /upload-smoke/i);
assert.match(source, /publish-smoke/i);
assert.match(source, /SMOKE_TEST_TNR_REQUIRED/);
assert.match(source, /payload\?\.mode !== 'test'/);
assert.match(source, /payload\?\.federation !== 'XXX'/);
assert.match(source, /\/api\/chess-results\/publish/);
assert.match(source, /\/api\/chess-results\/upload-diagnostic/);
assert.match(source, /ownershipWorker\.fetch\(smokeRequest\(request, pathname, key, ownershipProof\), env\)/);
assert.match(source, /<round round=\"1\" date=\"20260908\" time=\"10:00\"/);
assert.doesNotMatch(source, /<round round=\"1\" date=\"\" time=\"\"/);
assert.match(source, /sex=\"m\" fed=\"XXX\" board=\"0\" teamno=\"0\"/);

const WEB_ORIGIN = 'https://web.chess-publisher.org';
let forwarded = null;
const env = {
  WEB_ORIGIN,
  WEB_ENGINE_SERVICE: {
    async fetch(request) {
      forwarded = request;
      return Response.json({ ok: true, relay: true }, {
        status: 200,
        headers: { 'Access-Control-Allow-Origin': WEB_ORIGIN },
      });
    },
  },
};

const capabilitiesRequest = new Request('https://chess-publisher-chess-results.kyamranbilyal.workers.dev/api/engine-relay/capabilities', {
  method: 'GET',
  headers: {
    Origin: WEB_ORIGIN,
    Authorization: 'Bearer organizer-token',
  },
});
const capabilitiesResponse = await smokeWorker.fetch(capabilitiesRequest, env);
assert.equal(capabilitiesResponse.status, 200);
assert.ok(forwarded);
assert.equal(new URL(forwarded.url).pathname, '/api/engine/capabilities');
assert.equal(forwarded.headers.get('Origin'), WEB_ORIGIN);
assert.equal(forwarded.headers.get('Authorization'), 'Bearer organizer-token');

forwarded = null;
const pairBody = JSON.stringify({ trf: '012 test', round: 1, rounds: 7, topColor: 'W', unpaired: [] });
const pairRequest = new Request('https://chess-publisher-chess-results.kyamranbilyal.workers.dev/api/engine-relay/pair', {
  method: 'POST',
  headers: {
    Origin: WEB_ORIGIN,
    Authorization: 'Bearer organizer-token',
    'Content-Type': 'application/json',
  },
  body: pairBody,
});
const pairResponse = await smokeWorker.fetch(pairRequest, env);
assert.equal(pairResponse.status, 200);
assert.ok(forwarded);
assert.equal(new URL(forwarded.url).pathname, '/api/engine/pair');
assert.equal(await forwarded.text(), pairBody);

forwarded = null;
const denied = await smokeWorker.fetch(new Request('https://chess-publisher-chess-results.kyamranbilyal.workers.dev/api/engine-relay/capabilities', {
  method: 'GET',
  headers: { Origin: 'https://example.invalid', Authorization: 'Bearer organizer-token' },
}), env);
assert.equal(denied.status, 403);
assert.equal(forwarded, null);

const unknown = await smokeWorker.fetch(new Request('https://chess-publisher-chess-results.kyamranbilyal.workers.dev/api/engine-relay/not-a-route', {
  method: 'GET',
  headers: { Origin: WEB_ORIGIN, Authorization: 'Bearer organizer-token' },
}), env);
assert.equal(unknown.status, 404);

console.log('PASS schema-valid smoke route guard + publish delegation + Web engine service relay regression');
