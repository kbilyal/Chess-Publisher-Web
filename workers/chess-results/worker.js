import { XMLParser, XMLValidator } from 'fast-xml-parser';

const ENDPOINT = 'https://chess-results.com/UploadXML.aspx';
const operations = new Set(['test', 'create', 'publish', 'admin-link', 'delete-authorize', 'unlink']);
const parser = new XMLParser({ ignoreAttributes: false, parseAttributeValue: false, parseTagValue: false });
const text = value => String(value ?? '').trim();
const escapeXml = value => text(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

class ServiceError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function fail(status, message) { throw new ServiceError(status, message); }

export async function boundedText(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) fail(413, 'Request or response is too large.');
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); fail(413, 'Request or response is too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(buffer);
}

export async function encrypt(value, env) {
  // Same AES-128-CBC, PKCS7, UTF-8 and uppercase hex as the supplied desktop service.
  const decode = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (!env.CR_AES_KEY || !env.CR_AES_IV) fail(503, 'Chess-Results server credentials are not configured.');
  const keyBytes = decode(env.CR_AES_KEY), iv = decode(env.CR_AES_IV);
  if (keyBytes.length !== 16 || iv.length !== 16) fail(503, 'Chess-Results server credentials are invalid.');
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['encrypt']);
  const bytes = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, new TextEncoder().encode(String(value)));
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function parseResult(raw, operation) {
  if (/<!DOCTYPE|<!ENTITY/i.test(raw) || XMLValidator.validate(raw) !== true) fail(502, `Chess-Results ${operation} returned invalid XML.`);
  const document = parser.parse(raw);
  const result = document?.chessresults?.result;
  if (!result || Array.isArray(result)) fail(502, `Chess-Results ${operation} response has no result.`);
  if (result['@_status'] !== 'OK') {
    const messages = document.chessresults.messages?.message || document.chessresults.message || result.message || [];
    const message = [messages].flat().map(m => text(m?.['@_Text'] || m?.['#text'] || (typeof m === 'string' ? m : ''))).filter(Boolean).join('; ');
    fail(502, message.slice(0, 1200) || `Chess-Results ${operation} returned ERROR.`);
  }
  return result;
}

async function official(operation, xml, fetchImpl) {
  const url = `${ENDPOINT}?key1=${operation}${operation === 'GETSID' ? '&source=21' : ''}`;
  const response = await fetchImpl(url, {
    method: xml ? 'POST' : 'GET', redirect: 'manual', signal: AbortSignal.timeout(25000),
    headers: { 'User-Agent': 'ChessPublisher/Web (Chess-Results XML Source 21)', ...(xml ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    ...(xml ? { body: new URLSearchParams({ xml: xml.replace(/</g, '{').replace(/>/g, '}') }).toString() } : {})
  });
  if (!response.ok) fail(502, `Chess-Results ${operation} returned HTTP ${response.status}.`);
  return parseResult(await boundedText(response, 2 * 1024 * 1024), operation);
}

async function getSid(env, fetchImpl) {
  const result = await official('GETSID', null, fetchImpl);
  if (!text(result['@_sid'])) fail(502, 'Chess-Results GETSID did not return a security ID.');
  const encrypted = await encrypt(result['@_sid'], env);
  const expected = text(result['@_sidEncrypt']).toUpperCase();
  if (expected && encrypted !== expected) fail(502, 'Chess-Results AES verification failed.');
  return { encrypted, verified: Boolean(expected) };
}

async function authenticate(request, env) {
  const authorization = request.headers.get('authorization');
  if (!/^Bearer\s+\S+/i.test(authorization || '')) fail(401, 'Sign in with your Organizer Token.');
  const response = await env.HUB.fetch('https://hub.internal/api/v1/cloud/workspace', {
    headers: { Authorization: authorization, Accept: 'application/json' }, signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) fail(response.status === 401 || response.status === 403 ? 401 : 503, 'Organizer authentication failed.');
  const workspace = JSON.parse(await boundedText(response, 1024 * 1024));
  const id = text(workspace?.organizer?.id);
  if (!id) fail(503, 'Organizer authentication returned no identity.');
  return id;
}

async function create(body, organizerId, env, fetchImpl) {
  const name = text(body.tournament).slice(0, 160), client = text(body.clientId), mode = text(body.mode).toLowerCase();
  const federation = mode === 'test' ? 'XXX' : text(body.federation).toUpperCase();
  if (!name || !client || client.length > 160 || !['test', 'real'].includes(mode) || !/^[A-Z]{3}$/.test(federation)) fail(400, 'Tournament name, stable client identity, Real/Test choice and federation are required.');
  await env.DB.prepare('INSERT OR IGNORE INTO creators (organizer_id) VALUES (?)').bind(organizerId).run();
  const creator = await env.DB.prepare('SELECT creator_id FROM creators WHERE organizer_id = ?').bind(organizerId).first();
  if (!creator || creator.creator_id > 2147483647) fail(503, 'Creator identity allocation failed.');
  const sid = await getSid(env, fetchImpl);
  // The unique organizer/client row is a durable claim before GETKEY. An uncertain
  // upstream result remains pending and cannot automatically request another TNR.
  const claimed = await env.DB.prepare('INSERT OR IGNORE INTO tournament_keys (organizer_id,client_id,creator_id,tournament,federation,mode) VALUES (?,?,?,?,?,?)')
    .bind(organizerId, client, creator.creator_id, name, federation, mode).run();
  if (!claimed.meta.changes) {
    const saved = await env.DB.prepare('SELECT * FROM tournament_keys WHERE organizer_id = ? AND client_id = ?').bind(organizerId, client).first();
    if (saved.mode !== mode || saved.federation !== federation) fail(409, 'The saved TNR belongs to a different tournament mode/federation. Restore the original selection.');
    if (saved.tnr && saved.state === 'ready') return { ok: true, key: saved.tnr, recovered: true, federation, mode };
    fail(409, 'A previous TNR request is pending or needs recovery. No duplicate TNR was requested.');
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?><chessresults><getkey source="21" sid="${sid.encrypted}" creatorID="${creator.creator_id}" federation="${federation}" tournament="${escapeXml(name)}" /></chessresults>`;
  const result = await official('GETKEY', xml, fetchImpl);
  const key = text(result['@_key']);
  if (!/^\d+$/.test(key)) fail(502, 'Chess-Results GETKEY returned no numeric tournament key.');
  await env.DB.prepare("UPDATE tournament_keys SET tnr = ?, state = 'ready' WHERE organizer_id = ? AND client_id = ?").bind(key, organizerId, client).run();
  return { ok: true, key, federation, mode, recovered: false, sidVerified: sid.verified };
}

async function ownedKey(body, organizerId, env) {
  const key = text(body.key);
  if (!/^\d+$/.test(key)) fail(400, 'A numeric Chess-Results tournament key is required.');
  const row = await env.DB.prepare("SELECT * FROM tournament_keys WHERE organizer_id = ? AND tnr = ? AND state = 'ready'").bind(organizerId, key).first();
  if (!row) fail(403, 'This TNR is not linked to your organizer account. Its verified Desktop mapping must be imported before Web access.');
  if (body.clientId && body.clientId !== row.client_id) fail(403, 'This TNR belongs to a different tournament identity.');
  return row;
}

async function adminLink(row, body, env) {
  const language = Number.isInteger(body.language) && body.language >= 0 && body.language <= 20 ? body.language : 1;
  const upload = body.section === 'upload';
  const url = new URL(upload ? 'https://chess-results.com/UploadData.aspx' : 'https://chess-results.com/Stammdaten.aspx');
  url.search = new URLSearchParams({ ...(upload ? { tnr: row.tnr, source: '0' } : { art: '1', tabkey: '26', key1: row.tnr }), lan: String(language),
    luser_sec: await encrypt(row.creator_id, env), tnr_sec: await encrypt(row.tnr, env) }).toString();
  return url.href;
}

async function publicState(key, fetchImpl) {
  const response = await fetchImpl(`https://chess-results.com/tnr${key}.aspx?lan=1`, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  const html = await boundedText(response, 2 * 1024 * 1024);
  return { confirmedDeleted: response.status === 404 || response.status === 410,
    exists: response.ok && /id="[^\"]*Label_Turnier|Tournament director|Tournament details/i.test(html) ? true : null };
}

export async function handleRequest(request, env, fetchImpl = fetch) {
  const origin = request.headers.get('origin');
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && origin !== env.WEB_ORIGIN) return json({ ok: false, message: 'Web origin is not allowed.' }, 403);
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  try {
    const path = new URL(request.url).pathname;
    if (path === '/api/health' && request.method === 'GET') return json({ ok: true, service: 'Chess-Results publishing', configured: Boolean(env.CR_AES_KEY && env.CR_AES_IV) });
    const operation = /^\/api\/chess-results\/([a-z-]+)$/.exec(path)?.[1];
    if (!operations.has(operation)) fail(404, 'Unknown Chess-Results operation.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers,
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept' } });
    if (request.method !== 'POST') fail(405, 'Use POST for Chess-Results operations.');
    const organizerId = await authenticate(request, env);
    let body;
    try { body = JSON.parse(await boundedText(request, operation === 'publish' ? 22000000 : 131072)); } catch (error) { if (error instanceof ServiceError) throw error; fail(400, 'Invalid JSON request.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'A JSON object is required.');
    if (operation === 'test') { const sid = await getSid(env, fetchImpl); return json({ ok: true, sourceId: 21, sidVerified: sid.verified }); }
    if (operation === 'create') return json(await create(body, organizerId, env, fetchImpl));
    const row = await ownedKey(body, organizerId, env);
    if (operation === 'publish') {
      const xml = typeof body.xml === 'string' ? body.xml : '';
      if (!xml.startsWith('<?xml') || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) fail(400, 'Invalid Chess-Results XML.');
      const document = parser.parse(xml)?.chessresults;
      const tournament = document?.tournamentdata?.tournament, security = document?.security?.securitydata;
      if (text(tournament?.['@_key']) !== row.tnr || text(security?.['@_source']) !== '21' ||
          security?.['@_sid'] !== '__CP_CR_SID__' || security?.['@_creator_sid'] !== '__CP_CR_CREATOR__' || security?.['@_tnr_sid'] !== '__CP_CR_TNR__') fail(400, 'XML tournament key or security placeholders do not match.');
      const sid = await getSid(env, fetchImpl);
      const secured = xml.replaceAll('__CP_CR_SID__', sid.encrypted).replaceAll('__CP_CR_CREATOR__', await encrypt(row.creator_id, env)).replaceAll('__CP_CR_TNR__', await encrypt(row.tnr, env));
      try { await official('UPLOAD', secured, fetchImpl); }
      catch (error) {
        if (error instanceof ServiceError && /Source-ID Tournament.*!=.*Upload-Parameter/i.test(error.message)) await env.DB.prepare('UPDATE tournament_keys SET rejection = ? WHERE organizer_id = ? AND tnr = ?').bind(error.message, organizerId, row.tnr).run();
        throw error;
      }
      await env.DB.prepare('UPDATE tournament_keys SET rejection = NULL WHERE organizer_id = ? AND tnr = ?').bind(organizerId, row.tnr).run();
      return json({ ok: true, key: row.tnr, sidVerified: sid.verified, publicUrl: `https://chess-results.com/tnr${row.tnr}.aspx?lan=1` });
    }
    if (operation === 'admin-link') {
      // Authenticate in the user's browser. Upload navigation then uses the
      // official admin session instead of inventing short-lived session tokens.
      return json({ ok: true, key: row.tnr, url: await adminLink(row, body, env), section: body.section || 'admin' });
    }
    if (!text(body.clientId)) fail(400, 'Stable tournament identity is required.');
    const state = await publicState(row.tnr, fetchImpl);
    if (operation === 'delete-authorize') return json({ ok: true, key: row.tnr,
      canDelete: state.confirmedDeleted || state.exists === true, alreadyDeleted: state.confirmedDeleted,
      adminUrl: state.exists ? await adminLink(row, body, env) : undefined,
      reason: state.exists === null && !state.confirmedDeleted ? 'Public tournament verification was inconclusive.' : '' });
    const canUnlink = state.confirmedDeleted || Boolean(row.rejection);
    if (canUnlink) await env.DB.prepare('DELETE FROM tournament_keys WHERE organizer_id = ? AND tnr = ?').bind(organizerId, row.tnr).run();
    return json({ ok: true, key: row.tnr, canUnlink, ...state, serverRejected: Boolean(row.rejection), reason: canUnlink ? 'Deletion or authenticated source rejection verified.' : 'Deletion is not confirmed; the TNR has been retained.' });
  } catch (error) {
    if (!(error instanceof ServiceError)) console.error({ event: 'chess_results_transport_failure', name: error?.name, message: String(error?.message || '').slice(0, 240) });
    return json({ ok: false, message: error instanceof ServiceError ? error.message : 'Chess-Results service is temporarily unavailable. The existing TNR has been retained.' }, error instanceof ServiceError ? error.status : 502);
  }
}

export default { fetch(request, env) { return handleRequest(request, env); } };
