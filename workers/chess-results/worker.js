const SOURCE_ID = 21;
const DEFAULT_HUB_API_BASE = 'https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev';
const DEFAULT_XML_URL = 'https://chess-results.com/xml.aspx';
const DEFAULT_UPLOAD_XML_URL = 'https://chess-results.com/uploadxml.aspx';
const DEFAULT_ADMIN_URL = 'https://chess-results.com/Stammdaten.aspx';
const DEFAULT_UPLOAD_SECTION_URL = 'https://chess-results.com/UploadData.aspx';
const DEFAULT_PUBLIC_BASE = 'https://chess-results.com';
const ALLOWED_OPERATIONS = new Set(['test', 'create', 'publish', 'admin-link', 'delete-authorize', 'unlink']);

class BridgeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'BridgeError';
    this.status = status;
    this.code = code;
  }
}

const text = value => String(value ?? '').trim();
const json = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  },
});

function corsHeaders(request, env) {
  const origin = text(request.headers.get('Origin'));
  const allowed = text(env.WEB_ORIGIN);
  if (!origin || !allowed || origin !== allowed) return { 'Vary': 'Origin' };
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function assertOrigin(request, env) {
  const allowed = text(env.WEB_ORIGIN);
  if (!allowed) throw new BridgeError(500, 'WEB_ORIGIN_NOT_CONFIGURED', 'WEB_ORIGIN is not configured on the Chess-Results Worker.');
  const origin = text(request.headers.get('Origin'));
  if (origin && origin !== allowed) throw new BridgeError(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed to use the Chess-Results Worker.');
}

function bearerToken(request) {
  const match = /^Bearer\s+(.+)$/i.exec(text(request.headers.get('Authorization')));
  const token = text(match?.[1]);
  if (!token) throw new BridgeError(401, 'ORGANIZER_TOKEN_REQUIRED', 'Organizer Token required. Connect Online & Cloud first.');
  return token;
}

async function hubOrganizer(request, env) {
  const token = bearerToken(request);
  const hubBase = text(env.HUB_API_BASE) || DEFAULT_HUB_API_BASE;
  let response;
  try {
    response = await fetch(`${hubBase.replace(/\/$/, '')}/api/v1/organizer/me`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Client-Version': 'chess-publisher-web-chess-results-worker-1',
      },
    });
  } catch {
    throw new BridgeError(503, 'HUB_AUTH_UNAVAILABLE', 'Organizer Token verification is temporarily unavailable.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new BridgeError(401, 'INVALID_ORGANIZER_TOKEN', 'Invalid Organizer Token.');
    throw new BridgeError(503, 'HUB_AUTH_FAILED', payload.message || 'Organizer Token verification failed.');
  }
  const organizer = payload.organizer || payload.user || payload.account || payload;
  const organizerId = text(organizer?.id || organizer?.organizerId || payload.organizerId);
  if (!organizerId) throw new BridgeError(503, 'HUB_ORGANIZER_ID_MISSING', 'Hub authentication did not return an organizer identity.');
  return { organizerId };
}

function creatorMapping(env, organizerId) {
  let mapping;
  try {
    mapping = JSON.parse(text(env.CHESS_RESULTS_CREATOR_MAP) || '{}');
  } catch {
    throw new BridgeError(500, 'CREATOR_MAP_INVALID', 'Chess-Results creator mapping is not valid JSON.');
  }
  const creatorId = Number(mapping[organizerId]);
  if (!Number.isInteger(creatorId) || creatorId <= 0 || creatorId > 2147483647) {
    throw new BridgeError(403, 'CREATOR_ID_NOT_ASSIGNED', 'This Organizer Token has no Chess-Results CreatorID assignment.');
  }
  return creatorId;
}

function bytesFromSecret(raw, label, allowedLengths) {
  const value = text(raw);
  if (!value) throw new BridgeError(500, `${label}_NOT_CONFIGURED`, `${label} is not configured on the Worker.`);
  let bytes;
  try {
    if (value.startsWith('hex:')) {
      const hex = value.slice(4).replace(/\s+/g, '');
      if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) throw new Error('invalid hex');
      bytes = Uint8Array.from(hex.match(/../g).map(x => Number.parseInt(x, 16)));
    } else if (value.startsWith('base64:')) {
      const binary = atob(value.slice(7));
      bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    } else if (value.startsWith('[')) {
      const arr = JSON.parse(value);
      if (!Array.isArray(arr)) throw new Error('not an array');
      bytes = Uint8Array.from(arr);
    } else if (/^\s*\d+(\s*,\s*\d+)+\s*$/.test(value)) {
      bytes = Uint8Array.from(value.split(',').map(v => Number(v.trim())));
    } else {
      const binary = atob(value);
      bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    }
  } catch {
    throw new BridgeError(500, `${label}_INVALID`, `${label} has an invalid encoding.`);
  }
  if (!allowedLengths.includes(bytes.length)) throw new BridgeError(500, `${label}_INVALID_LENGTH`, `${label} has an invalid byte length.`);
  return bytes;
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function encryptValue(value, env) {
  const keyBytes = bytesFromSecret(env.CHESS_RESULTS_AES_KEY, 'CHESS_RESULTS_AES_KEY', [16, 24, 32]);
  const iv = bytesFromSecret(env.CHESS_RESULTS_AES_IV, 'CHESS_RESULTS_AES_IV', [16]);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, new TextEncoder().encode(String(value)));
  return toHex(encrypted);
}

function parseAttributes(fragment) {
  const attrs = {};
  const re = /([A-Za-z0-9_:-]+)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = re.exec(fragment))) attrs[match[1]] = match[2];
  return attrs;
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function parseBridgeXml(raw) {
  const source = String(raw || '').trim();
  const resultTag = source.match(/<result\b([^>]*)\/?\s*>/i);
  const genericTag = source.match(/<(?:data|securitydata)\b([^>]*)\/?\s*>/i);
  const attrs = parseAttributes((resultTag || genericTag || [null, ''])[1] || '');
  const status = text(attrs.status).toUpperCase();
  const messageMatch = source.match(/<message\b[^>]*(?:Text|text|statusMsg)="([^"]*)"/i);
  const message = decodeXmlEntities(attrs.statusMsg || messageMatch?.[1] || '');
  return { source, attrs, status, message };
}

async function upstreamText(url, init, code) {
  let response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new BridgeError(502, code, 'Chess-Results official bridge is unreachable.');
  }
  const raw = await response.text();
  if (!response.ok) throw new BridgeError(502, code, `Chess-Results official bridge returned HTTP ${response.status}.`);
  return raw;
}

function officialXmlUrl(env, action) {
  const url = new URL(text(env.CHESS_RESULTS_XML_URL) || DEFAULT_XML_URL);
  url.searchParams.set('key1', action);
  return url;
}

async function getSid(env) {
  const action = text(env.CHESS_RESULTS_GETSID_ACTION) || 'GETSID';
  const url = officialXmlUrl(env, action);
  url.searchParams.set('source', String(SOURCE_ID));
  const raw = await upstreamText(url.toString(), { method: 'GET', headers: { 'Accept': 'application/xml,text/xml;q=0.9,*/*;q=0.1' } }, 'GETSID_FAILED');
  const parsed = parseBridgeXml(raw);
  if (parsed.status && parsed.status !== 'OK') throw new BridgeError(502, 'GETSID_REJECTED', parsed.message || 'Chess-Results rejected GETSID.');
  const sid = text(parsed.attrs.sid);
  if (!sid) throw new BridgeError(502, 'GETSID_INVALID_RESPONSE', 'Chess-Results GETSID did not return a SID.');
  const encryptedSid = await encryptValue(sid, env);
  const expected = text(parsed.attrs.sidEncrypt).toUpperCase();
  if (expected && encryptedSid !== expected) throw new BridgeError(500, 'AES_VERIFICATION_FAILED', 'Chess-Results SID encryption verification failed.');
  return { encryptedSid, sidVerified: !expected || encryptedSid === expected, sidComparisonAvailable: Boolean(expected) };
}

function braceXml(xml) {
  return String(xml).replace(/</g, '{').replace(/>/g, '}');
}

function formBody(xml) {
  const form = new URLSearchParams();
  form.set('xml', braceXml(xml));
  return form.toString();
}

async function getKey(env, input, creatorId) {
  const { encryptedSid } = await getSid(env);
  const action = text(env.CHESS_RESULTS_GETKEY_ACTION) || 'GETKEY';
  const url = officialXmlUrl(env, action);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<chessresults>\n<getkey source="${SOURCE_ID}" sid="${encryptedSid}" creatorID="${creatorId}" federation="${xmlEscape(input.federation)}" tournament="${xmlEscape(input.tournament)}" />\n</chessresults>`;
  const raw = await upstreamText(url.toString(), {
    method: 'POST',
    headers: { 'Accept': 'application/xml,text/xml;q=0.9,*/*;q=0.1', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: formBody(xml),
  }, 'GETKEY_FAILED');
  const parsed = parseBridgeXml(raw);
  if (parsed.status && parsed.status !== 'OK') throw new BridgeError(502, 'GETKEY_REJECTED', parsed.message || 'Chess-Results rejected GETKEY.');
  const key = text(parsed.attrs.key);
  if (!/^\d+$/.test(key)) throw new BridgeError(502, 'GETKEY_INVALID_RESPONSE', 'Chess-Results GETKEY did not return a numeric tournament key.');
  return key;
}

function xmlEscape(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;');
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const base64 = String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function hmacKey(env) {
  const secret = text(env.CHESS_RESULTS_OWNERSHIP_HMAC_SECRET);
  if (secret.length < 32) throw new BridgeError(500, 'OWNERSHIP_HMAC_NOT_CONFIGURED', 'Chess-Results ownership signing secret is not configured.');
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signObject(payload, env) {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(env), payloadBytes);
  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifyObject(proof, env) {
  const [payloadPart, signaturePart, extra] = text(proof).split('.');
  if (!payloadPart || !signaturePart || extra) throw new BridgeError(403, 'OWNERSHIP_PROOF_REQUIRED', 'A verified Chess-Results ownership proof is required.');
  let payloadBytes, signatureBytes, payload;
  try {
    payloadBytes = base64UrlDecode(payloadPart);
    signatureBytes = base64UrlDecode(signaturePart);
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    throw new BridgeError(403, 'OWNERSHIP_PROOF_INVALID', 'Chess-Results ownership proof is invalid.');
  }
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(env), signatureBytes, payloadBytes);
  if (!valid) throw new BridgeError(403, 'OWNERSHIP_PROOF_INVALID', 'Chess-Results ownership proof is invalid.');
  return payload;
}

async function createOwnershipProof(env, organizerId, creatorId, key, input) {
  return signObject({
    v: 1,
    purpose: 'chess-results-ownership',
    organizerId,
    creatorId,
    sourceId: SOURCE_ID,
    key,
    clientId: text(input.clientId).slice(0, 160),
    mode: input.mode,
    federation: input.federation,
    issuedAt: new Date().toISOString(),
  }, env);
}

async function verifiedOwnership(env, organizerId, creatorId, key, proof) {
  if (!/^\d+$/.test(text(key))) throw new BridgeError(400, 'INVALID_TNR', 'A numeric Chess-Results TNR is required.');
  const payload = await verifyObject(proof, env);
  if (payload?.purpose !== 'chess-results-ownership' || Number(payload.sourceId) !== SOURCE_ID || text(payload.organizerId) !== organizerId || Number(payload.creatorId) !== creatorId || text(payload.key) !== text(key)) {
    throw new BridgeError(403, 'TNR_OWNERSHIP_MISMATCH', 'This TNR is not verified as owned by the authenticated organizer.');
  }
  return payload;
}

function normalizeCreateInput(body) {
  const modeRaw = text(body.mode).toLowerCase();
  const mode = modeRaw === 'test' ? 'test' : (modeRaw === 'real' || modeRaw === 'real-online' ? 'real' : '');
  if (!mode) throw new BridgeError(400, 'TOURNAMENT_MODE_REQUIRED', 'Choose Real tournament or Test tournament before requesting a TNR.');
  const tournament = text(body.tournament).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').slice(0, 160);
  if (!tournament) throw new BridgeError(400, 'TOURNAMENT_NAME_REQUIRED', 'Tournament name is required.');
  const requestedFederation = text(body.federation).toUpperCase();
  const federation = mode === 'test' ? 'XXX' : requestedFederation;
  if (!/^[A-Z]{3}$/.test(federation)) throw new BridgeError(400, 'INVALID_FEDERATION', 'A three-letter FIDE federation code is required.');
  return { mode, tournament, federation, clientId: text(body.clientId) };
}

function replaceTournamentAttribute(xml, name, value) {
  const re = new RegExp(`(<tournament\\b[^>]*\\s${name}=")[^"]*(")`, 'i');
  if (!re.test(xml)) throw new BridgeError(400, 'INVALID_PUBLICATION_XML', `Tournament XML is missing ${name}.`);
  return xml.replace(re, `$1${xmlEscape(value)}$2`);
}

function securePublicationXml(rawXml, key, ownership, creatorId, encryptedSid, encryptedCreator, encryptedTnr) {
  let xml = String(rawXml || '');
  if (!/^\s*<\?xml\b/i.test(xml) || !/<chessresults\b/i.test(xml)) throw new BridgeError(400, 'INVALID_PUBLICATION_PAYLOAD', 'A Chess-Results XML document is required.');
  const tournamentTag = xml.match(/<tournament\b([^>]*)\/?\s*>/i);
  if (!tournamentTag) throw new BridgeError(400, 'INVALID_PUBLICATION_XML', 'Tournament XML is missing tournament data.');
  const attrs = parseAttributes(tournamentTag[1]);
  if (text(attrs.key) !== text(key)) throw new BridgeError(409, 'TNR_XML_MISMATCH', 'The XML tournament key does not match the verified TNR.');
  xml = replaceTournamentAttribute(xml, 'creator', String(creatorId));
  xml = replaceTournamentAttribute(xml, 'federation', ownership.federation);
  const security = xml.match(/<securitydata\b([^>]*)\/?\s*>/i);
  if (!security) throw new BridgeError(400, 'INVALID_PUBLICATION_XML', 'Tournament XML is missing securitydata.');
  const secured = `<securitydata source="${SOURCE_ID}" sid="${encryptedSid}" creator_sid="${encryptedCreator}" tnr_sid="${encryptedTnr}" />`;
  return xml.replace(/<securitydata\b[^>]*\/?\s*>/i, secured);
}

async function uploadPublication(env, key, ownership, creatorId, xml) {
  const { encryptedSid } = await getSid(env);
  const [encryptedCreator, encryptedTnr] = await Promise.all([encryptValue(String(creatorId), env), encryptValue(String(key), env)]);
  const securedXml = securePublicationXml(xml, key, ownership, creatorId, encryptedSid, encryptedCreator, encryptedTnr);
  const url = text(env.CHESS_RESULTS_UPLOAD_XML_URL) || DEFAULT_UPLOAD_XML_URL;
  const raw = await upstreamText(url, {
    method: 'POST',
    headers: { 'Accept': 'application/xml,text/xml,text/html;q=0.8,*/*;q=0.1', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: formBody(securedXml),
  }, 'UPLOAD_FAILED');
  const parsed = parseBridgeXml(raw);
  const statusMatch = raw.match(/\bstatus\s*=\s*"(OK|WARNING|ERROR)"/i);
  const status = text(parsed.status || statusMatch?.[1]).toUpperCase();
  if (status === 'ERROR') throw new BridgeError(502, 'UPLOAD_REJECTED', parsed.message || 'Chess-Results rejected the XML upload.');
  if (status !== 'OK' && status !== 'WARNING') throw new BridgeError(502, 'UPLOAD_INVALID_RESPONSE', 'Chess-Results upload did not return a verifiable success status.');
  return { status, message: parsed.message || '' };
}

function chessResultsTimestamp(date = new Date()) {
  const parts = [date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()];
  return parts.map((part, index) => String(part).padStart(index === 2 ? 4 : 2, '0')).join('');
}

async function adminUrl(env, key, creatorId, section) {
  const [encryptedCreator, encryptedTnr] = await Promise.all([encryptValue(String(creatorId), env), encryptValue(String(key), env)]);
  if (section === 'upload') {
    const url = new URL(text(env.CHESS_RESULTS_UPLOAD_SECTION_URL) || DEFAULT_UPLOAD_SECTION_URL);
    url.searchParams.set('tnr', key);
    url.searchParams.set('sid', encryptedTnr);
    url.searchParams.set('sid1', encryptedCreator);
    url.searchParams.set('source', String(SOURCE_ID));
    url.searchParams.set('lan', '1');
    url.searchParams.set('time', chessResultsTimestamp());
    return url.toString();
  }
  const url = new URL(text(env.CHESS_RESULTS_ADMIN_URL) || DEFAULT_ADMIN_URL);
  url.searchParams.set('art', '1');
  url.searchParams.set('lan', '1');
  url.searchParams.set('tabkey', '26');
  url.searchParams.set('key1', key);
  url.searchParams.set('luser_sec', encryptedCreator);
  url.searchParams.set('tnr_sec', encryptedTnr);
  return url.toString();
}

async function publicTournamentDeleted(env, key) {
  const base = (text(env.CHESS_RESULTS_PUBLIC_BASE) || DEFAULT_PUBLIC_BASE).replace(/\/$/, '');
  let response;
  try {
    response = await fetch(`${base}/tnr${encodeURIComponent(key)}.aspx?lan=1`, { method: 'GET', headers: { 'Accept': 'text/html,*/*;q=0.5' }, redirect: 'follow' });
  } catch {
    throw new BridgeError(503, 'OWNERSHIP_CHECK_UNAVAILABLE', 'Chess-Results deletion verification is temporarily unavailable.');
  }
  if (response.status === 404 || response.status === 410) return true;
  const body = (await response.text()).slice(0, 300000);
  if (/tournament\s+(?:was\s+)?(?:not\s+found|does\s+not\s+exist)|no\s+tournament\s+found|turnier\s+(?:wurde\s+)?nicht\s+gefunden|turnier\s+existiert\s+nicht/i.test(body)) return true;
  return false;
}

async function parseBody(request) {
  const contentType = text(request.headers.get('Content-Type')).toLowerCase();
  if (!contentType.includes('application/json')) throw new BridgeError(415, 'JSON_REQUIRED', 'Chess-Results Worker accepts JSON requests only.');
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  } catch {
    throw new BridgeError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
}

async function handleOperation(operation, request, env) {
  const { organizerId } = await hubOrganizer(request, env);
  const creatorId = creatorMapping(env, organizerId);
  const body = await parseBody(request);

  if (operation === 'test') {
    const sid = await getSid(env);
    return { ok: true, sourceId: SOURCE_ID, creatorMapped: true, sidVerified: sid.sidVerified, sidComparisonAvailable: sid.sidComparisonAvailable };
  }

  if (operation === 'create') {
    const input = normalizeCreateInput(body);
    const key = await getKey(env, input, creatorId);
    const ownershipProof = await createOwnershipProof(env, organizerId, creatorId, key, input);
    return { ok: true, key, ownershipProof, sourceId: SOURCE_ID, federation: input.federation, mode: input.mode, recovered: false };
  }

  const key = text(body.key);
  const ownership = await verifiedOwnership(env, organizerId, creatorId, key, body.ownershipProof);

  if (operation === 'publish') {
    if (typeof body.xml !== 'string') throw new BridgeError(400, 'INVALID_PUBLICATION_PAYLOAD', 'XML publication payload is required.');
    const result = await uploadPublication(env, key, ownership, creatorId, body.xml);
    return { ok: true, key, uploaded: true, upstreamStatus: result.status, message: result.message };
  }

  if (operation === 'admin-link') {
    const section = body.section === 'upload' ? 'upload' : 'admin';
    return { ok: true, key, section, url: await adminUrl(env, key, creatorId, section) };
  }

  if (operation === 'delete-authorize') {
    return { ok: true, key, url: await adminUrl(env, key, creatorId, 'admin'), verifiedOwner: true };
  }

  if (operation === 'unlink') {
    const deleted = await publicTournamentDeleted(env, key);
    if (!deleted) return { ok: true, key, canUnlink: false, reason: 'Chess-Results still serves this TNR. Delete it from the verified Admin page first, then retry unlink.' };
    return { ok: true, key, canUnlink: true, verifiedOwner: true, verifiedDeleted: true };
  }

  throw new BridgeError(404, 'UNKNOWN_CHESS_RESULTS_OPERATION', 'Unknown Chess-Results operation.');
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    try {
      assertOrigin(request, env);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (request.method !== 'POST') throw new BridgeError(405, 'METHOD_NOT_ALLOWED', 'Use POST for Chess-Results operations.');
      const url = new URL(request.url);
      const match = url.pathname.match(/^\/api\/chess-results\/([a-z-]+)\/?$/i);
      const operation = text(match?.[1]).toLowerCase();
      if (!ALLOWED_OPERATIONS.has(operation)) throw new BridgeError(404, 'UNKNOWN_CHESS_RESULTS_OPERATION', 'Unknown Chess-Results operation.');
      const result = await handleOperation(operation, request, env);
      return json(result, 200, headers);
    } catch (error) {
      if (error instanceof BridgeError) return json({ ok: false, code: error.code, message: error.message }, error.status, headers);
      return json({ ok: false, code: 'CHESS_RESULTS_WORKER_ERROR', message: 'Chess-Results Worker failed safely.' }, 500, headers);
    }
  },
};
