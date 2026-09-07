export class ChessResultsApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 0) { super(message); this.name = 'ChessResultsApiError'; }
}

export const REMOTE_CHESS_RESULTS_API_PREFIX = 'https://chess-publisher-chess-results.kyamranbilyal.workers.dev/api/chess-results/';
const PRODUCTION_HOSTS = new Set(['chess-publisher.org', 'www.chess-publisher.org', 'web.chess-publisher.org']);

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

export const chessResultsApi = {
  test: () => request('test'),
  create: (body: { tournament: string; federation: string; mode: string; clientId: string }) => request('create', body),
  publish: (body: { key: string; xml: string }) => request('publish', body),
  adminLink: (body: { key: string; section?: 'admin' | 'upload' }) => request('admin-link', body),
  unlink: (body: { key: string; clientId: string; serverError: string }) => request('unlink', body)
};
