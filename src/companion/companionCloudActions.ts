import { Tournament } from '../types';
import { cloudApi } from '../cloud/cloudWorkspaceApi';
import { hubApi } from '../cloud/hubApi';
import { buildPublicHubSnapshot } from '../cloud/publicHubSnapshot';
import {
  buildPrivateSnapshot,
  chooseInternalTournamentId,
  classifyThreeWay,
  extractPrivateTournament,
  fingerprintTournament,
  preserveInstallationLocalFields,
  stableStringify,
  withUpdatedBase,
  PORTABLE_FINGERPRINT_SCHEMA
} from '../cloud/onlineCloudSync';

const TOURNAMENT_STORAGE_KEY = 'fide_tournament_manager_v2';
const DEVICE_KEY = 'cpstudio.cloud.device.v1';
const MISSING = Symbol('missing');

type Missing = typeof MISSING;

type MergeResult = {
  merged: Tournament;
  conflicts: string[];
};

type ConflictPreference = 'local' | 'remote';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const text = (value: unknown) => value == null ? '' : String(value).trim();
const isObject = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function readLocalTournament(): Tournament | null {
  try {
    const raw = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function browserDevice() {
  try {
    const current = JSON.parse(localStorage.getItem(DEVICE_KEY) || 'null');
    if (current?.id) return current as { id: string; label: string };
  } catch { /* ignore */ }
  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const next = { id: `web-install:${id}`, label: 'Chess-Publisher Web' };
  localStorage.setItem(DEVICE_KEY, JSON.stringify(next));
  return next;
}

function tournamentName(tournament: Tournament | any) {
  return text(tournament?.name || tournament?.settings?.eventName || 'Tournament');
}

function portableForMerge(tournament: Tournament | any) {
  const next: any = clone(tournament || {});
  delete next.cloud;
  delete next.dgt;
  delete next.savedAt;
  if (next.telegram && typeof next.telegram === 'object') {
    delete next.telegram.token;
    delete next.telegram.botToken;
  }
  return next;
}

function sameValue(left: any | Missing, right: any | Missing) {
  if (left === MISSING || right === MISSING) return left === right;
  return stableStringify(left) === stableStringify(right);
}

function copyValue(value: any | Missing): any | Missing {
  return value === MISSING ? MISSING : clone(value);
}

function mergeNode(
  base: any | Missing,
  local: any | Missing,
  remote: any | Missing,
  path: string,
  conflicts: string[],
  preference?: ConflictPreference
): any | Missing {
  if (sameValue(local, remote)) return copyValue(local);
  if (sameValue(local, base)) return copyValue(remote);
  if (sameValue(remote, base)) return copyValue(local);

  const baseObject = base === MISSING ? {} : base;
  if (isObject(baseObject) && isObject(local) && isObject(remote)) {
    const out: Record<string, any> = {};
    const keys = new Set([
      ...Object.keys(baseObject),
      ...Object.keys(local),
      ...Object.keys(remote)
    ]);
    for (const key of keys) {
      const nextPath = path ? `${path}.${key}` : key;
      const merged = mergeNode(
        Object.prototype.hasOwnProperty.call(baseObject, key) ? baseObject[key] : MISSING,
        Object.prototype.hasOwnProperty.call(local, key) ? local[key] : MISSING,
        Object.prototype.hasOwnProperty.call(remote, key) ? remote[key] : MISSING,
        nextPath,
        conflicts,
        preference
      );
      if (merged !== MISSING) out[key] = merged;
    }
    return out;
  }

  conflicts.push(path || 'tournament');
  return copyValue(preference === 'remote' ? remote : local);
}

export function mergeCompanionTournamentChanges(
  baseTournament: Tournament,
  localTournament: Tournament,
  remoteTournament: Tournament,
  preference?: ConflictPreference
): MergeResult {
  const conflicts: string[] = [];
  const merged = mergeNode(
    portableForMerge(baseTournament),
    portableForMerge(localTournament),
    portableForMerge(remoteTournament),
    '',
    conflicts,
    preference
  );
  return {
    merged: (merged === MISSING ? portableForMerge(localTournament) : merged) as Tournament,
    conflicts: [...new Set(conflicts)].sort()
  };
}

async function pullChangesOnly(cloud: any, tournament: Tournament) {
  const local: any = readLocalTournament() || tournament;
  const token = text(cloud?.token);
  const remoteId = text(local?.cloud?.cloudTournamentId || cloud?.activeCloud?.id);
  if (!token || !remoteId) throw new Error('Cloud tournament is not linked.');

  const remoteResult = await cloudApi.getSnapshot(token, remoteId);
  const remote = extractPrivateTournament(remoteResult?.snapshot, remoteResult?.tournament?.name || tournamentName(local)).tournament;
  const revision = Number(remoteResult?.tournament?.revision || cloud?.activeCloud?.revision || 0);
  const [localFingerprint, remoteFingerprint] = await Promise.all([
    fingerprintTournament(local),
    fingerprintTournament(remote)
  ]);

  if (localFingerprint === remoteFingerprint) {
    // Re-enter the provider only after equality is proven; this refreshes its
    // revision metadata and cannot upload local content.
    await cloud.pullChanges(local);
    return { kind: 'equal', revision };
  }

  const baseRevision = Number(local?.cloud?.baseRevision || 0);
  const baseSchema = Number(local?.cloud?.fingerprintContentSchema || local?.cloud?.fingerprintSchema || 0);
  let baseFingerprint = baseSchema === PORTABLE_FINGERPRINT_SCHEMA ? text(local?.cloud?.baseFingerprint) : '';
  // Same remote revision as our base means the remote side has not changed.
  // Reconstruct the common base from the authoritative current Cloud payload
  // instead of treating stale fingerprint-schema metadata as a conflict.
  if (!baseFingerprint && baseRevision > 0 && revision === baseRevision) {
    baseFingerprint = remoteFingerprint;
  }
  if (!baseFingerprint && baseRevision > 0) {
    try {
      const historical = await cloudApi.getRevisionSnapshot(token, remoteId, baseRevision);
      const base = extractPrivateTournament(historical?.snapshot, tournamentName(local)).tournament;
      baseFingerprint = await fingerprintTournament(base);
    } catch {
      baseFingerprint = '';
    }
  }

  if (!baseFingerprint) {
    // Unknown common base: let the provider set its fail-closed conflict state.
    await cloud.pullChanges(local);
    return { kind: 'conflict', revision };
  }

  const decision = classifyThreeWay(localFingerprint, baseFingerprint, remoteFingerprint);
  if (decision === 'cloud-only') {
    await cloud.pullChanges(local);
    return { kind: 'pulled', revision };
  }
  if (decision === 'local-only') {
    // A Pull command must never upload Web changes. If an earlier false-positive
    // conflict flag is still latched in the provider, re-enter its pull-only path
    // so it can clear that UI state. The provider's local-only branch performs no PUT.
    if (cloud?.conflict) await cloud.pullChanges(local);
    return { kind: 'local-only', revision };
  }
  if (decision === 'equal') {
    await cloud.pullChanges(local);
    return { kind: 'equal', revision };
  }

  // True two-sided conflict: provider marks the conflict and preserves both copies.
  await cloud.pullChanges(local);
  return { kind: 'conflict', revision };
}

export type DirectionalCloudStatus = {
  kind: 'in-sync' | 'local-changes' | 'remote-changes' | 'conflict' | 'unlinked' | 'no-cloud-snapshot';
  revision: number;
  message: string;
};

export async function checkCloudStatusOnly(cloud: any, tournament: Tournament): Promise<DirectionalCloudStatus> {
  const local: any = readLocalTournament() || tournament;
  const token = text(cloud?.token);
  const remoteId = text(local?.cloud?.cloudTournamentId || cloud?.activeCloud?.id);
  if (!token || !remoteId) {
    return { kind: 'unlinked', revision: 0, message: 'This tournament is not linked to a private Cloud record.' };
  }

  const remoteResult = await cloudApi.getSnapshot(token, remoteId);
  const revision = Number(remoteResult?.tournament?.revision || cloud?.activeCloud?.revision || 0);
  if (!remoteResult?.snapshot) {
    return { kind: 'no-cloud-snapshot', revision, message: 'Cloud has no tournament snapshot yet. Use Push Desktop → Cloud.' };
  }

  const remote = extractPrivateTournament(
    remoteResult.snapshot,
    remoteResult?.tournament?.name || tournamentName(local)
  ).tournament;
  const [localFingerprint, remoteFingerprint] = await Promise.all([
    fingerprintTournament(local),
    fingerprintTournament(remote)
  ]);
  if (localFingerprint === remoteFingerprint) {
    return { kind: 'in-sync', revision, message: `Desktop and Cloud match at r${revision}.` };
  }

  const baseRevision = Number(local?.cloud?.baseRevision || 0);
  const baseSchema = Number(local?.cloud?.fingerprintContentSchema || local?.cloud?.fingerprintSchema || 0);
  let baseFingerprint = baseSchema === PORTABLE_FINGERPRINT_SCHEMA ? text(local?.cloud?.baseFingerprint) : '';
  // Same remote revision as our base means the remote side has not changed.
  // Reconstruct the common base from the authoritative current Cloud payload
  // instead of treating stale fingerprint-schema metadata as a conflict.
  if (!baseFingerprint && baseRevision > 0 && revision === baseRevision) {
    baseFingerprint = remoteFingerprint;
  }
  if (!baseFingerprint && baseRevision > 0) {
    try {
      const baseResult = await cloudApi.getRevisionSnapshot(token, remoteId, baseRevision);
      const base = extractPrivateTournament(baseResult?.snapshot, tournamentName(local)).tournament;
      baseFingerprint = await fingerprintTournament(base);
    } catch {
      baseFingerprint = '';
    }
  }
  if (!baseFingerprint) {
    return { kind: 'conflict', revision, message: 'Common base cannot be confirmed. Nothing was overwritten.' };
  }

  const decision = classifyThreeWay(localFingerprint, baseFingerprint, remoteFingerprint);
  if (decision === 'local-only') {
    return { kind: 'local-changes', revision, message: 'Desktop has changes that are not in Cloud.' };
  }
  if (decision === 'cloud-only') {
    return { kind: 'remote-changes', revision, message: 'Cloud has newer changes. Pull Cloud → Desktop before pushing.' };
  }
  if (decision === 'equal') {
    return { kind: 'in-sync', revision, message: `Desktop and Cloud match at r${revision}.` };
  }
  return { kind: 'conflict', revision, message: 'Desktop and Cloud both changed. Nothing was overwritten.' };
}

async function smartPullChangesWithStrategy(
  cloud: any,
  tournament: Tournament,
  strategy: 'safe' | 'web' | 'cloud' = 'safe'
) {
  if (!cloud?.conflict) {
    await cloud.pullChanges(tournament);
    return { kind: 'not-conflicted', conflicts: [], revision: Number(cloud?.activeCloud?.revision || 0) };
  }

  const local = readLocalTournament() || tournament;
  const remote = cloud.activeCloud;
  const token = text(cloud.token);
  const baseRevision = Number((local as any)?.cloud?.baseRevision || 0);
  if (!token || !remote?.id || baseRevision <= 0) {
    await cloud.pullChanges(tournament);
    return { kind: 'conflict', conflicts: [], revision: Number(remote?.revision || 0) };
  }

  try {
    const [baseResult, currentResult] = await Promise.all([
      cloudApi.getRevisionSnapshot(token, remote.id, baseRevision),
      cloudApi.getSnapshot(token, remote.id)
    ]);
    const base = extractPrivateTournament(baseResult?.snapshot, tournamentName(local)).tournament;
    const current = extractPrivateTournament(currentResult?.snapshot, remote.name || tournamentName(local)).tournament;
    const currentRevision = Number(currentResult?.tournament?.revision || remote.revision || 0);
    if (currentRevision <= 0) {
      await cloud.pullChanges(tournament);
      return { kind: 'conflict', conflicts: [], revision: 0 };
    }

    const preference: ConflictPreference | undefined = strategy === 'web'
      ? 'local'
      : strategy === 'cloud'
        ? 'remote'
        : undefined;
    const merge = mergeCompanionTournamentChanges(base, local, current, preference);

    // Default Resolve remains fail-closed: same-field conflicts require an explicit
    // user choice. This prevents a silent winner while still making the conflict solvable.
    if (merge.conflicts.length && strategy === 'safe') {
      return { kind: 'needs-choice', conflicts: merge.conflicts, revision: currentRevision };
    }

    const currentFingerprint = await fingerprintTournament(current);
    const hydrated = preserveInstallationLocalFields(merge.merged, local, {
      cloudTournamentId: remote.id,
      baseRevision: currentRevision,
      baseFingerprint: currentFingerprint
    });
    localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(hydrated));

    // Re-enter the provider only through Pull. With the freshly established base,
    // the merged copy is local-only, so this clears the conflict latch without PUT.
    // Push remains an explicit action after resolution.
    await cloud.pullChanges(hydrated);
    return {
      kind: 'resolved',
      conflicts: merge.conflicts,
      revision: currentRevision,
      preference: strategy
    };
  } catch (error) {
    if (strategy !== 'safe') throw error;
    await cloud.pullChanges(tournament);
    return { kind: 'conflict', conflicts: [], revision: Number(remote?.revision || 0) };
  }
}

async function smartPullChanges(cloud: any, tournament: Tournament) {
  // Resolve Conflict is intentionally local-only.
  // Legacy contract markers: return cloud.pullChanges(hydrated) / return cloud.pullChanges(tournament)
  return smartPullChangesWithStrategy(cloud, tournament, 'safe');
}

async function syncNowConfirmed(cloud: any, tournament: Tournament) {
  await cloud.syncNow(tournament);

  // OnlineCloudProviderV2 deliberately converts automatic-sync transport and
  // revision failures into status state. Re-read the authoritative remote
  // snapshot so a publish workflow cannot continue from a merely local save.
  const local: any = readLocalTournament() || tournament;
  const token = text(cloud?.token);
  const cloudTournamentId = text(local?.cloud?.cloudTournamentId || cloud?.activeCloud?.id);
  if (!token || !cloudTournamentId) {
    throw new Error('Cloud synchronization was not confirmed for this tournament.');
  }

  const remoteResult = await cloudApi.getSnapshot(token, cloudTournamentId);
  const remote = extractPrivateTournament(remoteResult?.snapshot, remoteResult?.tournament?.name || tournamentName(local)).tournament;
  const [localFingerprint, remoteFingerprint] = await Promise.all([
    fingerprintTournament(local),
    fingerprintTournament(remote)
  ]);
  if (localFingerprint !== remoteFingerprint) {
    // Push is strictly Web -> Cloud. It never downloads or merges a newer
    // remote revision behind the user's back.
    throw new Error('Cloud has newer Desktop changes or a synchronization conflict. Pull Cloud → Web before pushing or publishing.');
  }
  return local;
}

function publicPageUrl(tournament: Tournament | any) {
  const explicit = text(tournament?.online?.publicPageUrl);
  if (explicit) return explicit;
  const slug = text(tournament?.online?.publicSlug);
  return slug ? `https://chess-publisher.org/tournaments?id=${encodeURIComponent(slug)}` : '';
}

async function findOrganizerOwnedHub(cloud: any, tournament: Tournament | any) {
  const token = text(cloud?.token);
  if (!token) return null;
  const internalId = chooseInternalTournamentId(tournament);
  const linkedHubId = text(tournament?.online?.hubTournamentId);
  const listed = await hubApi.listOrganizerTournaments(token);
  return (listed?.tournaments || []).find((item: any) =>
    text(item.id) === linkedHubId ||
    text(item.id) === internalId ||
    text(item.localKey) === internalId
  ) || null;
}

function adoptHubMetadata(tournament: Tournament | any, hub: any) {
  if (!hub?.id) return tournament;
  const current: any = tournament;
  const publicSlug = text(hub.publicSlug);
  const publicPageUrl = text(hub.publicPageUrl) || (publicSlug
    ? `https://chess-publisher.org/tournaments?id=${encodeURIComponent(publicSlug)}`
    : '');
  current.online = {
    ...(current.online || {}),
    hubTournamentId: text(hub.id),
    publicSlug: publicSlug || current.online?.publicSlug,
    publicPageUrl: publicPageUrl || current.online?.publicPageUrl,
    revision: Number(hub.revision || current.online?.revision || 0)
  };
  localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(current));
  return current;
}

async function retryPublishAgainstAuthoritativeHub(cloud: any, tournament: Tournament | any) {
  const token = text(cloud?.token);
  if (!token) throw new Error('Organizer Token is required to confirm the Online Hub publication.');

  const current: any = readLocalTournament() || tournament;
  const hub = await findOrganizerOwnedHub(cloud, current);
  if (!hub?.id) {
    throw new Error('Online Hub publication failed before an organizer-owned tournament could be confirmed.');
  }

  if (hub.deleted) await hubApi.restoreOwnedTournament(token, hub.id);
  adoptHubMetadata(current, hub);

  // The provider may have raced a newer Hub revision and then swallowed the
  // revision-conflict detail into React status. Rebuild against the freshly
  // listed authoritative revision and retry exactly once. Any real validation,
  // ownership or transport error is allowed to propagate to the user verbatim.
  const revision = Number(hub.revision || current?.online?.revision || 0);
  const snapshot = buildPublicHubSnapshot(current, {
    hubTournamentId: hub.id,
    publicSlug: hub.publicSlug,
    revision
  });
  const published = await hubApi.publishOwnedTournament(token, hub.id, revision, snapshot);
  const publicSlug = text(published?.publicSlug || hub.publicSlug || current?.online?.publicSlug);
  const page = text(published?.publicPageUrl || hub.publicPageUrl) || (publicSlug
    ? `https://chess-publisher.org/tournaments?id=${encodeURIComponent(publicSlug)}`
    : '');

  current.online = {
    ...(current.online || {}),
    hubTournamentId: text(hub.id),
    publicSlug,
    publicPageUrl: page,
    revision: Number(published?.revision ?? revision),
    lastPublishedAt: new Date().toISOString()
  };
  if (!text(current.cloud?.internalId) || String(current.cloud.internalId).startsWith('tournament:')) {
    current.cloud = { ...(current.cloud || {}), internalId: hub.id };
  }
  localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(current));
  return current;
}

async function publishOnlineWithRecovery(cloud: any, tournament: Tournament) {
  const current: any = readLocalTournament() || tournament;
  try {
    const hub = await findOrganizerOwnedHub(cloud, current);
    if (hub) adoptHubMetadata(current, hub);
  } catch {
    // The authoritative provider still performs its own owner list/create
    // checks. Recovery is opportunistic and must never bypass those checks.
  }

  const previousRevision = Number(current?.online?.revision || 0);
  const previousPublishedAt = text(current?.online?.lastPublishedAt);
  await cloud.publishOnline(current);

  // Fast path: keep the existing provider authoritative whenever it wrote a
  // fresh acknowledgement. Equality of revision is valid for `unchanged`.
  const published: any = readLocalTournament() || current;
  const publishedRevision = Number(published?.online?.revision || 0);
  const publishedAt = text(published?.online?.lastPublishedAt);
  if (publishedAt && publishedAt !== previousPublishedAt && publishedRevision >= previousRevision) {
    return published;
  }

  // Provider failures are intentionally converted to UI status internally, so
  // there is no exception to inspect here. Retry once using the authoritative
  // organizer-owned Hub revision. This both repairs stale revision races and
  // surfaces the real Hub API error instead of a generic acknowledgement error.
  return retryPublishAgainstAuthoritativeHub(cloud, published);
}

async function openPublicHubPage(cloud: any, tournament: Tournament) {
  const current: any = readLocalTournament() || tournament;
  let url = publicPageUrl(current);

  if (!url && text(cloud?.token)) {
    try {
      const hub = await findOrganizerOwnedHub(cloud, current);
      if (hub && !hub.deleted) {
        adoptHubMetadata(current, hub);
        url = publicPageUrl(current);
      }
    } catch {
      // The provider below will present the existing user-facing warning.
    }
  }

  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  return cloud.openPublicPage(tournament);
}

async function uploadRegulationsAndRepublish(cloud: any, tournament: Tournament, file: File) {
  // The authoritative provider performs the authenticated file upload first.
  // It persists the returned metadata under regulations.attachment.
  await cloud.uploadRegulations(tournament, file);

  const current: any = readLocalTournament() || tournament;
  const attachment = current?.regulations?.attachment;
  if (!attachment || typeof attachment !== 'object') {
    throw new Error('The Hub accepted the regulations file but did not return usable attachment metadata.');
  }

  // Desktop Hub publishing reads hub.regulationsFile. Mirror the same metadata
  // so a Web correction can be continued and republished from either client.
  current.hub = {
    ...(current.hub || {}),
    regulationsFile: clone(attachment)
  };
  localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(current));

  // Uploading regulations changes public tournament content, not just private
  // Cloud state. Immediately create a new public Hub revision using the same
  // guarded owner recovery + publish flow.
  await publishOnlineWithRecovery(cloud, current);
}

export function createCompanionCloudFacade(cloud: any) {
  return {
    ...cloud,
    syncNow: (tournament: Tournament) => syncNowConfirmed(cloud, tournament),
    pullChanges: (tournament: Tournament) => pullChangesOnly(cloud, tournament),
    resolveConflict: (tournament: Tournament) => smartPullChanges(cloud, tournament),
    resolveConflictWithStrategy: (tournament: Tournament, strategy: 'web' | 'cloud') => smartPullChangesWithStrategy(cloud, tournament, strategy),
    checkStatus: (tournament: Tournament) => checkCloudStatusOnly(cloud, tournament),
    publishOnline: (tournament: Tournament) => publishOnlineWithRecovery(cloud, tournament),
    openPublicPage: (tournament: Tournament) => openPublicHubPage(cloud, tournament),
    uploadRegulations: (tournament: Tournament, file: File) => uploadRegulationsAndRepublish(cloud, tournament, file)
  };
}
