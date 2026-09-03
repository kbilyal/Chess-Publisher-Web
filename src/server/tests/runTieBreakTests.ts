/**
 * Authoritative Test Suite for FIDE Play-Off and Tie-Break Regulations
 * Effective from 1 March 2026 (Section 16 - Unplayed Rounds Management)
 * 
 * Matrix: Cases A through L + Full Article 16 Verification
 */

import {
  calculateTournamentStandings,
  calculateAllTieBreaks,
  fidePointsFromRound,
  chooseBuchholzLowCutIndex2026,
  chooseSBLowCutIndex2026,
  buchholzVariant2026,
  sonnebornVariant2026,
  getUnplayedRoundCategory2026,
  getAdjustedScoreForOpponents,
  getDummyOpponentScore,
  getBuchholzContribution,
  getSonnebornBergerContribution,
  applyFideCutModifier,
  TieBreakRuleSet
} from '../../engine/tiebreaks';
import { Tournament, PlayerRoundState } from '../../types';

function createMockPlayer(id: number, name: string, roundsCount: number): PlayerRoundState {
  return {
    id,
    key: `p_${id}`,
    name,
    rating: 2000,
    fed: 'FID',
    fideId: `1000${id}`,
    birth: '1990-01-01',
    gender: 'm',
    title: '',
    joinedFromRound: 1,
    score: 0,
    wins: 0,
    gameWins: 0,
    blackWins: 0,
    opponents: [],
    colors: [],
    byeCount: 0,
    fullPointUnplayed: 0,
    rounds: Array(roundsCount).fill(null),
    sourcePlayer: {
      id,
      pairingNumber: id,
      localKey: `p_${id}`,
      name,
      rating: 2000,
      fideId: `1000${id}`,
      fed: 'FID',
      title: '',
      gender: 'm',
      birth: '1990-01-01',
      joinedFromRound: 1,
      attendance: 'present'
    }
  };
}

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    console.error(`  [FAIL] ${testName}${details ? ` - ${details}` : ''}`);
  }
}

export async function runAllTieBreakTests() {
  console.log('=== FIDE 2026 TIE-BREAK AUDIT & REGRESSION SUITE (Effective 1 March 2026) ===\n');

  // -------------------------------------------------------------
  // CASE A: Normal played tournament (no unplayed rounds)
  // -------------------------------------------------------------
  console.log('--- CASE A: Normal Played Tournament ---');
  {
    const p1 = createMockPlayer(1, 'Player 1', 3);
    const p2 = createMockPlayer(2, 'Player 2', 3);
    const p3 = createMockPlayer(3, 'Player 3', 3);
    const p4 = createMockPlayer(4, 'Player 4', 3);

    // R1: 1-2 (1-0), 3-4 (0.5-0.5)
    p1.rounds[0] = { opp: 2, color: 'w', result: '1', played: true, kind: 'played' };
    p2.rounds[0] = { opp: 1, color: 'b', result: '0', played: true, kind: 'played' };
    p3.rounds[0] = { opp: 4, color: 'w', result: '=', played: true, kind: 'played' };
    p4.rounds[0] = { opp: 3, color: 'b', result: '=', played: true, kind: 'played' };

    // R2: 1-3 (1-0), 2-4 (1-0)
    p1.rounds[1] = { opp: 3, color: 'b', result: '1', played: true, kind: 'played' };
    p3.rounds[1] = { opp: 1, color: 'w', result: '0', played: true, kind: 'played' };
    p2.rounds[1] = { opp: 4, color: 'w', result: '1', played: true, kind: 'played' };
    p4.rounds[1] = { opp: 2, color: 'b', result: '0', played: true, kind: 'played' };

    // R3: 1-4 (1-0), 2-3 (0.5-0.5)
    p1.rounds[2] = { opp: 4, color: 'w', result: '1', played: true, kind: 'played' };
    p4.rounds[2] = { opp: 1, color: 'b', result: '0', played: true, kind: 'played' };
    p2.rounds[2] = { opp: 3, color: 'b', result: '=', played: true, kind: 'played' };
    p3.rounds[2] = { opp: 2, color: 'w', result: '=', played: true, kind: 'played' };

    p1.score = 3.0;
    p2.score = 1.5;
    p3.score = 1.0;
    p4.score = 0.5;

    const players = [p1, p2, p3, p4];
    calculateAllTieBreaks(players, 3, false);

    // P1 opponents: P2 (1.5), P3 (1.0), P4 (0.5). BH = 1.5 + 1.0 + 0.5 = 3.0.
    // SB = 1.5*1 + 1.0*1 + 0.5*1 = 3.0.
    assert(p1.buchholz === 3.0, 'CASE A: P1 Buchholz is 3.0', `got ${p1.buchholz}`);
    assert(p1.sonneborn === 3.0, 'CASE A: P1 Sonneborn is 3.0', `got ${p1.sonneborn}`);
    // Cut-1 cuts lowest opponent score (P4 with 0.5): BH-C1 = 3.0 - 0.5 = 2.5.
    assert(p1.buchholzCut1 === 2.5, 'CASE A: P1 BH-C1 is 2.5', `got ${p1.buchholzCut1}`);
  }

  // -------------------------------------------------------------
  // CASE B: 7-round PAB (Pairing Allocated Bye)
  // -------------------------------------------------------------
  console.log('\n--- CASE B: 7-round PAB ---');
  {
    const p1 = createMockPlayer(1, 'PAB Player', 7);
    p1.score = 5.0;
    // R1 is PAB (1.0 point awarded)
    p1.rounds[0] = { opp: 0, color: '-', result: 'U', played: false, kind: 'pairing-bye', points: 1.0 };
    
    // Other 6 rounds are played against opponents with scores:
    const dummyScore = getDummyOpponentScore(p1, 0, 7, undefined, 0.5);
    // Expected dummy = min(5.0, 0.5 * 7) = 3.5
    assert(dummyScore === 3.5, 'CASE B: PAB dummy score is min(5.0, 3.5) = 3.5', `got ${dummyScore}`);

    const bhContrib = getBuchholzContribution(p1, 0, 7, undefined, 0.5);
    assert(bhContrib === 3.5, 'CASE B: PAB BH contribution is 3.5', `got ${bhContrib}`);

    const sbContrib = getSonnebornBergerContribution(p1, 0, 7, undefined, 0.5);
    assert(sbContrib === 3.5, 'CASE B: PAB SB contribution is 3.5 * 1.0 = 3.5', `got ${sbContrib}`);

    const cat = getUnplayedRoundCategory2026(p1, 0, 7);
    assert(cat === 1, 'CASE B: PAB category is 1 (Article 16.2.1)', `got ${cat}`);
  }

  // -------------------------------------------------------------
  // CASE C: 7-round half-point bye
  // -------------------------------------------------------------
  console.log('\n--- CASE C: 7-round Half-Point Bye ---');
  {
    const p1 = createMockPlayer(1, 'Half-Bye Player', 7);
    p1.score = 5.0;
    p1.rounds[0] = { opp: 0, color: '-', result: 'H', played: false, kind: 'half-bye', points: 0.5 };

    const dummyScore = getDummyOpponentScore(p1, 0, 7, undefined, 0.5);
    assert(dummyScore === 3.5, 'CASE C: Half-bye dummy score is min(5.0, 3.5) = 3.5', `got ${dummyScore}`);

    const bhContrib = getBuchholzContribution(p1, 0, 7, undefined, 0.5);
    assert(bhContrib === 3.5, 'CASE C: Half-bye BH contribution is 3.5', `got ${bhContrib}`);

    const sbContrib = getSonnebornBergerContribution(p1, 0, 7, undefined, 0.5);
    assert(sbContrib === 1.75, 'CASE C: Half-bye SB contribution is 3.5 * 0.5 = 1.75', `got ${sbContrib}`);
  }

  // -------------------------------------------------------------
  // CASE D: Zero-point bye
  // -------------------------------------------------------------
  console.log('\n--- CASE D: Zero-Point Bye ---');
  {
    const p1 = createMockPlayer(1, 'Zero-Bye Player', 7);
    p1.score = 4.0;
    p1.rounds[0] = { opp: 0, color: '-', result: 'Z', played: false, kind: 'zero-bye', points: 0.0 };

    const dummyScore = getDummyOpponentScore(p1, 0, 7, undefined, 0.5);
    assert(dummyScore === 3.5, 'CASE D: Zero-bye dummy score is min(4.0, 3.5) = 3.5', `got ${dummyScore}`);

    const bhContrib = getBuchholzContribution(p1, 0, 7, undefined, 0.5);
    assert(bhContrib === 3.5, 'CASE D: Zero-bye BH contribution is 3.5', `got ${bhContrib}`);

    const sbContrib = getSonnebornBergerContribution(p1, 0, 7, undefined, 0.5);
    assert(sbContrib === 0, 'CASE D: Zero-bye SB contribution is 3.5 * 0 = 0', `got ${sbContrib}`);
  }

  // -------------------------------------------------------------
  // CASE E: Player score below cap
  // -------------------------------------------------------------
  console.log('\n--- CASE E: Player Score Below Cap ---');
  {
    const p1 = createMockPlayer(1, 'Low Score Player', 7);
    p1.score = 2.5;
    p1.rounds[0] = { opp: 0, color: '-', result: 'U', played: false, kind: 'pairing-bye', points: 1.0 };

    const dummyScore = getDummyOpponentScore(p1, 0, 7, undefined, 0.5);
    assert(dummyScore === 2.5, 'CASE E: Dummy score is min(2.5, 3.5) = 2.5', `got ${dummyScore}`);

    const bhContrib = getBuchholzContribution(p1, 0, 7, undefined, 0.5);
    assert(bhContrib === 2.5, 'CASE E: BH contribution is 2.5', `got ${bhContrib}`);

    const sbContrib = getSonnebornBergerContribution(p1, 0, 7, undefined, 0.5);
    assert(sbContrib === 2.5, 'CASE E: SB contribution is 2.5 * 1.0 = 2.5', `got ${sbContrib}`);
  }

  // -------------------------------------------------------------
  // CASE F: Forfeit Win (Article 16.4.1)
  // -------------------------------------------------------------
  console.log('\n--- CASE F: Forfeit Win ---');
  {
    const p1 = createMockPlayer(1, 'Forfeit Winner', 7);
    p1.score = 5.0;
    p1.rounds[0] = { opp: 2, color: 'w', result: '+', played: false, kind: 'forfeit', points: 1.0 };
    const scheduledOpponentAdjustedScore = 3.0;

    const cat = getUnplayedRoundCategory2026(p1, 0, 7);
    assert(cat === 2, 'CASE F: Forfeit win is category 2 (Article 16.2.2)', `got ${cat}`);

    const dummyScore = getDummyOpponentScore(p1, 0, 7, scheduledOpponentAdjustedScore, 0.5);
    assert(dummyScore === 3.0, 'CASE F: Forfeit win dummy is min(5.0, 3.0) = 3.0', `got ${dummyScore}`);

    const bhContrib = getBuchholzContribution(p1, 0, 7, scheduledOpponentAdjustedScore, 0.5);
    assert(bhContrib === 3.0, 'CASE F: BH contribution is 3.0', `got ${bhContrib}`);

    const sbContrib = getSonnebornBergerContribution(p1, 0, 7, scheduledOpponentAdjustedScore, 0.5);
    assert(sbContrib === 3.0, 'CASE F: SB contribution is 3.0 * 1.0 = 3.0', `got ${sbContrib}`);
  }

  // -------------------------------------------------------------
  // CASE G: Forfeit Loss (Article 16.4.1)
  // -------------------------------------------------------------
  console.log('\n--- CASE G: Forfeit Loss ---');
  {
    const p1 = createMockPlayer(1, 'Forfeit Loser', 7);
    p1.score = 4.0;
    p1.rounds[0] = { opp: 2, color: 'w', result: '-', played: false, kind: 'forfeit', points: 0.0 };
    const scheduledOpponentAdjustedScore = 4.5;

    const cat = getUnplayedRoundCategory2026(p1, 0, 7);
    assert(cat === 4, 'CASE G: Forfeit loss is category 4 (Article 16.2.4)', `got ${cat}`);

    const dummyScore = getDummyOpponentScore(p1, 0, 7, scheduledOpponentAdjustedScore, 0.5);
    assert(dummyScore === 4.0, 'CASE G: Forfeit loss dummy is min(4.0, 4.5) = 4.0', `got ${dummyScore}`);

    const bhContrib = getBuchholzContribution(p1, 0, 7, scheduledOpponentAdjustedScore, 0.5);
    assert(bhContrib === 4.0, 'CASE G: BH contribution is 4.0', `got ${bhContrib}`);

    const sbContrib = getSonnebornBergerContribution(p1, 0, 7, scheduledOpponentAdjustedScore, 0.5);
    assert(sbContrib === 0.0, 'CASE G: SB contribution is 4.0 * 0 = 0', `got ${sbContrib}`);
  }

  // -------------------------------------------------------------
  // CASE H: Article 16.2.5 (Requested bye in final round -> evaluated as DRAW for opponents)
  // -------------------------------------------------------------
  console.log('\n--- CASE H: Article 16.2.5 Adjusted Score Evaluation ---');
  {
    const p1 = createMockPlayer(1, 'Player P', 5);
    // 4 played rounds: win, win, win, win (4.0 points)
    p1.rounds[0] = { opp: 10, color: 'w', result: '1', played: true, kind: 'played' };
    p1.rounds[1] = { opp: 11, color: 'b', result: '1', played: true, kind: 'played' };
    p1.rounds[2] = { opp: 12, color: 'w', result: '1', played: true, kind: 'played' };
    p1.rounds[3] = { opp: 13, color: 'b', result: '1', played: true, kind: 'played' };
    // Round 5 (final round): zero-point requested bye (awarded 0.0)
    p1.rounds[4] = { opp: 0, color: '-', result: 'Z', played: false, kind: 'zero-bye', points: 0.0 };
    p1.score = 4.0;

    const cat = getUnplayedRoundCategory2026(p1, 4, 5);
    assert(cat === 5, 'CASE H: Zero-bye in final round is category 5 (Article 16.2.5)', `got ${cat}`);

    const adjustedScore = getAdjustedScoreForOpponents(p1, 5, 0.5);
    // For opponents: round 5 is evaluated as DRAW (0.5), so adjusted score = 4.0 - 0.0 + 0.5 = 4.5.
    assert(adjustedScore === 4.5, 'CASE H: Adjusted score for opponents evaluates round 5 as DRAW (4.5 not 4.0)', `got ${adjustedScore}`);
    assert(p1.score === 4.0, 'CASE H: Real tournament score is UNCHANGED at 4.0', `got ${p1.score}`);
  }

  // -------------------------------------------------------------
  // CASE I: Withdrawal (Rounds after withdrawal treated as zero-point byes)
  // -------------------------------------------------------------
  console.log('\n--- CASE I: Withdrawal ---');
  {
    const p1 = createMockPlayer(1, 'Withdrawn Player', 7);
    // Played rounds 1-3 (score = 2.0)
    p1.rounds[0] = { opp: 10, color: 'w', result: '1', played: true, kind: 'played' };
    p1.rounds[1] = { opp: 11, color: 'b', result: '1', played: true, kind: 'played' };
    p1.rounds[2] = { opp: 12, color: 'w', result: '0', played: true, kind: 'played' };
    // Withdraws: rounds 4, 5, 6, 7 are unplayed
    p1.rounds[3] = { opp: 0, color: '-', result: 'Z', played: false, kind: 'unplayed', points: 0.0 };
    p1.rounds[4] = { opp: 0, color: '-', result: 'Z', played: false, kind: 'unplayed', points: 0.0 };
    p1.rounds[5] = { opp: 0, color: '-', result: 'Z', played: false, kind: 'unplayed', points: 0.0 };
    p1.rounds[6] = { opp: 0, color: '-', result: 'Z', played: false, kind: 'unplayed', points: 0.0 };
    p1.score = 2.0;

    // All rounds 4, 5, 6, 7 are followed only by VURs (or end), so all are Category 5 (16.2.5)
    const cat4 = getUnplayedRoundCategory2026(p1, 3, 7);
    const cat7 = getUnplayedRoundCategory2026(p1, 6, 7);
    assert(cat4 === 5, 'CASE I: Round 4 after withdrawal is category 5 (16.2.5)', `got ${cat4}`);
    assert(cat7 === 5, 'CASE I: Round 7 after withdrawal is category 5 (16.2.5)', `got ${cat7}`);

    // Adjusted score for opponents: each of rounds 4, 5, 6, 7 becomes a DRAW (+0.5 each = +2.0)
    // Adjusted score = 2.0 + 4 * 0.5 = 4.0
    const adj = getAdjustedScoreForOpponents(p1, 7, 0.5);
    assert(adj === 4.0, 'CASE I: Adjusted score for opponents evaluates all 4 withdrawn rounds as draws (4.0)', `got ${adj}`);

    // Now test a player who took a requested bye in R2, but played R3 (later non-VUR)
    const p2 = createMockPlayer(2, 'Intermittent Bye Player', 5);
    p2.rounds[0] = { opp: 10, color: 'w', result: '1', played: true, kind: 'played' };
    p2.rounds[1] = { opp: 0, color: '-', result: 'H', played: false, kind: 'half-bye', points: 0.5 };
    p2.rounds[2] = { opp: 11, color: 'b', result: '1', played: true, kind: 'played' }; // Played round!
    p2.rounds[3] = { opp: 12, color: 'w', result: '0', played: true, kind: 'played' };
    p2.rounds[4] = { opp: 0, color: '-', result: 'H', played: false, kind: 'half-bye', points: 0.5 };

    const catR2 = getUnplayedRoundCategory2026(p2, 1, 5);
    const catR5 = getUnplayedRoundCategory2026(p2, 4, 5);
    assert(catR2 === 3, 'CASE I: Requested bye in R2 followed by played R3 is Category 3 (16.2.3)', `got ${catR2}`);
    assert(catR5 === 5, 'CASE I: Requested bye in final round R5 is Category 5 (16.2.5)', `got ${catR5}`);
  }

  // -------------------------------------------------------------
  // CASE J: BH-C1 with VUR (Article 16.5.1 Exception)
  // -------------------------------------------------------------
  console.log('\n--- CASE J: Buchholz Cut-1 with VUR (Article 16.5.1) ---');
  {
    // Construct exactly as specified in Section 10 CASE J:
    // normal mathematical lowest BH contribution = 2.0
    // VUR contribution = 3.0
    // another contribution = 4.0
    const elements = [
      { round: 1, kind: 'played', vur: false, bh: 2.0, sb: 2.0, sbSignificanceScore: 2.0, points: 1 },
      { round: 2, kind: 'half-bye', vur: true, bh: 3.0, sb: 1.5, sbSignificanceScore: 3.0, points: 0.5 },
      { round: 3, kind: 'played', vur: false, bh: 4.0, sb: 4.0, sbSignificanceScore: 4.0, points: 1 }
    ];

    const cutIdx = chooseBuchholzLowCutIndex2026(elements);
    // Index 1 (the VUR with bh 3.0) must be chosen, NOT index 0 (played game with 2.0)
    assert(cutIdx === 1, 'CASE J: chooseBuchholzLowCutIndex2026 cuts VUR (index 1, bh 3.0), not lowest (index 0, bh 2.0)', `got ${cutIdx}`);

    const bhC1 = buchholzVariant2026(elements, 'C1');
    // Total un-cut BH = 2.0 + 3.0 + 4.0 = 9.0.
    // Cut value is 3.0 (the VUR contribution).
    // Remaining BH = 2.0 + 4.0 = 6.0!
    assert(bhC1 === 6.0, 'CASE J: Buchholz Cut-1 with VUR exception is exactly 6.0 (2.0 + 4.0)', `got ${bhC1}`);
  }

  // -------------------------------------------------------------
  // CASE K: SB-C1 with VUR (Article 16.5.1 Exception)
  // -------------------------------------------------------------
  console.log('\n--- CASE K: Sonneborn-Berger Cut-1 with VUR (Article 16.5.1) ---');
  {
    // Case K.1: VUR contribution A > normal least significant B -> Cut VUR
    // Round 1: Played, opponent score 2.0, result 1.0 -> SB = 2.0
    // Round 2: Played, opponent score 4.0, result 1.0 -> SB = 4.0
    // Round 3: VUR (half-bye), dummy score 5.0, result 0.5 -> SB = 2.5
    // Normal least significant B: opponent with lowest score is Round 1 (2.0), B.sb = 2.0.
    // Lowest VUR contribution A: Round 3 (2.5).
    // max(A, B) = max(2.5, 2.0) = 2.5 (Round 3). Cut Round 3!
    const elements1 = [
      { round: 1, kind: 'played', vur: false, bh: 2.0, sb: 2.0, sbSignificanceScore: 2.0, points: 1 },
      { round: 2, kind: 'played', vur: false, bh: 4.0, sb: 4.0, sbSignificanceScore: 4.0, points: 1 },
      { round: 3, kind: 'half-bye', vur: true, bh: 5.0, sb: 2.5, sbSignificanceScore: 5.0, points: 0.5 }
    ];
    const cutIdx1 = chooseSBLowCutIndex2026(elements1);
    assert(cutIdx1 === 2, 'CASE K.1: SB-C1 cuts VUR when VUR contribution 2.5 > least significant 2.0', `got ${cutIdx1}`);

    // Case K.2: Normal least significant B > VUR contribution A -> Cut B
    // Round 1: Played, opponent score 1.5, result 1.0 -> SB = 1.5
    // Round 2: Played, opponent score 4.0, result 1.0 -> SB = 4.0
    // Round 3: VUR (half-bye), dummy score 2.0, result 0.5 -> SB = 1.0
    // Normal least significant B: Round 1 (opponent score 1.5), B.sb = 1.5.
    // VUR contribution A: Round 3 (1.0).
    // max(A, B) = max(1.0, 1.5) = 1.5 (Round 1). Cut Round 1!
    const elements2 = [
      { round: 1, kind: 'played', vur: false, bh: 1.5, sb: 1.5, sbSignificanceScore: 1.5, points: 1 },
      { round: 2, kind: 'played', vur: false, bh: 4.0, sb: 4.0, sbSignificanceScore: 4.0, points: 1 },
      { round: 3, kind: 'half-bye', vur: true, bh: 2.0, sb: 1.0, sbSignificanceScore: 2.0, points: 0.5 }
    ];
    const cutIdx2 = chooseSBLowCutIndex2026(elements2);
    assert(cutIdx2 === 0, 'CASE K.2: SB-C1 cuts Round 1 when least significant 1.5 > VUR contribution 1.0', `got ${cutIdx2}`);
  }

  // -------------------------------------------------------------
  // CASE L: Cut-2 (Article 16.5.2 Reapplication)
  // -------------------------------------------------------------
  console.log('\n--- CASE L: Cut-2 Multiple Cut Reapplication ---');
  {
    // 4 elements:
    // R1: played, bh = 2.0
    // R2: VUR 1, bh = 3.0
    // R3: VUR 2, bh = 3.5
    // R4: played, bh = 5.0
    const elements = [
      { round: 1, kind: 'played', vur: false, bh: 2.0, sb: 2.0, sbSignificanceScore: 2.0, points: 1 },
      { round: 2, kind: 'half-bye', vur: true, bh: 3.0, sb: 1.5, sbSignificanceScore: 3.0, points: 0.5 },
      { round: 3, kind: 'half-bye', vur: true, bh: 3.5, sb: 1.75, sbSignificanceScore: 3.5, points: 0.5 },
      { round: 4, kind: 'played', vur: false, bh: 5.0, sb: 5.0, sbSignificanceScore: 5.0, points: 1 }
    ];

    // First cut: cuts VUR 1 (bh 3.0) because VUR exists and min(VUR) = 3.0 >= min(all)=2.0.
    // Remaining elements: R1 (2.0), R3 (VUR, 3.5), R4 (5.0).
    // Second cut (Article 16.5.2 reapplication): cuts remaining VUR R3 (bh 3.5) because VUR still exists and 3.5 >= 2.0.
    // Remaining: R1 (2.0) and R4 (5.0). Sum = 7.0!
    const bhC2 = buchholzVariant2026(elements, 'C2');
    assert(bhC2 === 7.0, 'CASE L: Buchholz Cut-2 reapplies Article 16.5.1 and yields 7.0 (2.0 + 5.0)', `got ${bhC2}`);
  }

  // -------------------------------------------------------------
  // Full-point bye (Category 16.2.1)
  // -------------------------------------------------------------
  console.log('\n--- Full-Point Bye (Category 16.2.1) ---');
  {
    const p1 = createMockPlayer(1, 'Full Bye Player', 7);
    p1.score = 5.0;
    p1.rounds[0] = { opp: 0, color: '-', result: 'F', played: false, kind: 'full-bye', points: 1.0 };
    const cat = getUnplayedRoundCategory2026(p1, 0, 7);
    assert(cat === 1, 'Full-point bye is category 1 (Article 16.2.1)', `got ${cat}`);

    const dummy = getDummyOpponentScore(p1, 0, 7, undefined, 0.5);
    assert(dummy === 3.5, 'Full-point bye dummy score is min(5.0, 3.5) = 3.5', `got ${dummy}`);
  }

  // -------------------------------------------------------------
  // Configurable Draw Points (Section 6 & 13)
  // -------------------------------------------------------------
  console.log('\n--- Custom Tournament Draw Points ---');
  {
    // Tournament with 3-1-0 scoring (drawPoints = 1.0, 7 rounds)
    const p1 = createMockPlayer(1, 'Custom Points Player', 7);
    p1.score = 12.0;
    p1.rounds[0] = { opp: 0, color: '-', result: 'U', played: false, kind: 'pairing-bye', points: 3.0 };

    const dummyScore = getDummyOpponentScore(p1, 0, 7, undefined, 1.0);
    // min(12.0, 1.0 * 7 = 7.0) = 7.0
    assert(dummyScore === 7.0, 'Custom draw points (1.0) caps dummy score at min(12.0, 7.0) = 7.0', `got ${dummyScore}`);
  }

  console.log(`\n=== TIE-BREAK TEST SUMMARY: ${passedTests}/${totalTests} PASSED ===\n`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

if (import.meta.url.endsWith(process.argv[1])) {
  runAllTieBreakTests().catch(err => {
    console.error('Test runner failed:', err);
    process.exit(1);
  });
}
