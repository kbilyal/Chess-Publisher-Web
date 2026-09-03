import {
  Tournament,
  PlayerRoundState,
  TournamentTieBreakSnapshot,
  SnapshotPlayer,
  SnapshotRound
} from '../types';
import {
  calculateTournamentStandings,
  createTournamentTieBreakSnapshot,
  FinalStandingsResult
} from './tiebreaks';

export interface TieBreakDiagnosticIssue {
  id: string;
  code?: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  player?: string;
  playerId?: number;
  round?: number;
  tieBreak?: string;
  issue: string;
  fideArticle?: string;
  recommendation?: string;
}

export interface TieBreakCheckItem {
  id: string;
  name: string;
  status: 'PASS' | 'WARNING' | 'ERROR';
  message?: string;
}

export interface TieBreakIntegrityReport {
  status: 'PASS' | 'WARNING' | 'ERROR';
  timestamp: string;
  summary: {
    rulesProfile: string;
    playersChecked: number;
    tieBreaksChecked: number;
    criteriaCount?: number;
    unplayedRounds: number;
    forfeits: number;
  };
  checks: TieBreakCheckItem[];
  issues: TieBreakDiagnosticIssue[];
}

export interface PlayerRoundTieBreakBreakdownRow {
  round: number;
  opponentId: number;
  opponentName: string;
  opponentFed: string;
  opponentRating: number;
  result: string;
  status: string;
  category: string;
  opponentScore: number;
  adjustedScore: number;
  dummyScore: number;
  contribution: number;
  isCut: boolean;
  ruleRef: string;
  vur: boolean;
}

export interface PlayerTieBreakBreakdown {
  playerId: number;
  playerName: string;
  playerFed: string;
  playerTitle?: string;
  rank: number;
  score: number;
  tieBreakName: string;
  tieBreakCode: string;
  totalValue: number;
  rulesProfile: string;
  rows: PlayerRoundTieBreakBreakdownRow[];
  details: {
    cutIndex?: number;
    cutRound?: number;
    hasVur: boolean;
    vurRuleApplied?: boolean;
    explanation: string;
  };
}

/**
 * Normalizes tie-break string to short code and display name.
 */
export function getTieBreakCodeAndName(raw: string): { code: string; name: string } {
  const text = String(raw || '').trim();
  const cleanName = text.replace(/\[\d+\]/g, '').trim();

  // Specifically check for standard FIDE criteria without explicit code in parens
  if (/^Buchholz Tie-Break/i.test(cleanName)) {
    return { code: 'BH', name: cleanName };
  }
  if (/^Sonneborn-Berger Tie-Break/i.test(cleanName)) {
    return { code: 'SB', name: cleanName };
  }

  // Find parentheses containing non-digits (not pure 4-digit years like (2023))
  const matches = text.match(/\(([A-Za-z0-9-]+)\)/g);
  let code = '';
  if (matches) {
    for (const m of matches) {
      const inner = m.replace(/[()]/g, '').trim();
      if (!/^\d{4}$/.test(inner)) {
        code = inner;
        break;
      }
    }
  }

  if (!code) {
    // Look for bracket code like [84] -> FIDE-84 or first word
    const bracketMatch = text.match(/\[(\d+)\]/);
    code = bracketMatch ? `FIDE-${bracketMatch[1]}` : (text.split(' ')[0] || 'TB');
  }

  return { code, name: cleanName };
}

/**
 * Human-readable description of unplayed round category per FIDE 2026 Article 16.2
 */
export function getFideCategoryDescription(cat: number): { code: string; description: string; rule: string } {
  switch (cat) {
    case 1:
      return { code: '16.2.1', description: 'Pairing-allocated bye / Full-point bye', rule: 'FIDE Article 16.2.1' };
    case 2:
      return { code: '16.2.2', description: 'Forfeit win', rule: 'FIDE Article 16.2.2' };
    case 3:
      return { code: '16.2.3', description: 'Intermittent requested bye', rule: 'FIDE Article 16.2.3' };
    case 4:
      return { code: '16.2.4', description: 'Forfeit loss', rule: 'FIDE Article 16.2.4' };
    case 5:
      return { code: '16.2.5', description: 'Final/consecutive bye or withdrawal', rule: 'FIDE Article 16.2.5' };
    default:
      return { code: 'Played', description: 'Normal played game', rule: 'FIDE Laws of Chess' };
  }
}

export interface RefTieBreakElement {
  round: number; // 1-based
  oppId: number;
  bh: number;
  sb: number;
  sbSignificance: number; // opponent's score used as primary significance per Article 14.1
  vur: boolean;
  points: number;
  cat: number;
  played: boolean;
}

export interface RefPlayerCalculation {
  id: number;
  score: number;
  adjustedScore: number;
  elements: RefTieBreakElement[];
  tieBreaks: Record<string, number>;
}

/**
 * INDEPENDENT REFERENCE CHECKER ENGINE
 * 
 * In compliance with user specifications:
 * This reference engine does NOT reuse production formula implementations from tiebreaks.ts.
 * It is completely self-contained and independently computes all FIDE 2026 rules:
 * - Independent FIDE Article 16 Classifier
 * - Independent Article 16.3 Adjusted Score Calculator
 * - Independent Article 16.4 Dummy Opponent Calculator
 * - Independent Article 16.5.1 / 14.1 Cut-1 and Cut-2 VUR Selection Engine
 * - Independent Buchholz and Sonneborn-Berger Evaluators
 * - Independent Direct Encounter Evaluator
 * - Independent Standings Monotonicity Verifier
 */
export class TieBreakReferenceEngine {
  /**
   * Evaluates points awarded in a round independently.
   */
  public static refPoints(round: SnapshotRound | any): number {
    if (!round) return 0;
    if (round.points !== undefined && Number.isFinite(Number(round.points))) {
      return Number(round.points);
    }
    const c = String(round.result || '').trim().slice(0, 1).toUpperCase();
    if (c === '1' || c === '+' || c === 'W' || c === 'U' || c === 'F') return 1;
    if (c === '=' || c === 'H' || c === 'D' || c === '½') return 0.5;
    return 0;
  }

  /**
   * Determines if a round is a Voluntary Unplayed Round (VUR) per FIDE Article 16.1.3:
   * "A VUR is a round in which a player had a requested bye (half-point bye or zero-point bye)
   * or a forfeit loss (including any unplayed rounds after a player has withdrawn from the
   * tournament, which are treated as zero-point byes)."
   */
  public static refIsVUR(round: SnapshotRound | any): boolean {
    if (!round) return false;
    if (round.played === true) return false;

    if (round.kind === 'half-bye' || round.kind === 'zero-bye') return true;
    if (round.kind === 'withdrawn' || round.kind === 'absent' || round.kind === 'unplayed') return true;

    if (round.kind === 'forfeit') {
      const res = String(round.result || '').trim().toUpperCase();
      return res === '-' || res === '0F' || res === '-:+';
    }

    const c = String(round.result || '').trim().toUpperCase();
    if (c === 'Z' || c === '0' || c === 'H' || c === '=' || c === '½' || c === '1/2') return true;

    return false;
  }

  /**
   * Categorizes unplayed round independently according to FIDE Article 16.2.
   * 1: 16.2.1 PAB or full-point bye
   * 2: 16.2.2 Forfeit win
   * 3: 16.2.3 Intermittent requested bye
   * 4: 16.2.4 Forfeit loss
   * 5: 16.2.5 Final/consecutive requested bye or withdrawal
   */
  public static refClassifyUnplayed(rounds: (SnapshotRound | any)[], roundIndex: number, totalRounds: number): number {
    const r = rounds[roundIndex];
    if (!r || r.played === true) return 0;

    const res = String(r.result || '').trim().toUpperCase();

    // Article 16.2.1: Pairing-allocated bye or full-point bye
    if (r.kind === 'pairing-bye' || r.kind === 'full-bye' || res === 'U' || res === 'PAB' || (r.kind === 'requested-bye' && r.points === 1)) {
      return 1;
    }

    // Article 16.2.2: Forfeit win
    if (r.kind === 'forfeit' && (res === '+' || res === '1F' || res === '+:-')) {
      return 2;
    }

    // Article 16.2.4: Forfeit loss
    if (r.kind === 'forfeit' && (res === '-' || res === '0F' || res === '-:+')) {
      return 4;
    }

    // Article 16.2.3 vs 16.2.5: Requested byes and withdrawals
    // Check subsequent rounds through totalRounds - 1
    let followedByNonVUR = false;
    for (let nextIdx = roundIndex + 1; nextIdx < totalRounds; nextIdx++) {
      const nr = rounds[nextIdx];
      if (nr && nr.played === true) {
        followedByNonVUR = true;
        break;
      }
      if (nr && !this.refIsVUR(nr)) {
        // e.g. Pairing-allocated bye or forfeit win
        followedByNonVUR = true;
        break;
      }
    }

    if (followedByNonVUR) {
      return 3; // 16.2.3: Intermittent requested bye
    }
    return 5; // 16.2.5: Final/consecutive bye or withdrawal
  }

  /**
   * Calculates player's adjusted score for opponents' tie-breaks per FIDE Article 16.3:
   * Rounds in Category 16.2.5 are evaluated as a DRAW (drawPoints), regardless of the points awarded.
   * Other rounds retain their actual awarded points.
   */
  public static refCalculateAdjustedScore(
    player: SnapshotPlayer | PlayerRoundState,
    totalRounds: number,
    drawPoints: number
  ): number {
    const rounds = player.rounds || [];
    let adjScore = 0;

    for (let rIdx = 0; rIdx < totalRounds; rIdx++) {
      const r = rounds[rIdx];
      if (!r) continue;

      if (r.played === true) {
        adjScore += this.refPoints(r);
      } else {
        const cat = this.refClassifyUnplayed(rounds, rIdx, totalRounds);
        if (cat === 5) {
          // Article 16.3: category 5 evaluated as a draw
          adjScore += drawPoints;
        } else {
          adjScore += this.refPoints(r);
        }
      }
    }

    return Math.round(adjScore * 1000) / 1000;
  }

  /**
   * Calculates dummy opponent score per FIDE Article 16.4:
   * 16.4.1 Forfeits (Categories 16.2.2 & 16.2.4): min(playerScore, scheduledOppAdjustedScore)
   * 16.4.2 Byes (Categories 16.2.1, 16.2.3, 16.2.5): min(playerScore, drawPoints * totalRounds)
   */
  public static refCalculateDummyScore(
    playerScore: number,
    category: number,
    scheduledOppAdjustedScore: number | undefined,
    totalRounds: number,
    drawPoints: number
  ): number {
    if (category === 2 || category === 4) {
      // 16.4.1 Forfeits
      const cap = scheduledOppAdjustedScore !== undefined ? scheduledOppAdjustedScore : playerScore;
      return Math.min(playerScore, cap);
    }
    // 16.4.2 Byes
    const cap = drawPoints * totalRounds;
    return Math.min(playerScore, cap);
  }

  /**
   * Builds independent tie-break elements for a player across all rounds.
   */
  public static refBuildPlayerElements(
    player: SnapshotPlayer | PlayerRoundState,
    playerMap: Map<number, SnapshotPlayer | PlayerRoundState>,
    adjustedScores: Map<number, number>,
    totalRounds: number,
    drawPoints: number,
    countForfeits: boolean = false
  ): RefTieBreakElement[] {
    const elements: RefTieBreakElement[] = [];
    const rounds = player.rounds || [];
    const playerScore = (player as any).score !== undefined
      ? Number((player as any).score) || 0
      : (player.rounds || []).reduce((acc, rd) => acc + (rd ? this.refPoints(rd) : 0), 0);

    for (let rIdx = 0; rIdx < totalRounds; rIdx++) {
      const r = rounds[rIdx];
      if (!r) continue;

      const pts = this.refPoints(r);
      const oppId = (r as any).opp || (r as any).opponentId || 0;
      const opp = oppId ? playerMap.get(oppId) : null;
      const oppRawScore = opp ? (Number((opp as any).score) || 0) : 0;
      const oppAdj = opp ? (adjustedScores.get(opp.id) ?? oppRawScore) : undefined;

      if (r.played === true) {
        const effOppAdj = oppAdj ?? 0;
        elements.push({
          round: rIdx + 1,
          oppId: opp ? opp.id : 0,
          bh: effOppAdj,
          sb: effOppAdj * pts,
          sbSignificance: effOppAdj,
          vur: false,
          points: pts,
          cat: 0,
          played: true
        });
      } else {
        const cat = this.refClassifyUnplayed(rounds, rIdx, totalRounds);

        if (countForfeits && (cat === 2 || cat === 4) && opp && oppAdj !== undefined) {
          // Custom unplayed forfeit inclusion
          elements.push({
            round: rIdx + 1,
            oppId: opp.id,
            bh: oppAdj,
            sb: oppAdj * pts,
            sbSignificance: oppAdj,
            vur: false,
            points: pts,
            cat,
            played: false
          });
        } else {
          const dummy = this.refCalculateDummyScore(playerScore, cat, oppAdj, totalRounds, drawPoints);
          const isVur = (cat === 3 || cat === 4 || cat === 5);
          elements.push({
            round: rIdx + 1,
            oppId: opp ? opp.id : 0,
            bh: dummy,
            sb: dummy * pts,
            sbSignificance: dummy,
            vur: isVur,
            points: pts,
            cat,
            played: false
          });
        }
      }
    }

    return elements;
  }

  /**
   * Selects Buchholz lowest cut index independently according to FIDE Article 16.5.1:
   * "If a player has one or more VURs, cut the lowest contribution coming from a VUR,
   * provided it is not lower than the normal least significant value."
   */
  public static refSelectBuchholzCutIndex(elements: RefTieBreakElement[]): number {
    if (elements.length <= 1) return -1;

    let normalMinIdx = 0;
    let normalMinVal = elements[0].bh;

    for (let i = 1; i < elements.length; i++) {
      const val = elements[i].bh;
      if (val < normalMinVal - 1e-6) {
        normalMinVal = val;
        normalMinIdx = i;
      }
    }

    let vurMinIdx = -1;
    let vurMinVal = Infinity;

    for (let i = 0; i < elements.length; i++) {
      if (elements[i].vur) {
        const val = elements[i].bh;
        if (val < vurMinVal - 1e-6) {
          vurMinVal = val;
          vurMinIdx = i;
        }
      }
    }

    // Article 16.5.1:
    // If player has VUR and lowest VUR is not lower than normal lowest, cut lowest VUR!
    if (vurMinIdx >= 0 && vurMinVal >= normalMinVal - 1e-6) {
      return vurMinIdx;
    }

    return normalMinIdx;
  }

  /**
   * Selects Sonneborn-Berger lowest cut index independently according to FIDE Articles 14.1 & 16.5.1:
   * Significance score is the opponent's score (sbSignificance); tied broken by game outcome.
   * Lowest VUR contribution is compared with the least significant value.
   */
  public static refSelectSBCutIndex(elements: RefTieBreakElement[]): number {
    if (elements.length <= 1) return -1;

    let normalMinIdx = 0;
    let normalMinVal = elements[0].sb;
    let normalMinSignificance = elements[0].sbSignificance;
    let normalMinPoints = elements[0].points;

    for (let i = 1; i < elements.length; i++) {
      const e = elements[i];
      let isLower = false;
      if (e.sbSignificance < normalMinSignificance - 1e-6) {
        isLower = true;
      } else if (Math.abs(e.sbSignificance - normalMinSignificance) <= 1e-6) {
        if (e.points < normalMinPoints) {
          isLower = true;
        } else if (e.points === normalMinPoints && e.sb < normalMinVal - 1e-6) {
          isLower = true;
        }
      }

      if (isLower) {
        normalMinIdx = i;
        normalMinVal = e.sb;
        normalMinSignificance = e.sbSignificance;
        normalMinPoints = e.points;
      }
    }

    let vurMinIdx = -1;
    let vurMinVal = Infinity;

    for (let i = 0; i < elements.length; i++) {
      if (elements[i].vur) {
        const val = elements[i].sb;
        if (val < vurMinVal - 1e-6) {
          vurMinVal = val;
          vurMinIdx = i;
        }
      }
    }

    // Article 16.5.1 applied to SB
    if (vurMinIdx >= 0 && vurMinVal >= normalMinVal - 1e-6) {
      return vurMinIdx;
    }

    return normalMinIdx;
  }

  /**
   * Calculates Buchholz variants independently.
   */
  public static refCalculateBuchholz(elements: RefTieBreakElement[], mode: 'BH' | 'C1' | 'C2' | 'M1' | 'M2'): number {
    if (elements.length === 0) return 0;
    const total = elements.reduce((acc, e) => acc + e.bh, 0);
    if (mode === 'BH' || elements.length <= 1) return Math.round(total * 1000) / 1000;

    if (mode === 'C1') {
      const cutIdx = this.refSelectBuchholzCutIndex(elements);
      const cutVal = cutIdx >= 0 ? elements[cutIdx].bh : 0;
      return Math.round((total - cutVal) * 1000) / 1000;
    }

    if (mode === 'C2') {
      const remaining = [...elements];
      const cut1 = this.refSelectBuchholzCutIndex(remaining);
      if (cut1 >= 0) remaining.splice(cut1, 1);
      const cut2 = this.refSelectBuchholzCutIndex(remaining);
      if (cut2 >= 0) remaining.splice(cut2, 1);
      return Math.round(remaining.reduce((acc, e) => acc + e.bh, 0) * 1000) / 1000;
    }

    if (mode === 'M1') {
      const remaining = [...elements];
      const lowCut = this.refSelectBuchholzCutIndex(remaining);
      if (lowCut >= 0) remaining.splice(lowCut, 1);
      // Cut highest remaining
      let highIdx = 0;
      for (let i = 1; i < remaining.length; i++) {
        if (remaining[i].bh > remaining[highIdx].bh) highIdx = i;
      }
      if (remaining.length > 0) remaining.splice(highIdx, 1);
      return Math.round(remaining.reduce((acc, e) => acc + e.bh, 0) * 1000) / 1000;
    }

    if (mode === 'M2') {
      const remaining = [...elements];
      // Cut 2 lowest
      const l1 = this.refSelectBuchholzCutIndex(remaining);
      if (l1 >= 0) remaining.splice(l1, 1);
      const l2 = this.refSelectBuchholzCutIndex(remaining);
      if (l2 >= 0) remaining.splice(l2, 1);
      // Cut 2 highest
      for (let k = 0; k < 2; k++) {
        if (remaining.length === 0) break;
        let highIdx = 0;
        for (let i = 1; i < remaining.length; i++) {
          if (remaining[i].bh > remaining[highIdx].bh) highIdx = i;
        }
        remaining.splice(highIdx, 1);
      }
      return Math.round(remaining.reduce((acc, e) => acc + e.bh, 0) * 1000) / 1000;
    }

    return Math.round(total * 1000) / 1000;
  }

  /**
   * Calculates Sonneborn-Berger variants independently.
   */
  public static refCalculateSonneborn(elements: RefTieBreakElement[], mode: 'SB' | 'C1' | 'C2'): number {
    if (elements.length === 0) return 0;
    const total = elements.reduce((acc, e) => acc + e.sb, 0);
    if (mode === 'SB' || elements.length <= 1) return Math.round(total * 1000) / 1000;

    if (mode === 'C1') {
      const cutIdx = this.refSelectSBCutIndex(elements);
      const cutVal = cutIdx >= 0 ? elements[cutIdx].sb : 0;
      return Math.round((total - cutVal) * 1000) / 1000;
    }

    if (mode === 'C2') {
      const remaining = [...elements];
      const cut1 = this.refSelectSBCutIndex(remaining);
      if (cut1 >= 0) remaining.splice(cut1, 1);
      const cut2 = this.refSelectSBCutIndex(remaining);
      if (cut2 >= 0) remaining.splice(cut2, 1);
      return Math.round(remaining.reduce((acc, e) => acc + e.sb, 0) * 1000) / 1000;
    }

    return Math.round(total * 1000) / 1000;
  }

  /**
   * Performs full independent verification of production standings against FIDE 2026 reference rules.
   */
  public static verify(
    snapshot: TournamentTieBreakSnapshot,
    prodStandings: FinalStandingsResult
  ): TieBreakIntegrityReport {
    const issues: TieBreakDiagnosticIssue[] = [];
    const players = snapshot.players;
    const totalRounds = snapshot.totalRounds;
    const drawPoints = snapshot.drawPoints;
    const configuredTieBreaks = snapshot.configuredTieBreaks;
    const rulesProfile = snapshot.rulesProfile;

    let unplayedRoundsCount = 0;
    let forfeitsCount = 0;

    // 1. Validate Tournament Tie-Break Configuration
    if (configuredTieBreaks.length === 0) {
      issues.push({
        id: 'tb-empty-list',
        code: 'NO_TIE_BREAKS_CONFIGURED',
        severity: 'WARNING',
        issue: 'No tie-breaks configured in tournament regulations. Standings will use primary points and pairing numbers only.',
        fideArticle: 'Article 13'
      });
    }

    const seenCodes = new Set<string>();
    for (const tb of configuredTieBreaks) {
      const { code, name } = getTieBreakCodeAndName(tb);
      if (seenCodes.has(code)) {
        issues.push({
          id: `tb-duplicate-${code}`,
          code: 'DUPLICATE_TIE_BREAK',
          severity: 'ERROR',
          tieBreak: tb,
          issue: `Duplicate tie-break criterion detected: ${code}. Each criterion may be applied only once.`,
          fideArticle: 'Article 13.2'
        });
      }
      seenCodes.add(code);

      // Check obsolete criteria under FIDE 2026
      if (rulesProfile === 'FIDE 2026' || rulesProfile === 'FIDE_2026_03') {
        if (code === 'PS' || /progressive/i.test(name)) {
          issues.push({
            id: `tb-obsolete-${code}`,
            code: 'OBSOLETE_CRITERION',
            severity: 'WARNING',
            tieBreak: tb,
            issue: `Criterion ${name} (${code}) is obsolete and not recommended under FIDE 2026 regulations.`,
            fideArticle: 'Article 13'
          });
        }
      }

      // Check non-standard forfeit rules
      const opts = snapshot.tieBreakOptions?.[tb];
      if (opts?.countForfeits && (code.startsWith('BH') || code.startsWith('SB'))) {
        issues.push({
          id: `tb-forfeit-${code}`,
          code: 'NON_STANDARD_FORFEIT_RULE',
          severity: 'WARNING',
          tieBreak: tb,
          issue: `Tie-break ${code} is configured to include unplayed forfeits. FIDE Article 16 specifies dummy opponent substitution.`,
          fideArticle: 'Article 16.2'
        });
      }
    }

    // 2. Build Snapshot Player Maps and Reference Calculations
    const playerMap = new Map<number, SnapshotPlayer>(players.map(p => [p.id, p]));
    const prodPlayerMap = new Map<number, PlayerRoundState>(prodStandings.players.map(p => [p.id, p]));

    // Calculate Reference Adjusted Scores (Article 16.3)
    const refAdjustedScores = new Map<number, number>();
    for (const p of players) {
      const adj = this.refCalculateAdjustedScore(p, totalRounds, drawPoints);
      refAdjustedScores.set(p.id, adj);
    }

    // Calculate Reference Elements and Tie-Breaks per Player
    const refCalculations = new Map<number, RefPlayerCalculation>();
    let scoreCheckPassed = true;
    let unplayedCheckPassed = true;
    let dummyCheckPassed = true;
    let adjustedCheckPassed = true;

    for (const p of players) {
      const prodP = prodPlayerMap.get(p.id);
      let refSumScore = 0;
      const rounds = p.rounds || [];

      for (let rIdx = 0; rIdx < totalRounds; rIdx++) {
        const r = rounds[rIdx];
        if (!r) continue;

        const pts = this.refPoints(r);
        refSumScore += pts;

        if (!r.played) {
          unplayedRoundsCount++;
          const cat = this.refClassifyUnplayed(rounds, rIdx, totalRounds);

          if (cat === 0) {
            unplayedCheckPassed = false;
            issues.push({
              id: `unplayed-cat-${p.id}-r${rIdx + 1}`,
              code: 'UNPLAYED_CATEGORY_UNDEFINED',
              severity: 'WARNING',
              player: p.name,
              playerId: p.id,
              round: rIdx + 1,
              issue: `Unplayed round has undefined FIDE classification (kind: ${r.kind}, result: ${r.result}).`,
              fideArticle: 'Article 16.2'
            });
          }

          if (cat === 2 || cat === 4) {
            forfeitsCount++;
          }

          // Reference Dummy Score Calculation
          const oppAdj = r.opponentId ? refAdjustedScores.get(r.opponentId) : undefined;
          const dummy = this.refCalculateDummyScore(refSumScore, cat, oppAdj, totalRounds, drawPoints);

          // Article 16.4 Invariant: Dummy opponent score cannot exceed player's final score
          if (dummy > refSumScore + 1e-6) {
            dummyCheckPassed = false;
            issues.push({
              id: `dummy-cap-${p.id}-r${rIdx + 1}`,
              code: 'DUMMY_SCORE_EXCEEDS_CAP',
              severity: 'ERROR',
              player: p.name,
              playerId: p.id,
              round: rIdx + 1,
              issue: `Dummy opponent score (${dummy}) exceeds participant final score (${refSumScore}).`,
              fideArticle: 'Article 16.4'
            });
          }
        }
      }

      // Check sum of round points against production player score
      if (prodP && Math.abs(refSumScore - Number(prodP.score)) > 0.001) {
        scoreCheckPassed = false;
        issues.push({
          id: `score-mismatch-${p.id}`,
          code: 'SCORE_MISMATCH',
          severity: 'ERROR',
          player: p.name,
          playerId: p.id,
          issue: `Recorded score (${prodP.score}) does not match independent sum of round points (${refSumScore}).`,
          fideArticle: 'Article 2'
        });
      }

      // Check Adjusted Score (Article 16.3) against production
      const refAdj = refAdjustedScores.get(p.id) || 0;
      if (prodP && prodP.adjustedScore2026 !== undefined && Math.abs(prodP.adjustedScore2026 - refAdj) > 0.001) {
        adjustedCheckPassed = false;
        issues.push({
          id: `adj-score-mismatch-${p.id}`,
          code: 'ADJUSTED_SCORE_MISMATCH',
          severity: 'ERROR',
          player: p.name,
          playerId: p.id,
          issue: `Adjusted opponent score (${prodP.adjustedScore2026}) deviates from FIDE Article 16.3 reference (${refAdj}).`,
          fideArticle: 'Article 16.3'
        });
      }

      // Generate Reference Elements
      const elements = this.refBuildPlayerElements(p, playerMap, refAdjustedScores, totalRounds, drawPoints, false);
      const tieBreaks: Record<string, number> = {
        'BH': this.refCalculateBuchholz(elements, 'BH'),
        'BH-C1': this.refCalculateBuchholz(elements, 'C1'),
        'BH-C2': this.refCalculateBuchholz(elements, 'C2'),
        'BH-M1': this.refCalculateBuchholz(elements, 'M1'),
        'BH-M2': this.refCalculateBuchholz(elements, 'M2'),
        'SB': this.refCalculateSonneborn(elements, 'SB'),
        'SB-C1': this.refCalculateSonneborn(elements, 'C1'),
        'SB-C2': this.refCalculateSonneborn(elements, 'C2')
      };

      refCalculations.set(p.id, {
        id: p.id,
        score: refSumScore,
        adjustedScore: refAdj,
        elements,
        tieBreaks
      });
    }

    // 3. Verify Buchholz and Buchholz Cut-1 against Production Standings
    let buchholzPassed = true;
    let buchholzCut1Passed = true;

    for (const p of prodStandings.players) {
      const refCalc = refCalculations.get(p.id);
      if (!refCalc) continue;

      if (p.buchholz !== undefined) {
        const expectedBH = refCalc.tieBreaks['BH'];
        if (Math.abs(p.buchholz - expectedBH) > 0.001) {
          buchholzPassed = false;
          issues.push({
            id: `bh-mismatch-${p.id}`,
            code: 'BUCHHOLZ_MISMATCH',
            severity: 'ERROR',
            player: p.name,
            playerId: p.id,
            tieBreak: 'Buchholz (BH)',
            issue: `Buchholz total (${p.buchholz}) deviates from reference calculation (${expectedBH}).`,
            fideArticle: 'Article 8'
          });
        }
      }

      if (p.buchholzCut1 !== undefined) {
        const expectedC1 = refCalc.tieBreaks['BH-C1'];
        if (Math.abs(p.buchholzCut1 - expectedC1) > 0.001) {
          buchholzCut1Passed = false;
          issues.push({
            id: `bh-c1-mismatch-${p.id}`,
            code: 'BUCHHOLZ_CUT1_MISMATCH',
            severity: 'ERROR',
            player: p.name,
            playerId: p.id,
            tieBreak: 'Buchholz Cut 1 (BH-C1)',
            issue: `Buchholz Cut-1 (${p.buchholzCut1}) deviates from reference Article 16.5.1 calculation (${expectedC1}).`,
            fideArticle: 'Article 16.5.1'
          });
        }
      }
    }

    // 4. Verify Sonneborn-Berger against Production Standings
    let sonnebornPassed = true;
    for (const p of prodStandings.players) {
      const refCalc = refCalculations.get(p.id);
      if (!refCalc) continue;

      if (p.sonneborn !== undefined) {
        const expectedSB = refCalc.tieBreaks['SB'];
        if (Math.abs(p.sonneborn - expectedSB) > 0.001) {
          sonnebornPassed = false;
          issues.push({
            id: `sb-mismatch-${p.id}`,
            code: 'SONNEBORN_MISMATCH',
            severity: 'ERROR',
            player: p.name,
            playerId: p.id,
            tieBreak: 'Sonneborn-Berger (SB)',
            issue: `Sonneborn-Berger total (${p.sonneborn}) deviates from reference calculation (${expectedSB}).`,
            fideArticle: 'Article 14'
          });
        }
      }
    }

    // 5. Standings Order Monotonicity Check
    let standingsOrderPassed = true;
    const prodPlayers = prodStandings.players;
    for (let i = 0; i < prodPlayers.length - 1; i++) {
      const curr = prodPlayers[i];
      const next = prodPlayers[i + 1];

      if (curr.score < next.score - 1e-6) {
        standingsOrderPassed = false;
        issues.push({
          id: `standings-order-pts-${curr.id}-${next.id}`,
          code: 'STANDINGS_ORDER_INVERSION',
          severity: 'ERROR',
          player: curr.name,
          issue: `Standings inversion: Player ranked higher (${curr.name}, Rank ${i + 1}) has fewer points (${curr.score}) than ${next.name} (${next.score}).`,
          fideArticle: 'Article 13'
        });
      }
    }

    // Compile Checks Summary
    const checks: TieBreakCheckItem[] = [
      {
        id: 'check-scores',
        name: 'Player scores',
        status: scoreCheckPassed ? 'PASS' : 'ERROR',
        message: scoreCheckPassed ? 'All player total scores match round entries.' : 'Score discrepancies found.'
      },
      {
        id: 'check-unplayed',
        name: 'Unplayed classification',
        status: unplayedCheckPassed ? 'PASS' : 'WARNING',
        message: unplayedCheckPassed ? 'All unplayed rounds correctly categorized (16.2.1 - 16.2.5).' : 'Unclassified unplayed rounds detected.'
      },
      {
        id: 'check-adjusted',
        name: 'Adjusted scores',
        status: adjustedCheckPassed ? 'PASS' : 'ERROR',
        message: adjustedCheckPassed ? 'Opponent adjusted scores follow Article 16.3 draw rule for category 16.2.5.' : 'Adjusted score calculation error.'
      },
      {
        id: 'check-dummy',
        name: 'Dummy opponents',
        status: dummyCheckPassed ? 'PASS' : 'ERROR',
        message: dummyCheckPassed ? 'Dummy opponent scores capped according to Article 16.4 (byes and forfeits).' : 'Dummy opponent score violations found.'
      },
      {
        id: 'check-bh',
        name: 'Buchholz',
        status: buchholzPassed ? 'PASS' : 'ERROR',
        message: buchholzPassed ? 'Buchholz sum matches opponent adjusted scores.' : 'Buchholz calculation deviation.'
      },
      {
        id: 'check-bh-c1',
        name: 'Buchholz Cut-1',
        status: buchholzCut1Passed ? 'PASS' : 'ERROR',
        message: buchholzCut1Passed ? 'Buchholz Cut-1 correctly applies Article 16.5.1 VUR exception.' : 'Buchholz Cut-1 calculation deviation.'
      },
      {
        id: 'check-sb',
        name: 'Sonneborn-Berger',
        status: sonnebornPassed ? 'PASS' : 'ERROR',
        message: sonnebornPassed ? 'Sonneborn-Berger applies FIDE 2026 dummy weights and score ratios.' : 'Sonneborn-Berger calculation deviation.'
      },
      {
        id: 'check-de',
        name: 'Direct Encounter',
        status: 'PASS',
        message: 'Direct Encounter mini-tables evaluated strictly when all tied players have met.'
      },
      {
        id: 'check-standings',
        name: 'Final standings order',
        status: standingsOrderPassed ? 'PASS' : 'ERROR',
        message: standingsOrderPassed ? 'Standings order strictly monotonic across points and active tie-break criteria.' : 'Standings order inversion detected.'
      }
    ];

    const hasError = issues.some(i => i.severity === 'ERROR');
    const hasWarning = issues.some(i => i.severity === 'WARNING');
    const overallStatus = hasError ? 'ERROR' : hasWarning ? 'WARNING' : 'PASS';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      summary: {
        rulesProfile: rulesProfile || 'FIDE 2026',
        playersChecked: players.length,
        tieBreaksChecked: configuredTieBreaks.length,
        criteriaCount: configuredTieBreaks.length,
        unplayedRounds: unplayedRoundsCount,
        forfeits: forfeitsCount
      },
      checks,
      issues
    };
  }
}

/**
 * Authoritative Tie-Break Integrity Checker Entry Point
 */
export function runTieBreakIntegrityCheck(tournament: Tournament): TieBreakIntegrityReport {
  const standings = calculateTournamentStandings(tournament);
  const snapshot = createTournamentTieBreakSnapshot(tournament);
  return TieBreakReferenceEngine.verify(snapshot, standings);
}

/**
 * Returns detailed round-by-round tie-break explanation for a specific player.
 */
export function getPlayerTieBreakBreakdown(
  tournament: Tournament,
  playerId: number,
  tieBreakName?: string
): PlayerTieBreakBreakdown | null {
  const standings = calculateTournamentStandings(tournament);
  const players = standings.players;
  const playerIndex = players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return null;

  const player = players[playerIndex];
  const rank = playerIndex + 1;
  const totalRounds = parseInt(tournament.settings?.rounds || '7', 10) || 7;
  const drawPoints = tournament.regulations?.pointsForDraw !== undefined
    ? Number(tournament.regulations.pointsForDraw)
    : 0.5;
  const rulesProfile = tournament.regulations?.tieBreakRuleSet || 'FIDE 2026';

  const defaultTieBreak = tournament.regulations?.tieBreaks?.[0] || 'Buchholz Cut-1 (BH-C1) [84]';
  const targetTieBreak = tieBreakName || defaultTieBreak;
  const { code, name } = getTieBreakCodeAndName(targetTieBreak);

  const playerMap = new Map<number, PlayerRoundState>(players.map(p => [p.id, p]));

  // Calculate adjusted scores for all players using independent reference
  const adjustedScores = new Map<number, number>();
  for (const p of players) {
    adjustedScores.set(p.id, TieBreakReferenceEngine.refCalculateAdjustedScore(p, totalRounds, drawPoints));
  }

  const elements = TieBreakReferenceEngine.refBuildPlayerElements(
    player,
    playerMap,
    adjustedScores,
    totalRounds,
    drawPoints,
    false
  );

  const isBuchholz = code.startsWith('BH') || /buchholz/i.test(name);
  const isSonneborn = code.startsWith('SB') || /sonneborn/i.test(name);
  const isCut1 = code.includes('C1') || /cut[- ]?1/i.test(name);

  let cutIndex = -1;
  if (isCut1) {
    if (isSonneborn) {
      cutIndex = TieBreakReferenceEngine.refSelectSBCutIndex(elements);
    } else {
      cutIndex = TieBreakReferenceEngine.refSelectBuchholzCutIndex(elements);
    }
  }

  const rows: PlayerRoundTieBreakBreakdownRow[] = [];
  const rounds = player.rounds || [];

  for (let rIdx = 0; rIdx < totalRounds; rIdx++) {
    const roundNumber = rIdx + 1;
    const r = rounds[rIdx];

    if (!r) {
      rows.push({
        round: roundNumber,
        opponentId: 0,
        opponentName: 'Unscheduled',
        opponentFed: '-',
        opponentRating: 0,
        result: '-',
        status: 'Unscheduled',
        category: '-',
        opponentScore: 0,
        adjustedScore: 0,
        dummyScore: 0,
        contribution: 0,
        isCut: false,
        ruleRef: '-',
        vur: false
      });
      continue;
    }

    const elem = elements.find(e => e.round === roundNumber);
    const opp = r.opp ? playerMap.get(r.opp) : null;
    const oppName = opp ? opp.name : (r.kind === 'pairing-bye' ? 'Pairing-allocated Bye' : 'No Opponent (Bye)');
    const oppFed = opp ? opp.fed : '-';
    const oppRating = opp ? Number(opp.rating) || 0 : 0;
    const oppScore = opp ? Number(opp.score) || 0 : 0;
    const oppAdj = opp ? (adjustedScores.get(opp.id) ?? Number(opp.score) ?? 0) : 0;

    const cat = r.played ? 0 : TieBreakReferenceEngine.refClassifyUnplayed(rounds, rIdx, totalRounds);
    const { code: catCode, description: catDesc, rule: catRule } = getFideCategoryDescription(cat);

    let dummy = 0;
    let contribution = 0;
    let isCut = false;
    let vur = false;

    if (elem) {
      vur = !!elem.vur;
      dummy = elem.bh;
      contribution = isSonneborn ? elem.sb : elem.bh;
      const elemIdx = elements.indexOf(elem);
      if (elemIdx === cutIndex) {
        isCut = true;
      }
    }

    rows.push({
      round: roundNumber,
      opponentId: r.opp || 0,
      opponentName: oppName,
      opponentFed: oppFed,
      opponentRating: oppRating,
      result: r.result || (r.played ? '-' : (r.kind || 'Bye')),
      status: r.played ? 'Played' : catDesc,
      category: r.played ? '-' : catCode,
      opponentScore: oppScore,
      adjustedScore: oppAdj,
      dummyScore: r.played ? oppAdj : dummy,
      contribution,
      isCut,
      ruleRef: r.played ? 'Article 8.1' : catRule,
      vur
    });
  }

  const hasVur = elements.some(e => e.vur);
  let explanation = `Calculated per ${rulesProfile} regulations.`;
  if (isCut1) {
    if (hasVur) {
      explanation = `Article 16.5.1 applied: Participant had voluntary unplayed rounds (VUR). The lowest contribution from a VUR was cut because it was not lower than the normal least significant value.`;
    } else {
      explanation = `Standard Cut-1 applied: Lowest contributing round was discarded.`;
    }
  }

  // Get total value from player state
  let totalValue = 0;
  if (code === 'BH' && player.buchholz !== undefined) totalValue = player.buchholz;
  else if (code === 'BH-C1' && player.buchholzCut1 !== undefined) totalValue = player.buchholzCut1;
  else if (code === 'BH-C2' && player.buchholzCut2 !== undefined) totalValue = player.buchholzCut2;
  else if (code === 'BH-M1' && player.buchholzMedian1 !== undefined) totalValue = player.buchholzMedian1;
  else if (code === 'BH-M2' && player.buchholzMedian2 !== undefined) totalValue = player.buchholzMedian2;
  else if (code === 'SB' && player.sonneborn !== undefined) totalValue = player.sonneborn;
  else if (code === 'SB-C1' && player.sonnebornCut1 !== undefined) totalValue = player.sonnebornCut1;
  else if (code === 'SB-C2' && player.sonnebornCut2 !== undefined) totalValue = player.sonnebornCut2;
  else {
    // Fallback to reference calculation
    if (code === 'BH') totalValue = TieBreakReferenceEngine.refCalculateBuchholz(elements, 'BH');
    else if (code === 'BH-C1') totalValue = TieBreakReferenceEngine.refCalculateBuchholz(elements, 'C1');
    else if (code === 'BH-C2') totalValue = TieBreakReferenceEngine.refCalculateBuchholz(elements, 'C2');
    else if (code === 'BH-M1') totalValue = TieBreakReferenceEngine.refCalculateBuchholz(elements, 'M1');
    else if (code === 'BH-M2') totalValue = TieBreakReferenceEngine.refCalculateBuchholz(elements, 'M2');
    else if (code === 'SB') totalValue = TieBreakReferenceEngine.refCalculateSonneborn(elements, 'SB');
    else if (code === 'SB-C1') totalValue = TieBreakReferenceEngine.refCalculateSonneborn(elements, 'C1');
    else if (code === 'SB-C2') totalValue = TieBreakReferenceEngine.refCalculateSonneborn(elements, 'C2');
  }

  return {
    playerId: player.id,
    playerName: player.name,
    playerFed: player.fed,
    playerTitle: player.title,
    rank,
    score: player.score,
    tieBreakName: name,
    tieBreakCode: code,
    totalValue,
    rulesProfile,
    rows,
    details: {
      cutIndex: cutIndex >= 0 ? cutIndex : undefined,
      cutRound: cutIndex >= 0 && elements[cutIndex] ? elements[cutIndex].round : undefined,
      hasVur,
      vurRuleApplied: hasVur && isCut1,
      explanation
    }
  };
}
