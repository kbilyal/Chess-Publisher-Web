import { Tournament } from '../types';
import { TransactionManager } from './TransactionManager';
import { validateRoundForFinalization, getRoundLifecycleState, sanitizeTournamentHardInvariants } from '../engine/roundEntryValidator';
import { calculateTournamentStandings } from '../engine/tiebreaks';
import { defaultTournamentRepository } from '../repositories/TournamentRepository';

export interface FinalizeRoundResult {
  success: boolean;
  round: number;
  transactionId: string;
  snapshotHash: string;
  finalizedAt: string;
  finalizedBy: string;
  tournament: Tournament;
  standingsCount: number;
}

/**
 * Transactional Finalize Round Workflow
 * 
 * Guarantees:
 * - Pre-flight validation of all boards and administrative entries
 * - Creation of cryptographic before-state snapshot
 * - Standings and tie-break recalculation
 * - Atomic persistence
 * - Rollback on any failure
 */
export async function executeFinalizeRoundTransaction(
  tournament: Tournament,
  round: number,
  options?: {
    arbiterName?: string;
    notes?: string;
    transactionManager?: TransactionManager<Tournament>;
  }
): Promise<FinalizeRoundResult> {
  const roundKey = String(round);
  const txManager = options?.transactionManager || new TransactionManager<Tournament>();

  // 1. Pre-flight validation
  const validation = validateRoundForFinalization(tournament, round);
  if (!validation.valid) {
    throw new Error(`Round ${round} cannot be finalized: ${validation.errors.join('; ')}`);
  }

  // 2. Begin transaction & create snapshot
  const tx = txManager.begin('FINALIZE_ROUND', tournament, {
    round,
    arbiterName: options?.arbiterName || 'Arbiter',
    notes: options?.notes
  });

  try {
    // 3. Validate state inside transaction
    txManager.validate(tx.transactionId, () => ({
      valid: validation.valid,
      errors: validation.errors
    }));

    // 4. Sanitize and prepare finalized afterState
    const { tournament: sanitizedTourn } = sanitizeTournamentHardInvariants(tournament);
    const afterState: Tournament = JSON.parse(JSON.stringify(sanitizedTourn));

    // Ensure pairings sub-structures exist
    if (!afterState.pairings.finalizedRounds) afterState.pairings.finalizedRounds = {};
    if (!afterState.pairings.roundStatus) afterState.pairings.roundStatus = {};
    if (!afterState.pairings.finalizedAt) afterState.pairings.finalizedAt = {};
    if (!afterState.pairings.finalizedBy) afterState.pairings.finalizedBy = {};
    if (!afterState.pairings.finalizedSnapshots) afterState.pairings.finalizedSnapshots = {};

    const finalizedTimestamp = new Date().toISOString();
    const arbiterName = options?.arbiterName || 'Arbiter';

    afterState.pairings.finalizedRounds[roundKey] = true;
    afterState.pairings.roundStatus[roundKey] = 'RESULTS_FINALIZED';
    afterState.pairings.finalizedAt[roundKey] = finalizedTimestamp;
    afterState.pairings.finalizedBy[roundKey] = arbiterName;
    afterState.pairings.finalizedSnapshots[roundKey] = tx.snapshotHash;

    // Recalculate standings with finalized round
    const recalculatedStandings = calculateTournamentStandings(afterState);

    // 5. Set preview & Commit transaction
    txManager.setPreview(tx.transactionId, afterState);
    const committedRecord = txManager.commit(tx.transactionId);

    // 6. Persist to repository atomically
    const persisted = await defaultTournamentRepository.saveTournament(afterState);
    if (!persisted) {
      throw new Error('Storage write failed during round finalization.');
    }

    return {
      success: true,
      round,
      transactionId: tx.transactionId,
      snapshotHash: tx.snapshotHash,
      finalizedAt: finalizedTimestamp,
      finalizedBy: arbiterName,
      tournament: afterState,
      standingsCount: recalculatedStandings.players.length
    };
  } catch (err: any) {
    // Clean rollback on error
    try {
      txManager.rollback(tx.transactionId);
    } catch {}
    throw err;
  }
}
