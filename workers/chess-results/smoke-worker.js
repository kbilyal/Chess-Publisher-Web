import ownershipWorker from './ownership-worker.js';

const text = value => String(value ?? '').trim();
const ENGINE_RELAY_PREFIX = '/api/engine-relay/';
const ENGINE_RELAY_ROUTES = new Set([
  'health',
  'capabilities',
  'pair',
  'pairing-checker/status',
  'pairing-checker/install',
  'tiebreak-checker/status',
  'tiebreak-checker/install',
  'tiebreak-checker/check',
  'trf26-exchange/check',
]);

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function engineRelayCors(request, env) {
  const origin = text(request.headers.get('Origin'));
  const allowed = text(env.WEB_ORIGIN);
  if (!allowed || origin !== allowed) return { 'Vary': 'Origin' };
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

async function engineRelay(request, env, url) {
  const headers = engineRelayCors(request, env);
  const origin = text(request.headers.get('Origin'));
  const allowed = text(env.WEB_ORIGIN);
  if (!allowed) return json({ ok: false, error: 'relay_origin_not_configured', message: 'WEB_ORIGIN is not configured.' }, 500, headers);
  if (origin !== allowed) return json({ ok: false, error: 'relay_origin_not_allowed', message: 'This origin is not allowed to use the Web engine relay.' }, 403, headers);

  const suffix = url.pathname.slice(ENGINE_RELAY_PREFIX.length).replace(/^\/+|\/+$/g, '');
  if (!ENGINE_RELAY_ROUTES.has(suffix)) return json({ ok: false, error: 'relay_route_not_allowed' }, 404, headers);
  if (!['GET', 'POST', 'OPTIONS'].includes(request.method)) return json({ ok: false, error: 'relay_method_not_allowed' }, 405, headers);
  if (!env.WEB_ENGINE_SERVICE || typeof env.WEB_ENGINE_SERVICE.fetch !== 'function') {
    return json({ ok: false, error: 'engine_relay_unavailable', message: 'Web engine relay is temporarily unavailable.' }, 503, headers);
  }

  const target = new URL(`https://engine.internal/api/engine/${suffix}`);
  target.search = url.search;
  const body = request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS'
    ? undefined
    : await request.arrayBuffer();
  const forwarded = new Request(target.toString(), {
    method: request.method,
    headers: request.headers,
    body,
    redirect: 'manual',
  });
  return env.WEB_ENGINE_SERVICE.fetch(forwarded);
}

function decodeProofPayload(proof) {
  try {
    const payloadPart = text(proof).split('.')[0];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payloadPart.length / 4) * 4, '=');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function smokeXml(key) {
  return `<?xml version="1.0" encoding="UTF-8"?><chessresults><tournamentdata><tournament key="${key}" type="0" name="Chess-Publisher Web Bridge Smoke Test" federation="XXX" creator="100" rounds="1" currentround="0" rankinground="0" from="20260908" to="20260908" ratedfide="N" ratednational="-" replay="1" timecontrol="10+5" chiefarbiter="" mail="" endstatus="N" /></tournamentdata><rounds><round round="1" date="20260908" time="10:00" /></rounds><players><player no="1" id="1" lastname="Test Player 1" firstname="" title="" rtg="1500" rtgfide="1500" rtgnat="0" dob="" sex="m" fed="XXX" board="0" teamno="0" clubname="" fideid="" club="0" typ="" group="" rank="1" kfaktor="20" /><player no="2" id="2" lastname="Test Player 2" firstname="" title="" rtg="1500" rtgfide="1500" rtgnat="0" dob="" sex="m" fed="XXX" board="0" teamno="0" clubname="" fideid="" club="0" typ="" group="" rank="2" kfaktor="20" /></players><playerpairings></playerpairings><security><securitydata source="21" sid="x" creator_sid="x" tnr_sid="x" /></security></chessresults>`;
}

function smokeRequest(request, pathname, key, ownershipProof) {
  const target = new URL(request.url);
  target.pathname = pathname;
  return new Request(target, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ key, ownershipProof, xml: smokeXml(key) }),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith(ENGINE_RELAY_PREFIX)) return engineRelay(request, env, url);

    const isUploadSmoke = request.method === 'POST' && /\/api\/chess-results\/upload-smoke\/?$/i.test(url.pathname);
    const isPublishSmoke = request.method === 'POST' && /\/api\/chess-results\/publish-smoke\/?$/i.test(url.pathname);
    if (isUploadSmoke || isPublishSmoke) {
      let body;
      try { body = await request.clone().json(); } catch { body = {}; }
      const key = text(body?.key);
      const ownershipProof = text(body?.ownershipProof);
      const payload = decodeProofPayload(ownershipProof);
      if (!/^\d+$/.test(key) || !ownershipProof) {
        return json({ ok: false, code: 'SMOKE_INPUT_INVALID', message: 'key and ownershipProof are required.' }, 400);
      }
      if (payload?.mode !== 'test' || payload?.federation !== 'XXX' || text(payload?.key) !== key) {
        return json({ ok: false, code: 'SMOKE_TEST_TNR_REQUIRED', message: 'The short smoke route is restricted to signed test TNRs with federation XXX.' }, 403);
      }
      const pathname = isPublishSmoke ? '/api/chess-results/publish' : '/api/chess-results/upload-diagnostic';
      return ownershipWorker.fetch(smokeRequest(request, pathname, key, ownershipProof), env);
    }
    return ownershipWorker.fetch(request, env);
  },
};
