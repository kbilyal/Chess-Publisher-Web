import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { XMLParser } from 'fast-xml-parser';
import { encrypt, handleRequest, parseResult } from './worker.js';

const SQL = await initSqlJs();
const db = new SQL.Database();
db.run(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
const DB = { prepare(sql) { return { bind(...args) {
  return { async run() { db.run(sql, args); return { meta: { changes: db.getRowsModified() } }; }, async first() {
    const query = db.prepare(sql); try { query.bind(args); return query.step() ? query.getAsObject() : null; } finally { query.free(); }
  } };
} }; } };
const aes = Buffer.from(Array.from({ length: 16 }, (_, i) => i));
const env = { DB, WEB_ORIGIN: 'https://web.chess-publisher.org', CR_AES_KEY: aes.toString('base64'), CR_AES_IV: aes.toString('base64'),
  HUB: { async fetch(_url, init) { const token = init.headers.Authorization; return new Response(JSON.stringify({ organizer: { id: token === 'Bearer owner' ? 'owner' : 'other' } }), { status: token ? 200 : 401 }); } } };
const cipher = createCipheriv('aes-128-cbc', aes, aes);
assert.equal(await encrypt('12345', env), Buffer.concat([cipher.update('12345'), cipher.final()]).toString('hex').toUpperCase());
let gets = 0, uploads = 0, malformed = false;
const parser = new XMLParser({ ignoreAttributes: false });
async function upstream(url, init) {
  assert.equal(init.redirect, 'manual', 'Workers require manual redirect handling');
  const operation = new URL(url).searchParams.get('key1');
  if (operation === 'GETSID') return new Response(`<chessresults><result status="OK" sid="12345" sidEncrypt="${await encrypt('12345', env)}"/></chessresults>`);
  if (operation === 'GETKEY') {
    gets++;
    if (malformed) throw new Error('Lost upstream response');
    assert.equal(init.method, 'POST');
    const transport = new URLSearchParams(init.body).get('xml');
    assert(!transport.includes('<'));
    const xml = parser.parse(transport.replaceAll('{', '<').replaceAll('}', '>'));
    assert.equal(xml.chessresults.getkey['@_federation'], 'XXX');
    return new Response(`<chessresults><result status="OK" key="${700000 + gets}"/></chessresults>`);
  }
  if (operation === 'UPLOAD') {
    uploads++;
    assert(!init.body.includes('__CP_CR_'));
    return new Response('<chessresults><result status="OK"/></chessresults>');
  }
  return new Response('Tournament details', { status: 200 });
}
const call = async (operation, body, token = 'owner', origin = env.WEB_ORIGIN) => {
  const response = await handleRequest(new Request(`https://worker.example/api/chess-results/${operation}`, {
    method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Origin: origin }, body: JSON.stringify(body)
  }), env, upstream);
  return { status: response.status, body: await response.json(), headers: response.headers };
};
assert.equal((await call('test', {})).body.sidVerified, true);
assert.equal((await call('test', {}, '')).status, 401);
assert.equal((await call('test', {}, 'owner', 'https://evil.example')).status, 403);
const preflight = await handleRequest(new Request('https://worker.example/api/chess-results/publish', { method: 'OPTIONS', headers: { Origin: env.WEB_ORIGIN } }), env, upstream);
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('access-control-allow-origin'), env.WEB_ORIGIN);
assert.equal((await call('create', { tournament: 'Missing identity' })).status, 400);
const create = { tournament: 'Test & demo', mode: 'test', federation: 'BUL', clientId: 'stable-client' };
const results = await Promise.all([call('create', create), call('create', create)]);
assert.equal(gets, 1, 'Concurrent creation must allocate exactly one TNR');
const created = results.find(result => result.status === 200).body;
assert.equal(created.key, '700001');
assert.equal((await call('create', create)).body.key, created.key);
assert.equal(gets, 1);
assert.equal((await call('create', { ...create, mode: 'real' })).status, 409);
const xml = `<?xml version="1.0"?><chessresults><tournamentdata><tournament key="${created.key}"/></tournamentdata><security><securitydata source="21" sid="__CP_CR_SID__" creator_sid="__CP_CR_CREATOR__" tnr_sid="__CP_CR_TNR__"/></security></chessresults>`;
assert.equal((await call('publish', { key: created.key, xml }, 'other')).status, 403);
assert.equal((await call('publish', { key: created.key, xml: xml.replace('700001', '999999') })).status, 400);
assert.equal((await call('publish', { key: created.key, xml })).status, 200);
assert.equal(uploads, 1);
assert.equal((await call('admin-link', { key: created.key }, 'other')).status, 403);
const admin = await call('admin-link', { key: created.key });
assert(new URL(admin.body.url).searchParams.get('luser_sec'));
assert(new URL((await call('admin-link', { key: created.key, section: 'upload' })).body.url).pathname.endsWith('UploadData.aspx'));
assert.equal((await call('unlink', { key: created.key, clientId: create.clientId, serverError: 'Source-ID Tournament (0) != Upload-Parameter (21)' })).body.canUnlink, false, 'Client text cannot forge deletion evidence');
malformed = true;
assert.equal((await call('create', { ...create, clientId: 'lost-response' })).status, 502);
assert.equal((await call('create', { ...create, clientId: 'lost-response' })).status, 409);
assert.equal(gets, 2, 'Unknown upstream outcome must not allocate a duplicate on retry');
assert.throws(() => parseResult('<html>Wrong server</html>', 'UPLOAD'), /no result/);
assert.throws(() => parseResult('<chessresults><result status="ERROR"/></chessresults>', 'UPLOAD'), /ERROR/);
console.log('Hosted official Chess-Results protocol, AES, ownership, durable TNR recovery and failure-injection tests: PASS');
