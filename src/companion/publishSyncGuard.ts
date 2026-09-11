import { Tournament } from '../types';

const STORAGE_KEY = 'fide_tournament_manager_v2';

function readStoredTournament(): Tournament | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function syncPublishSync(
  facade: Record<string, any>,
  tournament: Tournament
) {
  // Publish is fail-closed: never send public data until private Cloud SYNC is
  // confirmed, and never leave publish-generated metadata only in browser state.
  await facade.syncNow(tournament);
  const synchronized = readStoredTournament() || tournament;
  const result = await facade.publishOnline(synchronized);
  const published = readStoredTournament() || result || synchronized;
  await facade.syncNow(published);
  return result;
}

async function syncRegulationsPublishSync(
  facade: Record<string, any>,
  tournament: Tournament,
  file: File
) {
  // Upload Regulations republishes the Hub internally, so apply the same
  // private-Cloud guard around the whole operation.
  await facade.syncNow(tournament);
  const synchronized = readStoredTournament() || tournament;
  const result = await facade.uploadRegulations(synchronized, file);
  const published = readStoredTournament() || result || synchronized;
  await facade.syncNow(published);
  return result;
}

/**
 * Web publication safety layer.
 *
 * Every public Hub publish is coupled to confirmed private Cloud SYNC:
 *   confirmed SYNC -> publish -> confirmed SYNC
 *
 * The first SYNC prevents publishing stale/conflicted Web state. The second
 * persists publication metadata (Hub revision/slug/lastPublishedAt and any
 * other publish acknowledgements) back into the same private tournament.
 *
 * Chess-Results already follows the same pre/post confirmed-SYNC contract in
 * CompanionWorkspace; this guard closes the remaining Hub path without
 * changing schema 7, Desktop, Worker or the protected SYNC core.
 */
export function protectPublishSyncFacade<T extends Record<string, any>>(facade: T): T {
  return {
    ...facade,
    publishOnline: (tournament: Tournament) => syncPublishSync(facade, tournament),
    uploadRegulations: (tournament: Tournament, file: File) =>
      syncRegulationsPublishSync(facade, tournament, file)
  } as T;
}
