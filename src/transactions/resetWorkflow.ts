import { Tournament } from '../types';
import { createInitialEmptyTournament, INITIAL_TOURNAMENT_DATA } from '../data/initialData';
import { TransactionManager } from './TransactionManager';
import { ResetMode, ResetDiffReport } from './types';

/**
 * Pre-flight calculation for Reset Tournament.
 * Details exactly what will be deleted or altered without mutating the state.
 */
export function calculateResetPreflight(
  tournament: Tournament,
  mode: ResetMode
): {
  diffReport: ResetDiffReport;
  proposedTournament: Tournament;
} {
  const liveBoards = tournament.pairings?.liveBoards || {};
  let liveBoardsCount = 0;
  Object.values(liveBoards).forEach(boards => {
    liveBoardsCount += (boards?.length || 0);
  });

  const roundsCount = Object.keys(liveBoards).length;
  const playersCount = tournament.players?.length || 0;

  let proposedTournament: Tournament;
  let playersToDeleteCount = 0;
  let settingsPreserved = false;
  let playersPreserved = false;

  switch (mode) {
    case 'FULL_RESET':
      proposedTournament = createInitialEmptyTournament('New FIDE Chess Tournament 2026');
      proposedTournament.players = [];
      playersToDeleteCount = playersCount;
      settingsPreserved = false;
      playersPreserved = false;
      break;

    case 'CLEAR_PAIRINGS_ONLY':
      proposedTournament = {
        ...JSON.parse(JSON.stringify(tournament)),
        pairings: {
          ...tournament.pairings,
          round: '1',
          results: '0',
          liveBoards: {},
          engine: {
            ...tournament.pairings.engine,
            lastGeneratedRound: 0,
            lastEngineMessage: 'Pairings reset by arbiter; players and settings preserved.'
          }
        }
      };
      if ((proposedTournament.pairings as any).rounds) {
        (proposedTournament.pairings as any).rounds = [];
      }
      playersToDeleteCount = 0;
      settingsPreserved = true;
      playersPreserved = true;
      break;

    case 'LOAD_SAMPLE':
      proposedTournament = JSON.parse(JSON.stringify(INITIAL_TOURNAMENT_DATA));
      playersToDeleteCount = 0;
      settingsPreserved = false;
      playersPreserved = false;
      break;
  }

  const diffReport: ResetDiffReport = {
    mode,
    targetName: proposedTournament.name,
    playersToDeleteCount,
    pairingsToDeleteRounds: roundsCount,
    liveBoardsToDeleteCount: liveBoardsCount,
    settingsPreserved,
    playersPreserved
  };

  return {
    diffReport,
    proposedTournament
  };
}

/**
 * Executes a transactional reset of the tournament.
 * Pre-flight -> Snapshot -> Arbiter Confirmation -> Atomic Commit -> Rollback on error.
 */
export async function executeResetTransaction(
  manager: TransactionManager<Tournament>,
  tournament: Tournament,
  mode: ResetMode,
  persistenceFn?: (state: Tournament) => Promise<boolean> | boolean
): Promise<{ success: boolean; tournament: Tournament; diffReport: ResetDiffReport; txId: string }> {
  // 1. Begin transaction & capture complete beforeState snapshot
  const tx = manager.begin('RESET_TOURNAMENT', tournament, { mode });

  // 2. Pre-flight calculation
  const { diffReport, proposedTournament } = calculateResetPreflight(tournament, mode);

  // 3. Validation
  const isValid = manager.validate(tx.transactionId, () => ({ valid: true }));
  if (!isValid) {
    throw new Error('Reset pre-flight validation failed.');
  }

  // 4. Set preview
  manager.setPreview(tx.transactionId, proposedTournament, { diffReport });

  // 5. Commit atomically (and archive snapshot for Undo)
  try {
    const committedTournament = await manager.commit(tx.transactionId, proposedTournament, persistenceFn);
    return {
      success: true,
      tournament: committedTournament,
      diffReport,
      txId: tx.transactionId
    };
  } catch (err: any) {
    throw new Error(`Reset commit failed: ${err.message}`);
  }
}

/**
 * Undo Last Reset: restores the archived tournament snapshot if available.
 */
export async function executeUndoReset(
  manager: TransactionManager<Tournament>,
  persistenceFn?: (state: Tournament) => Promise<boolean> | boolean
): Promise<{ success: boolean; tournament: Tournament }> {
  const snapshot = manager.getUndoResetSnapshot();
  if (!snapshot) {
    throw new Error('No archived reset snapshot available to undo.');
  }

  const restoredState = JSON.parse(JSON.stringify(snapshot.state));

  if (persistenceFn) {
    const ok = await persistenceFn(restoredState);
    if (!ok) {
      throw new Error('Failed to persist restored tournament state.');
    }
  }

  manager.clearUndoResetSnapshot();
  return {
    success: true,
    tournament: restoredState
  };
}
