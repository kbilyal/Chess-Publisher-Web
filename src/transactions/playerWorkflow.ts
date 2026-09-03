import { Tournament, Player, BoardPairing, Attendance } from '../types';
import { TransactionManager } from './TransactionManager';
import { PlayerBulkOperationReport, PlayerHistoryCheckResult } from './types';
import { FEDERATIONS } from '../data/initialData';

const TITLE_ORDER: Record<string, number> = {
  GM: 1, IM: 2, WGM: 3, FM: 4, WIM: 5, CM: 6, WFM: 7, WCM: 8
};

/**
 * Checks if a player has any historical games, pairings, or byes in the tournament.
 * Invariant: Players with game or pairing history can NEVER be deleted from the tournament roster.
 */
export function checkPlayerHasHistory(tournament: Tournament, playerKeyOrId: string | number): PlayerHistoryCheckResult {
  const targetKey = String(playerKeyOrId);
  const playedRounds = new Set<number>();
  let playedGamesCount = 0;
  let byesCount = 0;
  const reasons: string[] = [];

  // Check liveBoards across all rounds
  const liveBoards = tournament.pairings?.liveBoards || {};
  for (const [roundStr, boards] of Object.entries(liveBoards)) {
    const roundNum = parseInt(roundStr, 10);
    if (!Array.isArray(boards)) continue;

    for (const b of boards) {
      const isWhite = b.whiteKey === targetKey || b.whiteKey === `local:${targetKey}` || (b as any).whiteId === playerKeyOrId;
      const isBlack = b.blackKey === targetKey || b.blackKey === `local:${targetKey}` || (b as any).blackId === playerKeyOrId;

      if (isWhite || isBlack) {
        playedRounds.add(roundNum);
        if (b.entryType === 'NORMAL_GAME' || (b.whiteKey && b.blackKey && b.whiteKey !== 'BYE' && b.blackKey !== 'BYE')) {
          playedGamesCount++;
          reasons.push(`Round ${roundNum}: Paired on Board ${b.board} (${b.result || '-'})`);
        } else {
          byesCount++;
          reasons.push(`Round ${roundNum}: Bye / Unplayed pairing (${b.result || b.entryType || 'BYE'})`);
        }
      }
    }
  }

  // Check historical rounds array (if present)
  const rounds = (tournament.pairings as any)?.rounds;
  if (Array.isArray(rounds)) {
    rounds.forEach((roundPairings, idx) => {
      const roundNum = idx + 1;
      if (!Array.isArray(roundPairings)) return;

      for (const b of roundPairings) {
        const isWhite = b.whiteKey === targetKey || b.whiteKey === `local:${targetKey}` || (b as any).whiteId === playerKeyOrId;
        const isBlack = b.blackKey === targetKey || b.blackKey === `local:${targetKey}` || (b as any).blackId === playerKeyOrId;

        if (isWhite || isBlack) {
          playedRounds.add(roundNum);
          if (b.result && b.result !== '-') {
            playedGamesCount++;
          }
        }
      }
    });
  }

  const roundsWithPairings = Array.from(playedRounds).sort((a, b) => a - b);
  const hasHistory = roundsWithPairings.length > 0;

  return {
    hasHistory,
    playedGamesCount,
    byesCount,
    roundsWithPairings,
    reasons
  };
}

/**
 * Returns true if starting ranks are locked.
 * Starting ranks become immutable once Round 1 pairings exist.
 */
export function isStartingRankLocked(tournament: Tournament): boolean {
  if (tournament.pairings?.engine?.firstRoundRegistrationLocked) {
    return true;
  }
  const liveBoards = tournament.pairings?.liveBoards || {};
  const hasLiveRounds = Object.keys(liveBoards).some(r => Array.isArray(liveBoards[r]) && liveBoards[r].length > 0);
  if (hasLiveRounds) return true;

  const rounds = (tournament.pairings as any)?.rounds;
  if (Array.isArray(rounds) && rounds.length > 0 && Array.isArray(rounds[0]) && rounds[0].length > 0) {
    return true;
  }

  return false;
}

/**
 * Deterministically sorts players according to official FIDE Starting Rank rules:
 * 1. Rating DESC
 * 2. Title hierarchy (GM -> IM -> WGM -> FM -> WIM -> CM -> WFM -> WCM -> Unrated)
 * 3. National Rating DESC
 * 4. Player Name A-Z
 */
export function sortPlayersFideStandard(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    // 1. Rating DESC
    if (b.rating !== a.rating) return b.rating - a.rating;
    // 2. Title hierarchy
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
 * Computes and annotates initial sort order for distinct display vs assigned pairing numbers.
 */
export function annotateInitialSortOrder(players: Player[]): Player[] {
  const sorted = sortPlayersFideStandard(players);
  const orderMap = new Map<string, number>();
  sorted.forEach((p, idx) => {
    orderMap.set(p.localKey, idx + 1);
  });

  return players.map(p => ({
    ...p,
    initialSortOrder: orderMap.get(p.localKey) || p.pairingNumber || p.id
  }));
}

/**
 * Validates a player registration or modification against duplicate FIDE ID and federation rules.
 */
export function validatePlayerEntry(
  tournament: Tournament,
  candidate: Partial<Player>,
  existingLocalKey?: string
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Name is required
  if (!candidate.name || !candidate.name.trim()) {
    errors.push('Player full name is required.');
  }

  // Duplicate FIDE ID check
  if (candidate.fideId && candidate.fideId.trim() !== '' && candidate.fideId.trim() !== '-' && candidate.fideId.trim() !== '0') {
    const fideIdStr = candidate.fideId.trim();
    const duplicate = (tournament.players || []).find(
      p => p.localKey !== existingLocalKey && p.fideId && p.fideId.trim() === fideIdStr
    );
    if (duplicate) {
      errors.push(
        `DUPLICATE_FIDE_ID: A player with FIDE ID ${fideIdStr} ("${duplicate.name}", rank #${duplicate.pairingNumber || duplicate.id}) is already registered in this tournament.`
      );
    }
  }

  // Federation validation: must be 3-letter code
  if (candidate.fed) {
    const fedCode = candidate.fed.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(fedCode)) {
      errors.push(`INVALID_FEDERATION: Federation code "${candidate.fed}" must be a 3-letter uppercase FIDE code (e.g. BUL, FID, GER).`);
    } else {
      const isKnown = FEDERATIONS.some(f => f[0] === fedCode);
      if (!isKnown && fedCode !== 'FID') {
        warnings.push(`Federation code "${fedCode}" is not in the standard FIDE federation directory.`);
      }
    }
  }

  // Starting Rank Locking guard: if locked, manual override of starting number is prohibited
  if (isStartingRankLocked(tournament) && candidate.pairingNumber !== undefined && existingLocalKey) {
    const existing = tournament.players.find(p => p.localKey === existingLocalKey);
    if (existing && existing.pairingNumber && existing.pairingNumber !== candidate.pairingNumber) {
      errors.push(
        `STARTING_RANK_LOCKED: Starting numbers are locked once Round 1 pairings are generated. Attempted to change rank of "${existing.name}" from #${existing.pairingNumber} to #${candidate.pairingNumber}.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Registers a new player with transactional safety, duplicate checking, and starting rank lock invariants.
 */
export async function executeRegisterPlayerTransaction(
  manager: TransactionManager<Tournament>,
  tournament: Tournament,
  newPlayerData: Partial<Player>,
  options?: {
    joinedFromRound?: number;
    lateEntryByeType?: 'half' | 'zero';
  },
  persistenceFn?: (state: Tournament) => Promise<boolean> | boolean
): Promise<{ success: boolean; tournament: Tournament; player: Player; txId: string }> {
  const tx = manager.begin('PLAYER_MUTATION', tournament, { action: 'REGISTER_PLAYER', name: newPlayerData.name });

  // 1. Validate
  const validation = validatePlayerEntry(tournament, newPlayerData);
  if (!validation.valid) {
    manager.rollback(tx.transactionId);
    const err = new Error(validation.errors.join(' '));
    (err as any).code = 'VALIDATION_FAILED';
    (err as any).errors = validation.errors;
    throw err;
  }

  const isLocked = isStartingRankLocked(tournament);
  const currentPlayers = tournament.players || [];
  const maxPairingNo = currentPlayers.reduce((max, p) => Math.max(max, p.pairingNumber || p.id || 0), 0);
  const assignedPairingNo = maxPairingNo + 1;

  const currentRound = Math.max(
    1,
    Object.keys(tournament.pairings?.liveBoards || {}).length,
    (tournament.pairings as any)?.rounds?.length || 0
  );

  const joinedRound = options?.joinedFromRound || (isLocked ? currentRound + 1 : 1);
  const lateByeType = options?.lateEntryByeType || 'zero';

  const localKey = newPlayerData.localKey || `local:${(newPlayerData.name || 'player').toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;

  const requestedByes: Record<string, 'half' | 'zero'> = {};
  // If late entry (joinedRound > 1), automatically assign preceding unplayed byes
  if (joinedRound > 1) {
    for (let r = 1; r < joinedRound; r++) {
      requestedByes[String(r)] = lateByeType;
    }
  }

  const player: Player = {
    id: assignedPairingNo,
    localKey,
    name: newPlayerData.name!.trim(),
    rating: newPlayerData.rating ?? 0,
    stdRating: newPlayerData.stdRating ?? newPlayerData.rating ?? 0,
    rapidRating: newPlayerData.rapidRating ?? 0,
    blitzRating: newPlayerData.blitzRating ?? 0,
    nationalRating: newPlayerData.nationalRating ?? 0,
    fed: (newPlayerData.fed || 'FID').toUpperCase(),
    fideId: newPlayerData.fideId?.trim() || '-',
    birth: newPlayerData.birth?.trim() || '-',
    gender: newPlayerData.gender || 'm',
    title: newPlayerData.title || '',
    attendance: newPlayerData.attendance || 'present',
    pairingNumber: assignedPairingNo,
    joinedFromRound: joinedRound,
    fideK: (newPlayerData.rating ?? 0) >= 2400 ? 10 : 20,
    club: newPlayerData.club,
    isStartingRankLocked: isLocked,
    requestedByes: Object.keys(requestedByes).length > 0 ? requestedByes : undefined
  };

  let updatedPlayers = [...currentPlayers, player];

  // If tournament has NOT started, annotate initial sort orders
  if (!isLocked) {
    updatedPlayers = annotateInitialSortOrder(updatedPlayers);
  } else {
    player.initialSortOrder = assignedPairingNo;
  }

  // Update manualByes in tournament engine for late-entry byes
  const nextManualByes = { ...(tournament.pairings?.engine?.manualByes || {}) };
  if (joinedRound > 1) {
    for (let r = 1; r < joinedRound; r++) {
      const rKey = String(r);
      if (!nextManualByes[rKey]) nextManualByes[rKey] = {};
      nextManualByes[rKey][localKey] = lateByeType === 'half' ? 'H' : 'Z';
    }
  }

  const proposedTournament: Tournament = {
    ...JSON.parse(JSON.stringify(tournament)),
    players: updatedPlayers,
    pairings: {
      ...tournament.pairings,
      engine: {
        ...tournament.pairings.engine,
        needsResort: !isLocked,
        manualByes: nextManualByes
      }
    }
  };

  // 2. Commit transaction
  let committedTournament: Tournament;
  try {
    committedTournament = await manager.commit(tx.transactionId, proposedTournament, persistenceFn);
  } catch (err: any) {
    const error = new Error(err.message || 'Failed to commit player registration.');
    (error as any).code = 'COMMIT_FAILED';
    throw error;
  }

  return {
    success: true,
    tournament: committedTournament,
    player,
    txId: tx.transactionId
  };
}

/**
 * Deletes a player with strict protection against deleting players with game/pairing history.
 */
export async function executeDeletePlayerTransaction(
  manager: TransactionManager<Tournament>,
  tournament: Tournament,
  playerKeyOrId: string | number,
  persistenceFn?: (state: Tournament) => Promise<boolean> | boolean
): Promise<{ success: boolean; tournament: Tournament; txId: string }> {
  const tx = manager.begin('PLAYER_MUTATION', tournament, { action: 'DELETE_PLAYER', playerKeyOrId });

  const targetKey = String(playerKeyOrId);
  const player = (tournament.players || []).find(p => p.localKey === targetKey || String(p.id) === targetKey);
  if (!player) {
    manager.rollback(tx.transactionId);
    const err = new Error(`Player "${playerKeyOrId}" not found in tournament roster.`);
    (err as any).code = 'PLAYER_NOT_FOUND';
    throw err;
  }

  // Strict invariant: Cannot delete player with game history
  const history = checkPlayerHasHistory(tournament, player.localKey);
  if (history.hasHistory) {
    manager.rollback(tx.transactionId);
    const err = new Error(
      `CANNOT_DELETE_PLAYER_WITH_HISTORY: Cannot delete player "${player.name}" because they have played games or pairings in round(s): ${history.roundsWithPairings.join(', ')}. Set status to "Withdrawn" instead.`
    );
    (err as any).code = 'CANNOT_DELETE_PLAYER_WITH_HISTORY';
    (err as any).history = history;
    throw err;
  }

  const isLocked = isStartingRankLocked(tournament);
  let remainingPlayers = tournament.players.filter(p => p.localKey !== player.localKey);

  // If tournament has not started, renumber pairing numbers
  if (!isLocked) {
    remainingPlayers = remainingPlayers.map((p, idx) => ({
      ...p,
      id: idx + 1,
      pairingNumber: idx + 1
    }));
    remainingPlayers = annotateInitialSortOrder(remainingPlayers);
  }

  const proposedTournament: Tournament = {
    ...JSON.parse(JSON.stringify(tournament)),
    players: remainingPlayers,
    pairings: {
      ...tournament.pairings,
      engine: {
        ...tournament.pairings.engine,
        needsResort: !isLocked
      }
    }
  };

  let committedTournament: Tournament;
  try {
    committedTournament = await manager.commit(tx.transactionId, proposedTournament, persistenceFn);
  } catch (err: any) {
    const error = new Error(err.message || 'Failed to commit player deletion.');
    (error as any).code = 'COMMIT_FAILED';
    throw error;
  }

  return {
    success: true,
    tournament: committedTournament,
    txId: tx.transactionId
  };
}

/**
 * Bulk updates player status (Present, Absent, Withdrawn) with transactional rollback.
 */
export async function executeBulkStatusTransaction(
  manager: TransactionManager<Tournament>,
  tournament: Tournament,
  playerKeys: string[],
  newAttendance: Attendance,
  persistenceFn?: (state: Tournament) => Promise<boolean> | boolean
): Promise<{ success: boolean; tournament: Tournament; report: PlayerBulkOperationReport; txId: string }> {
  const tx = manager.begin('PLAYER_BULK_OPERATION', tournament, {
    operation: 'STATUS_CHANGE',
    newAttendance,
    playerKeys
  });

  const targetSet = new Set(playerKeys);
  const nextExcluded = new Set(tournament.pairings?.engine?.excluded || []);

  const updatedPlayers = (tournament.players || []).map(p => {
    if (targetSet.has(p.localKey) || targetSet.has(String(p.id))) {
      if (newAttendance === 'withdrawn') {
        nextExcluded.add(p.localKey);
      } else {
        nextExcluded.delete(p.localKey);
      }
      return { ...p, attendance: newAttendance };
    }
    return p;
  });

  const report: PlayerBulkOperationReport = {
    operation: 'STATUS_CHANGE',
    totalSelected: playerKeys.length,
    affectedCount: playerKeys.length,
    blockedCount: 0
  };

  const proposedTournament: Tournament = {
    ...JSON.parse(JSON.stringify(tournament)),
    players: updatedPlayers,
    pairings: {
      ...tournament.pairings,
      engine: {
        ...tournament.pairings.engine,
        excluded: Array.from(nextExcluded)
      }
    }
  };

  let committedTournament: Tournament;
  try {
    committedTournament = await manager.commit(tx.transactionId, proposedTournament, persistenceFn);
  } catch (err: any) {
    const error = new Error(err.message || 'Failed to commit bulk status change.');
    (error as any).code = 'COMMIT_FAILED';
    throw error;
  }

  return {
    success: true,
    tournament: committedTournament,
    report,
    txId: tx.transactionId
  };
}

/**
 * Bulk updates player federation with 3-letter FIDE code validation.
 */
export async function executeBulkFederationTransaction(
  manager: TransactionManager<Tournament>,
  tournament: Tournament,
  playerKeys: string[],
  newFed: string,
  persistenceFn?: (state: Tournament) => Promise<boolean> | boolean
): Promise<{ success: boolean; tournament: Tournament; report: PlayerBulkOperationReport; txId: string }> {
  const fedCode = (newFed || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(fedCode)) {
    const err = new Error(`INVALID_FEDERATION: Federation code "${newFed}" must be a 3-letter uppercase FIDE code.`);
    (err as any).code = 'INVALID_FEDERATION';
    throw err;
  }

  const tx = manager.begin('PLAYER_BULK_OPERATION', tournament, {
    operation: 'FEDERATION_CHANGE',
    newFed: fedCode,
    playerKeys
  });

  const targetSet = new Set(playerKeys);
  const updatedPlayers = (tournament.players || []).map(p => {
    if (targetSet.has(p.localKey) || targetSet.has(String(p.id))) {
      return { ...p, fed: fedCode };
    }
    return p;
  });

  const report: PlayerBulkOperationReport = {
    operation: 'FEDERATION_CHANGE',
    totalSelected: playerKeys.length,
    affectedCount: playerKeys.length,
    blockedCount: 0
  };

  const proposedTournament: Tournament = {
    ...JSON.parse(JSON.stringify(tournament)),
    players: updatedPlayers
  };

  let committedTournament: Tournament;
  try {
    committedTournament = await manager.commit(tx.transactionId, proposedTournament, persistenceFn);
  } catch (err: any) {
    const error = new Error(err.message || 'Failed to commit bulk federation change.');
    (error as any).code = 'COMMIT_FAILED';
    throw error;
  }

  return {
    success: true,
    tournament: committedTournament,
    report,
    txId: tx.transactionId
  };
}

/**
 * Bulk deletes players with protection: players with game/pairing history are blocked from deletion.
 */
export async function executeBulkDeleteTransaction(
  manager: TransactionManager<Tournament>,
  tournament: Tournament,
  playerKeys: string[],
  options?: {
    allowPartial?: boolean;
  },
  persistenceFn?: (state: Tournament) => Promise<boolean> | boolean
): Promise<{ success: boolean; tournament: Tournament; report: PlayerBulkOperationReport; txId: string }> {
  const tx = manager.begin('PLAYER_BULK_OPERATION', tournament, {
    operation: 'DELETE',
    playerKeys,
    allowPartial: options?.allowPartial
  });

  const targetSet = new Set(playerKeys);
  const blockedDetails: { playerKey: string; playerName: string; reason: string }[] = [];
  const playersToDelete = new Set<string>();

  for (const player of tournament.players || []) {
    if (targetSet.has(player.localKey) || targetSet.has(String(player.id))) {
      const history = checkPlayerHasHistory(tournament, player.localKey);
      if (history.hasHistory) {
        blockedDetails.push({
          playerKey: player.localKey,
          playerName: player.name,
          reason: `Has played games or pairings in round(s) ${history.roundsWithPairings.join(', ')}.`
        });
      } else {
        playersToDelete.add(player.localKey);
      }
    }
  }

  if (blockedDetails.length > 0 && !options?.allowPartial) {
    manager.rollback(tx.transactionId);
    const err = new Error(
      `CANNOT_DELETE_PLAYERS_WITH_HISTORY: ${blockedDetails.length} player(s) have game/pairing history and cannot be deleted: ${blockedDetails.map(b => b.playerName).join(', ')}.`
    );
    (err as any).code = 'CANNOT_DELETE_PLAYERS_WITH_HISTORY';
    (err as any).blockedDetails = blockedDetails;
    throw err;
  }

  const isLocked = isStartingRankLocked(tournament);
  let remainingPlayers = (tournament.players || []).filter(p => !playersToDelete.has(p.localKey));

  if (!isLocked) {
    remainingPlayers = remainingPlayers.map((p, idx) => ({
      ...p,
      id: idx + 1,
      pairingNumber: idx + 1
    }));
    remainingPlayers = annotateInitialSortOrder(remainingPlayers);
  }

  const report: PlayerBulkOperationReport = {
    operation: 'DELETE',
    totalSelected: playerKeys.length,
    affectedCount: playersToDelete.size,
    blockedCount: blockedDetails.length,
    blockedDetails: blockedDetails.length > 0 ? blockedDetails : undefined
  };

  const proposedTournament: Tournament = {
    ...JSON.parse(JSON.stringify(tournament)),
    players: remainingPlayers,
    pairings: {
      ...tournament.pairings,
      engine: {
        ...tournament.pairings.engine,
        needsResort: !isLocked
      }
    }
  };

  let committedTournament: Tournament;
  try {
    committedTournament = await manager.commit(tx.transactionId, proposedTournament, persistenceFn);
  } catch (err: any) {
    const error = new Error(err.message || 'Failed to commit bulk delete.');
    (error as any).code = 'COMMIT_FAILED';
    throw error;
  }

  return {
    success: true,
    tournament: committedTournament,
    report,
    txId: tx.transactionId
  };
}

/**
 * Assigns or updates a round-specific requested bye ('half' | 'zero').
 * Enforces bye regulations (e.g. maximum half-point byes limit, ungenerated rounds).
 */
export async function executeRequestedByeTransaction(
  manager: TransactionManager<Tournament>,
  tournament: Tournament,
  playerKey: string,
  round: number,
  byeType: 'half' | 'zero' | 'none',
  options?: {
    maxHalfPointByes?: number;
  },
  persistenceFn?: (state: Tournament) => Promise<boolean> | boolean
): Promise<{ success: boolean; tournament: Tournament; txId: string }> {
  const tx = manager.begin('PLAYER_MUTATION', tournament, {
    action: 'REQUESTED_BYE',
    playerKey,
    round,
    byeType
  });

  const player = (tournament.players || []).find(p => p.localKey === playerKey || String(p.id) === playerKey);
  if (!player) {
    manager.rollback(tx.transactionId);
    const err = new Error(`Player "${playerKey}" not found.`);
    (err as any).code = 'PLAYER_NOT_FOUND';
    throw err;
  }

  // Cannot request bye for a round that is already generated or finalized
  const liveBoards = tournament.pairings?.liveBoards?.[String(round)] || [];
  if (liveBoards.length > 0) {
    manager.rollback(tx.transactionId);
    const err = new Error(`CANNOT_SET_BYE_GENERATED_ROUND: Round ${round} is already generated.`);
    (err as any).code = 'CANNOT_SET_BYE_GENERATED_ROUND';
    throw err;
  }

  // Check max half-point byes
  const maxHalfByes = options?.maxHalfPointByes ?? 2;
  const currentRequestedByes = { ...(player.requestedByes || {}) };

  if (byeType === 'half') {
    const existingHalfCount = Object.entries(currentRequestedByes).filter(
      ([rStr, val]) => rStr !== String(round) && val === 'half'
    ).length;

    if (existingHalfCount >= maxHalfByes) {
      manager.rollback(tx.transactionId);
      const err = new Error(
        `MAX_BYES_EXCEEDED: Player "${player.name}" has already reached the maximum of ${maxHalfByes} half-point bye(s).`
      );
      (err as any).code = 'MAX_BYES_EXCEEDED';
      throw err;
    }
  }

  if (byeType === 'none') {
    delete currentRequestedByes[String(round)];
  } else {
    currentRequestedByes[String(round)] = byeType;
  }

  const nextManualByes = { ...(tournament.pairings?.engine?.manualByes || {}) };
  const rKey = String(round);
  if (!nextManualByes[rKey]) nextManualByes[rKey] = {};

  if (byeType === 'none') {
    delete nextManualByes[rKey][player.localKey];
  } else {
    nextManualByes[rKey][player.localKey] = byeType === 'half' ? 'H' : 'Z';
  }

  const updatedPlayers = tournament.players.map(p => {
    if (p.localKey === player.localKey) {
      return {
        ...p,
        requestedByes: Object.keys(currentRequestedByes).length > 0 ? currentRequestedByes : undefined
      };
    }
    return p;
  });

  const proposedTournament: Tournament = {
    ...JSON.parse(JSON.stringify(tournament)),
    players: updatedPlayers,
    pairings: {
      ...tournament.pairings,
      engine: {
        ...tournament.pairings.engine,
        manualByes: nextManualByes
      }
    }
  };

  let committedTournament: Tournament;
  try {
    committedTournament = await manager.commit(tx.transactionId, proposedTournament, persistenceFn);
  } catch (err: any) {
    const error = new Error(err.message || 'Failed to commit requested bye.');
    (error as any).code = 'COMMIT_FAILED';
    throw error;
  }

  return {
    success: true,
    tournament: committedTournament,
    txId: tx.transactionId
  };
}
