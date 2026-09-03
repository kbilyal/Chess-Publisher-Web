/**
 * NOTICE: UNVERIFIED IMPLEMENTATION
 * 
 * In accordance with Chess-Publisher safety policy:
 * This tie-break implementation is currently unverified against the reference
 * Chess-Publisher v1.05.00 Stable baseline. An authoritative tie-break checker
 * (via TieBreakCheckerAdapter) is required before treating these calculations
 * as certified for official FIDE reporting.
 */

import { Player, Tournament, PlayerRoundState, SpecialPrizeConfig, SpecialPrizeGroupResult, TieBreakRuleSet } from '../types';

export { TieBreakRuleSet };

export interface FinalStandingsResult {
  players: PlayerRoundState[];
  tieList: string[];
  completed: number;
}

export function fidePointsFromRound(round: any): number {
  if (!round) return 0;
  if (round.points !== undefined && Number.isFinite(Number(round.points))) {
    return Number(round.points);
  }
  const code = String(round.result || '').trim().slice(0, 1).toUpperCase();
  if (code === '1' || code === '+' || code === 'F' || code === 'U' || code === 'W') return 1;
  if (code === '=' || code === 'H' || code === 'D' || code === '½') return 0.5;
  return 0;
}

/**
 * FIDE Article 16.1.3:
 * A VUR is a round in which a player had a requested bye (half-point bye or zero-point bye)
 * or a forfeit loss (including any unplayed rounds after a player has withdrawn from the
 * tournament, which are treated as zero-point byes).
 */
export function isRequestedByeRound(round: any): boolean {
  if (!round) return false;
  if (round.kind === 'half-bye' || round.kind === 'zero-bye') return true;
  if (round.played === false) {
    if (round.kind === 'pairing-bye' || round.kind === 'full-bye') return false;
    if (round.kind === 'forfeit') return false;
    if (round.result === 'U' || round.result === 'PAB' || round.result === 'F' || round.result === '+') return false;
    if (round.kind === 'unplayed' || round.kind === 'withdrawn' || round.kind === 'absent') return true;
    const code = String(round.result || '').trim().toUpperCase();
    if (code === 'Z' || code === '0' || code === 'H' || code === '=' || code === '½' || code === '1/2') return true;
  }
  return false;
}

export function isForfeitLossRound(round: any): boolean {
  if (!round) return false;
  const res = String(round.result || '').trim().toUpperCase();
  return round.kind === 'forfeit' && (res === '-' || res === '0F' || res === '-:+');
}

export function isForfeitWinRound(round: any): boolean {
  if (!round) return false;
  const res = String(round.result || '').trim().toUpperCase();
  return round.kind === 'forfeit' && (res === '+' || res === '1F' || res === '+:-');
}

export function isVURRound(round: any): boolean {
  // FIDE 16.1.2: Voluntary unplayed round = requested bye or forfeit loss
  return isRequestedByeRound(round) || isForfeitLossRound(round);
}

/**
 * Categorize unplayed rounds according to FIDE Play-Off and Tie-Break Regulations
 * Effective 1 March 2026, Article 16.2:
 * 16.2.1: Pairing-allocated bye or full-point bye
 * 16.2.2: Forfeit win
 * 16.2.3: Requested bye, followed by at least one round that is not a VUR
 * 16.2.4: Forfeit loss
 * 16.2.5: Requested bye in the last round OR followed only by VUR rounds
 */
export function getUnplayedRoundCategory2026(player: PlayerRoundState, roundIndex: number, totalRounds: number): number {
  const round = player.rounds[roundIndex];
  if (!round || round.played !== false) return 0;

  // 16.2.1 Pairing Allocated Bye or Full-Point Bye
  if (
    round.kind === 'pairing-bye' ||
    round.kind === 'full-bye' ||
    round.result === 'U' ||
    round.result === 'PAB' ||
    (round.result === 'F' && fidePointsFromRound(round) === 1)
  ) {
    return 1;
  }

  // 16.2.2 Forfeit win
  if (isForfeitWinRound(round)) return 2;

  // 16.2.4 Forfeit loss
  if (isForfeitLossRound(round)) return 4;

  // Requested bye (half-bye, zero-bye, unplayed after withdrawal)
  if (isRequestedByeRound(round) || round.played === false) {
    let followedByNonVUR = false;
    for (let i = roundIndex + 1; i < totalRounds; i++) {
      const later = player.rounds[i];
      if (later && !isVURRound(later)) {
        followedByNonVUR = true;
        break;
      }
    }
    return followedByNonVUR ? 3 : 5;
  }

  return 0;
}

export function classifyUnplayedRound2026(player: PlayerRoundState, roundIndex: number, totalRounds: number): number {
  return getUnplayedRoundCategory2026(player, roundIndex, totalRounds);
}

/**
 * FIDE Article 16.3:
 * Adjusted score of player used for calculating opponents' tie-breaks.
 * For categories 16.2.1, 16.2.2, 16.2.3, 16.2.4: evaluates as WIN/DRAW/LOSS corresponding to awarded points.
 * For category 16.2.5: evaluates as DRAW regardless of awarded points.
 */
export function getAdjustedScoreForOpponents(
  player: PlayerRoundState,
  totalRounds: number,
  drawPoints: number = 0.5
): number {
  let adjusted = Number(player.score) || 0;

  for (let i = 0; i < totalRounds; i++) {
    const r = player.rounds[i];
    if (!r || r.played !== false) continue;

    const cat = getUnplayedRoundCategory2026(player, i, totalRounds);
    if (cat === 5) {
      const awarded = fidePointsFromRound(r);
      adjusted += drawPoints - awarded; // Category 16.2.5 evaluates as draw
    }
  }

  return adjusted;
}

export function calculateAdjustedScores2026(
  players: PlayerRoundState[],
  totalRounds: number,
  drawPoints: number = 0.5
): void {
  for (const p of players) {
    p.adjustedScore2026 = getAdjustedScoreForOpponents(p, totalRounds, drawPoints);
  }
}

/**
 * FIDE Article 16.4:
 * Dummy opponent score calculation for participant's own tie-break.
 * Article 16.4.1 Forfeits: min(participantFinalScore, scheduledOpponentAdjustedScore)
 * Article 16.4.2 Byes: min(participantFinalScore, drawPoints * totalRounds)
 */
export function getDummyOpponentScore(
  player: PlayerRoundState,
  roundIndex: number,
  totalRounds: number,
  scheduledOpponentAdjustedScore?: number,
  drawPoints: number = 0.5
): number {
  const cat = getUnplayedRoundCategory2026(player, roundIndex, totalRounds);
  const participantFinalScore = Number(player.score) || 0;

  if (cat === 2 || cat === 4) {
    const cap = scheduledOpponentAdjustedScore !== undefined
      ? scheduledOpponentAdjustedScore
      : participantFinalScore;
    return Math.min(participantFinalScore, cap);
  }

  const maxCap = drawPoints * totalRounds;
  return Math.min(participantFinalScore, maxCap);
}

export function getBuchholzContribution(
  player: PlayerRoundState,
  roundIndex: number,
  totalRounds: number,
  scheduledOpponentAdjustedScore?: number,
  drawPoints: number = 0.5
): number {
  return getDummyOpponentScore(player, roundIndex, totalRounds, scheduledOpponentAdjustedScore, drawPoints);
}

export function getSonnebornBergerContribution(
  player: PlayerRoundState,
  roundIndex: number,
  totalRounds: number,
  scheduledOpponentAdjustedScore?: number,
  drawPoints: number = 0.5
): number {
  const dummy = getDummyOpponentScore(player, roundIndex, totalRounds, scheduledOpponentAdjustedScore, drawPoints);
  const round = player.rounds[roundIndex];
  const awarded = fidePointsFromRound(round);
  return dummy * awarded;
}

export function makeOwnTieBreakElements2026(
  player: PlayerRoundState,
  byId: Map<number, PlayerRoundState>,
  totalRounds: number,
  options: { forfeitsAsPlayed?: boolean; drawPoints?: number } = {}
): any[] {
  const elements: any[] = [];
  const forfeitsAsPlayed = !!options.forfeitsAsPlayed;
  const drawPoints = options.drawPoints !== undefined ? options.drawPoints : 0.5;

  for (let i = 0; i < totalRounds; i++) {
    const r = player.rounds[i];
    if (!r) continue;

    if (r.played && r.opp) {
      const opp = byId.get(r.opp);
      if (!opp) continue;

      const oppScore = Number(opp.adjustedScore2026) || 0;
      const points = fidePointsFromRound(r);

      elements.push({
        round: i + 1,
        kind: 'played',
        category: 0,
        vur: false,
        opponentId: r.opp,
        opponentRating: Number(opp.rating) || 0,
        bh: oppScore,
        sb: oppScore * points,
        sbSignificanceScore: oppScore,
        points
      });
      continue;
    }

    const playedPabWithoutOpponent = (
      r.played === true && !Number(r.opp) &&
      (r.kind === 'pairing-bye' || String(r.result || '').toUpperCase() === 'U')
    );

    if (r.played === false || playedPabWithoutOpponent) {
      const cat = playedPabWithoutOpponent ? 1 : getUnplayedRoundCategory2026(player, i, totalRounds);
      const points = fidePointsFromRound(r);

      if (forfeitsAsPlayed && (cat === 2 || cat === 4) && r.opp && byId.has(r.opp)) {
        const scheduled = byId.get(r.opp)!;
        const oppScore = Number(scheduled.adjustedScore2026) || 0;
        elements.push({
          round: i + 1,
          kind: 'forfeit-as-played',
          category: cat,
          vur: false,
          opponentId: r.opp,
          opponentRating: Number(scheduled.rating) || 0,
          bh: oppScore,
          sb: oppScore * points,
          sbSignificanceScore: oppScore,
          points
        });
        continue;
      }

      // FIDE 16.4 Dummy score calculations
      const scheduled = r.opp ? byId.get(r.opp) : null;
      const scheduledAdj = scheduled ? Number(scheduled.adjustedScore2026) || 0 : undefined;
      const dummy = getDummyOpponentScore(player, i, totalRounds, scheduledAdj, drawPoints);

      // VUR determination per Article 16.1.3:
      // Category 1 (PAB, full bye) -> false
      // Category 2 (forfeit win) -> false
      // Category 3, 4, 5 (requested byes, forfeit losses, rounds after withdrawal) -> true
      const isVur = (cat === 3 || cat === 4 || cat === 5);

      elements.push({
        round: i + 1,
        kind: r.kind || 'unplayed',
        category: cat,
        vur: isVur,
        opponentId: r.opp || 0,
        opponentRating: 0,
        bh: dummy,
        sb: dummy * points,
        sbSignificanceScore: dummy,
        points
      });
    }
  }

  return elements;
}

/**
 * FIDE Article 16.5.1 Buchholz Cut-1 Exception:
 * When a modifier requires cutting the least significant value and player has one or more VURs,
 * cut the lowest contribution coming from a VUR, provided it is not lower than the normal least significant value.
 * lowestVurContribution = min(contributions from VUR)
 * normalLowest = min(all contributions)
 * cutValue = max(lowestVurContribution, normalLowest)
 */
export function chooseBuchholzLowCutIndex2026(elements: any[]): number {
  if (!elements.length) return -1;

  let globalIndex = 0;
  for (let i = 1; i < elements.length; i++) {
    if (elements[i].bh < elements[globalIndex].bh) globalIndex = i;
  }

  const vurIndexes = elements.map((e, i) => (e.vur ? i : -1)).filter(i => i >= 0);
  if (vurIndexes.length) {
    let vurIndex = vurIndexes[0];
    for (const i of vurIndexes) {
      if (elements[i].bh < elements[vurIndex].bh) vurIndex = i;
    }
    if (elements[vurIndex].bh >= elements[globalIndex].bh) {
      return vurIndex;
    }
  }

  return globalIndex;
}

/**
 * FIDE Article 16.5.1 Sonneborn-Berger Cut-1 Exception:
 * A = lowest contribution coming from a VUR
 * B = least significant SB value per Article 14.1 (lowest opponent score; tie-broken by lowest result)
 * Cut: max(A, B)
 */
export function chooseSBLowCutIndex2026(elements: any[]): number {
  if (!elements.length) return -1;

  let leastScore = Math.min(...elements.map(e => e.sbSignificanceScore));
  const leastCandidates = elements.map((e, i) => ({ e, i })).filter(x => x.e.sbSignificanceScore === leastScore);

  let globalIndex = leastCandidates[0].i;
  for (const x of leastCandidates) {
    if (x.e.sb < elements[globalIndex].sb) globalIndex = x.i;
  }

  const vurIndexes = elements.map((e, i) => (e.vur ? i : -1)).filter(i => i >= 0);
  if (vurIndexes.length) {
    let vurIndex = vurIndexes[0];
    for (const i of vurIndexes) {
      if (elements[i].sb < elements[vurIndex].sb) vurIndex = i;
    }
    if (elements[vurIndex].sb >= elements[globalIndex].sb) {
      return vurIndex;
    }
  }

  return globalIndex;
}

/**
 * FIDE Article 16.5 / 16.5.2 Apply FIDE Cut Modifiers
 */
export function applyFideCutModifier(
  elements: any[],
  mode: 'BH-C1' | 'BH-C2' | 'BH-M1' | 'BH-M2' | 'SB-C1' | 'SB-C2'
): any[] {
  const arr = [...elements];

  const cutLowBH = () => {
    const idx = chooseBuchholzLowCutIndex2026(arr);
    if (idx >= 0) arr.splice(idx, 1);
  };

  const cutHighBH = () => {
    if (!arr.length) return;
    let idx = 0;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].bh > arr[idx].bh) idx = i;
    }
    arr.splice(idx, 1);
  };

  const cutLowSB = () => {
    const idx = chooseSBLowCutIndex2026(arr);
    if (idx >= 0) arr.splice(idx, 1);
  };

  if (mode === 'BH-C1') {
    cutLowBH();
  } else if (mode === 'BH-C2') {
    cutLowBH();
    cutLowBH();
  } else if (mode === 'BH-M1') {
    cutLowBH();
    cutHighBH();
  } else if (mode === 'BH-M2') {
    cutLowBH();
    cutLowBH();
    cutHighBH();
    cutHighBH();
  } else if (mode === 'SB-C1') {
    cutLowSB();
  } else if (mode === 'SB-C2') {
    cutLowSB();
    cutLowSB();
  }

  return arr;
}

export function buchholzVariant2026(elements: any[], mode: 'BH' | 'C1' | 'C2' | 'M1' | 'M2'): number {
  if (mode === 'BH') {
    return elements.reduce((sum, e) => sum + e.bh, 0);
  }
  const cutMode = `BH-${mode}` as 'BH-C1' | 'BH-C2' | 'BH-M1' | 'BH-M2';
  const remaining = applyFideCutModifier(elements, cutMode);
  return remaining.reduce((sum, e) => sum + e.bh, 0);
}

export function sonnebornVariant2026(elements: any[], mode: 'SB' | 'C1' | 'C2'): number {
  if (mode === 'SB') {
    return elements.reduce((sum, e) => sum + e.sb, 0);
  }
  const cutMode = `SB-${mode}` as 'SB-C1' | 'SB-C2';
  const remaining = applyFideCutModifier(elements, cutMode);
  return remaining.reduce((sum, e) => sum + e.sb, 0);
}

// FIDE Rating Regulations Table 8.1.1 (Percentage score -> Dp rating difference)
const FIDE_PERFORMANCE_DP_BY_PERCENT: number[] = [
  -800,-677,-589,-538,-501,-470,-444,-422,-401,-383,-366,-351,-336,-322,-309,-296,-284,-273,-262,-251,-240,-230,-220,-211,-202,-193,-184,-175,-166,-158,-149,-141,-133,-125,-117,-110,-102,-95,-87,-80,-72,-65,-57,-50,-43,-36,-29,-21,-14,-7,0,
  7,14,21,29,36,43,50,57,65,72,80,87,95,102,110,117,125,133,141,149,158,166,175,184,193,202,211,220,230,240,251,262,273,284,296,309,322,336,351,366,383,401,422,444,470,501,538,589,677,800
];

export function fidePerformanceDifference(scoreFraction: number): number {
  const raw = Math.max(0, Math.min(1, Number(scoreFraction) || 0));
  const percent = Math.max(0, Math.min(100, Math.floor(raw * 100 + 0.5)));
  return FIDE_PERFORMANCE_DP_BY_PERCENT[percent];
}

export function fideRoundedAverage(values: number[]): number {
  const nums = (values || []).map(Number).filter(Number.isFinite);
  if (!nums.length) return 0;
  return Math.floor((nums.reduce((a, b) => a + b, 0) / nums.length) + 0.5);
}

export function fideExpectedScoreAtRating(playerRating: number, opponentRating: number): number {
  const a = Number(playerRating), b = Number(opponentRating);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0.5;
  const d = Math.abs(Math.round(a - b));
  const bands: [number, number][] = [
    [3,.50],[10,.51],[17,.52],[25,.53],[32,.54],[39,.55],[46,.56],[53,.57],[61,.58],[68,.59],[76,.60],[83,.61],[91,.62],[98,.63],[106,.64],[113,.65],
    [121,.66],[129,.67],[137,.68],[145,.69],[153,.70],[162,.71],[170,.72],[179,.73],[188,.74],[197,.75],[206,.76],[215,.77],[225,.78],[235,.79],[245,.80],[256,.81],
    [267,.82],[278,.83],[290,.84],[302,.85],[315,.86],[328,.87],[344,.88],[357,.89],[374,.90],[391,.91],[411,.92],[432,.93],[456,.94],[484,.95],[517,.96],[559,.97],
    [619,.98],[735,.99]
  ];
  let high = 1.0;
  for (const [maxD, p] of bands) {
    if (d <= maxD) { high = p; break; }
  }
  if (a === b) return 0.5;
  return a > b ? high : 1 - high;
}

export function fidePerfectTournamentPerformance(games: { opponentRating: number; points: number }[]): number {
  const rated = (games || []).filter(g => Number(g.opponentRating) > 0);
  if (!rated.length) return 0;
  const score = rated.reduce((sum, g) => sum + Number(g.points || 0), 0);
  const ratings = rated.map(g => Number(g.opponentRating));
  if (score <= 1e-12) return Math.min(...ratings) - 800;

  let lo = Math.min(...ratings) - 1000;
  let hi = Math.max(...ratings) + 1000;
  const expected = (rating: number) => rated.reduce((sum, g) => sum + fideExpectedScoreAtRating(rating, g.opponentRating), 0);
  
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (expected(mid) + 1e-12 >= score) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function calculateAllTieBreaks(
  players: PlayerRoundState[],
  totalRounds: number,
  isRoundRobin: boolean = false,
  drawPoints: number = 0.5
): void {
  const byId = new Map<number, PlayerRoundState>(players.map(p => [p.id, p]));
  calculateAdjustedScores2026(players, totalRounds, drawPoints);

  for (const p of players) {
    const stdElements = makeOwnTieBreakElements2026(p, byId, totalRounds, { forfeitsAsPlayed: false, drawPoints });
    const forfeitElements = makeOwnTieBreakElements2026(p, byId, totalRounds, { forfeitsAsPlayed: true, drawPoints });

    p.fide2026Elements = stdElements;
    p.fide2026ElementsStandard = stdElements;
    p.fide2026ElementsForfeits = forfeitElements;

    p.buchholz = buchholzVariant2026(stdElements, 'BH');
    p.buchholzCut1 = buchholzVariant2026(stdElements, 'C1');
    p.buchholzCut2 = buchholzVariant2026(stdElements, 'C2');
    p.buchholzMedian1 = buchholzVariant2026(stdElements, 'M1');
    p.buchholzMedian2 = buchholzVariant2026(stdElements, 'M2');

    p.sonneborn = sonnebornVariant2026(stdElements, 'SB');
    p.sonnebornCut1 = sonnebornVariant2026(stdElements, 'C1');
    p.sonnebornCut2 = sonnebornVariant2026(stdElements, 'C2');

    // Progressive score
    let progressive = 0;
    let running = 0;
    const oppRatings: number[] = [];

    for (let r = 0; r < totalRounds; r++) {
      const g = p.rounds[r];
      if (g) {
        running += fidePointsFromRound(g);
      }
      progressive += running;

      if (g && g.played && g.opp) {
        const opp = byId.get(g.opp);
        if (opp && Number(opp.rating) > 0) oppRatings.push(Number(opp.rating));
      }
    }

    p.progressive = progressive;
    p.progressiveCut1 = progressive - (p.rounds[0] ? fidePointsFromRound(p.rounds[0]) : 0);
    p.aro = oppRatings.length ? fideRoundedAverage(oppRatings) : 0;
    p.aroCut1 = oppRatings.length > 1 ? fideRoundedAverage([...oppRatings].sort((a, b) => a - b).slice(1)) : p.aro;

    // Performance ratings
    const validGames = (p.rounds || []).filter(g => g && g.played && g.opp && byId.has(g.opp)).map(g => {
      const opp = byId.get(g.opp)!;
      return { opponentRating: Number(opp.rating) || 1400, points: fidePointsFromRound(g) };
    });

    if (validGames.length > 0) {
      const score = validGames.reduce((sum, g) => sum + g.points, 0);
      p.tpr = p.aro + fidePerformanceDifference(score / validGames.length);
      p.ptp = fidePerfectTournamentPerformance(validGames);
    } else {
      p.tpr = 0;
      p.ptp = 0;
    }

    // Direct encounter placeholder (resolved during ranking group sort)
    p.directEncounter = 0;

    // Koya system
    const regularOpponents = (p.rounds || []).filter(g => g && g.played && g.opp && byId.has(g.opp)).map(g => byId.get(g.opp)!);
    p.koya = regularOpponents.reduce((sum, opp) => {
      if ((Number(opp.score) || 0) < totalRounds / 2) return sum;
      const match = (p.rounds || []).find(g => g && g.played && g.opp === opp.id);
      return sum + (match ? fidePointsFromRound(match) : 0);
    }, 0);

    // Opponent rating sum without one
    p.opponentRatingSumWithoutOne = oppRatings.length > 1
      ? [...oppRatings].sort((a, b) => a - b).slice(1).reduce((sum, r) => sum + r, 0)
      : 0;

    p.blackGames = (p.colors || []).filter(c => c === 'b').length;
  }

  // Average Opponents Buchholz (AOB)
  for (const p of players) {
    const regularOpponents = (p.rounds || []).filter(g => g && g.played && g.opp && byId.has(g.opp)).map(g => byId.get(g.opp)!);
    if (regularOpponents.length > 0) {
      const aobRaw = regularOpponents.reduce((sum, opp) => sum + (Number(opp.buchholz) || 0), 0) / regularOpponents.length;
      p.averageOpponentsBuchholz = Math.floor(aobRaw * 100 + 0.5) / 100;
    } else {
      p.averageOpponentsBuchholz = 0;
    }

    const perfOpponents = regularOpponents.filter(o => o.tpr && o.tpr > 0);
    p.apro = perfOpponents.length ? fideRoundedAverage(perfOpponents.map(o => o.tpr || 0)) : 0;
    p.appo = perfOpponents.length ? fideRoundedAverage(perfOpponents.map(o => o.ptp || 0)) : 0;
  }
}

/**
 * FIDE Article 6 Direct Encounter recursive resolution for tied score groups.
 */
export function resolveDirectEncounter(
  group: PlayerRoundState[]
): PlayerRoundState[][] {
  if (group.length <= 1) return [group];

  // Calculate scores only in games among members of the group
  const groupIds = new Set(group.map(p => p.id));
  const miniScores = new Map<number, { score: number; playedCount: number }>();

  for (const p of group) {
    let score = 0;
    let playedCount = 0;
    for (const r of p.rounds) {
      if (r && r.played && r.opp && groupIds.has(r.opp)) {
        score += fidePointsFromRound(r);
        playedCount++;
      }
    }
    miniScores.set(p.id, { score, playedCount });
  }

  const allMet = group.every(p => (miniScores.get(p.id)?.playedCount || 0) === group.length - 1);

  if (allMet) {
    const bucketsMap = new Map<number, PlayerRoundState[]>();
    for (const p of group) {
      const s = miniScores.get(p.id)!.score;
      if (!bucketsMap.has(s)) bucketsMap.set(s, []);
      bucketsMap.get(s)!.push(p);
    }

    const sortedScores = Array.from(bucketsMap.keys()).sort((a, b) => b - a);
    if (sortedScores.length === 1) return [group]; // Still tied

    const result: PlayerRoundState[][] = [];
    for (const s of sortedScores) {
      const sub = bucketsMap.get(s)!;
      if (sub.length <= 1) {
        result.push(sub);
      } else {
        result.push(...resolveDirectEncounter(sub));
      }
    }
    return result;
  }

  return [group];
}

export function getStandingTieBreakValue(player: PlayerRoundState, tieName: string): number {
  const text = String(tieName || '').trim();

  if (text.includes('Buchholz Cut-1')) return Number(player.buchholzCut1 || 0);
  if (text.includes('Buchholz Cut-2')) return Number(player.buchholzCut2 || 0);
  if (text.includes('Median Buchholz 2')) return Number(player.buchholzMedian2 || 0);
  if (text.includes('Median Buchholz')) return Number(player.buchholzMedian1 || 0);
  if (text.includes('Buchholz Tie-Break')) return Number(player.buchholz || 0);

  if (text.includes('Sonneborn-Berger Cut-1')) return Number(player.sonnebornCut1 || 0);
  if (text.includes('Sonneborn-Berger')) return Number(player.sonneborn || 0);

  if (text.includes('Direct Encounter')) return Number(player.directEncounter || 0);
  if (text.includes('Average of Opponents\' Buchholz')) return Number(player.averageOpponentsBuchholz || 0);
  if (text.includes('Average Rating of Opponents')) return Number(player.aro || 0);

  if (text.includes('victories (WIN)')) return Number(player.wins || 0);
  if (text.includes('games won (WON)')) return Number(player.gameWins || 0);
  if (text.includes('played with Black (BPG)')) return Number(player.blackGames || 0);
  if (text.includes('won with Black (BWG)')) return Number(player.blackWins || 0);

  if (text.includes('Performance Tie-Break (TPR)')) return Number(player.tpr || 0);
  if (text.includes('Performance Tie-Break (PTP)')) return Number(player.ptp || 0);
  if (text.includes('Performance Tie-Break (APRO)')) return Number(player.apro || 0);
  if (text.includes('Performance Tie-Break (APPO)')) return Number(player.appo || 0);

  if (text.includes('Progressive Score')) return Number(player.progressive || 0);
  if (text.includes('Koya System')) return Number(player.koya || 0);
  if (text.includes('Sum of the ratings of the opponents')) return Number(player.opponentRatingSumWithoutOne || 0);

  return 0;
}

export function sortStandingsWithTieBreaks(
  players: PlayerRoundState[],
  tieBreakList: string[]
): PlayerRoundState[] {
  // Score bucket grouping
  const scoreMap = new Map<number, PlayerRoundState[]>();
  for (const p of players) {
    const s = p.score;
    if (!scoreMap.has(s)) scoreMap.set(s, []);
    scoreMap.get(s)!.push(p);
  }

  const scores = Array.from(scoreMap.keys()).sort((a, b) => b - a);
  const finalOrdered: PlayerRoundState[] = [];

  for (const s of scores) {
    const bracket = scoreMap.get(s)!;
    if (bracket.length <= 1) {
      finalOrdered.push(...bracket);
      continue;
    }

    const sortedBracket = sortBracketRecursive(bracket, tieBreakList, 0);
    finalOrdered.push(...sortedBracket);
  }

  return finalOrdered;
}

function sortBracketRecursive(
  group: PlayerRoundState[],
  tieBreaks: string[],
  tieIndex: number
): PlayerRoundState[] {
  if (group.length <= 1 || tieIndex >= tieBreaks.length) {
    // Fallback tie-break: lowest Starting Number / SNo
    return [...group].sort((a, b) => a.id - b.id);
  }

  const currentTie = tieBreaks[tieIndex];

  if (currentTie.includes('Direct Encounter')) {
    const deBuckets = resolveDirectEncounter(group);
    const result: PlayerRoundState[] = [];
    for (const b of deBuckets) {
      if (b.length <= 1) {
        result.push(...b);
      } else {
        result.push(...sortBracketRecursive(b, tieBreaks, tieIndex + 1));
      }
    }
    return result;
  }

  // Value grouping
  const valueMap = new Map<number, PlayerRoundState[]>();
  for (const p of group) {
    const val = getStandingTieBreakValue(p, currentTie);
    if (!valueMap.has(val)) valueMap.set(val, []);
    valueMap.get(val)!.push(p);
  }

  const sortedValues = Array.from(valueMap.keys()).sort((a, b) => b - a);
  const result: PlayerRoundState[] = [];

  for (const val of sortedValues) {
    const sub = valueMap.get(val)!;
    if (sub.length <= 1) {
      result.push(...sub);
    } else {
      result.push(...sortBracketRecursive(sub, tieBreaks, tieIndex + 1));
    }
  }

  return result;
}

export function calculateTournamentStandings(tournament: Tournament): FinalStandingsResult {
  const players = tournament.players || [];
  const completedRounds = Object.keys(tournament.pairings.liveBoards || {}).length;
  const announcedRounds = parseInt(tournament.settings.rounds) || 7;
  const isRoundRobin = tournament.settings.tournamentFormat === 'Individual Round Robin';

  // Build PlayerRoundState array
  const byKey = new Map<string, PlayerRoundState>();
  const states: PlayerRoundState[] = players.map(p => {
    const state: PlayerRoundState = {
      id: p.pairingNumber || p.id,
      key: p.localKey,
      name: p.name,
      rating: p.rating,
      fed: p.fed,
      fideId: p.fideId,
      birth: p.birth,
      gender: p.gender,
      title: p.title,
      joinedFromRound: p.joinedFromRound || 1,
      score: 0,
      wins: 0,
      gameWins: 0,
      blackWins: 0,
      opponents: [],
      colors: [],
      byeCount: 0,
      fullPointUnplayed: 0,
      rounds: Array(announcedRounds).fill(null),
      sourcePlayer: p
    };
    byKey.set(p.localKey, state);
    return state;
  });

  // Replay liveBoards
  for (let r = 1; r <= announcedRounds; r++) {
    const boards = tournament.pairings?.liveBoards?.[String(r)];
    if (!Array.isArray(boards)) continue;

    for (const b of boards) {
      const pWhite = byKey.get(b.whiteKey);
      const pBlack = byKey.get(b.blackKey);
      const res = String(b.result || '').trim().toUpperCase();

      if (pWhite && pBlack) {
        let rw = ' ';
        let rb = ' ';
        let played = false;

        if (res === '1 - 0' || res === '1-0' || res === '1:0') { rw = '1'; rb = '0'; played = true; }
        else if (res === '0 - 1' || res === '0-1' || res === '0:1') { rw = '0'; rb = '1'; played = true; }
        else if (res === '½ - ½' || res === '1/2-1/2' || res === '0.5-0.5' || res === '=') { rw = '='; rb = '='; played = true; }
        else if (res === '1F - 0F' || res === '1F-0F' || res === '+:-') { rw = '+'; rb = '-'; played = false; }
        else if (res === '0F - 1F' || res === '0F-1F' || res === '-:+') { rw = '-'; rb = '+'; played = false; }
        else if (res === '0F - 0F' || res === '0F-0F' || res === '-:-') { rw = '-'; rb = '-'; played = false; }

        if (played) {
          pWhite.opponents.push(pBlack.id);
          pBlack.opponents.push(pWhite.id);
          pWhite.colors.push('w');
          pBlack.colors.push('b');

          pWhite.rounds[r - 1] = { opp: pBlack.id, color: 'w', result: rw, played: true, kind: 'played' };
          pBlack.rounds[r - 1] = { opp: pWhite.id, color: 'b', result: rb, played: true, kind: 'played' };

          const pw = fidePointsFromRound(pWhite.rounds[r - 1]);
          const pb = fidePointsFromRound(pBlack.rounds[r - 1]);
          pWhite.score += pw;
          pBlack.score += pb;
          if (pw === 1) { pWhite.wins++; pWhite.gameWins++; }
          if (pb === 1) { pBlack.wins++; pBlack.gameWins++; pBlack.blackWins++; }
        } else if (rw === '+' || rw === '-') {
          pWhite.rounds[r - 1] = { opp: pBlack.id, color: 'w', result: rw, played: false, kind: 'forfeit' };
          pBlack.rounds[r - 1] = { opp: pWhite.id, color: 'b', result: rb, played: false, kind: 'forfeit' };
          const pw = fidePointsFromRound(pWhite.rounds[r - 1]);
          const pb = fidePointsFromRound(pBlack.rounds[r - 1]);
          pWhite.score += pw;
          pBlack.score += pb;
          if (pw === 1) pWhite.wins++;
          if (pb === 1) pBlack.wins++;
        }
      } else {
        const single = pWhite || pBlack;
        if (!single) continue;

        let code = ' ';
        let pts = 0;
        let kind = 'unplayed';

        if (b.entryType === 'PAB' || res === 'PAB') {
          code = 'U';
          pts = b.pabPoints !== undefined ? b.pabPoints : (parseFloat(tournament.regulations?.pabPoints || '1.0') || 1.0);
          kind = 'pairing-bye';
        } else if (b.entryType === 'REQUESTED_BYE' || res === '1 BYE' || res === 'FULL BYE' || res === '½ BYE' || res === '1/2 BYE') {
          if (b.byePoints === 1.0 || res === '1 BYE' || res === 'FULL BYE') {
            code = 'F'; pts = 1.0; kind = 'full-bye';
          } else {
            code = 'H'; pts = b.byePoints !== undefined ? b.byePoints : 0.5; kind = 'half-bye';
          }
        } else if (b.entryType === 'ZERO_POINT_BYE' || res === '0 BYE' || res === 'Z') {
          code = 'Z'; pts = 0.0; kind = 'zero-bye';
        } else if (b.entryType === 'UNPAIRED' || b.entryType === 'ABSENT' || b.entryType === 'WITHDRAWN') {
          code = 'Z'; pts = 0.0; kind = 'unplayed';
        }

        single.rounds[r - 1] = { opp: 0, color: '-', result: code, played: false, kind, points: pts };
        single.score += pts;
        if (pts === 1) single.wins++;
        single.byeCount++;
      }
    }
  }

  // Calculate tiebreaks
  const drawPoints = tournament.regulations?.pointsForDraw !== undefined
    ? Number(tournament.regulations.pointsForDraw)
    : 0.5;
  calculateAllTieBreaks(states, announcedRounds, isRoundRobin, drawPoints);

  // Sort by regulations tiebreak list
  const tieList = tournament.regulations?.tieBreaks || [];
  const sorted = sortStandingsWithTieBreaks(states, tieList);

  return {
    players: sorted,
    tieList,
    completed: completedRounds
  };
}

export function calculateSpecialPrizes(
  standings: PlayerRoundState[],
  config: SpecialPrizeConfig,
  currentYear: number = 2026
): SpecialPrizeGroupResult[] {
  const results: SpecialPrizeGroupResult[] = [];
  const places = Math.min(20, Math.max(1, config.places || 3));

  // 1. Age Categories (U8, U10, U12, U14, U16, U18, U20, 50+, 65+)
  const ageLimits = [8, 10, 12, 14, 16, 18, 20];
  for (const age of ageLimits) {
    const key = `U${age}`;
    if (config.ages.includes(key)) {
      const minBirthYear = currentYear - age;
      const eligible = standings.filter(p => {
        const birthYear = parseInt(p.birth?.slice(0, 4) || '0');
        return birthYear >= minBirthYear;
      });
      results.push({
        name: `Best Junior ${key} (Born ${minBirthYear}+)`,
        kind: 'age',
        players: eligible.slice(0, places)
      });
    }
  }

  if (config.ages.includes('50+')) {
    const maxBirthYear = currentYear - 50;
    const eligible = standings.filter(p => {
      const birthYear = parseInt(p.birth?.slice(0, 4) || '0');
      return birthYear > 0 && birthYear <= maxBirthYear;
    });
    results.push({
      name: `Best Senior 50+ (Born ≤${maxBirthYear})`,
      kind: 'age',
      players: eligible.slice(0, places)
    });
  }

  if (config.ages.includes('65+')) {
    const maxBirthYear = currentYear - 65;
    const eligible = standings.filter(p => {
      const birthYear = parseInt(p.birth?.slice(0, 4) || '0');
      return birthYear > 0 && birthYear <= maxBirthYear;
    });
    results.push({
      name: `Best Veteran 65+ (Born ≤${maxBirthYear})`,
      kind: 'age',
      players: eligible.slice(0, places)
    });
  }

  // 2. Female category
  if (config.female) {
    const eligible = standings.filter(p => {
      const g = p.gender ? p.gender.toLowerCase() : '';
      return g === 'f' || g === 'w' || g === 'female';
    });
    results.push({
      name: 'Best Female Player',
      kind: 'female',
      players: eligible.slice(0, places)
    });
  }

  // 3. Rating Range categories
  if (config.ratingRanges) {
    config.ratingRanges.filter(r => r.enabled).forEach(range => {
      const minR = Number(range.from) || 0;
      const maxR = Number(range.to) || 9999;
      const eligible = standings.filter(p => p.rating >= minR && p.rating <= maxR);
      results.push({
        name: range.name || `Rating ${minR}-${maxR}`,
        kind: 'rating',
        players: eligible.slice(0, places)
      });
    });
  }

  return results;
}
