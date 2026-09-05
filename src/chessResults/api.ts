export type ChessResultsApiPayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  error?: string;
  sidVerified?: boolean;
  key?: string;
  url?: string;
  canUnlink?: boolean;
  reason?: string;
  [key: string]: unknown;
};

export class ChessResultsApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 0) { super(message); this.name = 'ChessResultsApiError'; }
}

async function request<T extends ChessResultsApiPayload>(operation: string, body: Record<string, unknown> = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/chess-results/${operation}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (error: any) {
    throw new ChessResultsApiError('network_error', error?.message || 'The Chess-Results bridge is unavailable.');
  }

  const payload = (await response.json().catch(() => ({} as ChessResultsApiPayload))) as ChessResultsApiPayload;
  if (!response.ok || payload.ok === false) {
    throw new ChessResultsApiError(
      String(payload.code || `http_${response.status}`),
      String(payload.message || payload.error || `Chess-Results service HTTP ${response.status}.`),
      response.status,
    );
  }
  return payload as T;
}

export const chessResultsApi = {
  test: () => request<{ sidVerified?: boolean }>('test'),
  create: (body: { tournament: string; federation: string; mode: string; clientId: string }) => request<{ key?: string; recovered?: boolean }>('create', body),
  publish: (body: { key: string; xml: string }) => request<{ ok?: boolean }>('publish', body),
  adminLink: (body: { key: string; section?: 'admin' | 'upload' }) => request<{ url?: string }>('admin-link', body),
  unlink: (body: { key: string; clientId: string; serverError: string }) => request<{ canUnlink?: boolean; reason?: string }>('unlink', body)
};
