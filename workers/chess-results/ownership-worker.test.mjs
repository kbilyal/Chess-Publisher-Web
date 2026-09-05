import assert from 'node:assert/strict';
import worker from './ownership-worker.js';

const originalFetch = globalThis.fetch;
const calls = [];
const hubCalls = [];

function hubResponseFor(request) {
  const auth = request.headers.get('Authorization');
  hubCalls.push({ url: request.url, auth });
  if (auth === 'Bearer organizer-A') {
    return new Response(JSON.stringify({ organizer: { id: 'org_A' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (auth === 'Bearer organizer-B') {
    return new Response(JSON.stringify({ organizer: { id: 'org_B' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } });
}

const env = {
  WEB_ORIGIN: 'https://web.chess-publisher.org',
  HUB_API_BASE: 'https://hub.example.test',
  HUB_SERVICE: {
    fetch(request) {
      return hubResponseFor(request);
    },
  },
  CHESS_RESULTS_XML_URL: 'https://chess-results.example.test/xml.aspx',
  CHESS_RESULTS_UPLOAD_XML_URL: 'https://chess-results.example.test/uploadxml.aspx',
  CHESS_RESULTS_ADMIN_URL: 'https://chess-results.example.test/Stammdaten.aspx',
  CHESS_RESULTS_UPLOAD_SECTION_URL: 'https://chess-results.example.test/UploadData.aspx',
  CHESS_RESULTS_PUBLIC_BASE: 'https://chess-results.example.test',
  CHESS_RESULTS_CREATOR_ID: '4242',
  CHESS_RESULTS_AES_KEY: `base64:${Buffer.alloc(16, 7).toString('base64')}`,
  CHESS_RESULTS_AES_IV: `base64:${Buffer.alloc(16, 9).toString('base64')}`,
  CHESS_RESULTS_OWNERSHIP_HMAC_SECRET: 'test-only-ownership-secret-0123456789abcdef',
};

function request(operation, body = {}, token = 'organizer-A') {
  return new Request(`https://web.chess-publisher.org/api/chess-results/${operation}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Origin: env.WEB_ORIGIN,
    },
    body: JSON.stringify(body),
  });
}

globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  calls.push({ href, init });

  assert.notEqual(href, 'https://hub.example.test/api/v1/organizer/me', 'public Hub URL must not be used when HUB_SERVICE is bound');

  if (href.includes('key1=GETSID')) {
    return new Response('<?xml version="1.0"?><chessresults><result sid="987654321" status="OK"/></chessresults>', { status: 200 });
  }

  if (href.includes('key1=GETKEY')) {
    const form = new URLSearchParams(String(init.body || ''));
    const posted = form.get('xml') || '';
    assert.match(posted, /creatorID="4242"/);
    assert.match(posted, /source="21"/);
    assert.match(posted, /federation="XXX"/);
    return new Response('<?xml version="1.0"?><chessresults><result key="7654321" status="OK"/></chessresults>', { status: 200 });
  }

  throw new Error(`Unexpected mock fetch: ${href}`);
};

try {
  let response = await worker.fetch(request('create', {
    tournament: 'Ownership Test',
    federation: 'BUL',
    mode: 'test',
    clientId: 'test-client',
  }), env);

  assert.equal(response.status, 200);
  const created = await response.json();
  assert.equal(created.key, '7654321');
  assert.equal(created.federation, 'XXX');
  assert.equal(typeof created.ownershipProof, 'string');

  response = await worker.fetch(request('admin-link', {
    key: created.key,
    ownershipProof: created.ownershipProof,
  }, 'organizer-B'), env);

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'TNR_OWNERSHIP_MISMATCH');

  response = await worker.fetch(request('delete-authorize', {
    key: created.key,
    ownershipProof: created.ownershipProof,
  }, 'organizer-B'), env);

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'TNR_OWNERSHIP_MISMATCH');

  response = await worker.fetch(request('unlink', {
    key: created.key,
    ownershipProof: created.ownershipProof,
  }, 'organizer-B'), env);

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'TNR_OWNERSHIP_MISMATCH');

  assert.equal(hubCalls.length, 4, 'Hub service binding must be called exactly once for each authenticated operation');
  assert.ok(hubCalls.every(call => call.url === 'https://hub.internal/api/v1/organizer/me'));
  console.log('Chess-Results Hub service binding + single auth + cross-organizer ownership guard: PASS');
} finally {
  globalThis.fetch = originalFetch;
}
