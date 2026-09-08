import { CLOUD_API_BASE } from './cloudWorkspaceApi';

const enc = (value: unknown) => encodeURIComponent(String(value));

export class HubApiError extends Error {
  status: number;
  code: string;
  payload: any;

  constructor(message: string, status = 0, code = 'hub_api_error', payload: any = null) {
    super(message);
    this.name = 'HubApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

async function request(path: string, options: {
  method?: string;
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  rawBody?: BodyInit;
} = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  // Keep the production browser CORS preflight minimal. Organizer identity is
  // authenticated by Authorization; the optional client-version header is not
  // part of the security contract and can cause the Worker preflight to reject
  // a valid browser request before token validation runs.
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

  let body = options.rawBody;
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
    throw new HubApiError(error?.message || 'Tournament Hub is unavailable.', 0, 'network_error');
  }

  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; }
  catch { data = { raw }; }
  if (!response.ok) {
    throw new HubApiError(data?.message || `HTTP ${response.status}`, response.status, data?.error || `http_${response.status}`, data);
  }
  return data;
}

async function publishOwnedTournament(token: string, id: string, expectedRevision: number, snapshot: any) {
  const headers = { 'X-Expected-Revision': String(expectedRevision) };
  try {
    return await request(`/api/v1/organizer/tournaments/${enc(id)}/snapshot`, {
      method: 'PUT',
      token,
      headers,
      body: snapshot
    });
  } catch (error: any) {
    if (!(error instanceof HubApiError) || error.status !== 404) throw error;

    // Compatibility with the currently deployed Hub API. Older deployments
    // expose the managed snapshot route without the /organizer prefix. Keep the
    // same tournament ID and revision and forward the Organizer Token as both
    // authenticated bearer identity and explicit organizer ownership header.
    // This fallback never creates or relinks a tournament, so it cannot create
    // a duplicate public slug. If the legacy backend still requires a separate
    // per-tournament manage token it will fail closed with 401/403.
    return request(`/api/v1/tournaments/${enc(id)}/snapshot`, {
      method: 'PUT',
      token,
      headers: {
        ...headers,
        'X-Organizer-Token': token
      },
      body: snapshot
    });
  }
}

export const hubApi = {
  health: () => request('/api/v1/health'),
  organizerMe: (token: string) => request('/api/v1/organizer/me', { token }),
  listOrganizerTournaments: (token: string) => request('/api/v1/organizer/tournaments', { token }),
  createOrganizerTournament: (token: string, input: any) => request('/api/v1/organizer/tournaments', { method: 'POST', token, body: input }),
  publishOwnedTournament,
  uploadOwnedRegulations: (token: string, id: string, file: File) => request(`/api/v1/organizer/tournaments/${enc(id)}/regulations-file`, {
    method: 'POST',
    token,
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name)
    },
    rawBody: file
  }),
  deleteOwnedTournament: (token: string, id: string, publicSlug: string) => request(`/api/v1/organizer/tournaments/${enc(id)}`, {
    method: 'DELETE',
    token,
    headers: { 'X-Confirm-Delete': publicSlug }
  }),
  restoreOwnedTournament: (token: string, id: string) => request(`/api/v1/organizer/tournaments/${enc(id)}/restore`, {
    method: 'POST',
    token
  })
};
