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
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const text = (value: unknown) => value == null ? '' : String(value).trim();

export function newUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function createInstallationLocalKey() {
  return `web-install:${newUuid()}`;
}

export function createInternalTournamentId() {
  return `tournament:${newUuid()}`;
}

export function chooseInternalTournamentId(
  tournament: Tournament | any,
  candidates: Array<unknown> = []
) {
  const existing = text(tournament?.cloud?.internalId);
  if (existing) return existing;

  // Desktop beta.4 contract: when a Hub logical ID already exists, private
  // Cloud Workspace reuses that same logical identity.
  const hubId = text(
    tournament?.online?.hubTournamentId ||
    tournament?.hub?.tournamentId ||
    tournament?.publication?.hubTournamentId
  );
  if (hubId) return hubId;

  for (const candidate of candidates) {
    const value = text(candidate);
    if (value) return value;
  }

  return createInternalTournamentId();
}

export function ensureLocalIdentity(
  tournament: Tournament | any,
  options: {
    internalIdCandidates?: Array<unknown>;
    cloudTournamentId?: string;
    baseRevision?: number;
    baseFingerprint?: string;
  } = {}
): Tournament {
  const next: any = clone(tournament || {});
  const currentCloud = next.cloud && typeof next.cloud === 'object' ? next.cloud : {};
  const internalId = chooseInternalTournamentId(next, options.internalIdCandidates || []);
  const localKey = text(currentCloud.localKey) || createInstallationLocalKey();

  next.cloud = {
    ...currentCloud,
    schemaVersion: 4,
    internalId,
    localKey,
    ...(options.cloudTournamentId ? { cloudTournamentId: options.cloudTournamentId } : {}),
    ...(Number.isInteger(options.baseRevision) ? { baseRevision: options.baseRevision } : {}),
    ...(options.baseFingerprint ? { baseFingerprint: options.baseFingerprint } : {})
  };

  return next as Tournament;
}

/**
 * Content compared for three-way sync. Runtime/account/device/cloud-link fields
 * are deliberately excluded so revision bookkeeping itself cannot create a
 * false conflict. DGT mapping is device-local and does not participate in the
 * private portable tournament fingerprint.
 */
export function tournamentContentForFingerprint(tournament: Tournament | any) {
  const next: any = clone(tournament || {});
  delete next.cloud;
  delete next.online;
  delete next.hub;
  delete next.publication;
  delete next.savedAt;
  delete next.dgt;

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
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) continue;
      out[key] = stableCanonicalize(value[key]);
    }
    return out;
  }
  return value;
}

export function stableStringify(value: any) {
  return JSON.stringify(stableCanonicalize(value));
}

export function fingerprintPayload(tournament: Tournament | any) {
  return stableStringify(tournamentContentForFingerprint(tournament));
}

export async function fingerprintTournament(tournament: Tournament | any) {
  const payload = new TextEncoder().encode(fingerprintPayload(tournament));
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function classifyThreeWay(
  localFingerprint: string,
  baseFingerprint: string,
  cloudFingerprint: string
): ThreeWayDecision {
  if (localFingerprint === cloudFingerprint) return 'equal';
  const localChanged = localFingerprint !== baseFingerprint;
  const cloudChanged = cloudFingerprint !== baseFingerprint;
  if (!localChanged && cloudChanged) return 'cloud-only';
  if (localChanged && !cloudChanged) return 'local-only';
  return 'conflict';
}

export function stripForPrivateCloud(tournament: Tournament | any) {
  const next: any = clone(tournament || {});
  const internalId = chooseInternalTournamentId(next);

  // cloud.localKey, base revision/fingerprint and automatic-backup preference
  // are installation/runtime metadata. Only the non-secret logical ID travels.
  next.cloud = {
    schemaVersion: 4,
    internalId
  };

  delete next.dgt;
  delete next.savedAt;

  if (next.telegram && typeof next.telegram === 'object') {
    delete next.telegram.token;
    delete next.telegram.botToken;
  }

  return next as Tournament;
}

export function preserveInstallationLocalFields(
  remoteTournament: Tournament | any,
  currentLocal: Tournament | any,
  options: {
    cloudTournamentId: string;
    baseRevision: number;
    baseFingerprint: string;
  }
) {
  const remote: any = clone(remoteTournament || {});
  const current: any = currentLocal || {};
  const internalId = chooseInternalTournamentId(remote, [
    current?.cloud?.internalId,
    current?.online?.hubTournamentId,
    options.cloudTournamentId
  ]);

  remote.cloud = {
    schemaVersion: 4,
    internalId,
    localKey: text(current?.cloud?.localKey) || createInstallationLocalKey(),
    cloudTournamentId: options.cloudTournamentId,
    baseRevision: options.baseRevision,
    baseFingerprint: options.baseFingerprint,
    autoBackup: current?.cloud?.autoBackup === true,
    lastSyncAt: new Date().toISOString()
  };

  // Never import another device's DGT mapping over this browser/device.
  if (current?.dgt) remote.dgt = clone(current.dgt);

  return remote as Tournament;
}

export function withUpdatedBase(
  tournament: Tournament | any,
  cloudTournamentId: string,
  revision: number,
  fingerprint: string
) {
  const next: any = ensureLocalIdentity(tournament, {
    cloudTournamentId,
    baseRevision: revision,
    baseFingerprint: fingerprint
  });
  next.cloud = {
    ...next.cloud,
    cloudTournamentId,
    baseRevision: revision,
    baseFingerprint: fingerprint,
    lastSyncAt: new Date().toISOString()
  };
  return next as Tournament;
}

export function buildPrivateSnapshot(name: string, tournament: Tournament | any) {
  const clean = stripForPrivateCloud(tournament);
  const internalId = chooseInternalTournamentId(clean);
  return {
    version: 'V99',
    data: {
      currentTournament: name,
      tournaments: { [name]: clean },
      preferences: {}
    },
    telegramGlobal: {},
    currentTournament: name,
    preferences: {},
    cloudWorkspace: {
      schemaVersion: 4,
      scope: 'single-tournament',
      private: true,
      internalId,
      clientVersion: 'studio-online-cloud-beta4'
    }
  };
}

export function extractPrivateTournament(snapshot: any, fallbackName = '') {
  const name = text(snapshot?.data?.currentTournament || snapshot?.currentTournament || fallbackName);
  const tournaments = snapshot?.data?.tournaments;
  const tournament = name && tournaments && typeof tournaments === 'object' ? tournaments[name] : null;
  if (!name || !tournament) {
    throw new Error('Cloud snapshot does not contain a Chess-Publisher tournament object.');
  }
  return { name, tournament: clone(tournament) as Tournament };
}
