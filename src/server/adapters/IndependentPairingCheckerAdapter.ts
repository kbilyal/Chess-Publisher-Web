import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { Tournament, BoardPairing, Player } from '../../types';
import { PairingCheckerAdapter, PairingCheckResult, PairingViolation } from '../../engine/adapters/types';
import { buildTRFText, formatTrfDate, setTrfField } from '../../engine/trfParser';
import { calculateTournamentStandings } from '../../engine/tiebreaks';

export interface IndependentPairingCheckerOptions {
  timeoutMs?: number;
  testExecutablePath?: string;
}

/**
 * IndependentPairingCheckerAdapter
 * 
 * Formal adapter for upstream BBP Pairings (v6.0.0) Independent Checker.
 * Upstream repository: BieremaBoyzProgramming/bbpPairings
 * Release: v6.0.0 (commit 16a000f9811de322b0e835d5643198226165b5a9)
 * 
 * SAFETY DIRECTIVES:
 * - Executes native authoritative checker binary (bin/bbpPairings --dutch <file.trf> -c).
 * - Guaranteed independent verification of proposed pairings before commit.
 * - Detects unsupported tournament configurations and returns CHECKER_UNSUPPORTED_FEATURE (never converts to PASS).
 * - If checker is unavailable, returns CHECKER_NOT_CONFIGURED and passed: false (never converts to PASS).
 * - Isolated per-check temporary file handling with guaranteed cleanup.
 */
export class IndependentPairingCheckerAdapter implements PairingCheckerAdapter {
  public readonly id = 'bbp-independent-checker';
  public readonly name = 'BBP Independent Pairing Checker';
  public readonly version = '6.0.0';
  public readonly authoritative = true;
  public readonly upstreamRepository = 'BieremaBoyzProgramming/bbpPairings';
  public readonly upstreamCommit = '16a000f9811de322b0e835d5643198226165b5a9';

  private customTestExecutablePath: string | null = null;
  private readonly defaultTimeoutMs: number;

  constructor(options?: IndependentPairingCheckerOptions) {
    this.defaultTimeoutMs = options?.timeoutMs || 5000;
    if (options?.testExecutablePath) {
      this.customTestExecutablePath = options.testExecutablePath;
    }
  }

  public setCustomExecutablePathForTest(testPath: string | null): void {
    this.customTestExecutablePath = testPath;
  }

  /**
   * Validates and sanitizes a binary path against directory traversal and permission checks.
   */
  public validateExecutablePath(candidate: string): boolean {
    if (!candidate || typeof candidate !== 'string') return false;
    if (candidate.includes('..')) return false;

    try {
      const resolved = path.resolve(candidate);
      if (!fs.existsSync(resolved)) return false;

      const stat = fs.statSync(resolved);
      if (!stat.isFile()) return false;

      if (process.platform !== 'win32') {
        if ((stat.mode & 0o111) === 0) return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Discovers the BBP binary on the host platform.
   */
  public async discoverBinary(): Promise<string | null> {
    if (this.customTestExecutablePath) {
      if (this.validateExecutablePath(this.customTestExecutablePath)) {
        return path.resolve(this.customTestExecutablePath);
      }
      return null;
    }

    const candidatePaths: (string | undefined)[] = [
      process.env.BBP_PATH,
      path.join(process.cwd(), 'bin', 'bbpPairings'),
      path.join(process.cwd(), 'engine', 'bbp', 'bbpPairings'),
      '/usr/local/bin/bbpPairings',
      '/usr/bin/bbpPairings'
    ];

    for (const candidate of candidatePaths) {
      if (!candidate) continue;
      if (this.validateExecutablePath(candidate)) {
        return path.resolve(candidate);
      }
    }

    return null;
  }

  public async isAvailable(): Promise<boolean> {
    const binary = await this.discoverBinary();
    return binary !== null;
  }

  /**
   * Builds an official TRF file encoding previous rounds plus proposed pairings for the specified round.
   * Player cumulative scores are updated to match the proposed match outcomes so BBP's internal score validator succeeds.
   */
  public buildCheckTrf(
    tournament: Tournament,
    proposedBoards: BoardPairing[],
    round: number
  ): string {
    const scheduledRounds = parseInt(tournament.settings?.rounds || '9', 10);
    const settings = tournament.settings;
    const pabVal = parseFloat(tournament.regulations?.pabPoints || '1.0');

    // Create pairing number mapping
    const keyToPlayer = new Map<string, { player: Player; num: number }>();
    const numToPlayer = new Map<number, Player>();
    tournament.players.forEach((p, idx) => {
      const num = p.pairingNumber || (idx + 1);
      const key = p.localKey || String(p.id || num);
      keyToPlayer.set(key, { player: p, num });
      numToPlayer.set(num, p);
    });

    // Map proposed pairings by player number
    const proposedRoundMap = new Map<number, { oppNum: number; color: 'w' | 'b' | '-'; resCode: string; points: number }>();

    for (const board of proposedBoards) {
      const wInfo = keyToPlayer.get(board.whiteKey);
      const bInfo = board.blackKey ? keyToPlayer.get(board.blackKey) : undefined;

      if (!wInfo) continue;

      if (board.result === 'PAB' || !board.blackKey || !bInfo) {
        // Pairing Allocated Bye
        proposedRoundMap.set(wInfo.num, {
          oppNum: 0,
          color: '-',
          resCode: 'U',
          points: pabVal
        });
      } else {
        // Standard game: white vs black. Default tentative result for checker inspection is draw ('=')
        proposedRoundMap.set(wInfo.num, {
          oppNum: bInfo.num,
          color: 'w',
          resCode: '=',
          points: 0.5
        });
        proposedRoundMap.set(bInfo.num, {
          oppNum: wInfo.num,
          color: 'b',
          resCode: '=',
          points: 0.5
        });
      }
    }

    // Build TRF headers
    const lines: string[] = [];
    lines.push(`012 ${tournament.name || 'Official Swiss Tournament'}`);
    lines.push(`022 ${settings?.city || 'Geneva'}`);
    lines.push(`032 ${settings?.country || 'SUI'}`);
    lines.push(`042 ${formatTrfDate(settings?.startDate || new Date().toISOString())}`);
    lines.push(`052 ${formatTrfDate(settings?.endDate || new Date().toISOString())}`);
    lines.push(`062 ${tournament.players.length}`);
    lines.push(`072 ${tournament.players.length}`);
    lines.push(`092 ${settings?.tournamentFormat || 'Individual Swiss'}`);
    lines.push(`102 ${settings?.chiefArbiter || 'IA Official'}`);
    lines.push(`122 ${settings?.timeControl || '90m + 30s'}`);

    // Round dates
    let roundDatesLine = "132 ".padEnd(91, " ");
    for (let r = 1; r <= scheduledRounds; r++) {
      const sched = tournament.schedule?.rows?.find(row => row.event === `Round ${r}`);
      const dateStr = sched ? formatTrfDate(sched.dateTime).slice(2) : formatTrfDate(settings?.startDate || new Date().toISOString()).slice(2);
      roundDatesLine = setTrfField(roundDatesLine, 92 + (r - 1) * 10, 8, dateStr);
    }
    lines.push(roundDatesLine.trimEnd());
    lines.push(`142 ${scheduledRounds}`);
    lines.push(`152 ${(tournament.pairings?.engine?.initialTopColor || 'w').toUpperCase()}`);
    lines.push(`162  W 1.0    D 0.5    L 0.0    Z 0.0    P ${pabVal.toFixed(1)}`);
    lines.push(`182 Chess-Publisher v1.05.01 (BBP Checker Interface)`);

    const standings = calculateTournamentStandings(tournament);

    // Build 001 Player lines
    for (let idx = 0; idx < tournament.players.length; idx++) {
      const p = tournament.players[idx];
      const pNum = p.pairingNumber || (idx + 1);
      const pState = standings.players.find(ps => ps.id === pNum);

      let pLine = "001 ".padEnd(91 + round * 10, " ");
      pLine = setTrfField(pLine, 5, 4, String(pNum), true);
      pLine = setTrfField(pLine, 10, 1, p.gender === 'f' ? 'w' : 'm');
      pLine = setTrfField(pLine, 11, 3, p.title || '');
      pLine = setTrfField(pLine, 15, 33, p.name);
      pLine = setTrfField(pLine, 49, 4, String(p.rating || 0), true);
      pLine = setTrfField(pLine, 54, 3, p.fed || 'FID');
      pLine = setTrfField(pLine, 58, 11, p.fideId ? String(p.fideId) : '');
      pLine = setTrfField(pLine, 70, 10, p.birth ? p.birth.replace(/-/g, '/').slice(0, 10) : '');

      // Calculate past points without normalizing unplayed/forfeited/bye results
      let points = 0;
      for (let r = 1; r < round; r++) {
        const rd = pState?.rounds?.[r - 1];
        const start = 92 + (r - 1) * 10;
        if (rd) {
          const oppNum = rd.opp ? String(rd.opp).padStart(4, " ") : "0000";
          const color = (rd.color === 'w' || rd.color === 'b') ? rd.color : '-';
          let resCode = String(rd.result || ' ').trim();

          // Strict TRF safety: preserve +, -, =, 1, 0, U, F, H, Z without normalization
          if (resCode === '1F - 0F') {
            resCode = rd.color === 'w' ? '+' : '-';
            points += (rd.color === 'w' ? 1.0 : 0.0);
          } else if (resCode === '0F - 1F') {
            resCode = rd.color === 'w' ? '-' : '+';
            points += (rd.color === 'w' ? 0.0 : 1.0);
          } else if (resCode === '0F - 0F') {
            resCode = '-';
            points += 0.0;
          } else if (resCode === '+' || resCode === '-') {
            points += (resCode === '+' ? 1.0 : 0.0);
          } else if (resCode === '1' || resCode === '1 - 0') {
            resCode = '1';
            points += 1.0;
          } else if (resCode === '0' || resCode === '0 - 1') {
            resCode = '0';
            points += 0.0;
          } else if (resCode === '=' || resCode === '½' || resCode === '½ - ½' || resCode === '0.5') {
            resCode = '=';
            points += 0.5;
          } else if (resCode === 'U' || resCode === 'PAB') {
            resCode = 'U';
            points += pabVal;
          } else if (resCode === 'F' || resCode === '1 BYE') {
            resCode = 'F';
            points += 1.0;
          } else if (resCode === 'H' || resCode === '½ BYE') {
            resCode = 'H';
            points += 0.5;
          } else if (resCode === 'Z' || resCode === '0 BYE') {
            resCode = 'Z';
            points += 0.0;
          }

          pLine = setTrfField(pLine, start, 4, oppNum, true);
          pLine = setTrfField(pLine, start + 5, 1, color);
          pLine = setTrfField(pLine, start + 7, 1, resCode);
        } else {
          pLine = setTrfField(pLine, start, 4, "0000", true);
          pLine = setTrfField(pLine, start + 5, 1, "-");
          pLine = setTrfField(pLine, start + 7, 1, "Z");
        }
      }

      // Add proposed round matches
      const propMatch = proposedRoundMap.get(pNum);
      const curStart = 92 + (round - 1) * 10;
      if (propMatch) {
        points += propMatch.points;
        const oppStr = propMatch.oppNum ? String(propMatch.oppNum).padStart(4, " ") : "0000";
        pLine = setTrfField(pLine, curStart, 4, oppStr, true);
        pLine = setTrfField(pLine, curStart + 5, 1, propMatch.color);
        pLine = setTrfField(pLine, curStart + 7, 1, propMatch.resCode);
      } else {
        pLine = setTrfField(pLine, curStart, 4, "0000", true);
        pLine = setTrfField(pLine, curStart + 5, 1, "-");
        pLine = setTrfField(pLine, curStart + 7, 1, "Z");
      }

      // Set score and rank
      pLine = setTrfField(pLine, 81, 4, points.toFixed(1), true);
      pLine = setTrfField(pLine, 86, 4, String(pNum), true);

      lines.push(pLine.trimEnd());
    }

    return lines.join('\n') + '\n';
  }

  public async check(
    tournament: Tournament,
    proposedBoards: BoardPairing[],
    round: number
  ): Promise<PairingCheckResult> {
    const timestamp = new Date().toISOString();
    const executable = await this.discoverBinary();

    if (!executable) {
      return {
        status: 'CHECKER_NOT_CONFIGURED',
        passed: false,
        checker: {
          id: this.id,
          name: this.name,
          version: this.version,
          authoritative: this.authoritative
        },
        round,
        timestamp,
        violations: [
          {
            code: 'CHECKER_NOT_CONFIGURED',
            severity: 'CRITICAL_FAIL',
            message: 'Authoritative BBP Independent Pairing Checker binary (v6.0.0) is not installed on this system.'
          }
        ],
        warnings: [],
        diagnostics: {
          totalBoards: proposedBoards.length,
          totalPlayers: tournament.players.length,
          colorAllocationIssues: 0,
          repeatOpponentIssues: 0,
          scoreGroupIssues: 0,
          floatIssues: 0,
          byeIssues: 0
        }
      };
    }

    // -----------------------------------------------------------------
    // BBP 6.0.0 CAPABILITY GUARD (Requirement 6)
    // -----------------------------------------------------------------
    const format = (tournament.settings?.tournamentFormat || 'Individual Swiss').toLowerCase();
    const system = (tournament.settings?.pairingSystem || 'dutch').toLowerCase();
    const isSwiss = format.includes('swiss') && !format.includes('team');
    const isDutch = system.includes('dutch') || system.includes('fide');
    const isBurstein = system.includes('burstein');
    const isTeam = format.includes('team') || Boolean((tournament.settings as any)?.teams);
    const hasFreePoints = Boolean((tournament.regulations as any)?.freePoints);
    const pointSystem = (tournament.regulations as any)?.scoreForWin || '1.0';
    const isStandardScore = pointSystem === '1.0' || pointSystem === '1';

    // Check 1: Non-Swiss formats (Round Robin / Berger, Knockout, Scheveningen, etc.)
    if (!isSwiss) {
      return {
        status: 'CHECKER_UNSUPPORTED_FEATURE',
        passed: false,
        checker: { id: this.id, name: this.name, version: this.version, authoritative: this.authoritative },
        round,
        timestamp,
        violations: [{
          code: 'CHECKER_UNSUPPORTED_FEATURE',
          severity: 'CRITICAL_FAIL',
          message: `Tournament format '${tournament.settings?.tournamentFormat}' is unsupported by BBP 6.0.0 (only Swiss systems supported).`
        }],
        warnings: [],
        diagnostics: { totalBoards: proposedBoards.length, totalPlayers: tournament.players.length, colorAllocationIssues: 0, repeatOpponentIssues: 0, scoreGroupIssues: 0, floatIssues: 0, byeIssues: 0 }
      };
    }

    // Check 2: Team Swiss is unsupported by individual checker
    if (isTeam) {
      return {
        status: 'CHECKER_UNSUPPORTED_FEATURE',
        passed: false,
        checker: { id: this.id, name: this.name, version: this.version, authoritative: this.authoritative },
        round,
        timestamp,
        violations: [{
          code: 'CHECKER_UNSUPPORTED_FEATURE',
          severity: 'CRITICAL_FAIL',
          message: 'Team Swiss format is unsupported by BBP 6.0.0 individual pairing checker.'
        }],
        warnings: [],
        diagnostics: { totalBoards: proposedBoards.length, totalPlayers: tournament.players.length, colorAllocationIssues: 0, repeatOpponentIssues: 0, scoreGroupIssues: 0, floatIssues: 0, byeIssues: 0 }
      };
    }

    // Check 3: Unsupported pairing systems (Dubov, Lim, Monrad, McMahon, Keizer)
    if (!isDutch && !isBurstein) {
      return {
        status: 'CHECKER_UNSUPPORTED_FEATURE',
        passed: false,
        checker: { id: this.id, name: this.name, version: this.version, authoritative: this.authoritative },
        round,
        timestamp,
        violations: [{
          code: 'CHECKER_UNSUPPORTED_FEATURE',
          severity: 'CRITICAL_FAIL',
          message: `Pairing system '${tournament.settings?.pairingSystem}' is unsupported by BBP 6.0.0 (only FIDE Dutch and Burstein supported).`
        }],
        warnings: [],
        diagnostics: { totalBoards: proposedBoards.length, totalPlayers: tournament.players.length, colorAllocationIssues: 0, repeatOpponentIssues: 0, scoreGroupIssues: 0, floatIssues: 0, byeIssues: 0 }
      };
    }

    // Check 4: Non-standard point systems (e.g. 3-1-0 Football scoring)
    if (!isStandardScore) {
      return {
        status: 'CHECKER_UNSUPPORTED_FEATURE',
        passed: false,
        checker: { id: this.id, name: this.name, version: this.version, authoritative: this.authoritative },
        round,
        timestamp,
        violations: [{
          code: 'CHECKER_UNSUPPORTED_FEATURE',
          severity: 'CRITICAL_FAIL',
          message: `Non-standard point system (${pointSystem} for win) is unsupported for FIDE Dutch verification in BBP 6.0.0.`
        }],
        warnings: [],
        diagnostics: { totalBoards: proposedBoards.length, totalPlayers: tournament.players.length, colorAllocationIssues: 0, repeatOpponentIssues: 0, scoreGroupIssues: 0, floatIssues: 0, byeIssues: 0 }
      };
    }

    // Check 5: Free points / adjustable points for adjourned games
    if (hasFreePoints) {
      return {
        status: 'CHECKER_UNSUPPORTED_FEATURE',
        passed: false,
        checker: { id: this.id, name: this.name, version: this.version, authoritative: this.authoritative },
        round,
        timestamp,
        violations: [{
          code: 'CHECKER_UNSUPPORTED_FEATURE',
          severity: 'CRITICAL_FAIL',
          message: 'Free points / adjustable adjourned game points are unsupported by BBP 6.0.0.'
        }],
        warnings: [],
        diagnostics: { totalBoards: proposedBoards.length, totalPlayers: tournament.players.length, colorAllocationIssues: 0, repeatOpponentIssues: 0, scoreGroupIssues: 0, floatIssues: 0, byeIssues: 0 }
      };
    }

    // Prepare isolated temporary check file
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbp-check-'));
    const trfPath = path.join(tempDir, 'check.trf');
    const trfContent = this.buildCheckTrf(tournament, proposedBoards, round);
    fs.writeFileSync(trfPath, trfContent, 'utf8');

    const timeoutDuration = this.defaultTimeoutMs;

    return new Promise<PairingCheckResult>((resolve) => {
      let isSettled = false;
      let stdout = '';
      let stderr = '';
      let timer: NodeJS.Timeout | null = null;
      let forceKillTimer: NodeJS.Timeout | null = null;

      const child = spawn(executable, ['--dutch', trfPath, '-c'], {
        cwd: tempDir,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        try {
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        } catch {}
      };

      timer = setTimeout(() => {
        if (isSettled) return;
        isSettled = true;
        child.kill('SIGTERM');
        forceKillTimer = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch {}
        }, 1000);

        cleanup();
        resolve({
          status: 'FAIL',
          passed: false,
          checker: {
            id: this.id,
            name: this.name,
            version: this.version,
            authoritative: this.authoritative
          },
          round,
          timestamp: new Date().toISOString(),
          violations: [
            {
              code: 'CHECKER_TIMEOUT',
              severity: 'CRITICAL_FAIL',
              message: `BBP Independent Checker timed out after ${timeoutDuration}ms.`
            }
          ],
          warnings: [],
          diagnostics: {
            totalBoards: proposedBoards.length,
            totalPlayers: tournament.players.length,
            colorAllocationIssues: 0,
            repeatOpponentIssues: 0,
            scoreGroupIssues: 0,
            floatIssues: 0,
            byeIssues: 0
          }
        });
      }, timeoutDuration);

      child.stdout.on('data', chunk => { stdout += chunk.toString(); });
      child.stderr.on('data', chunk => { stderr += chunk.toString(); });

      child.on('error', (err) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        resolve({
          status: 'FAIL',
          passed: false,
          checker: {
            id: this.id,
            name: this.name,
            version: this.version,
            authoritative: this.authoritative
          },
          round,
          timestamp: new Date().toISOString(),
          violations: [
            {
              code: 'CHECKER_SPAWN_ERROR',
              severity: 'CRITICAL_FAIL',
              message: `Failed to execute BBP checker: ${err.message}`
            }
          ],
          warnings: [],
          diagnostics: {
            totalBoards: proposedBoards.length,
            totalPlayers: tournament.players.length,
            colorAllocationIssues: 0,
            repeatOpponentIssues: 0,
            scoreGroupIssues: 0,
            floatIssues: 0,
            byeIssues: 0
          }
        });
      });

      child.on('close', (exitCode) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();

        // Parse stdout for mismatches
        const violations: PairingViolation[] = [];
        const hasMismatch = stdout.includes('Checker pairings') || stdout.includes('Tournament pairings');

        if (hasMismatch) {
          const lines = stdout.split('\n');
          let inTable = false;
          let boardIdx = 1;

          for (const line of lines) {
            if (line.includes('Checker pairings')) {
              inTable = true;
              continue;
            }
            if (inTable && line.includes('-')) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              violations.push({
                code: 'FIDE_DUTCH_PAIRING_DEVIATION',
                severity: 'CRITICAL_FAIL',
                fideArticle: 'FIDE Swiss Rules C.04.3 (Dutch System)',
                board: boardIdx++,
                message: `Deviation detected: BBP Checker expected vs Proposed: ${trimmed}`
              });
            }
          }

          if (violations.length === 0) {
            violations.push({
              code: 'FIDE_DUTCH_PAIRING_DEVIATION',
              severity: 'CRITICAL_FAIL',
              message: 'Proposed pairing deviates from authoritative FIDE Dutch rules verified by BBP 6.0.0.'
            });
          }

          resolve({
            status: 'FAIL',
            passed: false,
            checker: {
              id: this.id,
              name: this.name,
              version: this.version,
              authoritative: this.authoritative
            },
            round,
            timestamp: new Date().toISOString(),
            violations,
            warnings: [],
            diagnostics: {
              totalBoards: proposedBoards.length,
              totalPlayers: tournament.players.length,
              colorAllocationIssues: violations.length,
              repeatOpponentIssues: 0,
              scoreGroupIssues: violations.length,
              floatIssues: 0,
              byeIssues: 0
            }
          });
          return;
        }

        if (exitCode !== 0) {
          const errMsg = (stderr || stdout || `Process exited with code ${exitCode}`).trim();
          resolve({
            status: 'FAIL',
            passed: false,
            checker: {
              id: this.id,
              name: this.name,
              version: this.version,
              authoritative: this.authoritative
            },
            round,
            timestamp: new Date().toISOString(),
            violations: [
              {
                code: 'CHECKER_EXECUTION_ERROR',
                severity: 'CRITICAL_FAIL',
                message: `BBP Independent Checker reported error: ${errMsg}`
              }
            ],
            warnings: [],
            diagnostics: {
              totalBoards: proposedBoards.length,
              totalPlayers: tournament.players.length,
              colorAllocationIssues: 0,
              repeatOpponentIssues: 0,
              scoreGroupIssues: 0,
              floatIssues: 0,
              byeIssues: 0
            }
          });
          return;
        }

        // Clean PASS
        resolve({
          status: 'PASS',
          passed: true,
          checker: {
            id: this.id,
            name: this.name,
            version: this.version,
            authoritative: this.authoritative
          },
          round,
          timestamp: new Date().toISOString(),
          violations: [],
          warnings: [],
          diagnostics: {
            totalBoards: proposedBoards.length,
            totalPlayers: tournament.players.length,
            colorAllocationIssues: 0,
            repeatOpponentIssues: 0,
            scoreGroupIssues: 0,
            floatIssues: 0,
            byeIssues: 0
          }
        });
      });
    });
  }

  /**
   * Directly verify a complete TRF file against BBP 6.0.0 with Capability Guard.
   */
  public async checkTrf(trfContent: string, round: number = 1): Promise<PairingCheckResult> {
    const executable = await this.discoverBinary();
    const timestamp = new Date().toISOString();

    if (!executable) {
      return {
        status: 'CHECKER_NOT_CONFIGURED',
        passed: false,
        checker: { id: this.id, name: this.name, version: this.version, authoritative: this.authoritative },
        round,
        timestamp,
        violations: [{ code: 'BINARY_MISSING', severity: 'CRITICAL_FAIL', message: 'BBP binary not found.' }],
        warnings: [],
        diagnostics: { totalBoards: 0, totalPlayers: 0, colorAllocationIssues: 0, repeatOpponentIssues: 0, scoreGroupIssues: 0, floatIssues: 0, byeIssues: 0 }
      };
    }

    // Capability Guard on raw TRF tags
    const trfUpper = trfContent.toUpperCase();
    const lines = trfContent.split('\n');

    // Structural Validation: Require at least 2 player 001 lines
    const playerLines = lines.filter(l => l.startsWith('001 '));
    if (playerLines.length < 2) {
      return {
        status: 'FAIL',
        passed: false,
        checker: { id: this.id, name: this.name, version: this.version, authoritative: this.authoritative },
        round,
        timestamp,
        violations: [{ code: 'MALFORMED_TRF', severity: 'CRITICAL_FAIL', message: 'Malformed TRF: Less than 2 player records (001) found in tournament input.' }],
        warnings: [],
        diagnostics: { totalBoards: 0, totalPlayers: playerLines.length, colorAllocationIssues: 0, repeatOpponentIssues: 0, scoreGroupIssues: 0, floatIssues: 0, byeIssues: 0 }
      };
    }

    for (const line of lines) {
      const code = line.slice(0, 3);
      const val = line.slice(4).trim().toUpperCase();

      // Check 1: Non-Swiss tournament type (092)
      if (code === '092') {
        if (val.includes('ROUND ROBIN') || val.includes('BERGER') || val.includes('KNOCKOUT') || val.includes('SCHEVENINGEN')) {
          return {
            status: 'CHECKER_UNSUPPORTED_FEATURE',
            passed: false,
            checker: { id: this.id, name: this.name, version: this.version, authoritative: this.authoritative },
            round,
            timestamp,
            violations: [{ code: 'CHECKER_UNSUPPORTED_FEATURE', severity: 'CRITICAL_FAIL', message: `Tournament format in line 092 (${val}) is unsupported by BBP 6.0.0 Swiss checker.` }],
            warnings: [],
            diagnostics: { totalBoards: 0, totalPlayers: 0, colorAllocationIssues: 0, repeatOpponentIssues: 0, scoreGroupIssues: 0, floatIssues: 0, byeIssues: 0 }
          };
        }
      }

      // Check 2: Team tournament (082)
      if (code === '082') {
        return {
          status: 'CHECKER_UNSUPPORTED_FEATURE',
          passed: false,
          checker: { id: this.id, name: this.name, version: this.version, authoritative: this.authoritative },
          round,
          timestamp,
          violations: [{ code: 'CHECKER_UNSUPPORTED_FEATURE', severity: 'CRITICAL_FAIL', message: 'Team Swiss format (082 tag) is unsupported by BBP 6.0.0 individual checker.' }],
          warnings: [],
          diagnostics: { totalBoards: 0, totalPlayers: 0, colorAllocationIssues: 0, repeatOpponentIssues: 0, scoreGroupIssues: 0, floatIssues: 0, byeIssues: 0 }
        };
      }

      // Check 3: Unsupported pairing system code (192)
      if (code === '192') {
        if (val.includes('DUBOV') || val.includes('LIM') || val.includes('MONRAD') || val.includes('MCMAHON') || val.includes('KEIZER')) {
          return {
            status: 'CHECKER_UNSUPPORTED_FEATURE',
            passed: false,
            checker: { id: this.id, name: this.name, version: this.version, authoritative: this.authoritative },
            round,
            timestamp,
            violations: [{ code: 'CHECKER_UNSUPPORTED_FEATURE', severity: 'CRITICAL_FAIL', message: `Pairing system in line 192 (${val}) is unsupported by BBP 6.0.0 Dutch checker.` }],
            warnings: [],
            diagnostics: { totalBoards: 0, totalPlayers: 0, colorAllocationIssues: 0, repeatOpponentIssues: 0, scoreGroupIssues: 0, floatIssues: 0, byeIssues: 0 }
          };
        }
      }

      // Check 4: Non-standard point system (162)
      if (code === '162') {
        if (val.includes('3.0') || val.includes('3-1-0') || val.includes('W 3') || val.includes('W 2')) {
          return {
            status: 'CHECKER_UNSUPPORTED_FEATURE',
            passed: false,
            checker: { id: this.id, name: this.name, version: this.version, authoritative: this.authoritative },
            round,
            timestamp,
            violations: [{ code: 'CHECKER_UNSUPPORTED_FEATURE', severity: 'CRITICAL_FAIL', message: `Non-standard point system in line 162 (${val}) is unsupported for FIDE Dutch verification in BBP 6.0.0.` }],
            warnings: [],
            diagnostics: { totalBoards: 0, totalPlayers: 0, colorAllocationIssues: 0, repeatOpponentIssues: 0, scoreGroupIssues: 0, floatIssues: 0, byeIssues: 0 }
          };
        }
      }
    }

    // Check 5: Free points / adjourned games
    if (trfUpper.includes('FREE_POINTS') || trfUpper.includes('ADJOURNED_ADJUSTABLE')) {
      return {
        status: 'CHECKER_UNSUPPORTED_FEATURE',
        passed: false,
        checker: { id: this.id, name: this.name, version: this.version, authoritative: this.authoritative },
        round,
        timestamp,
        violations: [{ code: 'CHECKER_UNSUPPORTED_FEATURE', severity: 'CRITICAL_FAIL', message: 'Free points / adjustable adjourned game points are unsupported by BBP 6.0.0.' }],
        warnings: [],
        diagnostics: { totalBoards: 0, totalPlayers: 0, colorAllocationIssues: 0, repeatOpponentIssues: 0, scoreGroupIssues: 0, floatIssues: 0, byeIssues: 0 }
      };
    }

    // Execute BBP on TRF
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbp-trf-check-'));
    const trfPath = path.join(tempDir, 'tournament.trf');
    fs.writeFileSync(trfPath, trfContent, 'utf8');

    return new Promise<PairingCheckResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      const child = spawn(executable, ['--dutch', trfPath, '-c'], { cwd: tempDir, stdio: ['ignore', 'pipe', 'pipe'] });

      child.stdout.on('data', chunk => { stdout += chunk.toString(); });
      child.stderr.on('data', chunk => { stderr += chunk.toString(); });

      child.on('close', (exitCode) => {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}

        const hasMismatch = stdout.includes('Checker pairings') || stdout.includes('Tournament pairings');
        if (hasMismatch) {
          resolve({
            status: 'FAIL',
            passed: false,
            checker: { id: this.id, name: this.name, version: this.version, authoritative: this.authoritative },
            round,
            timestamp: new Date().toISOString(),
            violations: [{ code: 'FIDE_DUTCH_PAIRING_DEVIATION', severity: 'CRITICAL_FAIL', message: `BBP Checker reported pairing discrepancy:\n${stdout}` }],
            warnings: [],
            diagnostics: { totalBoards: 0, totalPlayers: 0, colorAllocationIssues: 1, repeatOpponentIssues: 0, scoreGroupIssues: 1, floatIssues: 0, byeIssues: 0 }
          });
          return;
        }

        if (exitCode !== 0) {
          resolve({
            status: 'FAIL',
            passed: false,
            checker: { id: this.id, name: this.name, version: this.version, authoritative: this.authoritative },
            round,
            timestamp: new Date().toISOString(),
            violations: [{ code: 'CHECKER_EXECUTION_ERROR', severity: 'CRITICAL_FAIL', message: (stderr || stdout || `Process exited with code ${exitCode}`).trim() }],
            warnings: [],
            diagnostics: { totalBoards: 0, totalPlayers: 0, colorAllocationIssues: 0, repeatOpponentIssues: 0, scoreGroupIssues: 0, floatIssues: 0, byeIssues: 0 }
          });
          return;
        }

        resolve({
          status: 'PASS',
          passed: true,
          checker: { id: this.id, name: this.name, version: this.version, authoritative: this.authoritative },
          round,
          timestamp: new Date().toISOString(),
          violations: [],
          warnings: [],
          diagnostics: { totalBoards: 0, totalPlayers: 0, colorAllocationIssues: 0, repeatOpponentIssues: 0, scoreGroupIssues: 0, floatIssues: 0, byeIssues: 0 }
        });
      });
    });
  }
}
