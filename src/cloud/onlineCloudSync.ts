import { Tournament } from '../types';

export type ThreeWayDecision = 'equal' | 'cloud-only' | 'local-only' | 'conflict';

export type CloudIdentity = {
  schemaVersion: 4;
  internalId: string;
  localKey: string;
  cloudTournamentId?: string;
  baseRevision?: number;
  baseFingerprint?: string;
  autoBackup?: boolean;
  lastSyncAt?: string;
  fingerprintContentSchema?: number;
};

export const PORTABLE_FINGERPRINT_SCHEMA = 6;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const text = (value: unknown) => value == null ? '' : String(value).trim();
const INSTALLATION_LOCAL_KEYS = new Set([
  'organizertoken','managetoken','managekey','admintoken','authtoken','accesstoken','refreshtoken','devicetoken',
  'password','secret','devicesecret','aeskey','aes','iv','filepath','folderpath','installationpath','windowspath',
  'linuxpath','executablepath','workingdirectory','serialport','usbpath','dgtport'
]);

export function newUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
export function createInstallationLocalKey() { return `web-install:${newUuid()}`; }
export function createInternalTournamentId() { return `tournament:${newUuid()}`; }

export function chooseInternalTournamentId(tournament: Tournament | any, candidates: Array<unknown> = []) {
  const existing = text(tournament?.cloud?.internalId);
  if (existing) return existing;
  const hubId = text(tournament?.online?.hubTournamentId || tournament?.hub?.tournamentId || tournament?.publication?.hubTournamentId);
  if (hubId) return hubId;
  for (const candidate of candidates) { const value = text(candidate); if (value) return value; }
  return createInternalTournamentId();
}

export function ensureLocalIdentity(tournament: Tournament | any, options: {
  internalIdCandidates?: Array<unknown>;
  cloudTournamentId?: string;
  baseRevision?: number;
  baseFingerprint?: string;
} = {}): Tournament {
  const next: any = clone(tournament || {});
  const currentCloud = next.cloud && typeof next.cloud === 'object' ? next.cloud : {};
  const internalId = chooseInternalTournamentId(next, options.internalIdCandidates || []);
  const localKey = text(currentCloud.localKey) || createInstallationLocalKey();
  const currentBase = Number(currentCloud.fingerprintContentSchema || 0) === PORTABLE_FINGERPRINT_SCHEMA
    ? text(currentCloud.baseFingerprint)
    : '';
  next.cloud = {
    ...currentCloud,
    schemaVersion: 4,
    internalId,
    localKey,
    fingerprintContentSchema: PORTABLE_FINGERPRINT_SCHEMA,
    baseFingerprint: options.baseFingerprint || currentBase,
    ...(options.cloudTournamentId ? { cloudTournamentId: options.cloudTournamentId } : {}),
    ...(Number.isInteger(options.baseRevision) ? { baseRevision: options.baseRevision } : {})
  };
  return next as Tournament;
}

export function sanitizePortableValue(value: any): any {
  if (Array.isArray(value)) return value.map(sanitizePortableValue);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) {
    if (INSTALLATION_LOCAL_KEYS.has(key.toLowerCase())) continue;
    out[key] = sanitizePortableValue(item);
  }
  return out;
}

function restoreInstallationLocalKeys(remote: any, local: any) {
  if (!remote || typeof remote !== 'object' || Array.isArray(remote) || !local || typeof local !== 'object' || Array.isArray(local)) return;
  for (const [key, value] of Object.entries(local)) {
    if (INSTALLATION_LOCAL_KEYS.has(key.toLowerCase())) { remote[key] = clone(value); continue; }
    if (remote[key] && typeof remote[key] === 'object' && !Array.isArray(remote[key]) && value && typeof value === 'object' && !Array.isArray(value)) {
      restoreInstallationLocalKeys(remote[key], value);
    }
  }
}

export function tournamentContentForFingerprint(tournament: Tournament | any) {
  const next: any = sanitizePortableValue(clone(tournament || {}));
  delete next.cloud;
  delete next.savedAt;
  delete next.dgt;
  delete next.uiState;
  delete next.runtimeState;
  if (next.online && typeof next.online === 'object') {
    delete next.online.revision;
    delete next.online.lastPublishedAt;
  }
  if (next.telegram && typeof next.telegram === 'object') {
    delete next.telegram.token;
    delete next.telegram.botToken;
  }
  return next;
}

export function stableCanonicalize(value: any): any {
  if (Array.isArray(value)) return value.map(stableCanonicalize);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const key of Object.keys(value).sort()) { if (value[key] !== undefined) out[key] = stableCanonicalize(value[key]); }
    return out;
  }
  return value;
}
export function stableStringify(value: any) { return JSON.stringify(stableCanonicalize(value)); }
export function fingerprintPayload(tournament: Tournament | any) { return stableStringify(tournamentContentForFingerprint(tournament)); }
export async function fingerprintTournament(tournament: Tournament | any) {
  const payload = new TextEncoder().encode(fingerprintPayload(tournament));
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function classifyThreeWay(localFingerprint: string, baseFingerprint: string, cloudFingerprint: string): ThreeWayDecision {
  if (localFingerprint === cloudFingerprint) return 'equal';
  const localChanged = localFingerprint !== baseFingerprint;
  const cloudChanged = cloudFingerprint !== baseFingerprint;
  if (!localChanged && cloudChanged) return 'cloud-only';
  if (localChanged && !cloudChanged) return 'local-only';
  return 'conflict';
}

export function stripForPrivateCloud(tournament: Tournament | any) {
  const source: any = sanitizePortableValue(clone(tournament || {}));
  const internalId = chooseInternalTournamentId(tournament || source);
  const cloudTournamentId = text(tournament?.cloud?.cloudTournamentId || source?.cloud?.cloudTournamentId);
  source.cloud = { schemaVersion: 4, internalId, ...(cloudTournamentId ? { cloudTournamentId } : {}) };
  delete source.dgt;
  delete source.savedAt;
  delete source.uiState;
  delete source.runtimeState;
  if (source.telegram && typeof source.telegram === 'object') { delete source.telegram.token; delete source.telegram.botToken; }
  return source as Tournament;
}

export function preserveInstallationLocalFields(remoteTournament: Tournament | any, currentLocal: Tournament | any, options: {
  cloudTournamentId: string;
  baseRevision: number;
  baseFingerprint: string;
}) {
  const remote: any = clone(remoteTournament || {});
  const current: any = currentLocal || {};
  restoreInstallationLocalKeys(remote, current);
  const internalId = chooseInternalTournamentId(remote, [current?.cloud?.internalId, current?.online?.hubTournamentId, options.cloudTournamentId]);
  remote.cloud = {
    ...(current?.cloud && typeof current.cloud === 'object' ? clone(current.cloud) : {}),
    schemaVersion: 4,
    internalId,
    localKey: text(current?.cloud?.localKey) || createInstallationLocalKey(),
    cloudTournamentId: options.cloudTournamentId,
    baseRevision: options.baseRevision,
    baseFingerprint: options.baseFingerprint,
    fingerprintContentSchema: PORTABLE_FINGERPRINT_SCHEMA,
    autoBackup: current?.cloud?.autoBackup === true,
    lastSyncAt: new Date().toISOString()
  };
  if (current?.dgt) remote.dgt = clone(current.dgt);
  if (current?.telegram && typeof current.telegram === 'object') {
    remote.telegram = { ...(remote.telegram || {}) };
    if (current.telegram.token !== undefined) remote.telegram.token = current.telegram.token;
    if (current.telegram.botToken !== undefined) remote.telegram.botToken = current.telegram.botToken;
  }
  if (current?.hub && typeof current.hub === 'object') {
    remote.hub = { ...(remote.hub || {}) };
    for (const key of ['manageToken','manageKey','adminToken']) if (current.hub[key] !== undefined) remote.hub[key] = clone(current.hub[key]);
  }
  return remote as Tournament;
}

export function withUpdatedBase(tournament: Tournament | any, cloudTournamentId: string, revision: number, fingerprint: string) {
  const next: any = ensureLocalIdentity(tournament, { cloudTournamentId, baseRevision: revision, baseFingerprint: fingerprint });
  next.cloud = {
    ...next.cloud,
    cloudTournamentId,
    baseRevision: revision,
    baseFingerprint: fingerprint,
    fingerprintContentSchema: PORTABLE_FINGERPRINT_SCHEMA,
    lastSyncAt: new Date().toISOString()
  };
  return next as Tournament;
}

export function buildPrivateSnapshot(name: string, tournament: Tournament | any) {
  const clean: any = stripForPrivateCloud(tournament);
  const snapshotName = text(name || clean?.name || clean?.settings?.eventName || 'Tournament') || 'Tournament';
  clean.name = snapshotName;
  const internalId = chooseInternalTournamentId(clean);
  const cloudTournamentId = text(clean?.cloud?.cloudTournamentId || tournament?.cloud?.cloudTournamentId);
  return {
    version: 'V99',
    data: { currentTournament: snapshotName, tournaments: { [snapshotName]: clean }, preferences: {} },
    telegramGlobal: {},
    currentTournament: snapshotName,
    preferences: {},
    cloudWorkspace: {
      schemaVersion: 5,
      scope: 'single-tournament',
      private: true,
      internalId,
      ...(cloudTournamentId ? { cloudTournamentId } : {}),
      fingerprintContentSchema: PORTABLE_FINGERPRINT_SCHEMA,
      clientVersion: 'chess-publisher-web-beta79-unified-sync-compat-v1'
    }
  };
}

export function extractPrivateTournament(snapshot: any, fallbackName = '') {
  const tournaments = snapshot?.data?.tournaments;
  const keys = tournaments && typeof tournaments === 'object' ? Object.keys(tournaments) : [];
  const requestedName = text(snapshot?.data?.currentTournament || snapshot?.currentTournament || fallbackName);
  const name = requestedName && tournaments?.[requestedName] ? requestedName : (keys[0] || requestedName || text(fallbackName));
  const tournament = name && tournaments && typeof tournaments === 'object' ? tournaments[name] : null;
  if (!name || !tournament) throw new Error('Cloud snapshot does not contain a Chess-Publisher tournament object.');
  const hydrated: any = clone(tournament);
  if (!text(hydrated.name)) hydrated.name = name;
  return { name: text(hydrated.name) || name, tournament: hydrated as Tournament };
}
