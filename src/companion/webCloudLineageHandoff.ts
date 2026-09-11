import { Tournament } from '../types';

const TOURNAMENT_STORAGE_KEY = 'fide_tournament_manager_v2';
const INSTALL_MARKER = '__chessPublisherWebCloudLineageGuardV1';

const LINEAGE_KEYS = [
  'cloudTournamentId',
  'internalId',
  'baseRevision',
  'baseFingerprint',
  'fingerprintSchema',
  'fingerprintContentSchema',
  'schemaVersion',
  'lastSyncAt'
] as const;

const text = (value: unknown) => value == null ? '' : String(value).trim();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function linkedIdentity(tournament: any) {
  return {
    cloudTournamentId: text(tournament?.cloud?.cloudTournamentId),
    internalId: text(tournament?.cloud?.internalId || tournament?.internalId)
  };
}

function sameLinkedTournament(existing: any, incoming: any) {
  const left = linkedIdentity(existing);
  const right = linkedIdentity(incoming);
  if (left.cloudTournamentId && right.cloudTournamentId) {
    return left.cloudTournamentId === right.cloudTournamentId;
  }
  return Boolean(left.internalId && right.internalId && left.internalId === right.internalId);
}

function shouldPreserveStoredLineage(existing: any, incoming: any) {
  if (!sameLinkedTournament(existing, incoming)) return false;
  const existingCloud = existing?.cloud || {};
  const incomingCloud = incoming?.cloud || {};
  const existingRevision = Number(existingCloud.baseRevision || 0);
  const incomingRevision = Number(incomingCloud.baseRevision || 0);

  if (existingRevision > incomingRevision) return true;
  if (existingRevision !== incomingRevision || existingRevision <= 0) return false;

  const existingFingerprint = text(existingCloud.baseFingerprint);
  const incomingFingerprint = text(incomingCloud.baseFingerprint);
  if (existingFingerprint && !incomingFingerprint) return true;

  const existingSchema = Number(existingCloud.fingerprintContentSchema || existingCloud.fingerprintSchema || 0);
  const incomingSchema = Number(incomingCloud.fingerprintContentSchema || incomingCloud.fingerprintSchema || 0);
  return Boolean(existingFingerprint && existingSchema > incomingSchema);
}

export function preserveNewestCloudLineage(existing: Tournament | any, incoming: Tournament | any): Tournament {
  if (!existing || !incoming || !shouldPreserveStoredLineage(existing, incoming)) return incoming as Tournament;

  const next: any = clone(incoming);
  const storedCloud = existing?.cloud || {};
  next.cloud = { ...(next.cloud || {}) };
  for (const key of LINEAGE_KEYS) {
    if (storedCloud[key] !== undefined) next.cloud[key] = clone(storedCloud[key]);
  }
  return next as Tournament;
}

export function withLatestStoredCloudLineage(tournament: Tournament): Tournament {
  if (typeof window === 'undefined') return tournament;
  try {
    const raw = window.localStorage.getItem(TOURNAMENT_STORAGE_KEY);
    if (!raw) return tournament;
    return preserveNewestCloudLineage(JSON.parse(raw), tournament);
  } catch {
    return tournament;
  }
}

/**
 * The private Cloud record owns the permanent internalId through its `localKey`.
 * Public Hub IDs are separate publication identities and must never replace it.
 * If an older Web publish path already wrote a Hub ID into cloud.internalId,
 * repair it from the currently-open organizer-owned private Cloud metadata.
 */
export function repairPrivateIdentityFromActiveCloud(
  tournament: Tournament | any,
  activeCloud: any
): Tournament {
  if (!tournament || !activeCloud) return tournament as Tournament;

  const linkedCloudId = text(tournament?.cloud?.cloudTournamentId);
  const activeCloudId = text(activeCloud?.id);
  const activeInternalId = text(activeCloud?.localKey);
  if (!linkedCloudId || !activeCloudId || linkedCloudId !== activeCloudId || !activeInternalId) {
    return tournament as Tournament;
  }

  const currentInternalId = text(tournament?.cloud?.internalId || tournament?.internalId);
  if (currentInternalId === activeInternalId) return tournament as Tournament;

  const repaired: any = clone(tournament);
  repaired.cloud = {
    ...(repaired.cloud || {}),
    cloudTournamentId: activeCloudId,
    internalId: activeInternalId
  };
  return repaired as Tournament;
}

/**
 * A public publish may update online.* metadata, but it is never allowed to
 * rewrite the private Cloud lineage. Preserve the exact private identity that
 * existed immediately before Publish Online while retaining all public metadata.
 */
export function preservePrivateIdentityAfterPublicPublish(
  beforePublish: Tournament | any,
  afterPublish: Tournament | any
): Tournament {
  if (!beforePublish || !afterPublish) return afterPublish as Tournament;

  const privateCloudId = text(beforePublish?.cloud?.cloudTournamentId);
  const privateInternalId = text(beforePublish?.cloud?.internalId || beforePublish?.internalId);
  const afterCloudId = text(afterPublish?.cloud?.cloudTournamentId);
  if (!privateCloudId || !privateInternalId || afterCloudId !== privateCloudId) {
    return afterPublish as Tournament;
  }

  const afterInternalId = text(afterPublish?.cloud?.internalId || afterPublish?.internalId);
  if (afterInternalId === privateInternalId) return afterPublish as Tournament;

  const repaired: any = clone(afterPublish);
  repaired.cloud = {
    ...(repaired.cloud || {}),
    cloudTournamentId: privateCloudId,
    internalId: privateInternalId
  };
  return repaired as Tournament;
}

function readStoredTournament(): Tournament | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TOURNAMENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistTournament(tournament: Tournament) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(tournament));
}

function freshTournamentForCloudFacade(facade: Record<string, any>, tournament: Tournament) {
  const latest = withLatestStoredCloudLineage(tournament);
  const repaired = repairPrivateIdentityFromActiveCloud(latest, facade?.activeCloud);
  if (repaired !== latest) persistTournament(repaired);
  return repaired;
}

async function publishWithPrivateIdentityGuard(facade: Record<string, any>, tournament: Tournament) {
  const beforePublish = freshTournamentForCloudFacade(facade, tournament);
  const result = await facade.publishOnline(beforePublish);

  const storedAfterPublish = readStoredTournament();
  if (storedAfterPublish) {
    const repairedStored = preservePrivateIdentityAfterPublicPublish(beforePublish, storedAfterPublish);
    if (repairedStored !== storedAfterPublish) persistTournament(repairedStored);
  }

  if (result && typeof result === 'object') {
    return preservePrivateIdentityAfterPublicPublish(beforePublish, result as Tournament);
  }
  return result;
}

/**
 * Web Companion has its own React tournament state while the authoritative
 * Cloud provider persists accepted revision lineage directly to localStorage.
 * A later render of stale React state must never write an older common base
 * back over a newer accepted base, otherwise the next Web-only edit can be
 * misclassified as a two-sided Desktop/Cloud conflict.
 */
export function installWebCloudLineageWriteGuard() {
  if (typeof window === 'undefined' || typeof Storage === 'undefined') return;
  const globalScope = globalThis as any;
  if (globalScope[INSTALL_MARKER]) return;

  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function guardedSetItem(key: string, value: string) {
    if (this === window.localStorage && key === TOURNAMENT_STORAGE_KEY) {
      try {
        const existingRaw = window.localStorage.getItem(key);
        if (existingRaw) {
          const existing = JSON.parse(existingRaw);
          const incoming = JSON.parse(value);
          value = JSON.stringify(preserveNewestCloudLineage(existing, incoming));
        }
      } catch {
        // Invalid/non-tournament values keep the native storage behavior.
      }
    }
    return originalSetItem.call(this, key, value);
  };

  globalScope[INSTALL_MARKER] = true;
}

export function protectCompanionCloudFacade<T extends Record<string, any>>(facade: T): T {
  const fresh = (tournament: Tournament) => freshTournamentForCloudFacade(facade, tournament);
  return {
    ...facade,
    syncNow: (tournament: Tournament) => facade.syncNow(fresh(tournament)),
    pullChanges: (tournament: Tournament) => facade.pullChanges(fresh(tournament)),
    checkStatus: (tournament: Tournament) => facade.checkStatus(fresh(tournament)),
    resolveConflict: (tournament: Tournament) => facade.resolveConflict(fresh(tournament)),
    resolveConflictWithStrategy: (tournament: Tournament, strategy: 'web' | 'cloud') =>
      facade.resolveConflictWithStrategy(fresh(tournament), strategy),
    publishOnline: (tournament: Tournament) => publishWithPrivateIdentityGuard(facade, tournament)
  } as T;
}
