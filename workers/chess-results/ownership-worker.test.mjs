import assert from 'node:assert/strict';
import worker from './ownership-worker.js';

const originalFetch = globalThis.fetch;
const calls = [];
const hubCalls = [];

function organizerIdFor(auth) {
  if (auth === 'Bearer organizer-A') return 'org_A';
  if (auth === 'Bearer organizer-B') return 'org_B';
  return '';
}

function cloudSnapshot(key = '7654321') {
  return {
    snapshot: {
      version: 'V99',
      data: {
        currentTournament: 'Ownership Test',
        tournaments: {
          'Ownership Test': {
            settings: { tnr: key, tournamentType: 'test', country: 'BUL' },
            chessResults: { key, mode: 'test', federation: 'XXX', clientId: 'desktop-client' },
          },
        },
      },
    },
  };
}

function hubResponseFor(request) {
  const auth = request.headers.get('Authorization');
  const url = new URL(request.url);
  hubCalls.push({ url: request.url, auth });
  const organizerId = organizerIdFor(auth);
  if (!organizerId) return new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } });

  if (url.pathname === '/api/v1/organizer/me') {
    return new Response(JSON.stringify({ organizer: { id: organizerId } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.pathname === '/api/v1/cloud/tournaments/cloud-A/snapshot') {
    if (organizerId !== 'org_A') return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify(cloudSnapshot()), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
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
  const createBody = {
    tournament: 'Ownership Test',
    federation: 'BUL',
    mode: 'test',
    clientId: 'test-client',
  };

  // A missing ownership secret must fail before any Chess-Results GETSID/GETKEY call.
  const callsBeforePreflight = calls.length;
  let response = await worker.fetch(request('create', createBody), {
    ...env,
    CHESS_RESULTS_OWNERSHIP_HMAC_SECRET: '',
  });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).code, 'OWNERSHIP_HMAC_NOT_CONFIGURED');
  assert.equal(calls.length, callsBeforePreflight, 'create preflight must not contact Chess-Results when HMAC is missing');

  response = await worker.fetch(request('create', createBody), env);
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

  response = await worker.fetch(request('claim', {
    key: created.key,
    cloudTournamentId: 'cloud-A',
    clientId: 'fresh-web-client',
  }, 'organizer-A'), env);
  assert.equal(response.status, 200);
  const claimed = await response.json();
  assert.equal(claimed.key, created.key);
  assert.equal(claimed.recoveredFromCloud, true);
  assert.equal(claimed.federation, 'XXX');
  assert.equal(typeof claimed.ownershipProof, 'string');

  response = await worker.fetch(request('admin-link', {
    key: created.key,
    ownershipProof: claimed.ownershipProof,
  }, 'organizer-A'), env);
  assert.equal(response.status, 200);
  assert.match((await response.json()).url, /key1=7654321/);

  response = await worker.fetch(request('claim', {
    key: created.key,
    cloudTournamentId: 'cloud-A',
    clientId: 'other-organizer-client',
  }, 'organizer-B'), env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'TNR_CLAIM_NOT_OWNED');

  const authCalls = hubCalls.filter(call => new URL(call.url).pathname === '/api/v1/organizer/me');
  const snapshotCalls = hubCalls.filter(call => new URL(call.url).pathname.includes('/api/v1/cloud/tournaments/'));
  assert.equal(authCalls.length, 8, 'Hub organizer authentication must occur exactly once for each authenticated operation');
  assert.equal(snapshotCalls.length, 2, 'Only explicit cross-device claim operations may read the organizer-owned cloud snapshot');
  assert.ok(authCalls.every(call => call.url === 'https://hub.internal/api/v1/organizer/me'));
  console.log('Chess-Results create preflight + Hub service binding + cross-device recovery + cross-organizer guard: PASS');
} finally {
  globalThis.fetch = originalFetch;
}