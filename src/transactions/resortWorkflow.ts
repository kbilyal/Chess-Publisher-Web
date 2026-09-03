import { Tournament, Player } from '../types';
import { TransactionManager } from './TransactionManager';
import { ResortDiffReport, RankChange } from './types';

const TITLE_ORDER: Record<string, number> = {
  GM: 1, IM: 2, WGM: 3, FM: 4, WIM: 5, CM: 6, WFM: 7, WCM: 8
};

/**
 * Deterministically sorts players according to FIDE Starting Rank rules:
 * 1. Rating DESC
 * 2. FIDE Title hierarchy (GM -> IM -> WGM -> FM -> WIM -> CM -> WFM -> WCM -> Unrated)
 * 3. Player Name A-Z
 */
export function sortPlayersFideStandard(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    // 1. Rating DESC
    if (b.rating !== a.rating) return b.rating - a.rating;
    // 2. Title
    const tA = TITLE_ORDER[a.title || ''] || 99;
    const tB = TITLE_ORDER[b.title || ''] || 99;
    if (tA !== tB) return tA - tB;
    // 3. National Rating DESC
    const natA = a.nationalRating || 0;
    const natB = b.nationalRating || 0;
    if (natB !== natA) return natB - natA;
    // 4. Name A-Z
    return a.name.localeCompare(b.name);
  });
}

/**
 * Pre-flight calculation for Resort Starting List.
 * Calculates new starting ranks without mutating tournament state.
 */
export function calculateResortPreflight(tournament: Tournament): {
  diffReport: ResortDiffReport;
  proposedTournament: Tournament;
} {
  const liveBoards = tournament.pairings?.liveBoards || {};
  const liveRoundKeys = Object.keys(liveBoards).filter(k => liveBoards[k] && liveBoards[k].length > 0);
  const roundsArray = (tournament.pairings as any)?.rounds || [];
  const roundsCount = Math.max(liveRoundKeys.length, roundsArray.length);
  const hasRoundsStarted = roundsCount > 0;

  const currentPlayers = tournament.players || [];
  const sorted = sortPlayersFideStandard(currentPlayers);

  const rankChanges: RankChange[] = [];
  let affectedCount = 0;

  const reindexedPlayers: Player[] = sorted.map((player, idx) => {
    const newRank = idx + 1;
    const oldRank = player.pairingNumber || player.id;
    const changed = oldRank !== newRank;
    if (changed) {
      affectedCount++;
    }

    rankChanges.push({
      playerId: player.id,
      playerName: player.name,
      fideId: player.fideId,
      title: player.title,
      rating: player.rating,
      oldRank,
      newRank,
      changed
    });

    return {
      ...player,
      id: newRank,
      pairingNumber: newRank
    };
  });

  const canCommitDirectly = !hasRoundsStarted;
  const requiresForceResort = hasRoundsStarted;
  const blockReason = hasRoundsStarted
    ? `Rounds have already commenced (${roundsCount} round(s) active). Re-sorting starting ranks during a live tournament requires explicit Arbiter Force-Resort confirmation and must not mutate historical pairings.`
    : undefined;

  const diffReport: ResortDiffReport = {
    totalPlayers: currentPlayers.length,
    affectedCount,
    rankChanges,
    hasRoundsStarted,
    roundCount: roundsCount,
    canCommitDirectly,
    requiresForceResort,
    blockReason
  };

  const proposedTournament: Tournament = {
    ...JSON.parse(JSON.stringify(tournament)),
    players: reindexedPlayers,
    pairings: {
      ...tournament.pairings,
      engine: {
        ...tournament.pairings.engine,
        needsResort: false
      }
    }
  };

  return {
    diffReport,
    proposedTournament
  };
}

/**
 * Executes the complete transactional workflow for Resort Starting List:
 * PRE-FLIGHT -> VALIDATE -> CREATE SNAPSHOT -> SHOW DIFF/PREVIEW -> ARBITER CONFIRMATION -> MUTATION -> COMMIT.
 */
export async function executeResortTransaction(
  manager: TransactionManager<Tournament>,
  tournament: Tournament,
  options: {
    forceResortConfirmed?: boolean;
    arbiterNotes?: string;
  },
  persistenceFn?: (state: Tournament) => Promise<boolean> | boolean
): Promise<{ success: boolean; tournament: Tournament; diffReport: ResortDiffReport; txId: string }> {
  // 1. Begin transaction & capture initial snapshot
  const tx = manager.begin('RESORT_STARTING_LIST', tournament, {
    forceResortConfirmed: options.forceResortConfirmed,
    notes: options.arbiterNotes
  });

  // 2. Pre-flight calculation (no mutation)
  const { diffReport, proposedTournament } = calculateResortPreflight(tournament);

  // 3. Pre-flight Validation
  const isValid = manager.validate(tx.transactionId, () => {
    if (diffReport.requiresForceResort && !options.forceResortConfirmed) {
      return {
        valid: false,
        errors: [diffReport.blockReason || 'Resort after Round 1 requires explicit Force Resort confirmation.']
      };
    }
    return { valid: true };
  });

  if (!isValid) {
    throw new Error(tx.error || 'Pre-flight validation failed.');
  }

  // 4. Set preview
  manager.setPreview(tx.transactionId, proposedTournament, { diffReport });

  // 5. Commit atomically with rollback protection
  try {
    const committedTournament = await manager.commit(tx.transactionId, proposedTournament, persistenceFn);
    return {
      success: true,
      tournament: committedTournament,
      diffReport,
      txId: tx.transactionId
    };
  } catch (err: any) {
    // If persistence fails, transaction automatically rolls back
    throw new Error(`Resort commit failed: ${err.message}`);
  }
}
