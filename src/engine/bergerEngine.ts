import { Player, BoardPairing, PlayerRoundState } from '../types';

export interface BergerScheduleRequest {
  players: Player[];
  playerStates?: PlayerRoundState[];
  cycles: number; // 1, 2, 3, 4
  initialTopColor?: 'w' | 'b';
}

export interface BergerScheduleResult {
  totalRounds: number;
  roundsPerCycle: number;
  cycles: number;
  schedule: Record<string, BoardPairing[]>;
  engineName: string;
}

/**
 * Generates FIDE Berger Tables for Individual Round Robin.
 * For N players:
 * - If N is even: Table size is N, rounds per cycle is N - 1.
 * - If N is odd: Table size is N + 1 (last number is a dummy/bye), rounds per cycle is N.
 */
export function generateBergerSchedule(request: BergerScheduleRequest): BergerScheduleResult {
  const { players, cycles = 1, initialTopColor = 'w' } = request;
  const n = players.length;

  if (n < 2) {
    throw new Error("Round Robin requires at least two registered players.");
  }

  const tableSize = (n % 2 === 0) ? n : n + 1;
  const roundsPerCycle = tableSize - 1;
  const totalRounds = roundsPerCycle * cycles;
  const flipInitial = initialTopColor === 'b';

  // Base Berger table generation
  const base = Array.from({ length: tableSize - 1 }, (_, i) => i + 1);
  const cycleRounds: { round: number; pairs: [number, number][] }[] = [];

  for (let round = 1; round <= roundsPerCycle; round++) {
    const shift = (round % 2 === 1) ? (round - 1) / 2 : (tableSize / 2) + (round / 2 - 1);
    const rotated = base.slice(shift).concat(base.slice(0, shift));
    const pairs: [number, number][] = [];

    for (let i = 0; i < tableSize / 2; i++) {
      let a = rotated[i];
      let b = (i === 0) ? tableSize : rotated[tableSize - 1 - i];

      // Alternating fixed player color
      if (round % 2 === 0 && i === 0) {
        [a, b] = [b, a];
      }

      const aDummy = a > n;
      const bDummy = b > n;

      if (aDummy || bDummy) {
        // One player has a free day / 0 BYE
        pairs.push([aDummy ? b : a, 0]);
      } else {
        if (flipInitial) {
          [a, b] = [b, a];
        }
        pairs.push([a, b]);
      }
    }
    cycleRounds.push({ round, pairs });
  }

  // Create mapping from SNo (1..n) to player object
  const sortedPlayers = [...players].sort((a, b) => a.pairingNumber - b.pairingNumber);
  const byNumber = new Map<number, Player>();
  sortedPlayers.forEach(p => byNumber.set(p.pairingNumber, p));

  const schedule: Record<string, BoardPairing[]> = {};

  for (let cycle = 0; cycle < cycles; cycle++) {
    const reverseColors = (cycle % 2 === 1);

    for (const baseRound of cycleRounds) {
      const sourceRound = baseRound.round;
      const roundNum = cycle * roundsPerCycle + sourceRound;
      const boards: BoardPairing[] = [];

      baseRound.pairs.forEach((pair, idx) => {
        let whiteNo = pair[0];
        let blackNo = pair[1];

        if (blackNo === 0) {
          // Free day / Bye
          const p = byNumber.get(whiteNo);
          if (p) {
            boards.push({
              board: idx + 1,
              whiteKey: p.localKey,
              blackKey: '',
              result: '0 BYE'
            });
          }
        } else {
          let pWhite = byNumber.get(whiteNo);
          let pBlack = byNumber.get(blackNo);

          if (reverseColors && pWhite && pBlack) {
            [pWhite, pBlack] = [pBlack, pWhite];
          }

          if (pWhite && pBlack) {
            boards.push({
              board: idx + 1,
              whiteKey: pWhite.localKey,
              blackKey: pBlack.localKey,
              result: '-'
            });
          }
        }
      });

      // Keep byes at the end
      boards.sort((a, b) => {
        const aBye = !a.blackKey;
        const bBye = !b.blackKey;
        if (aBye !== bBye) return aBye ? 1 : -1;
        return a.board - b.board;
      });

      boards.forEach((b, i) => { b.board = i + 1; });
      schedule[String(roundNum)] = boards;
    }
  }

  return {
    totalRounds,
    roundsPerCycle,
    cycles,
    schedule,
    engineName: 'FIDE Berger Tables (Single/Double Cycle)'
  };
}

/**
 * Calculates Round Robin rounds for a given player count and cycles count.
 */
export function calculateRoundRobinRounds(playerCount: number, cycles: number): number {
  if (playerCount < 2) return 0;
  const roundsPerCycle = (playerCount % 2 === 0) ? playerCount - 1 : playerCount;
  return roundsPerCycle * Math.max(1, cycles);
}
