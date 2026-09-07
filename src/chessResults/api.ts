export class ChessResultsApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 0) { super(message); this.name = 'ChessResultsApiError'; }
}

export const REMOTE_CHESS_RESULTS_API_PREFIX = 'https://chess-publisher-chess-results.kyamranbilyal.workers.dev/api/chess-results/';
const PRODUCTION_HOSTS = new Set(['chess-publisher.org', 'www.chess-publisher.org', 'web.chess-publisher.org']);
const TOURNAMENT_STORAGE_KEY = 'fide_tournament_manager_v2';
const transientContinuity = new Map<string, string>();

function apiPrefix() {
  if (typeof window !== 'undefined' && PRODUCTION_HOSTS.has(window.location.hostname)) return REMOTE_CHESS_RESULTS_API_PREFIX;
  return '/api/chess-results/';
}

function organizerToken() {
  if (typeof window === 'undefined') return '';
  const sessionKeys = ['cpstudio.organizerToken.session', 'cpweb.organizerToken.session'];
  const localKeys = ['cpstudio.organizerToken.remembered', 'cpweb.organizerToken.remembered'];
  try {
    for (const key of sessionKeys) {
      const value = (sessionStorage.getItem(key) || '').trim();
      if (value) return value;
    }
    for (const key of localKeys) {
      const value = (localStorage.getItem(key) || '').trim();
      if (value) return value;
    }
  } catch { /* storage unavailable */ }
  return '';
}

function readCurrentTournament(): any {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function continuityContext(body: Record<string, unknown> = {}) {
  const tournament = readCurrentTournament();
  const cloudTournamentId = String(
    body.cloudTournamentId ||
    tournament?.cloud?.cloudTournamentId ||
    tournament?.online?.cloudTournamentId ||
    tournament?.hub?.cloudTournamentId ||
    ''
  ).trim();
  const clientId = String(
    body.clientId ||
    tournament?.chessResults?.clientId ||
    tournament?.cloud?.internalId ||
    tournament?.cloud?.localKey ||
    ''
  ).trim();
  return { cloudTournamentId, clientId };
}

function continuityCacheKey(key: string) {
  return `${organizerToken()}::${key}`;
}

async function request(operation: string, body: Record<string, unknown> = {}) {
  const token = organizerToken();
  if (!token) throw new ChessResultsApiError('organizer_token_required', 'Organizer Token is required for Chess-Results publication.', 401);

  let response: Response;
  try {
    response = await fetch(`${apiPrefix()}${operation}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body),
      cache: 'no-store'
    });
  } catch (error: any) {
    throw new ChessResultsApiError('network_error', error?.message || 'The Chess-Results bridge is unavailable.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new ChessResultsApiError(payload.code || `http_${response.status}`, payload.message || payload.error || `Chess-Results service HTTP ${response.status}.`, response.status);
  return payload;
}

async function automaticContinuity(keyRaw: string, body: Record<string, unknown> = {}) {
  const key = String(keyRaw || '').trim();
  if (!/^\d+$/.test(key)) throw new ChessResultsApiError('invalid_tnr', 'A numeric Chess-Results TNR is required.', 400);

  const cached = transientContinuity.get(continuityCacheKey(key));
  if (cached) return cached;

  const { cloudTournamentId, clientId } = continuityContext(body);
  if (!cloudTournamentId) {
    throw new ChessResultsApiError(
      'cloud_sync_required',
      'Sync this tournament with Desktop/Cloud first, then retry Chess-Results. TNR access is restored automatically.',
      409
    );
  }

  try {
    const result = await request('claim', { key, cloudTournamentId, clientId });
    const proof = String(result?.ownershipProof || '').trim();
    if (!proof) throw new ChessResultsApiError('continuity_restore_failed', 'Chess-Results TNR access could not be restored automatically. Sync the tournament and retry.', 409);
    transientContinuity.set(continuityCacheKey(key), proof);
    return proof;
  } catch (error: any) {
    if (error instanceof ChessResultsApiError) {
      const continuityCodes = new Set([
        'OWNERSHIP_PROOF_REQUIRED',
        'OWNERSHIP_PROOF_INVALID',
        'TNR_OWNERSHIP_MISMATCH',
        'TNR_CLAIM_NOT_OWNED',
        'TNR_NOT_IN_SYNCED_TOURNAMENT',
        'TNR_CLAIM_REQUIRES_CLOUD_SYNC'
      ]);
      if (continuityCodes.has(String(error.code || '').toUpperCase())) {
        throw new ChessResultsApiError(
          'continuity_restore_required',
          'Sync the current Desktop/Cloud tournament and retry. Chess-Results TNR access is restored automatically; no separate ownership step is required.',
          error.status || 409
        );
      }
    }
    throw error;
  }
}

async function requestWithAutomaticContinuity(operation: string, body: Record<string, unknown>) {
  const key = String(body.key || '').trim();
  const { cloudTournamentId, clientId } = continuityContext(body);
  const ownershipProof = await automaticContinuity(key, { ...body, cloudTournamentId, clientId });
  return request(operation, { ...body, cloudTournamentId, clientId, ownershipProof });
}

export const chessResultsApi = {
  test: () => request('test'),
  create: async (body: { tournament: string; federation: string; mode: string; clientId: string }) => {
    const result = await request('create', body);
    const key = String(result?.key || '').trim();
    const proof = String(result?.ownershipProof || '').trim();
    if (/^\d+$/.test(key) && proof) transientContinuity.set(continuityCacheKey(key), proof);
    return result;
  },
  publish: (body: { key: string; xml: string; cloudTournamentId?: string; clientId?: string }) => requestWithAutomaticContinuity('publish', body),
  adminLink: (body: { key: string; section?: 'admin' | 'upload'; cloudTournamentId?: string; clientId?: string }) => requestWithAutomaticContinuity('admin-link', body),
  unlink: async (body: { key: string; clientId: string; serverError: string; cloudTournamentId?: string }) => {
    const result = await requestWithAutomaticContinuity('unlink', body);
    if (result?.canUnlink) transientContinuity.delete(continuityCacheKey(String(body.key || '').trim()));
    return result;
  }
};
