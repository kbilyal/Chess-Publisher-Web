import { Tournament } from '../types';
import { cloudApi } from '../cloud/cloudWorkspaceApi';
import { hubApi } from '../cloud/hubApi';
import {
  buildPrivateSnapshot,
  chooseInternalTournamentId,
  extractPrivateTournament,
  fingerprintTournament,
  preserveInstallationLocalFields,
  stableStringify,
  withUpdatedBase
} from '../cloud/onlineCloudSync';

const TOURNAMENT_STORAGE_KEY = 'fide_tournament_manager_v2';
const DEVICE_KEY = 'cpstudio.cloud.device.v1';
const MISSING = Symbol('missing');

type Missing = typeof MISSING;

type MergeResult = {
  merged: Tournament;
  conflicts: string[];
};

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
  conflicts: string[]
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
        conflicts
      );
      if (merged !== MISSING) out[key] = merged;
    }
    return out;
  }

  conflicts.push(path || 'tournament');
  return copyValue(local);
}

export function mergeCompanionTournamentChanges(
  baseTournament: Tournament,
  localTournament: Tournament,
  remoteTournament: Tournament
): MergeResult {
  const conflicts: string[] = [];
  const merged = mergeNode(
    portableForMerge(baseTournament),
    portableForMerge(localTournament),
    portableForMerge(remoteTournament),
    '',
    conflicts
  );
  return {
    merged: (merged === MISSING ? portableForMerge(localTournament) : merged) as Tournament,
    conflicts: [...new Set(conflicts)].sort()
  };
}

async function smartPullChanges(cloud: any, tournament: Tournament) {
  if (!cloud?.conflict) return cloud.pullChanges(tournament);

  const local = readLocalTournament() || tournament;
  const remote = cloud.activeCloud;
  const token = text(cloud.token);
  const baseRevision = Number((local as any)?.cloud?.baseRevision || 0);
  if (!token || !remote?.id || baseRevision <= 0) return cloud.pullChanges(tournament);

  try {
    const [baseResult, currentResult] = await Promise.all([
      cloudApi.getRevisionSnapshot(token, remote.id, baseRevision),
      cloudApi.getSnapshot(token, remote.id)
    ]);
    const base = extractPrivateTournament(baseResult?.snapshot, tournamentName(local)).tournament;
    const current = extractPrivateTournament(currentResult?.snapshot, remote.name || tournamentName(local)).tournament;
    const currentRevision = Number(currentResult?.tournament?.revision || remote.revision || 0);
    if (currentRevision <= 0) return cloud.pullChanges(tournament);

    const merge = mergeCompanionTournamentChanges(base, local, current);
    if (merge.conflicts.length) return cloud.pullChanges(tournament);

    const currentFingerprint = await fingerprintTournament(current);
    const hydrated = preserveInstallationLocalFields(merge.merged, local, {
      cloudTournamentId: remote.id,
      baseRevision: currentRevision,
      baseFingerprint: currentFingerprint
    });
    const mergedFingerprint = await fingerprintTournament(hydrated);
    const saved = await cloudApi.putSnapshot(
      token,
      remote.id,
      currentRevision,
      buildPrivateSnapshot(tournamentName(hydrated), hydrated),
      browserDevice()
    );
    const revision = Number(saved?.revision || currentRevision + 1);
    const updated = withUpdatedBase(hydrated, remote.id, revision, mergedFingerprint);
    localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(updated));

    // Re-enter the existing provider's Pull Changes path so it remains the
    // authority that clears conflict state and refreshes its React metadata.
    return cloud.pullChanges(updated);
  } catch {
    // If the merge cannot be proven safe (including a concurrent new revision),
    // fall back to the existing fail-closed three-way workflow. No overwrite.
    return cloud.pullChanges(tournament);
  }
}

function publicPageUrl(tournament: Tournament | any) {
  const explicit = text(tournament?.online?.publicPageUrl);
  if (explicit) return explicit;
  const slug = text(tournament?.online?.publicSlug);
  return slug ? `https://chess-publisher.org/tournaments?id=${encodeURIComponent(slug)}` : '';
}

async function openPublicHubPage(cloud: any, tournament: Tournament) {
  const current: any = readLocalTournament() || tournament;
  let url = publicPageUrl(current);

  if (!url && text(cloud?.token)) {
    try {
      const internalId = chooseInternalTournamentId(current);
      const linkedHubId = text(current?.online?.hubTournamentId);
      const listed = await hubApi.listOrganizerTournaments(cloud.token);
      const hub = (listed?.tournaments || []).find((item: any) =>
        (!item?.deleted) && (
          text(item.id) === linkedHubId ||
          text(item.id) === internalId ||
          text(item.localKey) === internalId
        )
      );
      if (hub) {
        const publicSlug = text(hub.publicSlug);
        url = text(hub.publicPageUrl) || (publicSlug
          ? `https://chess-publisher.org/tournaments?id=${encodeURIComponent(publicSlug)}`
          : '');
        if (url) {
          current.online = {
            ...(current.online || {}),
            hubTournamentId: text(hub.id) || current.online?.hubTournamentId,
            publicSlug: publicSlug || current.online?.publicSlug,
            publicPageUrl: url,
            revision: Number(hub.revision || current.online?.revision || 0)
          };
          localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(current));
        }
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
  // guarded publishOnline flow (latest organizer-owned revision + validation).
  await cloud.publishOnline(current);
}

export function createCompanionCloudFacade(cloud: any) {
  return {
    ...cloud,
    pullChanges: (tournament: Tournament) => smartPullChanges(cloud, tournament),
    openPublicPage: (tournament: Tournament) => openPublicHubPage(cloud, tournament),
    uploadRegulations: (tournament: Tournament, file: File) => uploadRegulationsAndRepublish(cloud, tournament, file)
  };
}
