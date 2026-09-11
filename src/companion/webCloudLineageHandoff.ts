import { Tournament } from '../types';
import { cloudApi } from '../cloud/cloudWorkspaceApi';
import {
  extractPrivateTournament,
  fingerprintTournament,
  PORTABLE_FINGERPRINT_SCHEMA
} from '../cloud/onlineCloudSync';

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

function timestamp(value: unknown) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

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
  if (existingFingerprint && existingSchema > incomingSchema) return true;

  // A stale React copy can carry the correct baseRevision while still carrying
  // an older, non-empty fingerprint. Revision equality alone therefore is not
  // enough to allow that UI write to replace a newer accepted lineage. Prefer
  // the lineage with the newer synchronization timestamp. Authoritative Cloud
  // repairs always stamp a fresh lastSyncAt and are allowed through.
  if (existingFingerprint && incomingFingerprint && existingFingerprint !== incomingFingerprint) {
    const existingSyncAt = timestamp(existingCloud.lastSyncAt);
    const incomingSyncAt = timestamp(incomingCloud.lastSyncAt);
    if (existingSyncAt && existingSyncAt >= incomingSyncAt) return true;
  }

  return false;
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

type SameRevisionBaseRepair = {
  tournament: Tournament;
  sameRevisionBase: boolean;
  repairedFingerprint: boolean;
  revision: number;
};

/**
 * If the authoritative Cloud record is still on exactly the revision stored as
 * this Web copy's common base, the remote side has not changed since that base.
 * Therefore the current Cloud fingerprint is the authoritative base even when
 * an older Web state kept a stale, non-empty baseFingerprint. Repair that
 * metadata before status checks / Pull / SYNC so a Web-only edit cannot be
 * misclassified as BOTH_CHANGED.
 */
async function repairSameRevisionAuthoritativeBase(
  facade: Record<string, any>,
  tournament: Tournament
): Promise<SameRevisionBaseRepair> {
  const current: any = freshTournamentForCloudFacade(facade, tournament);
  const token = text(facade?.token);
  const remoteId = text(current?.cloud?.cloudTournamentId || facade?.activeCloud?.id);
  const baseRevision = Number(current?.cloud?.baseRevision || 0);
  if (!token || !remoteId || baseRevision <= 0) {
    return { tournament: current, sameRevisionBase: false, repairedFingerprint: false, revision: 0 };
  }

  try {
    const remoteResult = await cloudApi.getSnapshot(token, remoteId);
    const revision = Number(remoteResult?.tournament?.revision || facade?.activeCloud?.revision || 0);
    if (!remoteResult?.snapshot || revision <= 0 || revision !== baseRevision) {
      return { tournament: current, sameRevisionBase: false, repairedFingerprint: false, revision };
    }

    const remote = extractPrivateTournament(
      remoteResult.snapshot,
      remoteResult?.tournament?.name || current?.name || current?.settings?.eventName || 'Tournament'
    ).tournament;
    const remoteFingerprint = await fingerprintTournament(remote);
    const currentFingerprint = text(current?.cloud?.baseFingerprint);
    const currentSchema = Number(current?.cloud?.fingerprintContentSchema || current?.cloud?.fingerprintSchema || 0);

    if (currentFingerprint === remoteFingerprint && currentSchema === PORTABLE_FINGERPRINT_SCHEMA) {
      return { tournament: current, sameRevisionBase: true, repairedFingerprint: false, revision };
    }

    const repaired: any = clone(current);
    repaired.cloud = {
      ...(repaired.cloud || {}),
      cloudTournamentId: remoteId,
      baseRevision: revision,
      baseFingerprint: remoteFingerprint,
      fingerprintSchema: PORTABLE_FINGERPRINT_SCHEMA,
      fingerprintContentSchema: PORTABLE_FINGERPRINT_SCHEMA,
      lastSyncAt: new Date().toISOString()
    };
    persistTournament(repaired);
    return { tournament: repaired, sameRevisionBase: true, repairedFingerprint: true, revision };
  } catch {
    // Network/transport failures remain fail-closed in the existing SYNC path.
    return { tournament: current, sameRevisionBase: false, repairedFingerprint: false, revision: 0 };
  }
}

async function clearLatchedPhantomConflict(
  facade: Record<string, any>,
  prepared: SameRevisionBaseRepair
) {
  if (!prepared.sameRevisionBase || !facade?.conflict) return { kind: 'not-needed' };
  const result = await facade.pullChanges(prepared.tournament);
  if (result?.kind === 'conflict') {
    throw new Error('Cloud changed while SYNC was recovering the common base. Review the conflict before pushing.');
  }
  return result;
}

async function syncWithSameRevisionRecovery(facade: Record<string, any>, tournament: Tournament) {
  const prepared = await repairSameRevisionAuthoritativeBase(facade, tournament);
  await clearLatchedPhantomConflict(facade, prepared);
  return facade.syncNow(prepared.tournament);
}

async function pullWithSameRevisionRecovery(facade: Record<string, any>, tournament: Tournament) {
  const prepared = await repairSameRevisionAuthoritativeBase(facade, tournament);
  return facade.pullChanges(prepared.tournament);
}

async function checkStatusWithSameRevisionRecovery(facade: Record<string, any>, tournament: Tournament) {
  const prepared = await repairSameRevisionAuthoritativeBase(facade, tournament);
  return facade.checkStatus(prepared.tournament);
}

async function resolveWithSameRevisionRecovery(
  facade: Record<string, any>,
  tournament: Tournament,
  strategy: 'safe' | 'web' | 'cloud' = 'safe'
) {
  const prepared = await repairSameRevisionAuthoritativeBase(facade, tournament);
  if (prepared.sameRevisionBase) {
    const result = await facade.pullChanges(prepared.tournament);
    if (['local-only', 'equal', 'pulled'].includes(String(result?.kind || ''))) {
      return { kind: 'not-conflicted', conflicts: [], revision: prepared.revision };
    }
  }
  return strategy === 'safe'
    ? facade.resolveConflict(prepared.tournament)
    : facade.resolveConflictWithStrategy(prepared.tournament, strategy);
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
  return {
    ...facade,
    syncNow: (tournament: Tournament) => syncWithSameRevisionRecovery(facade, tournament),
    pullChanges: (tournament: Tournament) => pullWithSameRevisionRecovery(facade, tournament),
    checkStatus: (tournament: Tournament) => checkStatusWithSameRevisionRecovery(facade, tournament),
    resolveConflict: (tournament: Tournament) => resolveWithSameRevisionRecovery(facade, tournament, 'safe'),
    resolveConflictWithStrategy: (tournament: Tournament, strategy: 'web' | 'cloud') =>
      resolveWithSameRevisionRecovery(facade, tournament, strategy),
    publishOnline: (tournament: Tournament) => publishWithPrivateIdentityGuard(facade, tournament)
  } as T;
}
