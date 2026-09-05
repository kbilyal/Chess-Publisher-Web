import bridgeWorker, { AUTHENTICATED_ORGANIZER } from './worker.js';

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

async function authenticatedOrganizerId(request, env) {
  const token = bearerToken(request);
  if (!token) return { ok: false, status: 401, code: 'ORGANIZER_TOKEN_REQUIRED', message: 'Organizer Token required. Connect Online & Cloud first.' };

  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Client-Version': 'chess-publisher-web-chess-results-ownership-2',
  };

  let response;
  try {
    if (env.HUB_SERVICE && typeof env.HUB_SERVICE.fetch === 'function') {
      response = await env.HUB_SERVICE.fetch(new Request('https://hub.internal/api/v1/organizer/me', {
        method: 'GET',
        headers,
      }));
    } else {
      const hubBase = text(env.HUB_API_BASE) || 'https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev';
      response = await fetch(`${hubBase.replace(/\/$/, '')}/api/v1/organizer/me`, {
        method: 'GET',
        headers,
      });
    }
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

    // Hub authentication is completed exactly once above. The verified organizer
    // identity is passed to the bridge core through a private Symbol capability.
    // GETSID, GETKEY, AES, Source ID 21, upload, and ownership semantics remain unchanged.
    return bridgeWorker.fetch(request, scopedEnv(env, auth.organizerId, creatorId));
  },
};
