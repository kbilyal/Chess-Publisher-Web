export const REMOTE_CLOUD_API_BASE = 'https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev';
const isProductionCloudOrigin = typeof window !== 'undefined'
  && /^(chess-publisher\.org|www\.chess-publisher\.org|web\.chess-publisher\.org)$/.test(window.location.hostname);
export const CLOUD_API_BASE = typeof window !== 'undefined' && !isProductionCloudOrigin
  ? '/cloud-api'
  : REMOTE_CLOUD_API_BASE;
export const CLOUD_CLIENT_VERSION = 'chess-publisher-web-online-cloud-beta5';

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

async function identitySafeCreateTournament(token: string, input: any) {
  const internalId = clean(input?.localKey);
  if (!internalId) {
    throw new CloudApiError('Stable tournament identity is required before Cloud CREATE.', {
      status: 409,
      code: 'cloud_identity_missing'
    });
  }

  const listed = await request('/api/v1/cloud/tournaments', { token });
  const tournaments = Array.isArray(listed?.tournaments) ? listed.tournaments : [];
  const matches = tournaments.filter((item: any) => clean(item?.localKey) === internalId);
  if (matches.length > 1) {
    throw new CloudApiError('More than one Cloud tournament has the same stable identity. Automatic selection is blocked.', {
      status: 409,
      code: 'cloud_identity_ambiguous',
      payload: { internalId, matches: matches.map((item: any) => clean(item?.id)).filter(Boolean) }
    });
  }
  if (matches.length === 1) return { ok: true, tournament: matches[0], reused: true };

  return request('/api/v1/cloud/tournaments', { method: 'POST', token, body: input });
}

async function identitySafePutSnapshot(
  token: string,
  id: string,
  baseRevision: number,
  snapshot: any,
  device: { id: string; label: string }
) {
  const internalId = clean(snapshot?.cloudWorkspace?.internalId);
  const snapshotCloudId = clean(snapshot?.cloudWorkspace?.cloudTournamentId);
  const metaResult = await request(`/api/v1/cloud/tournaments/${enc(id)}`, { token });
  const remote = metaResult?.tournament || {};
  const remoteId = clean(remote?.id);
  const remoteInternalId = clean(remote?.localKey);

  if (remoteId && remoteId !== clean(id)) {
    throw new CloudApiError('Cloud tournament identity changed before synchronization.', {
      status: 409,
      code: 'cloud_identity_mismatch'
    });
  }
  if (snapshotCloudId && snapshotCloudId !== clean(id)) {
    throw new CloudApiError('Snapshot belongs to a different Cloud tournament. Write blocked.', {
      status: 409,
      code: 'cloud_identity_mismatch'
    });
  }
  if (internalId && remoteInternalId && internalId !== remoteInternalId) {
    throw new CloudApiError('Stable tournament identity does not match the selected Cloud tournament. Write blocked.', {
      status: 409,
      code: 'cloud_identity_mismatch',
      payload: { internalId, remoteInternalId, cloudTournamentId: id }
    });
  }

  return request(`/api/v1/cloud/tournaments/${enc(id)}/snapshot`, {
    method: 'PUT',
    token,
    headers: { 'X-Expected-Revision': String(baseRevision) },
    body: { baseRevision, snapshot, deviceId: device.id, deviceLabel: device.label }
  });
}

export const cloudApi = {
  workspace: (token: string) => request('/api/v1/cloud/workspace', { token }),
  listTournaments: (token: string) => request('/api/v1/cloud/tournaments', { token }),
  listArchivedTournaments: (token: string) => request('/api/v1/cloud/tournaments/archived', { token }),
  createTournament: identitySafeCreateTournament,
  getTournament: (token: string, id: string) => request(`/api/v1/cloud/tournaments/${enc(id)}`, { token }),
  archiveTournament: (token: string, id: string, expectedRevision: number) => request(`/api/v1/cloud/tournaments/${enc(id)}`, {
    method: 'DELETE',
    token,
    headers: { 'X-Expected-Revision': String(Math.max(0, Number(expectedRevision) || 0)) }
  }),
  restoreArchivedTournament: (token: string, id: string) => request(`/api/v1/cloud/tournaments/${enc(id)}/restore`, { method: 'POST', token }),
  getSnapshot: (token: string, id: string) => request(`/api/v1/cloud/tournaments/${enc(id)}/snapshot`, { token }),
  putSnapshot: identitySafePutSnapshot,
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