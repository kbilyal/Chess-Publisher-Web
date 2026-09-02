import { Player, BoardPairing, PlayerRoundState, GameResult } from '../types';

export interface DutchPairingRequest {
  round: number;
  totalRounds: number;
  players: Player[];
  playerStates: PlayerRoundState[];
  initialTopColor: 'w' | 'b';
  manualByes?: Record<string, string>; // e.g. { playerKey: 'PAB' | 'F' | 'H' | 'Z' }
  excludedKeys?: string[];
  fixedBoards?: Record<string, number>;
  pabPoints?: number;
}

export interface DutchPairingResult {
  round: number;
  boards: BoardPairing[];
  engineName: string;
  authoritative: false;
  engineType: 'prototype';
  unpairedKeys: string[];
  pabKey?: string;
  ruleLog: string[];
}

/**
 * PROTOTYPE / DEMONSTRATION ENGINE ONLY — NON-AUTHORITATIVE
 * 
 * IMPORTANT: This client-side TypeScript implementation is intended exclusively
 * for UI development, visual demonstration, offline testing, and comparison.
 * It is NOT authoritative, NOT FIDE-certified, and MUST NOT be used for official tournaments.
 * The production authoritative pairing engine is Gacrux (via backend API).
 */
export function generateDutchPairings(request: DutchPairingRequest): DutchPairingResult {
  const { round, players, playerStates, initialTopColor, manualByes = {}, excludedKeys = [], fixedBoards = {}, pabPoints = 1.0 } = request;
  const ruleLog: string[] = [];

  ruleLog.push(`Starting FIDE Dutch pairing for Round ${round}`);

  // 1. Determine active eligible players for this round
  const manualByeKeys = new Set(Object.keys(manualByes));
  const excludedSet = new Set(excludedKeys);

  const activeCandidates = playerStates.filter(p => {
    const isJoined = Number(p.joinedFromRound || 1) <= round;
    const isPresent = p.sourcePlayer ? p.sourcePlayer.attendance !== 'absent' : true;
    const isExcluded = excludedSet.has(p.key);
    const hasManualBye = manualByeKeys.has(p.key);
    return isJoined && isPresent && !isExcluded && !hasManualBye;
  });

  ruleLog.push(`Active pairable players count: ${activeCandidates.length}`);

  // Sort active candidates by current score DESC, then by starting rank (pairingNumber/id) ASC
  activeCandidates.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
    return a.id - b.id;
  });

  // Check parity: If odd number of players, exactly one gets a pairing-allocated bye (PAB)
  let allocatedPabPlayer: PlayerRoundState | null = null;
  let pool = [...activeCandidates];

  if (pool.length % 2 === 1) {
    // In FIDE Dutch, PAB is assigned to the lowest ranked player in the lowest score bracket
    // who has not already received a PAB or full point unplayed bye.
    let pabCandidateIndex = -1;
    for (let i = pool.length - 1; i >= 0; i--) {
      const candidate = pool[i];
      // Check if candidate already had a PAB / full unplayed bye
      const hadPab = candidate.rounds.some(r => r && (r.kind === 'pairing-bye' || r.result === 'U' || r.result === 'PAB'));
      if (!hadPab) {
        pabCandidateIndex = i;
        break;
      }
    }

    if (pabCandidateIndex === -1) {
      // Fallback to lowest ranked
      pabCandidateIndex = pool.length - 1;
    }

    allocatedPabPlayer = pool.splice(pabCandidateIndex, 1)[0];
    ruleLog.push(`Assigned Pairing-Allocated Bye (PAB) to: ${allocatedPabPlayer.name} (SNo. ${allocatedPabPlayer.id}, Pts: ${allocatedPabPlayer.score})`);
  }

  // 2. Perform Swiss pairing on pool (even count)
  let pairedMatches: { white: PlayerRoundState; black: PlayerRoundState }[] = [];

  if (round === 1) {
    // Round 1 Special Case:
    // Split into Top Half S1 and Bottom Half S2
    const n = pool.length;
    const half = n / 2;
    const S1 = pool.slice(0, half);
    const S2 = pool.slice(half);

    for (let i = 0; i < half; i++) {
      const p1 = S1[i];
      const p2 = S2[i];
      // Board 1 takes initialTopColor, board 2 takes opposite, etc.
      const boardIndex = i + 1;
      const topGetsWhite = (boardIndex % 2 === 1) ? (initialTopColor === 'w') : (initialTopColor !== 'w');

      if (topGetsWhite) {
        pairedMatches.push({ white: p1, black: p2 });
      } else {
        pairedMatches.push({ white: p2, black: p1 });
      }
    }
    ruleLog.push(`Round 1: Split into Top Half (${S1.length}) and Bottom Half (${S2.length}) with alternating colors.`);
  } else {
    // Round > 1: Score brackets pairing with backtracking and color balance optimization
    pairedMatches = pairScoreBrackets(pool, round, initialTopColor, ruleLog);
  }

  // 3. Assemble BoardPairing array
  const boards: BoardPairing[] = [];

  pairedMatches.forEach((match, idx) => {
    boards.push({
      board: idx + 1,
      whiteKey: match.white.key,
      blackKey: match.black.key,
      result: '-'
    });
  });

  // Append PAB if any (PAB must be the last board in pairing)
  if (allocatedPabPlayer) {
    boards.push({
      board: boards.length + 1,
      whiteKey: allocatedPabPlayer.key,
      blackKey: '',
      result: 'PAB'
    });
  }

  // Append manual byes and exclusions
  playerStates.forEach(p => {
    const isJoined = Number(p.joinedFromRound || 1) <= round;
    if (!isJoined) return;

    if (manualByeKeys.has(p.key)) {
      const byeType = manualByes[p.key] || 'H';
      let res: GameResult = '½ BYE';
      if (byeType === 'PAB') res = 'PAB';
      else if (byeType === 'F' || byeType === '1') res = '1 BYE';
      else if (byeType === 'H' || byeType === '0.5') res = '½ BYE';
      else if (byeType === 'Z' || byeType === '0') res = '0 BYE';

      boards.push({
        board: boards.length + 1,
        whiteKey: p.key,
        blackKey: '',
        result: res
      });
      ruleLog.push(`Administrative Bye for ${p.name}: ${res}`);
    } else if (excludedSet.has(p.key) || (p.sourcePlayer && p.sourcePlayer.attendance === 'absent')) {
      boards.push({
        board: boards.length + 1,
        whiteKey: p.key,
        blackKey: '',
        result: '0 BYE'
      });
      ruleLog.push(`Absent/Excluded Bye for ${p.name}: 0 BYE`);
    }
  });

  // Apply Fixed Boards rearrangement if requested
  const reorderedBoards = applyFixedBoardOrdering(boards, fixedBoards, ruleLog);

  return {
    round,
    boards: reorderedBoards,
    engineName: 'Prototype Swiss Pairing Engine — Non-Authoritative',
    authoritative: false,
    engineType: 'prototype',
    unpairedKeys: allocatedPabPlayer ? [allocatedPabPlayer.key] : [],
    pabKey: allocatedPabPlayer ? allocatedPabPlayer.key : undefined,
    ruleLog
  };
}

/**
 * Score Bracket Pairing with strict FIDE Dutch criteria:
 * 1. Absolute Criterion A.1: No rematch (two players cannot play each other more than once).
 * 2. Absolute Criterion A.2: Color difference limit (|w - b| <= 2).
 * 3. Absolute Criterion A.3: No three consecutive same colors (w-w-w or b-b-b forbidden).
 * 4. Relative Criterion B.1: Minimize score difference (pairing within same score bracket).
 * 5. Relative Criterion B.2: Equalize and alternate colors.
 */
function pairScoreBrackets(
  players: PlayerRoundState[],
  currentRound: number,
  initialTopColor: 'w' | 'b',
  ruleLog: string[]
): { white: PlayerRoundState; black: PlayerRoundState }[] {
  const result: { white: PlayerRoundState; black: PlayerRoundState }[] = [];
  const remaining = [...players];

  // Group into score brackets
  const scoreMap = new Map<number, PlayerRoundState[]>();
  for (const p of remaining) {
    const s = p.score;
    if (!scoreMap.has(s)) scoreMap.set(s, []);
    scoreMap.get(s)!.push(p);
  }

  // Sort score brackets descending
  const scores = Array.from(scoreMap.keys()).sort((a, b) => b - a);
  let downfloats: PlayerRoundState[] = [];

  for (const s of scores) {
    const currentBracket = [...downfloats, ...(scoreMap.get(s) || [])];
    downfloats = [];

    // Sort bracket by rating DESC, then SNo ASC
    currentBracket.sort((a, b) => {
      if (Math.abs(b.rating - a.rating) > 0.001) return b.rating - a.rating;
      return a.id - b.id;
    });

    const bracketPairs = solveBracket(currentBracket);
    if (bracketPairs.success) {
      result.push(...bracketPairs.pairs);
      if (bracketPairs.unpaired) {
        downfloats.push(bracketPairs.unpaired);
      }
    } else {
      // If bracket cannot be paired internally, downfloat bottom player to next bracket
      if (currentBracket.length > 0) {
        const floater = currentBracket.pop()!;
        downfloats.push(floater);
        const retry = solveBracket(currentBracket);
        if (retry.success) {
          result.push(...retry.pairs);
        } else {
          // Emergency greedy pairing
          downfloats.push(...currentBracket);
        }
      }
    }
  }

  // Pair any remaining downfloats across brackets
  if (downfloats.length > 0) {
    const finalPairs = solveBracketGreedy(downfloats);
    result.push(...finalPairs);
  }

  return result;
}

function solveBracket(bracket: PlayerRoundState[]): {
  success: boolean;
  pairs: { white: PlayerRoundState; black: PlayerRoundState }[];
  unpaired?: PlayerRoundState;
} {
  if (bracket.length === 0) return { success: true, pairs: [] };

  const isOdd = bracket.length % 2 === 1;
  let candidates = [...bracket];
  let downfloatCandidate: PlayerRoundState | undefined;

  if (isOdd) {
    // Select downfloater (lowest in bracket)
    downfloatCandidate = candidates.pop()!;
  }

  const pairs = pairGroupDeterministic(candidates);
  if (pairs !== null) {
    return { success: true, pairs, unpaired: downfloatCandidate };
  }

  // Backtrack: try different downfloaters if odd
  if (isOdd) {
    for (let i = bracket.length - 2; i >= 0; i--) {
      const altCandidates = [...bracket];
      const altDownfloat = altCandidates.splice(i, 1)[0];
      const altPairs = pairGroupDeterministic(altCandidates);
      if (altPairs !== null) {
        return { success: true, pairs: altPairs, unpaired: altDownfloat };
      }
    }
  }

  return { success: false, pairs: [] };
}

function pairGroupDeterministic(
  group: PlayerRoundState[]
): { white: PlayerRoundState; black: PlayerRoundState }[] | null {
  if (group.length === 0) return [];
  if (group.length % 2 !== 0) return null;

  const n = group.length;
  const half = n / 2;
  const S1 = group.slice(0, half);
  const S2 = group.slice(half);

  // Try direct S1[i] with S2[i]
  let directMatches: { white: PlayerRoundState; black: PlayerRoundState }[] = [];
  let possible = true;

  for (let i = 0; i < half; i++) {
    const p1 = S1[i];
    const p2 = S2[i];

    // Check rematch
    if (hasPlayed(p1, p2)) {
      possible = false;
      break;
    }

    const orientation = determineColorOrientation(p1, p2);
    if (!orientation.valid) {
      possible = false;
      break;
    }

    if (orientation.whiteIsP1) {
      directMatches.push({ white: p1, black: p2 });
    } else {
      directMatches.push({ white: p2, black: p1 });
    }
  }

  if (possible && directMatches.length === half) {
    return directMatches;
  }

  // Recursive backtracking matching
  return backtrackPairing(group, []);
}

function backtrackPairing(
  remaining: PlayerRoundState[],
  accumulated: { white: PlayerRoundState; black: PlayerRoundState }[]
): { white: PlayerRoundState; black: PlayerRoundState }[] | null {
  if (remaining.length === 0) return accumulated;

  const first = remaining[0];

  for (let i = 1; i < remaining.length; i++) {
    const partner = remaining[i];

    if (hasPlayed(first, partner)) continue;

    const orientation = determineColorOrientation(first, partner);
    if (!orientation.valid) continue;

    const match = orientation.whiteIsP1
      ? { white: first, black: partner }
      : { white: partner, black: first };

    const nextRemaining = remaining.filter((_, idx) => idx !== 0 && idx !== i);
    const result = backtrackPairing(nextRemaining, [...accumulated, match]);
    if (result !== null) {
      return result;
    }
  }

  return null;
}

function solveBracketGreedy(players: PlayerRoundState[]): { white: PlayerRoundState; black: PlayerRoundState }[] {
  const pairs: { white: PlayerRoundState; black: PlayerRoundState }[] = [];
  const list = [...players];

  while (list.length >= 2) {
    const a = list.shift()!;
    let bestIdx = -1;
    let minPenalty = Infinity;

    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (hasPlayed(a, b)) continue;

      const orient = determineColorOrientation(a, b);
      const penalty = orient.valid ? 0 : 500;

      if (penalty < minPenalty) {
        minPenalty = penalty;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      // Must force pairing even if repeat (emergency fallback)
      bestIdx = 0;
    }

    const b = list.splice(bestIdx, 1)[0];
    const orient = determineColorOrientation(a, b);
    if (orient.whiteIsP1) {
      pairs.push({ white: a, black: b });
    } else {
      pairs.push({ white: b, black: a });
    }
  }

  return pairs;
}

function hasPlayed(p1: PlayerRoundState, p2: PlayerRoundState): boolean {
  return p1.opponents.includes(p2.id) || p2.opponents.includes(p1.id);
}

/**
 * FIDE Color Rules Check:
 * - Color Difference = (Whites - Blacks)
 * - Must not exceed +2 or -2
 * - Must not have 3 consecutive same colors (e.g. w-w -> cannot take w)
 */
export function determineColorOrientation(p1: PlayerRoundState, p2: PlayerRoundState): {
  valid: boolean;
  whiteIsP1: boolean;
} {
  const p1Whites = p1.colors.filter(c => c === 'w').length;
  const p1Blacks = p1.colors.filter(c => c === 'b').length;
  const p1Diff = p1Whites - p1Blacks;
  const p1Last2 = p1.colors.slice(-2);
  const p1CannotWhite = p1Diff >= 2 || (p1Last2.length === 2 && p1Last2[0] === 'w' && p1Last2[1] === 'w');
  const p1CannotBlack = p1Diff <= -2 || (p1Last2.length === 2 && p1Last2[0] === 'b' && p1Last2[1] === 'b');

  const p2Whites = p2.colors.filter(c => c === 'w').length;
  const p2Blacks = p2.colors.filter(c => c === 'b').length;
  const p2Diff = p2Whites - p2Blacks;
  const p2Last2 = p2.colors.slice(-2);
  const p2CannotWhite = p2Diff >= 2 || (p2Last2.length === 2 && p2Last2[0] === 'w' && p2Last2[1] === 'w');
  const p2CannotBlack = p2Diff <= -2 || (p2Last2.length === 2 && p2Last2[0] === 'b' && p2Last2[1] === 'b');

  // If P1 must take White and P2 must take White => Conflict
  if (p1CannotBlack && p2CannotBlack) {
    return { valid: false, whiteIsP1: true };
  }
  // If P1 must take Black and P2 must take Black => Conflict
  if (p1CannotWhite && p2CannotWhite) {
    return { valid: false, whiteIsP1: true };
  }

  if (p1CannotWhite || p2CannotBlack) {
    return { valid: true, whiteIsP1: false };
  }

  if (p1CannotBlack || p2CannotWhite) {
    return { valid: true, whiteIsP1: true };
  }

  // Preference by color difference
  if (p1Diff < p2Diff) {
    return { valid: true, whiteIsP1: true }; // P1 has fewer whites, give P1 white
  } else if (p2Diff < p1Diff) {
    return { valid: true, whiteIsP1: false };
  }

  // Preference by alternation (oppose last color)
  const p1Last = p1.colors[p1.colors.length - 1];
  const p2Last = p2.colors[p2.colors.length - 1];

  if (p1Last === 'b' && p2Last === 'w') {
    return { valid: true, whiteIsP1: true };
  } else if (p1Last === 'w' && p2Last === 'b') {
    return { valid: true, whiteIsP1: false };
  }

  // Highest ranked player alternation
  return { valid: true, whiteIsP1: p1.id <= p2.id };
}

function applyFixedBoardOrdering(
  boards: BoardPairing[],
  fixedBoards: Record<string, number>,
  ruleLog: string[]
): BoardPairing[] {
  if (Object.keys(fixedBoards).length === 0) return boards;

  const normalGames = boards.filter(b => b.whiteKey && b.blackKey);
  const byes = boards.filter(b => !b.whiteKey || !b.blackKey);

  const desiredSlots = new Map<number, BoardPairing>();

  normalGames.forEach(b => {
    const fixedW = fixedBoards[b.whiteKey];
    const fixedB = fixedBoards[b.blackKey];
    const targetBoard = fixedW || fixedB;

    if (targetBoard && targetBoard <= normalGames.length) {
      desiredSlots.set(targetBoard, b);
      b.fixedWhite = !!fixedW;
      b.fixedBlack = !!fixedB;
      b.fixedBoardNumber = targetBoard;
    }
  });

  const availableBoards = normalGames.filter(b => !b.fixedBoardNumber);
  const reordered: (BoardPairing | null)[] = new Array(normalGames.length).fill(null);

  desiredSlots.forEach((board, slotNum) => {
    if (slotNum - 1 < reordered.length) {
      reordered[slotNum - 1] = board;
    }
  });

  let freeIdx = 0;
  for (let i = 0; i < reordered.length; i++) {
    if (!reordered[i] && freeIdx < availableBoards.length) {
      reordered[i] = availableBoards[freeIdx++];
    }
  }

  const finalOrdered = [...reordered.filter(Boolean) as BoardPairing[], ...byes];
  finalOrdered.forEach((b, idx) => {
    b.board = idx + 1;
  });

  ruleLog.push(`Applied ${desiredSlots.size} fixed board constraints.`);
  return finalOrdered;
}
