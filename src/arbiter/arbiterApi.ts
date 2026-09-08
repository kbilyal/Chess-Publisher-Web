import { REMOTE_CLOUD_API_BASE } from '../cloud/cloudWorkspaceApi';

const clean = (value: unknown) => value == null ? '' : String(value).trim();
const enc = (value: unknown) => encodeURIComponent(String(value));

export type ArbiterSessionSummary = {
  id: string;
  name: string;
  deviceId?: string;
  createdAt?: string;
  lastSeenAt?: string;
  lastSubmitAt?: string;
  online?: boolean;
};

export type ArbiterAccessStatus = {
  ok: boolean;
  tournamentId: string;
  grant: null | {
    id: string;
    createdAt?: string;
    lastUsedAt?: string;
  };
  sessions: ArbiterSessionSummary[];
  pendingResults: number;
};

export type ArbiterSubmission = {
  id: string;
  tournamentId: string;
  round: number;
  board: number;
  whiteKey: string;
  blackKey: string;
  result: string;
  baseRevision: number;
  sessionId: string;
  arbiterName: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ArbiterTournamentView = {
  id: string;
  name: string;
  revision: number;
  round: string;
  players: Array<{
    localKey: string;
    pairingNumber: number;
    name: string;
    rating: number;
    fed: string;
    fideId: string;
    title?: string;
  }>;
  pairings: {
    liveBoards: Record<string, Array<{
      board: number;
      whiteKey: string;
      blackKey: string;
      result: string;
      entryType?: string;
    }>>;
    finalizedRounds?: Record<string, boolean>;
    roundStatus?: Record<string, string>;
  };
};

async function request(path: string, options: {
  method?: string;
  token?: string;
  body?: unknown;
} = {}) {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${REMOTE_CLOUD_API_BASE}${path}`, {
      method: options.method || 'GET',
      headers,
      body,
      cache: 'no-store'
    });
  } catch (error: any) {
    throw new Error(error?.message || 'Arbiter Access is unavailable.');
  }

  const raw = await response.text();
  let payload: any = null;
  try { payload = raw ? JSON.parse(raw) : null; }
  catch { payload = { raw }; }

  if (!response.ok) {
    const error: any = new Error(clean(payload?.message) || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = clean(payload?.error) || `http_${response.status}`;
    error.currentRevision = Number.isFinite(Number(payload?.currentRevision)) ? Number(payload.currentRevision) : null;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export const arbiterApi = {
  organizerStatus: (organizerToken: string, tournamentId: string) =>
    request(`/api/v1/cloud/tournaments/${enc(tournamentId)}/arbiter-access`, { token: organizerToken }) as Promise<ArbiterAccessStatus>,

  createGrant: (organizerToken: string, tournamentId: string) =>
    request(`/api/v1/cloud/tournaments/${enc(tournamentId)}/arbiter-access`, {
      method: 'POST',
      token: organizerToken
    }) as Promise<ArbiterAccessStatus & { accessUrl: string }>,

  revokeGrant: (organizerToken: string, tournamentId: string) =>
    request(`/api/v1/cloud/tournaments/${enc(tournamentId)}/arbiter-access`, {
      method: 'DELETE',
      token: organizerToken
    }) as Promise<{ ok: boolean; revoked: boolean }>,

  organizerPendingResults: (organizerToken: string, tournamentId: string) =>
    request(`/api/v1/cloud/tournaments/${enc(tournamentId)}/arbiter-results`, { token: organizerToken }) as Promise<{ ok: boolean; results: ArbiterSubmission[] }>,

  acknowledgeResults: (organizerToken: string, tournamentId: string, submissionIds: string[]) =>
    request(`/api/v1/cloud/tournaments/${enc(tournamentId)}/arbiter-results/ack`, {
      method: 'POST',
      token: organizerToken,
      body: { submissionIds }
    }) as Promise<{ ok: boolean; acknowledged: number }>,

  join: (accessCode: string, name: string, deviceId: string) =>
    request('/api/v1/arbiter/join', {
      method: 'POST',
      body: { accessCode, name, deviceId }
    }) as Promise<{ ok: boolean; sessionToken: string; session: { id: string; name: string }; tournament: { id: string; name: string } }>,

  tournament: (sessionToken: string) =>
    request('/api/v1/arbiter/tournament', { token: sessionToken }) as Promise<{
      ok: boolean;
      role: 'arbiter';
      permissions: { pairings: true; results: true; publish: false };
      session: { id: string; name: string };
      tournament: ArbiterTournamentView;
    }>,

  submitResult: (sessionToken: string, input: {
    round: number;
    board: number;
    whiteKey: string;
    blackKey: string;
    result: string;
    baseRevision: number;
  }) => request('/api/v1/arbiter/results', {
    method: 'POST',
    token: sessionToken,
    body: input
  }) as Promise<{ ok: boolean; submission: ArbiterSubmission }>
};
