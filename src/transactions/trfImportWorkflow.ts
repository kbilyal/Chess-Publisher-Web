import { Tournament, Player, BoardPairing } from '../types';
import { parseTRF, ParsedTrfTournament } from '../engine/trfParser';
import { TransactionManager } from './TransactionManager';
import { TrfConflictReport, MetadataChange, PlayerAttributeChange } from './types';

/**
 * Parses and computes conflict diff between current tournament and uploaded TRF content.
 */
export function calculateTrfImportPreflight(
  currentTournament: Tournament,
  trfContent: string
): {
  valid: boolean;
  conflictReport: TrfConflictReport;
  parsedData?: ParsedTrfTournament;
  proposedTournament?: Tournament;
} {
  const validationErrors: string[] = [];
  const validationWarnings: string[] = [];

  let parsed: ParsedTrfTournament;
  try {
    parsed = parseTRF(trfContent);
    if (!parsed.players || parsed.players.length === 0) {
      validationErrors.push("No valid '001' player records found in the TRF content.");
    }
  } catch (err: any) {
    return {
      valid: false,
      conflictReport: {
        valid: false,
        validationErrors: [`TRF Parsing Error: ${err.message || String(err)}`],
        validationWarnings: [],
        metadataChanges: [],
        addedPlayers: [],
        removedPlayers: [],
        changedPlayerAttributes: [],
        roundsDifference: { currentRounds: 0, importedRounds: 0 },
        byesDifference: { currentByesCount: 0, importedByesCount: 0 }
      }
    };
  }

  if (validationErrors.length > 0) {
    return {
      valid: false,
      conflictReport: {
        valid: false,
        validationErrors,
        validationWarnings,
        metadataChanges: [],
        addedPlayers: [],
        removedPlayers: [],
        changedPlayerAttributes: [],
        roundsDifference: { currentRounds: 0, importedRounds: 0 },
        byesDifference: { currentByesCount: 0, importedByesCount: 0 }
      },
      parsedData: parsed
    };
  }

  // Check Metadata changes
  const metadataChanges: MetadataChange[] = [];
  if (parsed.name && parsed.name !== currentTournament.name) {
    metadataChanges.push({ field: 'Tournament Name', oldValue: currentTournament.name, newValue: parsed.name });
  }
  if (parsed.city && parsed.city !== currentTournament.settings.city) {
    metadataChanges.push({ field: 'City', oldValue: currentTournament.settings.city, newValue: parsed.city });
  }
  if (parsed.country && parsed.country !== currentTournament.settings.country) {
    metadataChanges.push({ field: 'Country', oldValue: currentTournament.settings.country, newValue: parsed.country });
  }
  if (parsed.chiefArbiter && parsed.chiefArbiter !== currentTournament.settings.chiefArbiter) {
    metadataChanges.push({ field: 'Chief Arbiter', oldValue: currentTournament.settings.chiefArbiter, newValue: parsed.chiefArbiter });
  }
  if (parsed.timeControl && parsed.timeControl !== currentTournament.settings.timeControl) {
    metadataChanges.push({ field: 'Time Control', oldValue: currentTournament.settings.timeControl, newValue: parsed.timeControl });
  }

  // Compare Players
  const currentPlayers = currentTournament.players || [];
  const currentPlayersMap = new Map<string, Player>();
  currentPlayers.forEach(p => {
    // Key by normalized name or fideId
    const key = p.fideId && p.fideId !== '-' ? `fide:${p.fideId}` : `name:${p.name.toLowerCase().trim()}`;
    currentPlayersMap.set(key, p);
  });

  const addedPlayers: { name: string; rating: number; title?: string; fideId?: string }[] = [];
  const changedPlayerAttributes: PlayerAttributeChange[] = [];
  const matchedCurrentKeys = new Set<string>();

  const importedPlayers: Player[] = (parsed.players || []).map((p, idx) => {
    const pNo = p.pairingNumber || idx + 1;
    const key = p.fideId && p.fideId !== '-' ? `fide:${p.fideId}` : `name:${(p.name || '').toLowerCase().trim()}`;
    const existing = currentPlayersMap.get(key);

    if (existing) {
      matchedCurrentKeys.add(key);
      if (existing.rating !== (p.rating || 0)) {
        changedPlayerAttributes.push({
          playerName: p.name || `Player ${pNo}`,
          fideId: p.fideId,
          field: 'rating',
          oldValue: existing.rating,
          newValue: p.rating || 0
        });
      }
      if ((existing.title || '') !== (p.title || '')) {
        changedPlayerAttributes.push({
          playerName: p.name || `Player ${pNo}`,
          fideId: p.fideId,
          field: 'title',
          oldValue: existing.title || '(none)',
          newValue: p.title || '(none)'
        });
      }
      if ((existing.fed || '') !== (p.fed || '')) {
        changedPlayerAttributes.push({
          playerName: p.name || `Player ${pNo}`,
          fideId: p.fideId,
          field: 'fed',
          oldValue: existing.fed || 'BUL',
          newValue: p.fed || 'BUL'
        });
      }
    } else {
      addedPlayers.push({
        name: p.name || `Player ${pNo}`,
        rating: p.rating || 0,
        title: p.title,
        fideId: p.fideId
      });
    }

    return {
      id: pNo,
      localKey: `local:${(p.name || `player-${pNo}`).toLowerCase().replace(/[^a-z0-9]/g, '-')}-${pNo}`,
      name: p.name || `Player ${pNo}`,
      rating: p.rating || 0,
      fed: p.fed || 'BUL',
      fideId: p.fideId || '-',
      birth: p.birth || '-',
      gender: p.gender || 'm',
      title: p.title || '',
      attendance: 'present',
      pairingNumber: pNo,
      joinedFromRound: 1,
      fideK: (p.rating || 0) >= 2400 ? 10 : 20
    };
  });

  const removedPlayers: { name: string; rating: number; title?: string; fideId?: string }[] = [];
  currentPlayers.forEach(p => {
    const key = p.fideId && p.fideId !== '-' ? `fide:${p.fideId}` : `name:${p.name.toLowerCase().trim()}`;
    if (!matchedCurrentKeys.has(key)) {
      removedPlayers.push({
        name: p.name,
        rating: p.rating,
        title: p.title,
        fideId: p.fideId
      });
    }
  });

  // Rebuild liveBoards from TRF roundsData if present
  const liveBoards: Record<string, BoardPairing[]> = {};
  let importedByesCount = 0;
  if (parsed.roundsData) {
    Object.entries(parsed.roundsData).forEach(([roundNum, pairings]) => {
      liveBoards[roundNum] = pairings.map((pair, bIdx) => {
        if (pair.result && (pair.result.includes('BYE') || pair.result === 'PAB')) {
          importedByesCount++;
        }
        const whitePlayer = importedPlayers.find(p => p.pairingNumber === pair.whiteNo || p.id === pair.whiteNo);
        const blackPlayer = pair.blackNo ? importedPlayers.find(p => p.pairingNumber === pair.blackNo || p.id === pair.blackNo) : undefined;

        return {
          board: bIdx + 1,
          whiteKey: whitePlayer?.localKey || `local:player-${pair.whiteNo}`,
          blackKey: blackPlayer?.localKey || (pair.blackNo ? `local:player-${pair.blackNo}` : 'bye'),
          result: (pair.result || '-') as any,
          trfImportedResult: pair.result
        };
      });
    });
  }

  const currentLiveBoards = currentTournament.pairings?.liveBoards || {};
  let currentByesCount = 0;
  Object.values(currentLiveBoards).forEach(boards => {
    (boards || []).forEach(b => {
      if (b.result && (b.result.includes('BYE') || b.result === 'PAB')) {
        currentByesCount++;
      }
    });
  });

  const currentRoundsCount = Object.keys(currentLiveBoards).length;
  const importedRoundsCount = Object.keys(liveBoards).length;

  const proposedTournament: Tournament = {
    ...currentTournament,
    name: parsed.name || currentTournament.name,
    settings: {
      ...currentTournament.settings,
      organizer: parsed.name || currentTournament.settings.organizer,
      city: parsed.city || currentTournament.settings.city,
      country: parsed.country || currentTournament.settings.country,
      startDate: parsed.startDate || currentTournament.settings.startDate,
      endDate: parsed.endDate || currentTournament.settings.endDate,
      chiefArbiter: parsed.chiefArbiter || currentTournament.settings.chiefArbiter,
      timeControl: parsed.timeControl || currentTournament.settings.timeControl,
      rounds: String(parsed.rounds || currentTournament.settings.rounds || 7)
    },
    players: importedPlayers,
    pairings: {
      ...currentTournament.pairings,
      round: String(Math.max(1, importedRoundsCount)),
      results: String(importedRoundsCount),
      liveBoards: Object.keys(liveBoards).length > 0 ? liveBoards : currentTournament.pairings?.liveBoards || {}
    }
  };

  const conflictReport: TrfConflictReport = {
    valid: true,
    validationErrors,
    validationWarnings,
    metadataChanges,
    addedPlayers,
    removedPlayers,
    changedPlayerAttributes,
    roundsDifference: {
      currentRounds: currentRoundsCount,
      importedRounds: importedRoundsCount
    },
    byesDifference: {
      currentByesCount,
      importedByesCount
    }
  };

  return {
    valid: true,
    conflictReport,
    parsedData: parsed,
    proposedTournament
  };
}

/**
 * Executes a transactional TRF import:
 * Upload TRF -> Parse -> Validate -> Compare -> Create snapshot -> Arbiter confirmation -> Commit -> Rollback on error.
 */
export async function executeTrfImportTransaction(
  manager: TransactionManager<Tournament>,
  currentTournament: Tournament,
  trfContent: string,
  persistenceFn?: (state: Tournament) => Promise<boolean> | boolean
): Promise<{
  success: boolean;
  tournament: Tournament;
  conflictReport: TrfConflictReport;
  txId: string;
}> {
  // 1. Begin transaction & capture snapshot
  const tx = manager.begin('IMPORT_TRF', currentTournament);

  // 2. Pre-flight calculation & diff
  const preflight = calculateTrfImportPreflight(currentTournament, trfContent);

  // 3. Validation
  const isValid = manager.validate(tx.transactionId, () => {
    if (!preflight.valid || !preflight.proposedTournament) {
      return {
        valid: false,
        errors: preflight.conflictReport.validationErrors
      };
    }
    return { valid: true, warnings: preflight.conflictReport.validationWarnings };
  });

  if (!isValid || !preflight.proposedTournament) {
    throw new Error(tx.error || 'TRF validation failed.');
  }

  // 4. Set preview
  manager.setPreview(tx.transactionId, preflight.proposedTournament, {
    conflictReport: preflight.conflictReport
  });

  // 5. Commit atomically with rollback protection
  try {
    const committedTournament = await manager.commit(
      tx.transactionId,
      preflight.proposedTournament,
      persistenceFn
    );
    return {
      success: true,
      tournament: committedTournament,
      conflictReport: preflight.conflictReport,
      txId: tx.transactionId
    };
  } catch (err: any) {
    throw new Error(`TRF import commit failed: ${err.message}`);
  }
}
