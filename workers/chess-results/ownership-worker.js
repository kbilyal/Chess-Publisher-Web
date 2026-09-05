import bridgeWorker, { AUTHENTICATED_ORGANIZER } from './worker.js';

const SOURCE_ID = 21;
const text = value => String(value ?? '').trim();
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  },
});

function bearerToken(request) {
  const match = /^Bearer\s+(.+)$/i.exec(text(request.headers.get('Authorization')));
  return text(match?.[1]);
}

function bridgeCreatorId(env) {
  const creatorId = Number(text(env.CHESS_RESULTS_CREATOR_ID));
  if (!Number.isInteger(creatorId) || creatorId <= 0 || creatorId > 2147483647) return null;
  return creatorId;
}

function corsHeaders(request, env) {
  const origin = text(request.headers.get('Origin'));
  const allowed = text(env.WEB_ORIGIN);
  if (!origin || !allowed || origin !== allowed) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function originAllowed(request, env) {
  const allowed = text(env.WEB_ORIGIN);
  const origin = text(request.headers.get('Origin'));
  return Boolean(allowed && (!origin || origin === allowed));
}

function hubHeaders(request) {
  const token = bearerToken(request);
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Client-Version': 'chess-publisher-web-chess-results-ownership-3',
  };
}

async function hubFetch(request, env, path) {
  const headers = hubHeaders(request);
  if (env.HUB_SERVICE && typeof env.HUB_SERVICE.fetch === 'function') {
    return env.HUB_SERVICE.fetch(new Request(`https://hub.internal${path}`, { method: 'GET', headers }));
  }
  const hubBase = text(env.HUB_API_BASE) || 'https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev';
  return fetch(`${hubBase.replace(/\/$/, '')}${path}`, { method: 'GET', headers });
}

async function authenticatedOrganizerId(request, env) {
  const token = bearerToken(request);
  if (!token) return { ok: false, status: 401, code: 'ORGANIZER_TOKEN_REQUIRED', message: 'Organizer Token required. Connect Online & Cloud first.' };

  let response;
  try {
    response = await hubFetch(request, env, '/api/v1/organizer/me');
  } catch {
    return { ok: false, status: 503, code: 'HUB_AUTH_UNAVAILABLE', message: 'Organizer Token verification is temporarily unavailable.' };
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: 401, code: 'INVALID_ORGANIZER_TOKEN', message: 'Invalid Organizer Token.' };
    }
    return {
      ok: false,
      status: 503,
      code: 'HUB_AUTH_FAILED',
      message: payload.message || payload.error || 'Organizer Token verification failed.',
      upstreamStatus: response.status,
    };
  }

  const organizer = payload.organizer || payload.user || payload.account || payload;
  const organizerId = text(organizer?.id || organizer?.organizerId || payload.organizerId);
  if (!organizerId) {
    return { ok: false, status: 503, code: 'HUB_ORGANIZER_ID_MISSING', message: 'Hub authentication did not return an organizer identity.' };
  }
  return { ok: true, organizerId };
}

function scopedEnv(env, organizerId, creatorId) {
  const creatorMap = JSON.stringify({ [organizerId]: String(creatorId) });
  return new Proxy(env, {
    get(target, property) {
      if (property === AUTHENTICATED_ORGANIZER) return { organizerId };
      if (property === 'CHESS_RESULTS_CREATOR_MAP') return creatorMap;
      return Reflect.get(target, property);
    },
  });
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

async function signOwnership(env, organizerId, creatorId, key, tournament, clientId) {
  const secret = text(env.CHESS_RESULTS_OWNERSHIP_HMAC_SECRET);
  if (secret.length < 32) throw new Error('OWNERSHIP_HMAC_NOT_CONFIGURED');
  const mode = text(tournament?.chessResults?.mode || tournament?.settings?.tournamentType || 'real').toLowerCase();
  const federationRaw = text(tournament?.chessResults?.federation || tournament?.settings?.country).toUpperCase();
  const federation = mode === 'test' ? 'XXX' : federationRaw;
  if (!/^[A-Z]{3}$/.test(federation)) throw new Error('TNR_CLAIM_FEDERATION_MISSING');
  const payload = {
    v: 1,
    purpose: 'chess-results-ownership',
    organizerId,
    creatorId,
    sourceId: SOURCE_ID,
    key,
    clientId: text(clientId).slice(0, 160),
    mode: mode || 'real',
    federation,
    issuedAt: new Date().toISOString(),
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const hmacKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', hmacKey, payloadBytes);
  return {
    proof: `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(new Uint8Array(signature))}`,
    federation,
    mode: payload.mode,
  };
}

function findTournamentWithTnr(snapshot, key) {
  const tournaments = snapshot?.data?.tournaments;
  if (!tournaments || typeof tournaments !== 'object' || Array.isArray(tournaments)) return null;
  for (const tournament of Object.values(tournaments)) {
    if (!tournament || typeof tournament !== 'object') continue;
    const crKey = text(tournament?.chessResults?.key);
    const settingsTnr = text(tournament?.settings?.tnr);
    if (crKey && settingsTnr && crKey !== settingsTnr) continue;
    if (crKey === key || settingsTnr === key) return tournament;
  }
  return null;
}

async function claimSyncedTnr(request, env, organizerId, creatorId) {
  if (!originAllowed(request, env)) {
    return json({ ok: false, code: 'ORIGIN_NOT_ALLOWED', message: 'This origin is not allowed to use the Chess-Results Worker.' }, 403, corsHeaders(request, env));
  }
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const key = text(body?.key || body?.tnr);
  const cloudTournamentId = text(body?.cloudTournamentId);
  if (!/^\d+$/.test(key)) return json({ ok: false, code: 'INVALID_TNR', message: 'A numeric Chess-Results TNR is required.' }, 400, corsHeaders(request, env));
  if (!cloudTournamentId) {
    return json({ ok: false, code: 'TNR_CLAIM_REQUIRES_CLOUD_SYNC', message: 'Sync this tournament with Online & Cloud before continuing a desktop-created TNR on the web.' }, 409, corsHeaders(request, env));
  }

  let response;
  try {
    response = await hubFetch(request, env, `/api/v1/cloud/tournaments/${encodeURIComponent(cloudTournamentId)}/snapshot`);
  } catch {
    return json({ ok: false, code: 'TNR_CLAIM_UNAVAILABLE', message: 'The synchronized tournament ownership check is temporarily unavailable.' }, 503, corsHeaders(request, env));
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const denied = response.status === 401 || response.status === 403 || response.status === 404;
    return json({
      ok: false,
      code: denied ? 'TNR_CLAIM_NOT_OWNED' : 'TNR_CLAIM_UNAVAILABLE',
      message: denied ? 'This synchronized tournament is not owned by the authenticated organizer.' : 'The synchronized tournament ownership check failed.',
    }, denied ? 403 : 503, corsHeaders(request, env));
  }

  const snapshot = payload?.snapshot || payload?.data?.snapshot || payload;
  const tournament = findTournamentWithTnr(snapshot, key);
  if (!tournament) {
    return json({ ok: false, code: 'TNR_NOT_IN_SYNCED_TOURNAMENT', message: `TNR ${key} is not present in the organizer-owned synchronized tournament snapshot. Pull/Sync Changes first.` }, 409, corsHeaders(request, env));
  }

  try {
    const signed = await signOwnership(env, organizerId, creatorId, key, tournament, body?.clientId);
    return json({ ok: true, key, ownershipProof: signed.proof, sourceId: SOURCE_ID, federation: signed.federation, mode: signed.mode, recoveredFromCloud: true }, 200, corsHeaders(request, env));
  } catch (error) {
    const code = error?.message === 'TNR_CLAIM_FEDERATION_MISSING' ? 'TNR_CLAIM_FEDERATION_MISSING' : 'OWNERSHIP_HMAC_NOT_CONFIGURED';
    const message = code === 'TNR_CLAIM_FEDERATION_MISSING'
      ? 'The synchronized tournament does not contain a valid three-letter federation for Chess-Results.'
      : 'Chess-Results ownership signing is not configured on the Worker.';
    return json({ ok: false, code, message }, 500, corsHeaders(request, env));
  }
}

function createPreflightFailure(env) {
  if (text(env.CHESS_RESULTS_OWNERSHIP_HMAC_SECRET).length < 32) {
    return { code: 'OWNERSHIP_HMAC_NOT_CONFIGURED', message: 'Chess-Results ownership signing is not configured on the Worker.' };
  }
  if (!text(env.CHESS_RESULTS_AES_KEY)) {
    return { code: 'CHESS_RESULTS_AES_KEY_NOT_CONFIGURED', message: 'CHESS_RESULTS_AES_KEY is not configured on the Worker.' };
  }
  if (!text(env.CHESS_RESULTS_AES_IV)) {
    return { code: 'CHESS_RESULTS_AES_IV_NOT_CONFIGURED', message: 'CHESS_RESULTS_AES_IV is not configured on the Worker.' };
  }
  return null;
}

function secretBytes(raw, allowedLengths) {
  const value = text(raw);
  if (!value) throw new Error('SECRET_MISSING');
  let bytes;
  if (value.startsWith('base64:')) {
    bytes = Uint8Array.from(atob(value.slice(7)), c => c.charCodeAt(0));
  } else if (value.startsWith('hex:')) {
    const hex = value.slice(4).replace(/\s+/g, '');
    bytes = Uint8Array.from(hex.match(/../g) || [], x => Number.parseInt(x, 16));
  } else if (/^\s*\d+(\s*,\s*\d+)+\s*$/.test(value)) {
    bytes = Uint8Array.from(value.split(',').map(v => Number(v.trim())));
  } else {
    bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  }
  if (!allowedLengths.includes(bytes.length)) throw new Error('SECRET_LENGTH');
  return bytes;
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function encryptForBridge(value, env) {
  const keyBytes = secretBytes(env.CHESS_RESULTS_AES_KEY, [16, 24, 32]);
  const iv = secretBytes(env.CHESS_RESULTS_AES_IV, [16]);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt']);
  return toHex(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, new TextEncoder().encode(String(value))));
}

function parseAttrs(fragment) {
  const attrs = {};
  const re = /([A-Za-z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = re.exec(fragment))) attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? '';
  return attrs;
}

function xmlEscape(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;');
}

function replaceTournamentAttribute(xml, name, value) {
  const re = new RegExp(`(<tournament\\b[^>]*\\s${name}=")[^"]*(")`, 'i');
  if (!re.test(xml)) throw new Error(`XML_MISSING_${name.toUpperCase()}`);
  return xml.replace(re, `$1${xmlEscape(value)}$2`);
}

async function verifyDiagnosticProof(env, proof, organizerId, creatorId, key) {
  const [payloadPart, signaturePart, extra] = text(proof).split('.');
  if (!payloadPart || !signaturePart || extra) throw new Error('PROOF_INVALID');
  const payloadBytes = base64UrlDecode(payloadPart);
  const signatureBytes = base64UrlDecode(signaturePart);
  const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  const secret = text(env.CHESS_RESULTS_OWNERSHIP_HMAC_SECRET);
  const hmacKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', hmacKey, signatureBytes, payloadBytes);
  if (!valid || payload?.purpose !== 'chess-results-ownership' || Number(payload.sourceId) !== SOURCE_ID || text(payload.organizerId) !== organizerId || Number(payload.creatorId) !== creatorId || text(payload.key) !== key) {
    throw new Error('PROOF_MISMATCH');
  }
  return payload;
}

function safeUploadPreview(raw) {
  return String(raw || '')
    .replace(/[A-F0-9]{32,}/gi, '[hex-redacted]')
    .replace(/[A-Za-z0-9_-]{80,}/g, '[token-redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 500);
}

function braceXml(xml) {
  return String(xml).replace(/</g, '{').replace(/>/g, '}');
}

async function uploadDiagnostic(request, env, organizerId, creatorId) {
  if (!originAllowed(request, env)) return json({ ok: false, code: 'ORIGIN_NOT_ALLOWED' }, 403, corsHeaders(request, env));
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const key = text(body?.key);
  if (!/^\d+$/.test(key) || typeof body?.xml !== 'string') {
    return json({ ok: false, code: 'DIAGNOSTIC_INPUT_INVALID', message: 'key, ownershipProof and xml are required.' }, 400, corsHeaders(request, env));
  }

  let ownership;
  try {
    ownership = await verifyDiagnosticProof(env, body.ownershipProof, organizerId, creatorId, key);
  } catch {
    return json({ ok: false, code: 'TNR_OWNERSHIP_MISMATCH', message: 'Diagnostic upload requires the verified owner proof.' }, 403, corsHeaders(request, env));
  }

  let xml = String(body.xml);
  const tournament = xml.match(/<tournament\b([^>]*)\/?\s*>/i);
  const attrs = parseAttrs(tournament?.[1] || '');
  if (text(attrs.key) !== key) return json({ ok: false, code: 'TNR_XML_MISMATCH' }, 409, corsHeaders(request, env));

  try {
    xml = replaceTournamentAttribute(xml, 'creator', String(creatorId));
    xml = replaceTournamentAttribute(xml, 'federation', ownership.federation);
    const xmlUrl = new URL(text(env.CHESS_RESULTS_XML_URL) || 'https://chess-results.com/xml.aspx');
    xmlUrl.searchParams.set('key1', text(env.CHESS_RESULTS_GETSID_ACTION) || 'GETSID');
    xmlUrl.searchParams.set('source', String(SOURCE_ID));
    const sidResponse = await fetch(xmlUrl.toString(), { method: 'GET', headers: { Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1' } });
    const sidRaw = await sidResponse.text();
    const sidMatch = sidRaw.match(/\bsid\s*=\s*["']([^"']+)["']/i) || sidRaw.match(/<sid\b[^>]*>([^<]+)<\/sid>/i);
    const sid = text(sidMatch?.[1]);
    if (!sid) return json({ ok: false, code: 'DIAGNOSTIC_GETSID_FAILED', upstreamStatus: sidResponse.status, preview: safeUploadPreview(sidRaw) }, 502, corsHeaders(request, env));

    const [encryptedSid, encryptedCreator, encryptedTnr] = await Promise.all([
      encryptForBridge(sid, env), encryptForBridge(String(creatorId), env), encryptForBridge(key, env),
    ]);
    const secured = `<securitydata source="${SOURCE_ID}" sid="${encryptedSid}" creator_sid="${encryptedCreator}" tnr_sid="${encryptedTnr}" />`;
    if (!/<securitydata\b/i.test(xml)) return json({ ok: false, code: 'DIAGNOSTIC_XML_SECURITY_MISSING' }, 400, corsHeaders(request, env));
    xml = xml.replace(/<securitydata\b[^>]*\/?\s*>/i, secured);

    const form = new URLSearchParams();
    form.set('xml', braceXml(xml));
    const uploadUrl = text(env.CHESS_RESULTS_UPLOAD_XML_URL) || 'https://chess-results.com/uploadxml.aspx';
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Accept: 'application/xml,text/xml,text/html;q=0.8,*/*;q=0.1', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: form.toString(),
    });
    const raw = await response.text();
    return json({
      ok: response.ok,
      diagnostic: true,
      key,
      upstreamStatus: response.status,
      contentType: text(response.headers.get('content-type')),
      responseLength: raw.length,
      preview: safeUploadPreview(raw),
    }, response.ok ? 200 : 502, corsHeaders(request, env));
  } catch (error) {
    return json({ ok: false, code: 'UPLOAD_DIAGNOSTIC_FAILED', message: text(error?.message || error) }, 500, corsHeaders(request, env));
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return bridgeWorker.fetch(request, env);

    const url = new URL(request.url);
    if (!/^\/api\/chess-results\/[a-z-]+\/?$/i.test(url.pathname)) {
      return bridgeWorker.fetch(request, env);
    }

    const auth = await authenticatedOrganizerId(request, env);
    if (!auth.ok) {
      const body = { ok: false, code: auth.code, message: auth.message };
      if (auth.upstreamStatus) body.upstreamStatus = auth.upstreamStatus;
      return json(body, auth.status, corsHeaders(request, env));
    }

    const creatorId = bridgeCreatorId(env);
    if (!creatorId) {
      return json({ ok: false, code: 'CREATOR_ID_NOT_CONFIGURED', message: 'Chess-Results CreatorID is not configured on the Worker.' }, 500, corsHeaders(request, env));
    }

    if (/\/claim\/?$/i.test(url.pathname)) {
      return claimSyncedTnr(request, env, auth.organizerId, creatorId);
    }

    if (/\/upload-diagnostic\/?$/i.test(url.pathname)) {
      return uploadDiagnostic(request, env, auth.organizerId, creatorId);
    }

    if (/\/create\/?$/i.test(url.pathname)) {
      const preflightFailure = createPreflightFailure(env);
      if (preflightFailure) {
        return json({ ok: false, ...preflightFailure }, 500, corsHeaders(request, env));
      }
    }

    // Hub authentication is completed exactly once above. The verified organizer
    // identity is passed to the bridge core through a private Symbol capability.
    // For create, all signing/encryption prerequisites are checked before GETKEY so
    // a missing Worker secret can never allocate a tournament key and fail afterward.
    return bridgeWorker.fetch(request, scopedEnv(env, auth.organizerId, creatorId));
  },
};