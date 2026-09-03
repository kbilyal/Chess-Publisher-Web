const DIRECT_CLOUD_API_BASE = 'https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev';

function isAiStudioPreview() {
  if (typeof window === 'undefined') return false;
  const host = String(window.location.hostname || '').toLowerCase();
  return host === 'ai.studio' || host.endsWith('.scf.usercontent.goog');
}

// AI Studio Preview uses a randomized sandbox origin. Route only Preview
// traffic through the same-origin Vite proxy; published Web keeps using the
// Hub API directly.
export const CLOUD_API_BASE = isAiStudioPreview() ? '/hub-api' : DIRECT_CLOUD_API_BASE;
export const CLOUD_CLIENT_VERSION = 'studio-online-cloud-beta4';

export class CloudApiError extends Error {
  status: number;
  code: string;
  currentRevision: number | null;
  payload: any;

  constructor(message: string, options: { status?: number; code?: string; currentRevision?: number | null; payload?: any } = {}) {
    super(message);
    this.name = 'CloudApiError';
    this.status = options.status ?? 0;
    this.code = options.code ?? 'api_error';
    this.currentRevision = options.currentRevision ?? null;
    this.payload = options.payload ?? null;
  }
}

const clean = (value: unknown) => value == null ? '' : String(value).trim();
const enc = (value: unknown) => encodeURIComponent(String(value));

async function request(path: string, options: {
  method?: string;
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
} = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  headers.set('X-Client-Version', CLOUD_CLIENT_VERSION);
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${CLOUD_API_BASE}${path}`, {
      method: options.method || 'GET',
      headers,
      body,
      cache: 'no-store'
    });
  } catch (error: any) {
    throw new CloudApiError('Cloud Workspace is unavailable.', {
      code: 'network_error',
      payload: {
        message: error?.message || String(error),
        base: CLOUD_API_BASE,
        origin: typeof window !== 'undefined' ? window.location.origin : ''
      }
    });
  }

  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; }
  catch { data = { raw }; }

  if (!response.ok) {
    throw new CloudApiError(clean(data?.message) || `HTTP ${response.status}`, {
      status: response.status,
      code: clean(data?.error) || `http_${response.status}`,
      currentRevision: Number.isFinite(Number(data?.currentRevision)) ? Number(data.currentRevision) : null,
      payload: data
    });
  }

  return data;
}

export const cloudApi = {
  workspace: (token: string) => request('/api/v1/cloud/workspace', { token }),
  listTournaments: (token: string) => request('/api/v1/cloud/tournaments', { token }),
  createTournament: (token: string, input: any) => request('/api/v1/cloud/tournaments', { method: 'POST', token, body: input }),
  getTournament: (token: string, id: string) => request(`/api/v1/cloud/tournaments/${enc(id)}`, { token }),
  getSnapshot: (token: string, id: string) => request(`/api/v1/cloud/tournaments/${enc(id)}/snapshot`, { token }),
  putSnapshot: (token: string, id: string, baseRevision: number, snapshot: any, device: { id: string; label: string }) => request(`/api/v1/cloud/tournaments/${enc(id)}/snapshot`, {
    method: 'PUT',
    token,
    headers: { 'X-Expected-Revision': String(baseRevision) },
    body: { baseRevision, snapshot, deviceId: device.id, deviceLabel: device.label }
  }),
  revisions: (token: string, id: string) => request(`/api/v1/cloud/tournaments/${enc(id)}/revisions`, { token }),
  getRevisionSnapshot: (token: string, id: string, revision: number) => request(`/api/v1/cloud/tournaments/${enc(id)}/revisions/${Number(revision)}`, { token }),
  restore: (token: string, id: string, revision: number) => request(`/api/v1/cloud/tournaments/${enc(id)}/restore/${Number(revision)}`, { method: 'POST', token }),
  getSettings: (token: string) => request('/api/v1/cloud/settings', { token }),
  putSettings: (token: string, baseRevision: number, settings: any, device: { id: string; label: string }) => request('/api/v1/cloud/settings', {
    method: 'PUT',
    token,
    headers: { 'X-Expected-Revision': String(baseRevision) },
    body: { baseRevision, settings, deviceId: device.id, deviceLabel: device.label }
  }),
  settingsRevisions: (token: string) => request('/api/v1/cloud/settings/revisions', { token }),
  restoreSettings: (token: string, revision: number) => request(`/api/v1/cloud/settings/restore/${Number(revision)}`, { method: 'POST', token })
};
