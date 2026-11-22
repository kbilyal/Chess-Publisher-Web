import assert from 'node:assert/strict';
import worker from './ownership-worker.js';
import { createHmac } from 'node:crypto';
import { ChessResultsTnrJournal } from './tnr-journal.js';

const originalFetch = globalThis.fetch;
const calls = [];
const hubCalls = [];

function organizerIdFor(auth) {
  if (auth === 'Bearer organizer-A') return 'org_A';
  if (auth === 'Bearer organizer-B') return 'org_B';
  return '';
}

function cloudSnapshot(key = '7654320') {
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
    return new Response(JSON.stringify(cloudSnapshot(organizerId === 'org_A' ? '7654320' : '7654321')), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
  DESKTOP_WEB_ORIGIN: 'https://chess-publisher.org',
  CHESS_RESULTS_CREATOR_MAP: JSON.stringify({ org_A: 4242, org_B: 4243 }),
  CHESS_RESULTS_LEGACY_TNRS: JSON.stringify({ org_A: { 7654320: { mode: 'real', federation: 'BUL', creatorId: 2000 } } }),
  CHESS_RESULTS_AES_KEY: `base64:${Buffer.alloc(16, 7).toString('base64')}`,
  CHESS_RESULTS_AES_IV: `base64:${Buffer.alloc(16, 9).toString('base64')}`,
  CHESS_RESULTS_OWNERSHIP_HMAC_SECRET: 'test-only-ownership-secret-0123456789abcdef',
};

const journals = new Map();
env.CHESS_RESULTS_JOURNAL = {
  idFromName: name => name,
  get(id) {
    if (!journals.has(id)) {
      const records = new Map();
      let queue = Promise.resolve();
      const state = {
        storage: {
          async get(key) { return records.get(key); },
          async put(key, value) {
            for (const [name, entry] of Object.entries(typeof key === 'string' ? { [key]: value } : key)) records.set(name, entry);
          },
          async delete(key) { records.delete(key); },
        },
        blockConcurrencyWhile(callback) {
          const result = queue.then(callback);
          queue = result.catch(() => {});
          return result;
        },
      };
      journals.set(id, {
        fetch(url, init) { return new ChessResultsTnrJournal(state, env).fetch(new Request(url, init)); },
      });
    }
    return journals.get(id);
  },
};
let getKeyResponse = 'OK';
let nextKey = 7654321;

function request(operation, body = {}, token = 'organizer-A', origin = env.WEB_ORIGIN) {
  return new Request(`https://web.chess-publisher.org/api/chess-results/${operation}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Origin: origin,
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
    assert.match(posted, /creatorID="424[23]"/);
    assert.match(posted, /source="21"/);
    assert.match(posted, /federation="XXX"/);
    if (getKeyResponse === 'timeout') throw new Error('transport interrupted');
    if (getKeyResponse === 'ERROR') return new Response('<chessresults><result status="ERROR"/></chessresults>');
    return new Response('<chessresults><result key="' + nextKey++ + '" status="OK"/></chessresults>');
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

  const getKeyCount = () => calls.filter(call => call.href.includes('key1=GETKEY')).length;
  const concurrentCreates = await Promise.all([
    worker.fetch(request('create', createBody), env),
    worker.fetch(request('create', createBody, 'organizer-A', env.DESKTOP_WEB_ORIGIN), env),
  ]);
  const [created, retried] = await Promise.all(concurrentCreates.map(response => response.json()));
  assert.equal(created.key, '7654321');
  assert.equal(created.federation, 'XXX');
  assert.equal(typeof created.ownershipProof, 'string');
  assert.equal(retried.key, created.key);
  assert.equal(retried.recovered, true);
  assert.equal(getKeyCount(), 1, 'Concurrent GETKEY for a single local tournament must issue a single vendor request.');
  assert.equal(concurrentCreates[1].headers.get('Access-Control-Allow-Origin'), env.DESKTOP_WEB_ORIGIN);

  response = await worker.fetch(request('create', { ...createBody, mode: 'real' }), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'TNR_ALLOCATION_MISMATCH');
  assert.equal(getKeyCount(), 1);

  response = await worker.fetch(request('create', createBody, 'organizer-B'), env);
  assert.equal(response.status, 200);
  assert.notEqual((await response.json()).key, created.key);
  assert.match(new URLSearchParams(calls.at(-1).init.body).get('xml'), /creatorID="4243"/);

  for (const operation of ['admin-link', 'delete-authorize', 'unlink']) {
    response = await worker.fetch(request(operation, { key: created.key, ownershipProof: created.ownershipProof }, 'organizer-B'), env);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'TNR_OWNERSHIP_MISMATCH');
  }

  // A stored Web registration can be used by another browser without Cloud sync.
  response = await worker.fetch(request('claim', { key: created.key }), env);
  const claimed = await response.json();
  assert.equal(response.status, 200);
  assert.equal(claimed.recovered, true);
  assert.equal(claimed.federation, 'XXX');
  response = await worker.fetch(request('admin-link', { key: created.key, ownershipProof: claimed.ownershipProof }), env);
  assert.equal(response.status, 200);

  const legacy = await worker.fetch(request('claim', { key: '7654320', cloudTournamentId: 'cloud-A' }), env);
  assert.equal(legacy.status, 200);
  const legacyResult = await legacy.json();
  assert.equal(legacyResult.recoveredFromCloud, true);
  const legacyPayload = JSON.parse(Buffer.from(legacyResult.ownershipProof.split('.')[0], 'base64url').toString());
  assert.equal(legacyPayload.creatorId, 2000, 'An explicitly enrolled Desktop TNR retains its original CreatorID.');
  assert.equal(legacyResult.federation, 'BUL', 'The enrolled legacy mode/federation outranks editable snapshot metadata.');
  response = await worker.fetch(request('admin-link', { key: legacyResult.key, ownershipProof: legacyResult.ownershipProof }), env);
  assert.equal(response.status, 200);

  response = await worker.fetch(request('claim', { key: created.key, cloudTournamentId: 'cloud-A' }, 'organizer-B'), env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'TNR_NOT_REGISTERED');

  const oldPayload = JSON.parse(Buffer.from(created.ownershipProof.split('.')[0], 'base64url').toString());
  const oldBytes = Buffer.from(JSON.stringify({ ...oldPayload, v: 1 }));
  const oldProof = oldBytes.toString('base64url') + '.' + createHmac('sha256', env.CHESS_RESULTS_OWNERSHIP_HMAC_SECRET).update(oldBytes).digest('base64url');
  response = await worker.fetch(request('admin-link', { key: created.key, ownershipProof: oldProof }), env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'OWNERSHIP_PROOF_EXPIRED');

  const interrupted = { ...createBody, clientId: 'interrupted-request' };
  getKeyResponse = 'timeout';
  response = await worker.fetch(request('create', interrupted), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'TNR_ALLOCATION_UNCONFIRMED');
  const unresolvedCount = getKeyCount();
  getKeyResponse = 'OK';
  response = await worker.fetch(request('create', interrupted), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'TNR_ALLOCATION_UNCONFIRMED');
  assert.equal(getKeyCount(), unresolvedCount, 'An unconfirmed vendor request must never be repeated.');

  const rejected = { ...createBody, clientId: 'explicitly-rejected' };
  getKeyResponse = 'ERROR';
  response = await worker.fetch(request('create', rejected), env);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, 'GETKEY_REJECTED');
  getKeyResponse = 'OK';
  response = await worker.fetch(request('create', rejected), env);
  assert.equal(response.status, 200);

  const authCalls = hubCalls.filter(call => new URL(call.url).pathname === '/api/v1/organizer/me');
  const snapshotCalls = hubCalls.filter(call => new URL(call.url).pathname.includes('/api/v1/cloud/tournaments/'));
  assert.equal(authCalls.length, 18, 'Hub authentication must occur exactly once per operation.');
  assert.equal(snapshotCalls.length, 1, 'Only an explicitly enrolled Desktop TNR is checked against its synced snapshot.');
  assert.ok(authCalls.every(call => call.url === 'https://hub.internal/api/v1/organizer/me'));
  console.log('Chess-Results durable TNR lifecycle, verified Desktop recovery and organizer isolation: PASS');
} finally {
  globalThis.fetch = originalFetch;
}
