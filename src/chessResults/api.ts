export class ChessResultsApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 0) { super(message); this.name = 'ChessResultsApiError'; }
}

async function request(operation: string, body: Record<string, unknown> = {}) {
  let response: Response;
  try {
    response = await fetch(`/api/chess-results/${operation}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
