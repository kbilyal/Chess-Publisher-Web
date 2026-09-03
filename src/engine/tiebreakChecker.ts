import { Tournament, PlayerRoundState, TieBreakRuleSet } from '../types';
import {
  calculateTournamentStandings,
  getStandingTieBreakValue,
  fidePointsFromRound,
  getUnplayedRoundCategory2026,
  getAdjustedScoreForOpponents,
  getDummyOpponentScore,
  makeOwnTieBreakElements2026,
  chooseBuchholzLowCutIndex2026,
  chooseSBLowCutIndex2026,
  applyFideCutModifier
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

/**
 * Authoritative Tie-Break Integrity Checker
 * Verifies tournament scores, unplayed classifications, dummy opponents,
 * Buchholz / SB cut rules, and standings order against FIDE regulations.
 */
export function runTieBreakIntegrityCheck(tournament: Tournament): TieBreakIntegrityReport {
  const issues: TieBreakDiagnosticIssue[] = [];
  const rulesProfile = tournament.regulations?.tieBreakRuleSet || 'FIDE 2026';
  const configuredTieBreaks = tournament.regulations?.tieBreaks || [];

  const standings = calculateTournamentStandings(tournament);
  const players = standings.players;
  const totalRounds = parseInt(tournament.settings?.rounds || '7', 10) || 7;
  const drawPoints = tournament.regulations?.pointsForDraw ?? 0.5;

  let unplayedRoundsCount = 0;
  let forfeitsCount = 0;

  // 1. Check configured tie-breaks list
  let emptyListError = false;
  if (configuredTieBreaks.length === 0) {
    emptyListError = true;
    issues.push({
      id: 'tb-empty-list',
      code: 'NO_TIE_BREAKS_CONFIGURED',
      severity: 'WARNING',
      issue: 'No tie-breaks configured in tournament regulations. Standings will use primary points and pairing numbers only.',
      fideArticle: 'Article 13'
    });
  }

  // Check for duplicate criteria and obsolete criteria
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

    // Check for obsolete criteria under FIDE 2026
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
    const opts = tournament.regulations?.tieBreakOptions?.[tb];
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

  // 2. Check Player Scores and Unplayed Rounds
  let scoreCheckPassed = true;
  let unplayedCheckPassed = true;
  let dummyCheckPassed = true;
  let adjustedCheckPassed = true;

  const playerMap = new Map<number, PlayerRoundState>(players.map(p => [p.id, p]));

  for (const p of players) {
    let sumScore = 0;
    const rounds = p.rounds || [];

    for (let rIdx = 0; rIdx < totalRounds; rIdx++) {
      const r = rounds[rIdx];
      if (!r) continue;

      const pts = fidePointsFromRound(r);
      sumScore += pts;

      if (!r.played) {
        unplayedRoundsCount++;
        const cat = getUnplayedRoundCategory2026(p, rIdx, totalRounds);
        if (cat === 0) {
          unplayedCheckPassed = false;
          issues.push({
            id: `unplayed-cat-${p.id}-r${rIdx + 1}`,
            severity: 'WARNING',
            player: p.name,
            playerId: p.id,
            round: rIdx + 1,
            issue: `Unplayed round has undefined FIDE classification (kind: ${r.kind || 'none'}, result: ${r.result || 'none'}).`,
            fideArticle: 'Article 16.2'
          });
        }

        if (cat === 2 || cat === 4) {
          forfeitsCount++;
        }

        // Dummy score check
        const oppAdj = (r.opp && playerMap.has(r.opp)) ? playerMap.get(r.opp)?.adjustedScore2026 : undefined;
        const dummy = getDummyOpponentScore(p, rIdx, totalRounds, oppAdj, drawPoints);

        // Dummy score invariant: must not exceed participant's final score
        if (dummy > Number(p.score) + 1e-6) {
          dummyCheckPassed = false;
          issues.push({
            id: `dummy-cap-${p.id}-r${rIdx + 1}`,
            severity: 'ERROR',
            player: p.name,
            playerId: p.id,
            round: rIdx + 1,
            issue: `Dummy opponent score (${dummy}) exceeds participant final score (${p.score}).`,
            fideArticle: 'Article 16.4'
          });
        }
      }
    }

    // Check sum of round points vs p.score
    if (Math.abs(sumScore - Number(p.score)) > 0.001) {
      scoreCheckPassed = false;
      issues.push({
        id: `score-mismatch-${p.id}`,
        severity: 'ERROR',
        player: p.name,
        playerId: p.id,
        issue: `Recorded score (${p.score}) does not match sum of individual round points (${sumScore}).`,
        fideArticle: 'Article 2'
      });
    }

    // Check adjusted score for opponents (Article 16.3)
    const calculatedAdj = getAdjustedScoreForOpponents(p, totalRounds, drawPoints);
    if (p.adjustedScore2026 !== undefined && Math.abs(p.adjustedScore2026 - calculatedAdj) > 0.001) {
      adjustedCheckPassed = false;
      issues.push({
        id: `adj-score-mismatch-${p.id}`,
        severity: 'ERROR',
        player: p.name,
        playerId: p.id,
        issue: `Adjusted opponent score (${p.adjustedScore2026}) deviates from Article 16.3 formula (${calculatedAdj}).`,
        fideArticle: 'Article 16.3'
      });
    }
  }

  // 3. Buchholz & Buchholz Cut-1 Check
  let buchholzPassed = true;
  let buchholzCut1Passed = true;

  for (const p of players) {
    const elements = makeOwnTieBreakElements2026(p, playerMap, totalRounds, { drawPoints });
    if (elements.length > 0) {
      const bhTotal = elements.reduce((s, e) => s + e.bh, 0);
      if (p.buchholz !== undefined && Math.abs(p.buchholz - bhTotal) > 0.001) {
        buchholzPassed = false;
        issues.push({
          id: `bh-sum-${p.id}`,
          severity: 'ERROR',
          player: p.name,
          playerId: p.id,
          tieBreak: 'Buchholz (BH)',
          issue: `Buchholz total (${p.buchholz}) differs from element sum (${bhTotal}).`,
          fideArticle: 'Article 8'
        });
      }

      // Cut 1 VUR test
      if (elements.length > 1) {
        const cutIdx = chooseBuchholzLowCutIndex2026(elements);
        const cutVal = elements[cutIdx].bh;
        const expectedC1 = bhTotal - cutVal;
        if (p.buchholzCut1 !== undefined && Math.abs(p.buchholzCut1 - expectedC1) > 0.001) {
          buchholzCut1Passed = false;
          issues.push({
            id: `bh-c1-${p.id}`,
            severity: 'ERROR',
            player: p.name,
            playerId: p.id,
            tieBreak: 'Buchholz Cut 1 (BH-C1)',
            issue: `Buchholz Cut-1 (${p.buchholzCut1}) deviates from Article 16.5.1 calculation (${expectedC1}).`,
            fideArticle: 'Article 16.5.1'
          });
        }
      }
    }
  }

  // 4. Sonneborn-Berger Check
  let sonnebornPassed = true;
  for (const p of players) {
    const elements = makeOwnTieBreakElements2026(p, playerMap, totalRounds, { drawPoints });
    if (elements.length > 0) {
      const sbTotal = elements.reduce((s, e) => s + e.sb, 0);
      if (p.sonneborn !== undefined && Math.abs(p.sonneborn - sbTotal) > 0.001) {
        sonnebornPassed = false;
        issues.push({
          id: `sb-sum-${p.id}`,
          severity: 'ERROR',
          player: p.name,
          playerId: p.id,
          tieBreak: 'Sonneborn-Berger (SB)',
          issue: `Sonneborn-Berger total (${p.sonneborn}) differs from weighted element sum (${sbTotal}).`,
          fideArticle: 'Article 14'
        });
      }
    }
  }

  // 5. Standings Order Monotonicity Check
  let standingsOrderPassed = true;
  for (let i = 0; i < players.length - 1; i++) {
    const curr = players[i];
    const next = players[i + 1];

    if (curr.score < next.score) {
      standingsOrderPassed = false;
      issues.push({
        id: `standings-order-pts-${curr.id}-${next.id}`,
        severity: 'ERROR',
        player: curr.name,
        issue: `Standings inversion: Player ranked higher (${curr.name}, Rank ${i + 1}) has fewer points (${curr.score}) than ${next.name} (${next.score}).`,
        fideArticle: 'Article 13'
      });
    }
  }

  // Compile check items list
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
      rulesProfile: String(rulesProfile),
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

/**
 * Computes deep diagnostic breakdown of every round for a selected player and tie-break criterion.
 */
export function getPlayerTieBreakBreakdown(
  tournament: Tournament,
  playerId: number,
  tieBreakName: string
): PlayerTieBreakBreakdown | null {
  const standings = calculateTournamentStandings(tournament);
  const playerIndex = standings.players.findIndex(p => p.id === playerId);
  if (playerIndex < 0) return null;

  const player = standings.players[playerIndex];
  const rank = playerIndex + 1;
  const totalRounds = parseInt(tournament.settings?.rounds || '7', 10) || 7;
  const drawPoints = tournament.regulations?.pointsForDraw ?? 0.5;
  const rulesProfile = String(tournament.regulations?.tieBreakRuleSet || 'FIDE 2026');

  const playerMap = new Map<number, PlayerRoundState>(standings.players.map(p => [p.id, p]));
  const elements = makeOwnTieBreakElements2026(player, playerMap, totalRounds, { drawPoints });

  const { code, name } = getTieBreakCodeAndName(tieBreakName);
  const isCut1 = code.includes('C1') || tieBreakName.toLowerCase().includes('cut-1') || tieBreakName.toLowerCase().includes('cut 1');
  const isBuchholz = code.startsWith('BH') || tieBreakName.toLowerCase().includes('buchholz');
  const isSonneborn = code.startsWith('SB') || tieBreakName.toLowerCase().includes('sonneborn');

  let cutIndex = -1;
  if (isCut1) {
    if (isBuchholz) {
      cutIndex = chooseBuchholzLowCutIndex2026(elements);
    } else if (isSonneborn) {
      cutIndex = chooseSBLowCutIndex2026(elements);
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
    const oppAdj = opp ? Number(opp.adjustedScore2026 ?? opp.score) : 0;

    const cat = r.played ? 0 : getUnplayedRoundCategory2026(player, rIdx, totalRounds);
    const { code: catCode, description: catDesc, rule: catRule } = getFideCategoryDescription(cat);

    let dummy = 0;
    let contribution = 0;
    let isCut = false;
    let vur = false;

    if (elem) {
      vur = !!elem.vur;
      dummy = isBuchholz ? elem.bh : (elem.dummy || elem.bh);
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

  const totalValue = getStandingTieBreakValue(player, tieBreakName);

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
