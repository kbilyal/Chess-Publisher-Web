import { Tournament } from '../types';
import { TransactionManager } from './TransactionManager';
import { defaultTournamentRepository } from '../repositories/TournamentRepository';

export interface UnlockRoundResult {
  success: boolean;
  blocked: boolean;
  round: number;
  reason?: string;
  message?: string;
  tournament?: Tournament;
  transactionId?: string;
  snapshotHash?: string;
  dependentRounds?: number[];
}

/**
 * Transactional Unlock Finalized Round Workflow
 * 
 * Safety directives:
 * - Detects downstream dependent rounds.
 * - Blocks normal correction if later rounds already exist.
 * - Takes full snapshot before unlocking.
 * - Requires explicit arbiter confirmation.
 */
export async function executeUnlockRoundTransaction(
  tournament: Tournament,
  round: number,
  options?: {
    arbiterConfirmed?: boolean;
    arbiterName?: string;
    transactionManager?: TransactionManager<Tournament>;
  }
): Promise<UnlockRoundResult> {
  const roundKey = String(round);
  const liveBoards = tournament.pairings?.liveBoards || {};
  const generatedRounds = Object.keys(liveBoards).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  const latestRound = generatedRounds.length > 0 ? generatedRounds[generatedRounds.length - 1] : 0;

  // 1. Dependency check: are there later rounds that depend on this round?
  const laterRounds = generatedRounds.filter(r => r > round);
  if (laterRounds.length > 0) {
    return {
      success: false,
      blocked: true,
      round,
      reason: 'EARLIER_ROUND_DEPENDENCY',
      dependentRounds: laterRounds,
      message: `Round ${round} is an earlier finalized round. Subsequent rounds (Round ${laterRounds.join(', ')}) already exist and depend on its results. Modifying earlier round results requires a dedicated recovery/rollback workflow.`
    };
  }

  // 2. Check arbiter confirmation
  if (options?.arbiterConfirmed !== true) {
    return {
      success: false,
      blocked: true,
      round,
      reason: 'ARBITER_CONFIRMATION_REQUIRED',
      message: 'Explicit arbiter confirmation is required to unlock a finalized round for result editing.'
    };
  }

  const txManager = options?.transactionManager || new TransactionManager<Tournament>();
  const tx = txManager.begin('UNLOCK_ROUND', tournament, {
    round,
    arbiterName: options?.arbiterName || 'Arbiter',
    unlockedAt: new Date().toISOString()
  });

  try {
    const afterState: Tournament = JSON.parse(JSON.stringify(tournament));

    if (!afterState.pairings.finalizedRounds) afterState.pairings.finalizedRounds = {};
    if (!afterState.pairings.roundStatus) afterState.pairings.roundStatus = {};

    afterState.pairings.finalizedRounds[roundKey] = false;
    afterState.pairings.roundStatus[roundKey] = 'ROUND_ACTIVE';

    txManager.setPreview(tx.transactionId, afterState);
    txManager.commit(tx.transactionId);

    await defaultTournamentRepository.saveTournament(afterState);

    return {
      success: true,
      blocked: false,
      round,
      tournament: afterState,
      transactionId: tx.transactionId,
      snapshotHash: tx.snapshotHash,
      message: `Round ${round} results unlocked for arbiter corrections.`
    };
  } catch (err: any) {
    try {
      txManager.rollback(tx.transactionId);
    } catch {}
    throw err;
  }
}
