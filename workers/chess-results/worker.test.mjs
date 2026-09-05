import assert from 'node:assert/strict';
import worker from './worker.js';

const originalFetch = globalThis.fetch;
const calls = [];
const env = {
  WEB_ORIGIN: 'https://web.chess-publisher.org',
  HUB_API_BASE: 'https://hub.example.test',
  CHESS_RESULTS_XML_URL: 'https://chess-results.example.test/xml.aspx',
  CHESS_RESULTS_UPLOAD_XML_URL: 'https://chess-results.example.test/uploadxml.aspx',
  CHESS_RESULTS_ADMIN_URL: 'https://chess-results.example.test/Stammdaten.aspx',
  CHESS_RESULTS_UPLOAD_SECTION_URL: 'https://chess-results.example.test/UploadData.aspx',
  CHESS_RESULTS_PUBLIC_BASE: 'https://chess-results.example.test',
  CHESS_RESULTS_CREATOR_MAP: JSON.stringify({ org_test: 4242 }),
  CHESS_RESULTS_AES_KEY: `base64:${Buffer.alloc(16, 7).toString('base64')}`,
  CHESS_RESULTS_AES_IV: `base64:${Buffer.alloc(16, 9).toString('base64')}`,
  CHESS_RESULTS_OWNERSHIP_HMAC_SECRET: 'test-only-ownership-secret-0123456789abcdef',
};

function request(operation, body = {}, token = 'organizer-token', origin = env.WEB_ORIGIN) {
  return new Request(`https://web.chess-publisher.org/api/chess-results/${operation}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Origin': origin,
    },
    body: JSON.stringify(body),
  });
}

globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  calls.push({ href, init });
  if (href === 'https://hub.example.test/api/v1/organizer/me') {
    assert.equal(init.headers.Authorization, 'Bearer organizer-token');
    return new Response(JSON.stringify({ organizer: { id: 'org_test' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (href.includes('key1=GETSID')) {
    assert.match(href, /source=21/);
    return new Response('<?xml version="1.0"?><chessresults><result sid="987654321" status="OK"/></chessresults>', { status: 200 });
  }
  if (href.includes('key1=GETKEY')) {
    const form = new URLSearchParams(String(init.body || ''));
    const posted = form.get('xml') || '';
    assert.match(posted, /source="21"/);
    assert.match(posted, /creatorID="4242"/);
    assert.match(posted, /federation="XXX"/);
    return new Response('<?xml version="1.0"?><chessresults><result key="7654321" status="OK"/></chessresults>', { status: 200 });
  }
  if (href === 'https://chess-results.example.test/uploadxml.aspx') {
    const form = new URLSearchParams(String(init.body || ''));
    const posted = form.get('xml') || '';
    assert.match(posted, /creator="4242"/);
    assert.doesNotMatch(posted, /creator="9999"/);
    assert.match(posted, /federation="XXX"/);
    assert.match(posted, /securitydata source="21"/);
    assert.doesNotMatch(posted, /__CP_CR_/);
    return new Response('<?xml version="1.0"?><chessresults><result status="OK"/></chessresults>', { status: 200 });
  }
  if (href === 'https://chess-results.example.test/tnr7654321.aspx?lan=1') {
    return new Response('Tournament not found', { status: 200 });
  }
  throw new Error(`Unexpected mock fetch: ${href}`);
};

try {
  let response = await worker.fetch(request('create', { tournament: 'Worker Test', federation: 'BUL', mode: 'test', clientId: 'client-1' }), env);
  assert.equal(response.status, 200);
  const created = await response.json();
  assert.equal(created.ok, true);
  assert.equal(created.key, '7654321');
  assert.equal(created.federation, 'XXX');
  assert.equal(typeof created.ownershipProof, 'string');
  assert.ok(created.ownershipProof.length > 40);

  const xml = '<?xml version="1.0"?><chessresults><tournament key="7654321" federation="BUL" creator="9999" /><security><securitydata source="99" sid="browser" creator_sid="browser" tnr_sid="browser" /></security></chessresults>';
  response = await worker.fetch(request('publish', { key: created.key, ownershipProof: created.ownershipProof, xml }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).uploaded, true);

  response = await worker.fetch(request('admin-link', { key: created.key, ownershipProof: created.ownershipProof, section: 'admin' }), env);
  const admin = await response.json();
  assert.equal(admin.ok, true);
  assert.match(admin.url, /Stammdaten\.aspx/);
  assert.match(admin.url, /key1=7654321/);
  assert.match(admin.url, /luser_sec=/);
  assert.match(admin.url, /tnr_sec=/);

  response = await worker.fetch(request('delete-authorize', { key: created.key, ownershipProof: created.ownershipProof }), env);
  assert.equal((await response.json()).verifiedOwner, true);

  response = await worker.fetch(request('unlink', { key: created.key, ownershipProof: created.ownershipProof }), env);
  const unlinked = await response.json();
  assert.equal(unlinked.canUnlink, true);
  assert.equal(unlinked.verifiedDeleted, true);

  response = await worker.fetch(request('publish', { key: '1111111', ownershipProof: created.ownershipProof, xml }), env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'TNR_OWNERSHIP_MISMATCH');

  response = await worker.fetch(request('test', {}, 'organizer-token', 'https://evil.example'), env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'ORIGIN_NOT_ALLOWED');

  assert.ok(calls.some(call => call.href.includes('/api/v1/organizer/me')));
  console.log('Chess-Results Worker security/protocol contract: PASS');
} finally {
  globalThis.fetch = originalFetch;
}
