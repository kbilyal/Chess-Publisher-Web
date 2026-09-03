import { Tournament } from '../../types';
import { TieBreakCheckerAdapter, TieBreakCheckResult } from './types';
import { runTieBreakIntegrityCheck } from '../tiebreakChecker';

/**
 * ChessPublisherTieBreakCheckerAdapter
 * 
 * Formal adapter for authoritative Chess-Publisher Tie-Break Checker.
 * Verifies tournament standings and tie-break invariants according to FIDE 2026 regulations.
 */
export class ChessPublisherTieBreakCheckerAdapter implements TieBreakCheckerAdapter {
  public readonly id = 'chess-publisher-tiebreak-checker';
  public readonly name = 'Chess-Publisher FIDE 2026 Tie-Break Integrity Checker';
  public readonly version = '1.05.01';
  public readonly authoritative = true;

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async verifyStandings(tournament: Tournament): Promise<TieBreakCheckResult> {
    const report = runTieBreakIntegrityCheck(tournament);
    const passed = report.status === 'PASS';

    return {
      status: passed ? 'PASS' : 'FAIL',
      passed,
      checker: {
        id: this.id,
        name: this.name,
        version: this.version
      },
      timestamp: report.timestamp,
      details: `Profile: ${report.summary.rulesProfile}, Checked: ${report.summary.playersChecked} players, Issues: ${report.issues.length}`
    };
  }
}
