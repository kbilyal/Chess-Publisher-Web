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
  const fresh = (tournament: Tournament) => withLatestStoredCloudLineage(tournament);
  return {
    ...facade,
    syncNow: (tournament: Tournament) => facade.syncNow(fresh(tournament)),
    pullChanges: (tournament: Tournament) => facade.pullChanges(fresh(tournament)),
    checkStatus: (tournament: Tournament) => facade.checkStatus(fresh(tournament)),
    resolveConflict: (tournament: Tournament) => facade.resolveConflict(fresh(tournament)),
    resolveConflictWithStrategy: (tournament: Tournament, strategy: 'web' | 'cloud') =>
      facade.resolveConflictWithStrategy(fresh(tournament), strategy),
    publishOnline: (tournament: Tournament) => facade.publishOnline(fresh(tournament))
  } as T;
}
