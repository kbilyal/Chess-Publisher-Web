import { Tournament } from '../types';

const STORAGE_KEY = 'fide_tournament_manager_v2';
const CONFIRMATION_MISMATCH = /Cloud has newer Desktop changes or a synchronization conflict/i;

function readStoredTournament(): Tournament | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function confirmedSyncWithRetry(
  facade: Record<string, any>,
  tournament: Tournament
) {
  try {
    return await facade.syncNow(tournament);
  } catch (error: any) {
    if (!CONFIRMATION_MISMATCH.test(String(error?.message || error || ''))) throw error;

    const current = readStoredTournament() || tournament;
    if (typeof facade.checkStatus !== 'function') throw error;
    const status = await facade.checkStatus(current);

    // A provider/confirmation race may report a stale mismatch even though the
    // Cloud is already equal, or while the Web-only change is still safely
    // pending. Heal those two benign states without ever overwriting newer Cloud
    // content. True remote changes/conflicts remain fail-closed.
    if (status?.kind === 'in-sync') return;
    if (status?.kind === 'local-changes') {
      await facade.syncNow(readStoredTournament() || current);
      return;
    }
    if (status?.kind === 'remote-changes') {
      throw new Error('Cloud changed while SYNC was running. Press ↕ SYNC again to pull the newer Cloud revision safely.');
    }
    if (status?.kind === 'conflict') {
      throw new Error('Desktop/Cloud and Web both changed after the common base. Use Resolve Conflict; nothing was overwritten.');
    }
    throw error;
  }
}

async function syncPublishSync(
  facade: Record<string, any>,
  tournament: Tournament
) {
  // Publish is fail-closed: never send public data until private Cloud SYNC is
  // confirmed, and never leave publish-generated metadata only in browser state.
  await confirmedSyncWithRetry(facade, tournament);
  const synchronized = readStoredTournament() || tournament;
  const result = await facade.publishOnline(synchronized);
  const published = readStoredTournament() || result || synchronized;
  await confirmedSyncWithRetry(facade, published);
  return result;
}

async function syncRegulationsPublishSync(
  facade: Record<string, any>,
  tournament: Tournament,
  file: File
) {
  // Upload Regulations republishes the Hub internally, so apply the same
  // private-Cloud guard around the whole operation.
  await confirmedSyncWithRetry(facade, tournament);
  const synchronized = readStoredTournament() || tournament;
  const result = await facade.uploadRegulations(synchronized, file);
  const published = readStoredTournament() || result || synchronized;
  await confirmedSyncWithRetry(facade, published);
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
    syncNow: (tournament: Tournament) => confirmedSyncWithRetry(facade, tournament),
    publishOnline: (tournament: Tournament) => syncPublishSync(facade, tournament),
    uploadRegulations: (tournament: Tournament, file: File) =>
      syncRegulationsPublishSync(facade, tournament, file)
  } as T;
}
