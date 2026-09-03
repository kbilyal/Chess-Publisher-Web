import { Tournament, Player, FideTitle } from '../types';
import { FidePlayerRecord } from '../server/fide/types';
import { TransactionManager } from './TransactionManager';
import {
  FideSyncField,
  FidePlayerFieldDiff,
  FidePlayerDiffItem,
  FideSyncDiffReport,
  FidePlayerSyncSelection,
  FideAuthoritativeSnapshot
} from './types';
import { validateTournamentHardInvariants } from '../engine/roundEntryValidator';
import { sortPlayersFideStandard } from './resortWorkflow';

export const transactionManager = new TransactionManager<Tournament>();

/**
 * Extracts and maps the active tournament rating type.
 */
export function getTournamentRatingType(tournament: Tournament): 'Standard' | 'Rapid' | 'Blitz' | 'Unrated' {
  return (
    (tournament.settings?.tournamentRatingType as any) ||
    ((tournament as any).ratingType as any) ||
    'Standard'
  );
}

/**
 * Compares an individual tournament player with their authoritative FIDE record.
 */
export function computeFidePlayerDiff(
  player: Player,
  authoritativeRecord: FidePlayerRecord | null,
  tournamentRatingType: 'Standard' | 'Rapid' | 'Blitz' | 'Unrated',
  isDuplicateInTournament: boolean = false
): FidePlayerDiffItem {
  const diffs: FidePlayerFieldDiff[] = [];

  const rawFideId = player.fideId ? String(player.fideId).trim() : '';
  const parsedFideId = parseInt(rawFideId, 10);
  const hasNumericFideId = !isNaN(parsedFideId) && parsedFideId > 0;

  if (isDuplicateInTournament) {
    return {
      playerId: player.id,
      playerKey: player.localKey,
      currentName: player.name,
      currentFideId: rawFideId,
      fideMatchedId: hasNumericFideId ? parsedFideId : undefined,
      status: 'DUPLICATE_FIDE_ID',
      warning: `Duplicate FIDE ID detected in tournament (${rawFideId}). Automatic synchronization blocked.`,
      diffs: [],
      selected: false
    };
  }

  if (!hasNumericFideId || !authoritativeRecord) {
    return {
      playerId: player.id,
      playerKey: player.localKey,
      currentName: player.name,
      currentFideId: rawFideId,
      status: 'UNMATCHED',
      warning: hasNumericFideId
        ? `No authoritative FIDE record found in database for ID ${parsedFideId}.`
        : 'Player has no valid numerical FIDE ID registered.',
      diffs: [],
      selected: false
    };
  }

  // 1. Name
  if (player.name.trim() !== authoritativeRecord.name.trim()) {
    diffs.push({
      field: 'name',
      label: 'Player Name',
      oldValue: player.name,
      newValue: authoritativeRecord.name,
      selected: true
    });
  }

  // 2. FIDE ID (if format difference or string difference)
  if (String(parsedFideId) !== String(authoritativeRecord.fideId)) {
    diffs.push({
      field: 'fideId',
      label: 'FIDE ID',
      oldValue: rawFideId,
      newValue: String(authoritativeRecord.fideId),
      selected: true
    });
  }

  // 3. Federation
  const currentFed = (player.fed || '').trim().toUpperCase();
  const authFed = (authoritativeRecord.federation || '').trim().toUpperCase();
  if (currentFed !== authFed) {
    diffs.push({
      field: 'fed',
      label: 'Federation',
      oldValue: player.fed || '—',
      newValue: authoritativeRecord.federation,
      selected: true
    });
  }

  // 4. Title
  const currentTitle = (player.title || '').trim().toUpperCase();
  const authTitle = (authoritativeRecord.title || '').trim().toUpperCase();
  if (currentTitle !== authTitle) {
    diffs.push({
      field: 'title',
      label: 'FIDE Title',
      oldValue: player.title || '—',
      newValue: authoritativeRecord.title || '—',
      selected: true
    });
  }

  // 5. Standard Rating
  const currentStd = player.stdRating !== undefined ? player.stdRating : (tournamentRatingType === 'Standard' ? player.rating : 0);
  if (currentStd !== authoritativeRecord.ratingStandard) {
    diffs.push({
      field: 'ratingStandard',
      label: 'Standard Rating',
      oldValue: currentStd,
      newValue: authoritativeRecord.ratingStandard,
      selected: true
    });
  }

  // 6. Rapid Rating
  const currentRapid = player.rapidRating !== undefined ? player.rapidRating : (tournamentRatingType === 'Rapid' ? player.rating : 0);
  if (currentRapid !== authoritativeRecord.ratingRapid) {
    diffs.push({
      field: 'ratingRapid',
      label: 'Rapid Rating',
      oldValue: currentRapid,
      newValue: authoritativeRecord.ratingRapid,
      selected: true
    });
  }

  // 7. Blitz Rating
  const currentBlitz = player.blitzRating !== undefined ? player.blitzRating : (tournamentRatingType === 'Blitz' ? player.rating : 0);
  if (currentBlitz !== authoritativeRecord.ratingBlitz) {
    diffs.push({
      field: 'ratingBlitz',
      label: 'Blitz Rating',
      oldValue: currentBlitz,
      newValue: authoritativeRecord.ratingBlitz,
      selected: true
    });
  }

  // 8. Birth Date (preserving partial date e.g. "1990")
  const currentBirth = (player.birth || '').trim();
  const authBirth = (authoritativeRecord.birth || '').trim();
  if (authBirth && currentBirth !== authBirth) {
    diffs.push({
      field: 'birth',
      label: 'Date of Birth',
      oldValue: player.birth || '—',
      newValue: authoritativeRecord.birth || '—',
      selected: true
    });
  }

  const authSnapshot: FideAuthoritativeSnapshot = {
    fideId: authoritativeRecord.fideId,
    name: authoritativeRecord.name,
    federation: authoritativeRecord.federation,
    title: authoritativeRecord.title,
    ratingStandard: authoritativeRecord.ratingStandard,
    ratingRapid: authoritativeRecord.ratingRapid,
    ratingBlitz: authoritativeRecord.ratingBlitz,
    birth: authoritativeRecord.birth
  };

  const status = diffs.length > 0 ? 'CHANGED' : 'UNCHANGED';

  return {
    playerId: player.id,
    playerKey: player.localKey,
    currentName: player.name,
    currentFideId: rawFideId,
    fideMatchedId: authoritativeRecord.fideId,
    status,
    diffs,
    selected: status === 'CHANGED',
    authoritativeRecord: authSnapshot
  };
}

/**
 * Pre-flight comparison of tournament players against the authoritative FIDE database.
 * Does not mutate tournament state.
 */
export function generateFideSyncPreflight(
  tournament: Tournament,
  fideLookup: (fideId: number) => FidePlayerRecord | null,
  targetPlayerKey?: string,
  databaseMetadata?: any
): FideSyncDiffReport {
  const ratingType = getTournamentRatingType(tournament);
  const players = tournament.players || [];

  // 1. Detect duplicate FIDE IDs in tournament
  const fideIdCounts = new Map<number, string[]>();
  for (const p of players) {
    const raw = (p.fideId || '').trim();
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) {
      const list = fideIdCounts.get(parsed) || [];
      list.push(p.localKey);
      fideIdCounts.set(parsed, list);
    }
  }

  const duplicateFideIds = new Set<number>();
  for (const [fideId, list] of fideIdCounts.entries()) {
    if (list.length > 1) {
      duplicateFideIds.add(fideId);
    }
  }

  // 2. Filter target players if specified
  const targetPlayers = targetPlayerKey
    ? players.filter(p => p.localKey === targetPlayerKey)
    : players;

  const items: FidePlayerDiffItem[] = [];

  for (const player of targetPlayers) {
    const raw = (player.fideId || '').trim();
    const parsed = parseInt(raw, 10);
    const isDup = !isNaN(parsed) && duplicateFideIds.has(parsed);

    let authRecord: FidePlayerRecord | null = null;
    if (!isNaN(parsed) && parsed > 0 && !isDup) {
      authRecord = fideLookup(parsed);
    }

    const item = computeFidePlayerDiff(player, authRecord, ratingType, isDup);
    items.push(item);
  }

  // 3. Counts
  let matchedCount = 0;
  let unchangedCount = 0;
  let changedCount = 0;
  let unmatchedCount = 0;
  let duplicateCount = 0;

  for (const item of items) {
    if (item.status === 'CHANGED') {
      changedCount++;
      matchedCount++;
    } else if (item.status === 'UNCHANGED') {
      unchangedCount++;
      matchedCount++;
    } else if (item.status === 'UNMATCHED') {
      unmatchedCount++;
    } else if (item.status === 'DUPLICATE_FIDE_ID') {
      duplicateCount++;
    }
  }

  // 4. Determine if FIDE starting list order would be outdated
  // Simulate applying all proposed changes and check if sort order changes
  let startingListOutdated = false;
  if (changedCount > 0) {
    const simulatedPlayers: Player[] = players.map(p => {
      const diffItem = items.find(it => it.playerKey === p.localKey);
      if (!diffItem || diffItem.status !== 'CHANGED' || !diffItem.authoritativeRecord) {
        return { ...p };
      }
      const rec = diffItem.authoritativeRecord;
      const clone = { ...p };
      for (const d of diffItem.diffs) {
        if (d.field === 'name') clone.name = rec.name;
        if (d.field === 'fed') clone.fed = rec.federation;
        if (d.field === 'title') clone.title = (rec.title || '') as FideTitle;
        if (d.field === 'ratingStandard') clone.stdRating = rec.ratingStandard;
        if (d.field === 'ratingRapid') clone.rapidRating = rec.ratingRapid;
        if (d.field === 'ratingBlitz') clone.blitzRating = rec.ratingBlitz;
        if (d.field === 'birth') clone.birth = rec.birth || clone.birth;
      }
      if (ratingType === 'Rapid') clone.rating = rec.ratingRapid || clone.rating;
      else if (ratingType === 'Blitz') clone.rating = rec.ratingBlitz || clone.rating;
      else clone.rating = rec.ratingStandard || clone.rating;
      return clone;
    });

    const currentSorted = sortPlayersFideStandard(players);
    const simulatedSorted = sortPlayersFideStandard(simulatedPlayers);

    for (let i = 0; i < currentSorted.length; i++) {
      if (currentSorted[i].localKey !== simulatedSorted[i].localKey) {
        startingListOutdated = true;
        break;
      }
    }
  }

  // Sort items: CHANGED first, then DUPLICATE_FIDE_ID, then UNMATCHED, then UNCHANGED
  const statusOrder: Record<string, number> = {
    CHANGED: 1,
    DUPLICATE_FIDE_ID: 2,
    UNMATCHED: 3,
    UNCHANGED: 4
  };

  items.sort((a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99));

  return {
    totalPlayers: targetPlayers.length,
    matchedCount,
    unchangedCount,
    changedCount,
    unmatchedCount,
    duplicateCount,
    startingListOutdated,
    tournamentRatingType: ratingType,
    players: items,
    databaseMetadata
  };
}

/**
 * Authoritative transactional execution of FIDE Player Synchronization.
 * 
 * Invariants:
 * 1. Requires explicit arbiter confirmation (arbiterConfirmed === true).
 * 2. Takes a complete beforeState snapshot with SHA-256 hash.
 * 3. Applies values strictly from server-side authoritative FIDE cache (client cannot inject arbitrary values).
 * 4. Preserves all tournament-specific data: pairingNumber, attendance, byes, results, pairings, roundHistory.
 * 5. Does not automatically resort starting ranks.
 * 6. Rejects mutating unmatched or duplicate players.
 * 7. On any error, executes exact rollback to beforeState snapshot.
 */
export function applyFidePlayerSync(
  tournament: Tournament,
  selections: FidePlayerSyncSelection[],
  fideLookup: (fideId: number) => FidePlayerRecord | null,
  options: {
    arbiterConfirmed: boolean;
    arbiterName?: string;
  }
): {
  success: boolean;
  tournament: Tournament;
  appliedCount: number;
  startingListOutdated: boolean;
} {
  if (!options.arbiterConfirmed) {
    const err: any = new Error('ARBITER_CONFIRMATION_REQUIRED: Explicit arbiter confirmation is required to apply FIDE player synchronization.');
    err.code = 'ARBITER_CONFIRMATION_REQUIRED';
    throw err;
  }

  if (!Array.isArray(selections) || selections.length === 0) {
    return {
      success: true,
      tournament: JSON.parse(JSON.stringify(tournament)),
      appliedCount: 0,
      startingListOutdated: false
    };
  }

  // 1. Begin transaction lifecycle
  const tx = transactionManager.begin('FIDE_PLAYER_SYNC', tournament, {
    arbiterName: options.arbiterName || 'Arbiter',
    selectionsCount: selections.length
  });

  try {
    const updatedTournament: Tournament = JSON.parse(JSON.stringify(tournament));
    const ratingType = getTournamentRatingType(updatedTournament);
    const playerMap = new Map<string, Player>();
    for (const p of updatedTournament.players) {
      playerMap.set(p.localKey, p);
    }

    let appliedCount = 0;

    for (const sel of selections) {
      const player = playerMap.get(sel.playerKey);
      if (!player) {
        continue;
      }

      if (!Array.isArray(sel.selectedFields) || sel.selectedFields.length === 0) {
        continue;
      }

      const rawFideId = (player.fideId || '').trim();
      const parsedFideId = parseInt(rawFideId, 10);
      if (isNaN(parsedFideId) || parsedFideId <= 0) {
        const err: any = new Error(`UNMATCHED_PLAYER_MUTATION_FORBIDDEN: Cannot synchronize player '${player.name}' without valid FIDE ID.`);
        err.code = 'UNMATCHED_PLAYER_MUTATION_FORBIDDEN';
        throw err;
      }

      // Authoritative lookup ONLY from server cache!
      const authoritative = fideLookup(parsedFideId);
      if (!authoritative) {
        const err: any = new Error(`UNMATCHED_PLAYER_MUTATION_FORBIDDEN: Authoritative record for FIDE ID ${parsedFideId} not found in database.`);
        err.code = 'UNMATCHED_PLAYER_MUTATION_FORBIDDEN';
        throw err;
      }

      // Check for duplicate in tournament
      const duplicates = updatedTournament.players.filter(
        p => (p.fideId || '').trim() === rawFideId
      );
      if (duplicates.length > 1) {
        const err: any = new Error(`DUPLICATE_FIDE_ID_MUTATION_FORBIDDEN: Multiple players in tournament share FIDE ID ${parsedFideId}. Auto-resolution forbidden.`);
        err.code = 'DUPLICATE_FIDE_ID_MUTATION_FORBIDDEN';
        throw err;
      }

      // Apply ONLY selected fields from authoritative record
      for (const field of sel.selectedFields) {
        switch (field) {
          case 'name':
            player.name = authoritative.name;
            break;
          case 'fed':
            player.fed = authoritative.federation;
            break;
          case 'title':
            player.title = (authoritative.title || '') as FideTitle;
            break;
          case 'fideId':
            player.fideId = String(authoritative.fideId);
            break;
          case 'birth':
            // Preserve exact birth data without inventing dates
            player.birth = authoritative.birth || '';
            break;
          case 'ratingStandard':
            player.stdRating = authoritative.ratingStandard;
            break;
          case 'ratingRapid':
            player.rapidRating = authoritative.ratingRapid;
            break;
          case 'ratingBlitz':
            player.blitzRating = authoritative.ratingBlitz;
            break;
        }
      }

      // Map active tournament rating deterministically based on ratingType
      if (ratingType === 'Rapid') {
        if (sel.selectedFields.includes('ratingRapid') || player.rapidRating !== undefined) {
          player.rating = authoritative.ratingRapid || player.rating;
        }
      } else if (ratingType === 'Blitz') {
        if (sel.selectedFields.includes('ratingBlitz') || player.blitzRating !== undefined) {
          player.rating = authoritative.ratingBlitz || player.rating;
        }
      } else {
        // Standard or default
        if (sel.selectedFields.includes('ratingStandard') || player.stdRating !== undefined) {
          player.rating = authoritative.ratingStandard || player.rating;
        }
      }

      // Preserve all three ratings on player record if present
      if (authoritative.ratingStandard !== undefined && player.stdRating === undefined) {
        player.stdRating = authoritative.ratingStandard;
      }
      if (authoritative.ratingRapid !== undefined && player.rapidRating === undefined) {
        player.rapidRating = authoritative.ratingRapid;
      }
      if (authoritative.ratingBlitz !== undefined && player.blitzRating === undefined) {
        player.blitzRating = authoritative.ratingBlitz;
      }

      appliedCount++;
    }

    // 2. Validate hard invariants
    const invariantCheck = validateTournamentHardInvariants(updatedTournament);
    if (!invariantCheck.valid) {
      const err: any = new Error(`INVARIANT_VALIDATION_FAILED: ${invariantCheck.violations.join('; ')}`);
      err.code = 'INVARIANT_VALIDATION_FAILED';
      throw err;
    }

    // 3. Compute if starting list order is outdated (for alert)
    const currentSorted = sortPlayersFideStandard(tournament.players);
    const updatedSorted = sortPlayersFideStandard(updatedTournament.players);
    let startingListOutdated = false;
    for (let i = 0; i < currentSorted.length; i++) {
      if (currentSorted[i].localKey !== updatedSorted[i].localKey) {
        startingListOutdated = true;
        break;
      }
    }

    // 4. Commit transaction
    transactionManager.setPreview(tx.transactionId, updatedTournament);
    transactionManager.commit(tx.transactionId);

    return {
      success: true,
      tournament: updatedTournament,
      appliedCount,
      startingListOutdated
    };
  } catch (err: any) {
    // Rollback to exact beforeState
    transactionManager.rollback(tx.transactionId);
    throw err;
  }
}
