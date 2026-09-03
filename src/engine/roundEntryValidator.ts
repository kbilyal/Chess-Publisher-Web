import { Tournament, BoardPairing, GameResult, RoundEntryType, RoundLifecycleStatus, Player } from '../types';

/**
 * Valid Normal Chess Results that can only be assigned to NORMAL_GAME with 2 real players
 */
export const NORMAL_GAME_RESULTS: readonly GameResult[] = [
  '1 - 0',
  '½ - ½',
  '0 - 1',
  '1F - 0F',
  '0F - 1F',
  '0F - 0F'
] as const;

export const PLAYED_CHESS_RESULTS: readonly string[] = [
  '1 - 0',
  '½ - ½',
  '0 - 1',
  '1F - 0F',
  '0F - 1F',
  '0F - 0F'
];

/**
 * Determines the explicit entry type of a board pairing.
 * Distinguishes NORMAL_GAME, PAB, REQUESTED_BYE, ZERO_POINT_BYE, UNPAIRED, ABSENT, WITHDRAWN.
 */
export function determineBoardEntryType(
  b: BoardPairing,
  tournament?: Tournament,
  round?: number
): RoundEntryType {
  // If entryType is already explicitly defined and valid, respect it
  if (b.entryType && isValidEntryType(b.entryType)) {
    return b.entryType;
  }

  const hasWhite = Boolean(b.whiteKey && b.whiteKey !== '' && b.whiteKey !== 'BYE' && b.whiteKey !== 'PAB');
  const hasBlack = Boolean(b.blackKey && b.blackKey !== '' && b.blackKey !== 'BYE' && b.blackKey !== 'PAB');

  // Both players present and valid
  if (hasWhite && hasBlack) {
    return 'NORMAL_GAME';
  }

  // Single player entry (Bye / Administrative)
  const singleKey = hasWhite ? b.whiteKey : (hasBlack ? b.blackKey : '');
  const roundKey = round ? String(round) : (tournament?.pairings?.round || '1');

  // Check manual/configured bye in tournament engine settings
  const manualByeSetting = singleKey && tournament?.pairings?.engine?.manualByes?.[roundKey]?.[singleKey];
  const isExcluded = singleKey && tournament?.pairings?.engine?.excluded?.includes(singleKey);

  if (b.result === 'PAB' || b.manualLateEntryPab || manualByeSetting === 'PAB') {
    return 'PAB';
  }

  if (b.result === '½ BYE' || (b.result as string) === '1/2 BYE' || b.lateEntryByeType === 'H' || manualByeSetting === 'H') {
    return 'REQUESTED_BYE';
  }

  if (b.result === '1 BYE' || b.lateEntryByeType === 'F' || manualByeSetting === 'F') {
    return 'REQUESTED_BYE';
  }

  if (b.result === '0 BYE' || b.lateEntryByeType === 'Z' || manualByeSetting === 'Z') {
    return 'ZERO_POINT_BYE';
  }

  if (isExcluded) {
    return 'WITHDRAWN';
  }

  // If blackKey is missing or blank and result is default '-', standard swiss allocation is PAB or Unpaired
  if (hasWhite && !hasBlack) {
    if ((b.result as string) === 'PAB' || b.pabPoints !== undefined) {
      return 'PAB';
    }
    return 'UNPAIRED';
  }

  return 'UNPAIRED';
}

function isValidEntryType(val: any): val is RoundEntryType {
  return [
    'NORMAL_GAME',
    'PAB',
    'REQUESTED_BYE',
    'ZERO_POINT_BYE',
    'UNPAIRED',
    'ABSENT',
    'WITHDRAWN'
  ].includes(val);
}

/**
 * Returns true ONLY if board has two real players and is a NORMAL_GAME
 */
export function isNormalGame(b: BoardPairing): boolean {
  const hasWhite = Boolean(b.whiteKey && b.whiteKey !== '' && b.whiteKey !== 'BYE' && b.whiteKey !== 'PAB');
  const hasBlack = Boolean(b.blackKey && b.blackKey !== '' && b.blackKey !== 'BYE' && b.blackKey !== 'PAB');
  return hasWhite && hasBlack && (b.entryType === undefined || b.entryType === 'NORMAL_GAME');
}

/**
 * Calculates authoritative points awarded for an entry
 */
export function getEntryPoints(
  entryType: RoundEntryType,
  b: BoardPairing,
  tournament?: Tournament
): number {
  if (entryType === 'PAB') {
    if (b.pabPoints !== undefined) return b.pabPoints;
    const cfgPab = tournament?.regulations?.pabPoints ? parseFloat(tournament.regulations.pabPoints) : 1.0;
    return isNaN(cfgPab) ? 1.0 : cfgPab;
  }
  if (entryType === 'REQUESTED_BYE') {
    if (b.byePoints !== undefined) return b.byePoints;
    if (b.result === '1 BYE' || b.lateEntryByeType === 'F') return 1.0;
    if (b.result === '½ BYE' || (b.result as string) === '1/2 BYE' || b.lateEntryByeType === 'H') return 0.5;
    return 0.5;
  }
  if (entryType === 'ZERO_POINT_BYE' || entryType === 'UNPAIRED' || entryType === 'ABSENT' || entryType === 'WITHDRAWN') {
    return 0.0;
  }
  return 0.0;
}

/**
 * Returns human-readable badges and labels for an entry
 */
export function getBoardDisplayInfo(
  b: BoardPairing,
  tournament?: Tournament,
  round?: number
): {
  entryType: RoundEntryType;
  isNormal: boolean;
  whiteOpponentLabel: string;
  blackOpponentLabel: string;
  resultBadgeText: string;
  points: number;
  pointsLabel: string;
  isLocked: boolean;
} {
  const entryType = determineBoardEntryType(b, tournament, round);
  const isNormal = entryType === 'NORMAL_GAME';
  const points = isNormal ? 0 : getEntryPoints(entryType, b, tournament);
  const roundKey = round ? String(round) : (tournament?.pairings?.round || '1');
  const isLocked = Boolean(
    tournament?.pairings?.finalizedRounds?.[roundKey] ||
    tournament?.pairings?.roundStatus?.[roundKey] === 'RESULTS_FINALIZED'
  );

  let resultBadgeText = b.result === '-' ? '—' : b.result;
  let pointsLabel = `${points.toFixed(1)} pt`;
  let whiteOpponentLabel = '';
  let blackOpponentLabel = '';

  switch (entryType) {
    case 'PAB':
      resultBadgeText = `PAB • ${points.toFixed(1)} pt`;
      blackOpponentLabel = `Pairing-Allocated Bye (${points.toFixed(1)} pt)`;
      break;
    case 'REQUESTED_BYE':
      resultBadgeText = `Requested Bye • ${points.toFixed(1)} pt`;
      blackOpponentLabel = `Requested Bye (${points.toFixed(1)} pt)`;
      break;
    case 'ZERO_POINT_BYE':
      resultBadgeText = `Zero-Point Bye • 0 pt`;
      blackOpponentLabel = `Zero-Point Bye (0 pt)`;
      break;
    case 'UNPAIRED':
      resultBadgeText = `Unpaired • 0 pt`;
      blackOpponentLabel = `Unpaired (0 pt)`;
      break;
    case 'ABSENT':
      resultBadgeText = `Absent`;
      blackOpponentLabel = `Absent`;
      break;
    case 'WITHDRAWN':
      resultBadgeText = `Withdrawn`;
      blackOpponentLabel = `Withdrawn`;
      break;
    case 'NORMAL_GAME':
    default:
      break;
  }

  return {
    entryType,
    isNormal,
    whiteOpponentLabel,
    blackOpponentLabel,
    resultBadgeText,
    points,
    pointsLabel,
    isLocked
  };
}

/**
 * HARD DATA INVARIANT VALIDATION
 * 
 * Verifies that:
 * 1. No board has missing whiteKey or missing blackKey while having a played chess result (1-0, 0-1, 1/2-1/2, 1F-0F, etc.)
 * 2. Administrative entries do not have normal chess results.
 */
export function validateBoardHardInvariants(b: BoardPairing): { valid: boolean; error?: string } {
  const hasWhite = Boolean(b.whiteKey && b.whiteKey !== '' && b.whiteKey !== 'BYE' && b.whiteKey !== 'PAB');
  const hasBlack = Boolean(b.blackKey && b.blackKey !== '' && b.blackKey !== 'BYE' && b.blackKey !== 'PAB');

  // Case 1: Incomplete player pairing with a played game result
  if (!hasWhite || !hasBlack) {
    if (
      b.result === '1 - 0' ||
      b.result === '0 - 1' ||
      b.result === '½ - ½' ||
      b.result === '1F - 0F' ||
      b.result === '0F - 1F' ||
      b.result === '0F - 0F'
    ) {
      return {
        valid: false,
        error: `Illegal board state on Board #${b.board}: Played result '${b.result}' requires two real players (White: ${b.whiteKey || 'missing'}, Black: ${b.blackKey || 'missing'}).`
      };
    }
  }

  // Case 2: 0 players
  if (!hasWhite && !hasBlack) {
    return {
      valid: false,
      error: `Illegal board state on Board #${b.board}: Neither White nor Black player is assigned.`
    };
  }

  return { valid: true };
}

/**
 * Validates tournament state across all rounds for hard invariants
 */
export function validateTournamentHardInvariants(tournament: Tournament): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const liveBoards = tournament.pairings?.liveBoards || {};

  for (const [roundKey, boards] of Object.entries(liveBoards)) {
    if (!Array.isArray(boards)) continue;
    for (const b of boards) {
      const check = validateBoardHardInvariants(b);
      if (!check.valid && check.error) {
        violations.push(`Round ${roundKey}: ${check.error}`);
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations
  };
}

/**
 * Sanitizes tournament board pairings to strictly guarantee data invariants
 */
export function sanitizeTournamentHardInvariants(tournament: Tournament): {
  tournament: Tournament;
  modifiedCount: number;
  messages: string[];
} {
  const cloned: Tournament = JSON.parse(JSON.stringify(tournament));
  let modifiedCount = 0;
  const messages: string[] = [];

  const liveBoards = cloned.pairings?.liveBoards || {};
  for (const [roundKey, boards] of Object.entries(liveBoards)) {
    if (!Array.isArray(boards)) continue;
    for (let i = 0; i < boards.length; i++) {
      const b = boards[i];
      const hasWhite = Boolean(b.whiteKey && b.whiteKey !== '' && b.whiteKey !== 'BYE' && b.whiteKey !== 'PAB');
      const hasBlack = Boolean(b.blackKey && b.blackKey !== '' && b.blackKey !== 'BYE' && b.blackKey !== 'PAB');

      if (!hasWhite || !hasBlack) {
        if (
          b.result === '1 - 0' ||
          b.result === '0 - 1' ||
          b.result === '½ - ½' ||
          b.result === '1F - 0F' ||
          b.result === '0F - 1F' ||
          b.result === '0F - 0F'
        ) {
          // Fix corrupted result on single-player entry
          const entryType = determineBoardEntryType(b, cloned, Number(roundKey));
          b.entryType = entryType;
          if (entryType === 'PAB') {
            b.result = 'PAB';
          } else if (entryType === 'REQUESTED_BYE') {
            b.result = '½ BYE';
          } else if (entryType === 'ZERO_POINT_BYE') {
            b.result = '0 BYE';
          } else {
            b.result = '-';
          }
          modifiedCount++;
          messages.push(`Repaired illegal result on Round ${roundKey} Board #${b.board} (Converted to ${b.result})`);
        } else {
          // Ensure correct entryType is set
          if (!b.entryType) {
            b.entryType = determineBoardEntryType(b, cloned, Number(roundKey));
          }
        }
      } else {
        if (!b.entryType) {
          b.entryType = 'NORMAL_GAME';
        }
      }
    }
  }

  return {
    tournament: cloned,
    modifiedCount,
    messages
  };
}

/**
 * Computes exact round lifecycle state:
 * - ROUND_ACTIVE: round generated, games in progress
 * - ALL_RESULTS_ENTERED: all normal games have valid results, all administrative entries are valid, NOT finalized yet
 * - RESULTS_FINALIZED: arbiter explicitly finalized the round, locked
 */
export function getRoundLifecycleState(
  tournament: Tournament,
  round: number
): {
  status: RoundLifecycleStatus;
  isComplete: boolean;
  isFinalized: boolean;
  canFinalize: boolean;
  canGenerateNext: boolean;
  totalBoards: number;
  normalGames: number;
  normalGamesCompleted: number;
  adminEntries: number;
  pendingBoards: number[];
  validationErrors: string[];
} {
  const roundKey = String(round);
  const liveBoards = tournament.pairings?.liveBoards || {};
  const boards = liveBoards[roundKey] || [];
  const validationErrors: string[] = [];
  const pendingBoards: number[] = [];

  if (boards.length === 0) {
    return {
      status: 'ROUND_ACTIVE',
      isComplete: false,
      isFinalized: false,
      canFinalize: false,
      canGenerateNext: false,
      totalBoards: 0,
      normalGames: 0,
      normalGamesCompleted: 0,
      adminEntries: 0,
      pendingBoards: [],
      validationErrors: ['No boards generated for this round.']
    };
  }

  let normalGames = 0;
  let normalGamesCompleted = 0;
  let adminEntries = 0;

  boards.forEach((b) => {
    const entryType = determineBoardEntryType(b, tournament, round);
    if (entryType === 'NORMAL_GAME') {
      normalGames++;
      if (b.result !== '-' && NORMAL_GAME_RESULTS.includes(b.result)) {
        normalGamesCompleted++;
      } else {
        pendingBoards.push(b.board);
      }
    } else {
      adminEntries++;
      // Verify no illegal chess result on administrative board
      const check = validateBoardHardInvariants(b);
      if (!check.valid && check.error) {
        validationErrors.push(check.error);
      }
    }
  });

  const allNormalGamesEntered = normalGamesCompleted === normalGames;
  const isComplete = allNormalGamesEntered && validationErrors.length === 0;

  const isFinalized = Boolean(
    tournament.pairings?.finalizedRounds?.[roundKey] === true ||
    tournament.pairings?.roundStatus?.[roundKey] === 'RESULTS_FINALIZED'
  );

  const announcedRounds = parseInt(tournament.settings?.rounds || '7', 10);
  const generatedRounds = Object.keys(liveBoards).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  const latestRound = generatedRounds.length > 0 ? generatedRounds[generatedRounds.length - 1] : 0;
  const isLatestRound = round === latestRound;

  let status: RoundLifecycleStatus = 'ROUND_ACTIVE';
  if (isFinalized) {
    status = 'RESULTS_FINALIZED';
  } else if (isComplete) {
    status = 'ALL_RESULTS_ENTERED';
  } else {
    status = 'ROUND_ACTIVE';
  }

  const canFinalize = status === 'ALL_RESULTS_ENTERED' && !isFinalized && validationErrors.length === 0;
  // Next round is allowed ONLY if the current round is explicitly finalized!
  const canGenerateNext = isFinalized && isLatestRound && round < announcedRounds;

  return {
    status,
    isComplete,
    isFinalized,
    canFinalize,
    canGenerateNext,
    totalBoards: boards.length,
    normalGames,
    normalGamesCompleted,
    adminEntries,
    pendingBoards,
    validationErrors
  };
}

/**
 * Validates a round prior to finalization
 */
export function validateRoundForFinalization(
  tournament: Tournament,
  round: number
): { valid: boolean; errors: string[] } {
  const lifecycle = getRoundLifecycleState(tournament, round);
  const errors: string[] = [...lifecycle.validationErrors];

  if (lifecycle.totalBoards === 0) {
    errors.push(`Round ${round} has no boards.`);
  }

  if (lifecycle.normalGamesCompleted < lifecycle.normalGames) {
    errors.push(
      `Round ${round} cannot be finalized: ${lifecycle.normalGames - lifecycle.normalGamesCompleted} normal board(s) still missing results (Board numbers: ${lifecycle.pendingBoards.join(', ')}).`
    );
  }

  // Check tournament hard invariants
  const invariantCheck = validateTournamentHardInvariants(tournament);
  if (!invariantCheck.valid) {
    errors.push(...invariantCheck.violations);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
