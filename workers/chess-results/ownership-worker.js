import bridgeWorker, { AUTHENTICATED_ORGANIZER } from './worker.js';

const text = value => String(value ?? '').trim();

function bearerToken(request) {
  const match = /^Bearer\s+(.+)$/i.exec(text(request.headers.get('Authorization')));
  return text(match?.[1]);
}

function bridgeCreatorId(env) {
  const creatorId = Number(text(env.CHESS_RESULTS_CREATOR_ID));
  if (!Number.isInteger(creatorId) || creatorId <= 0 || creatorId > 2147483647) return null;
  return creatorId;
}

async function authenticatedOrganizerId(request, env) {
  const token = bearerToken(request);
  if (!token) return null;

  const hubBase = text(env.HUB_API_BASE) || 'https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev';
  let response;
  try {
    response = await fetch(`${hubBase.replace(/\/$/, '')}/api/v1/organizer/me`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Client-Version': 'chess-publisher-web-chess-results-ownership-1',
      },
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  const organizer = payload.organizer || payload.user || payload.account || payload;
  return text(organizer?.id || organizer?.organizerId || payload.organizerId) || null;
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

    const organizerId = await authenticatedOrganizerId(request, env);
    const creatorId = bridgeCreatorId(env);

    // Preserve the bridge Worker's own fail-closed auth/config responses when
    // authentication or bridge configuration is unavailable.
    if (!organizerId || !creatorId) return bridgeWorker.fetch(request, env);

    // Chess-Results CreatorID is a bridge credential only. It is deliberately
    // not mapped per organizer. The authenticated organizer identity is passed
    // to the bridge core through a private Symbol capability so Hub is checked
    // exactly once per request while ownership remains organizerId + TNR scoped.
    return bridgeWorker.fetch(request, scopedEnv(env, organizerId, creatorId));
  },
};
