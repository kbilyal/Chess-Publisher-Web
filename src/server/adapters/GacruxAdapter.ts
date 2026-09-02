import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { PairingEngineAdapter, PairingEngineResult, EngineExecutionRecord } from '../../engine/adapters/types';
import { Tournament, BoardPairing, Player } from '../../types';
import { buildTRFText } from '../../engine/trfParser';
import { auditStore } from '../auditStore';

export interface GacruxAdapterOptions {
  timeoutMs?: number;
  testExecutablePath?: string;
}

/**
 * GacruxAdapter (Server-Side)
 * 
 * Formal adapter for upstream Gacrux 1.9.57 FIDE Swiss Dutch pairing engine.
 * Upstream: OttoMilvang/TieBreakServer (commit 14a34a2c2f36509b110e4f25d6247f31fc4bf2f5)
 * Executed authoritatively by the Node.js backend server.
 * 
 * SAFETY DIRECTIVES:
 * - Uses official CLI interface (pairingchecker.py -i <input> -o <output> -p -m dutch).
 * - Direct execution with spawn (NO shell execution).
 * - Isolated per-request temporary working directory with guaranteed cleanup.
 * - Strict process timeout enforcement with SIGTERM and SIGKILL fallback.
 * - Captures stdout, stderr, exit code, input/output cryptographic digests, and duration.
 * - Path traversal protection and client path injection prevention.
 * - Sensitive filesystem paths redacted from public-facing error responses.
 * - Never substitutes prototype or AI-generated algorithms.
 * - Returns isAvailable() = false if the native runtime/script is not installed on the system.
 * - Throws AUTHORITATIVE_ENGINE_NOT_CONFIGURED if invoked without real binary.
 */
export class GacruxAdapter implements PairingEngineAdapter {
  public readonly id = 'gacrux-fide-dutch';
  public readonly name = 'Gacrux Swiss Dutch Engine';
  public readonly authoritative = true;
  public readonly upstreamRepository = 'OttoMilvang/TieBreakServer';
  public readonly upstreamCommit = '14a34a2c2f36509b110e4f25d6247f31fc4bf2f5';
  
  private detectedVersion: string | null = null;
  private customTestExecutablePath: string | null = null;
  private readonly defaultTimeoutMs: number;

  constructor(options?: GacruxAdapterOptions) {
    this.defaultTimeoutMs = options?.timeoutMs || 5000;
    if (options?.testExecutablePath) {
      this.customTestExecutablePath = options.testExecutablePath;
    }
  }

  public get version(): string {
    return this.detectedVersion || '1.9.57';
  }

  /**
   * For internal testing only - allows automated architecture test harness to supply
   * a test fixture executable (e.g. mock timeout / nonzero exit process).
   * Strictly forbidden from being called via user API requests.
   */
  public setCustomExecutablePathForTest(testPath: string | null): void {
    this.customTestExecutablePath = testPath;
    this.detectedVersion = null;
  }

  /**
   * Validates and sanitizes a binary or script path against directory traversal and permission checks.
   */
  public validateExecutablePath(candidate: string): boolean {
    if (!candidate || typeof candidate !== 'string') return false;
    
    // Prevent directory traversal attacks
    if (candidate.includes('..')) {
      return false;
    }

    try {
      const resolved = path.resolve(candidate);
      if (!fs.existsSync(resolved)) return false;

      const stat = fs.statSync(resolved);
      if (!stat.isFile()) return false;

      // For Python scripts, file existence is sufficient as python3 executes them
      if (candidate.endsWith('.py')) {
        return true;
      }

      // Check execute permission on POSIX systems for compiled binaries / shell scripts
      if (process.platform !== 'win32') {
        if ((stat.mode & 0o111) === 0) return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Discovers the Gacrux engine on the host platform.
   * Checks strictly whitelisted installation candidates and process.env.GACRUX_PATH.
   */
  public async discoverBinary(): Promise<string | null> {
    // Internal test fixture override (for architecture tests)
    if (this.customTestExecutablePath) {
      if (this.validateExecutablePath(this.customTestExecutablePath)) {
        return path.resolve(this.customTestExecutablePath);
      }
      return null;
    }

    const candidatePaths: (string | undefined)[] = [
      process.env.GACRUX_PATH,
      path.join(process.cwd(), 'engine', 'gacrux', 'pairingchecker.py'),
      path.join(process.cwd(), 'engine', 'gacrux', 'gacrux'),
      path.join(process.cwd(), 'bin', 'gacrux'),
      '/usr/local/bin/gacrux',
      '/usr/bin/gacrux'
    ];

    for (const candidate of candidatePaths) {
      if (!candidate) continue;
      if (this.validateExecutablePath(candidate)) {
        const resolved = path.resolve(candidate);
        // Attempt version detection once if not cached
        if (!this.detectedVersion) {
          this.detectedVersion = await this.queryVersionFromBinary(resolved);
        }
        return resolved;
      }
    }

    return null;
  }

  /**
   * Queries version directly from the discovered binary or python script.
   */
  private async queryVersionFromBinary(executable: string): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        const isPython = executable.endsWith('.py');
        const cmd = isPython ? 'python3' : executable;
        const args = isPython ? [executable, '-V'] : ['--version'];

        const child = spawn(cmd, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 2000
        });

        let out = '';
        child.stdout?.on('data', chunk => { out += chunk.toString(); });
        child.stderr?.on('data', chunk => { out += chunk.toString(); });
        child.on('close', (code) => {
          if (code === 0 && out.trim()) {
            const match = out.match(/(\d+\.\d+\.\d+(?:-[a-zA-Z0-9]+)?)/);
            resolve(match ? match[1] : out.trim().slice(0, 30));
          } else {
            resolve(null);
          }
        });
        child.on('error', () => resolve(null));
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Real availability check.
   */
  public async isAvailable(): Promise<boolean> {
    const binary = await this.discoverBinary();
    return binary !== null;
  }

  /**
   * Returns diagnostic information about engine discovery.
   */
  public async getDiagnostic(): Promise<{
    available: boolean;
    version: string | null;
    platform: string;
    diagnostic: string;
  }> {
    const binary = await this.discoverBinary();
    const platform = process.platform;

    if (!binary) {
      return {
        available: false,
        version: null,
        platform,
        diagnostic: 'Gacrux executable not found in GACRUX_PATH or standard system locations (/usr/local/bin, /usr/bin, ./bin, ./engine/gacrux).'
      };
    }

    return {
      available: true,
      version: this.detectedVersion || '1.9.57',
      platform,
      diagnostic: `Authoritative Gacrux engine discovered at ${path.basename(binary)}.`
    };
  }

  /**
   * Generates deterministic TRF input specification for Gacrux engine.
   * Encodes completed tournament history through round - 1.
   */
  public buildEngineInput(
    tournament: Tournament,
    round: number,
    options?: {
      manualByes?: Record<string, string>;
      excludedKeys?: string[];
      fixedBoards?: Record<string, number>;
      initialTopColor?: 'w' | 'b';
      pabPoints?: number;
    }
  ): string {
    const scheduledRounds = parseInt(tournament.settings?.rounds || '9', 10);
    const completedRound = Math.max(0, round - 1);

    // Provide complete default metadata if missing to ensure TRF compliance
    const safeTourn: Tournament = {
      ...tournament,
      name: tournament.name || 'Official Swiss Tournament',
      settings: {
        ...tournament.settings,
        organizer: tournament.settings?.organizer || tournament.name || 'Official Swiss Federation',
        city: tournament.settings?.city || 'Geneva',
        country: tournament.settings?.country || 'SUI',
        startDate: tournament.settings?.startDate || new Date().toISOString().slice(0, 10),
        endDate: tournament.settings?.endDate || new Date().toISOString().slice(0, 10),
        chiefArbiter: tournament.settings?.chiefArbiter || 'IA Official',
        timeControl: tournament.settings?.timeControl || '90m + 30s',
        rounds: String(scheduledRounds),
        tournamentFormat: tournament.settings?.tournamentFormat || 'Individual Swiss'
      },
      regulations: {
        ...tournament.regulations,
        pabPoints: String(options?.pabPoints ?? tournament.regulations?.pabPoints ?? '1.0')
      },
      pairings: {
        ...tournament.pairings,
        engine: {
          ...tournament.pairings?.engine,
          initialTopColor: options?.initialTopColor || tournament.pairings?.engine?.initialTopColor || 'w'
        }
      }
    };

    const trfResult = buildTRFText(safeTourn, 16, completedRound);
    return trfResult.text;
  }

  /**
   * Executes the real Gacrux engine process with full isolation, timeout, and diagnostic logging.
   */
  public async generatePairing(
    tournament: Tournament,
    round: number,
    options?: {
      manualByes?: Record<string, string>;
      excludedKeys?: string[];
      fixedBoards?: Record<string, number>;
      initialTopColor?: 'w' | 'b';
      pabPoints?: number;
      timeoutMs?: number;
    }
  ): Promise<PairingEngineResult> {
    const executable = await this.discoverBinary();

    if (!executable) {
      const err = new Error(
        'Authoritative Gacrux pairing engine binary (v1.9.57) is not installed or configured on this system. ' +
        'Refusing to generate unverified pairing for official tournament.'
      );
      (err as any).code = 'AUTHORITATIVE_ENGINE_NOT_CONFIGURED';
      throw err;
    }

    const requestId = `req_${Date.now()}_r${round}_${Math.random().toString(36).slice(2, 8)}`;
    const inputData = this.buildEngineInput(tournament, round, options);
    const inputHash = crypto.createHash('sha256').update(inputData, 'utf8').digest('hex');
    const startedAt = new Date().toISOString();
    const timeoutDuration = options?.timeoutMs || this.defaultTimeoutMs;

    // Create per-request isolated temporary working directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gacrux-run-'));
    const inputFilePath = path.join(tempDir, 'input.trf');
    const outputFilePath = path.join(tempDir, 'output.json');
    fs.writeFileSync(inputFilePath, inputData, 'utf8');

    const isPythonScript = executable.endsWith('.py');
    const isCustomFixture = this.customTestExecutablePath !== null && !isPythonScript;

    let spawnCmd: string;
    let spawnArgs: string[];

    if (isPythonScript) {
      spawnCmd = 'python3';
      spawnArgs = [executable, '-i', inputFilePath, '-o', outputFilePath, '-p', '-m', 'dutch'];
      if (options?.initialTopColor) {
        spawnArgs.push('-t', options.initialTopColor);
      }

      // Handle excluded, withdrawn, absent, and manual bye players for round
      const excludedNumbers: number[] = [];
      const excludedKeys = new Set<string>([
        ...(options?.excludedKeys || []),
        ...(tournament.pairings?.engine?.excluded || [])
      ]);

      const manualByes = options?.manualByes || tournament.pairings?.engine?.manualByes?.[String(round)] || {};
      for (const pKey of Object.keys(manualByes)) {
        excludedKeys.add(pKey);
      }

      for (const player of tournament.players) {
        if (
          excludedKeys.has(player.localKey) ||
          excludedKeys.has(String(player.id)) ||
          (player.attendance as string) === 'withdrawn' ||
          player.attendance === 'absent'
        ) {
          if (player.pairingNumber && !excludedNumbers.includes(player.pairingNumber)) {
            excludedNumbers.push(player.pairingNumber);
          }
        }
      }

      if (excludedNumbers.length > 0) {
        spawnArgs.push('-u', ...excludedNumbers.map(n => String(n)));
      }
    } else if (isCustomFixture) {
      // Test harness fixtures expect command-line flags and may write to stdout
      spawnCmd = executable;
      spawnArgs = ['--round', String(round), '--format', 'json', '--input', inputFilePath];
    } else {
      spawnCmd = executable;
      spawnArgs = ['-i', inputFilePath, '-o', outputFilePath, '-p', '-m', 'dutch'];
      if (options?.initialTopColor) {
        spawnArgs.push('-t', options.initialTopColor);
      }
    }

    const invokedCommandLine = `${spawnCmd} ${spawnArgs.join(' ')}`;
    const startTime = performance.now();

    return new Promise<PairingEngineResult>((resolve, reject) => {
      let isSettled = false;
      let isTimedOut = false;
      let stdout = '';
      let stderr = '';
      let timer: NodeJS.Timeout | null = null;
      let forceKillTimer: NodeJS.Timeout | null = null;

      // Safe spawn without shell
      const child = spawn(spawnCmd, spawnArgs, {
        cwd: tempDir,
        env: {
          ...process.env,
          GACRUX_TEMP_DIR: tempDir
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        try {
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        } catch {
          // Ignore temp cleanup errors
        }
      };

      // Set timeout
      timer = setTimeout(() => {
        if (isSettled) return;
        isTimedOut = true;
        child.kill('SIGTERM');

        // Escalate to SIGKILL if not dead after 1000ms
        forceKillTimer = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            // Child already dead
          }
        }, 1000);
      }, timeoutDuration);

      child.stdout.on('data', chunk => {
        if (stdout.length < 5 * 1024 * 1024) {
          stdout += chunk.toString();
        }
      });

      child.stderr.on('data', chunk => {
        if (stderr.length < 2 * 1024 * 1024) {
          stderr += chunk.toString();
        }
      });

      child.on('error', (spawnErr: any) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        const duration = performance.now() - startTime;
        const finishedAt = new Date().toISOString();

        const record: EngineExecutionRecord = {
          requestId,
          tournamentId: tournament.name || 'tournament',
          round,
          timestamp: startedAt,
          engineId: this.id,
          engineName: this.name,
          engineVersion: this.version,
          authoritative: true,
          upstreamRepository: this.upstreamRepository,
          upstreamCommit: this.upstreamCommit,
          invokedCommandLine,
          platform: process.platform,
          inputFormat: 'TRF',
          inputHash,
          inputDigest: inputHash,
          input: inputData,
          startedAt,
          finishedAt,
          executionDurationMs: duration,
          exitCode: null,
          stdout,
          stderr: spawnErr.message || String(spawnErr),
          parsedResult: null,
          errorCode: 'ENGINE_SPAWN_FAILED',
          errorMessage: spawnErr.message
        };
        auditStore.addRecord(record);

        reject({
          code: 'ENGINE_SPAWN_FAILED',
          message: `Failed to spawn Gacrux engine process: ${spawnErr.message}`,
          details: spawnErr
        });
      });

      child.on('close', (exitCode: number | null) => {
        if (isSettled) return;
        isSettled = true;
        const duration = performance.now() - startTime;
        const finishedAt = new Date().toISOString();

        if (isTimedOut) {
          cleanup();
          const timeoutErrRecord: EngineExecutionRecord = {
            requestId,
            tournamentId: tournament.name || 'tournament',
            round,
            timestamp: startedAt,
            engineId: this.id,
            engineName: this.name,
            engineVersion: this.version,
            authoritative: true,
            upstreamRepository: this.upstreamRepository,
            upstreamCommit: this.upstreamCommit,
            invokedCommandLine,
            platform: process.platform,
            inputFormat: 'TRF',
            inputHash,
            inputDigest: inputHash,
            input: inputData,
            startedAt,
            finishedAt,
            executionDurationMs: duration,
            exitCode,
            stdout,
            stderr: `Process terminated due to timeout (${timeoutDuration}ms).\n` + stderr,
            parsedResult: null,
            errorCode: 'ENGINE_TIMEOUT',
            errorMessage: `Engine execution timed out after ${timeoutDuration}ms.`
          };
          auditStore.addRecord(timeoutErrRecord);

          reject({
            code: 'ENGINE_TIMEOUT',
            message: `Gacrux engine execution timed out after ${timeoutDuration}ms. Process was terminated.`,
            stderr,
            stdout,
            exitCode
          });
          return;
        }

        if (exitCode !== 0) {
          cleanup();
          const failureRecord: EngineExecutionRecord = {
            requestId,
            tournamentId: tournament.name || 'tournament',
            round,
            timestamp: startedAt,
            engineId: this.id,
            engineName: this.name,
            engineVersion: this.version,
            authoritative: true,
            upstreamRepository: this.upstreamRepository,
            upstreamCommit: this.upstreamCommit,
            invokedCommandLine,
            platform: process.platform,
            inputFormat: 'TRF',
            inputHash,
            inputDigest: inputHash,
            input: inputData,
            startedAt,
            finishedAt,
            executionDurationMs: duration,
            exitCode,
            stdout,
            stderr,
            parsedResult: null,
            errorCode: 'ENGINE_EXECUTION_FAILED',
            errorMessage: `Gacrux engine terminated with non-zero exit code ${exitCode}`
          };
          auditStore.addRecord(failureRecord);

          reject({
            code: 'ENGINE_EXECUTION_FAILED',
            message: `Gacrux engine terminated with exit code ${exitCode}`,
            exitCode,
            stderr,
            stdout
          });
          return;
        }

        try {
          let parsed: PairingEngineResult;
          let outputRaw = '';

          if (fs.existsSync(outputFilePath)) {
            outputRaw = fs.readFileSync(outputFilePath, 'utf8');
            parsed = this.parseGacruxJsonOutput(outputRaw, tournament, round);
          } else {
            outputRaw = stdout;
            parsed = this.parseEngineOutput(stdout, round);
          }

          cleanup();

          const outputHash = crypto.createHash('sha256').update(outputRaw, 'utf8').digest('hex');
          parsed.auditRecordId = requestId;
          parsed.executionDurationMs = duration;

          const successRecord: EngineExecutionRecord = {
            requestId,
            tournamentId: tournament.name || 'tournament',
            round,
            timestamp: startedAt,
            engineId: this.id,
            engineName: this.name,
            engineVersion: this.version,
            authoritative: true,
            upstreamRepository: this.upstreamRepository,
            upstreamCommit: this.upstreamCommit,
            invokedCommandLine,
            platform: process.platform,
            inputFormat: 'TRF',
            inputHash,
            inputDigest: inputHash,
            outputDigest: outputHash,
            input: inputData,
            startedAt,
            finishedAt,
            executionDurationMs: duration,
            exitCode: 0,
            stdout,
            stderr,
            parsedResult: parsed.boards
          };
          auditStore.addRecord(successRecord);

          resolve(parsed);
        } catch (parseErr: any) {
          cleanup();
          const parseErrRecord: EngineExecutionRecord = {
            requestId,
            tournamentId: tournament.name || 'tournament',
            round,
            timestamp: startedAt,
            engineId: this.id,
            engineName: this.name,
            engineVersion: this.version,
            authoritative: true,
            upstreamRepository: this.upstreamRepository,
            upstreamCommit: this.upstreamCommit,
            invokedCommandLine,
            platform: process.platform,
            inputFormat: 'TRF',
            inputHash,
            inputDigest: inputHash,
            input: inputData,
            startedAt,
            finishedAt,
            executionDurationMs: duration,
            exitCode,
            stdout,
            stderr,
            parsedResult: null,
            errorCode: 'ENGINE_OUTPUT_PARSE_ERROR',
            errorMessage: parseErr.message
          };
          auditStore.addRecord(parseErrRecord);

          reject({
            code: 'ENGINE_OUTPUT_PARSE_ERROR',
            message: `Failed to parse Gacrux engine output: ${parseErr.message}`,
            rawOutput: stdout,
            stderr
          });
        }
      });

      // Handle stdin error events safely
      child.stdin.on('error', () => {});
      try {
        child.stdin.end();
      } catch {}
    });
  }

  /**
   * Parses official Gacrux JSON output file.
   * Maps [white, black] integer pairs back to Player entities and BoardPairing records.
   */
  public parseGacruxJsonOutput(rawJson: string, tournament: Tournament, round: number): PairingEngineResult {
    const data = JSON.parse(rawJson);

    if (data.status && data.status.code !== 0) {
      const errMsgs = (data.status.error || []).join('; ') || `Gacrux status code ${data.status.code}`;
      throw new Error(`Gacrux pairing engine error: ${errMsgs}`);
    }

    if (!data.pairingResult || !Array.isArray(data.pairingResult.pairs)) {
      throw new Error('Gacrux JSON output missing pairingResult.pairs array');
    }

    const playerByNum = new Map<number, Player>();
    tournament.players.forEach((p, idx) => {
      const pNum = p.pairingNumber || (idx + 1);
      playerByNum.set(pNum, p);
    });

    const boards: BoardPairing[] = [];
    let boardNum = 1;
    let pabKey: string | undefined;

    for (const pair of data.pairingResult.pairs) {
      const whiteNum = pair[0];
      const blackNum = pair[1];
      const pWhite = playerByNum.get(whiteNum);

      if (blackNum === 0) {
        // Pairing Allocated Bye
        if (pWhite) {
          pabKey = pWhite.localKey || String(pWhite.id || whiteNum);
          boards.push({
            board: boardNum++,
            whiteKey: pabKey,
            blackKey: '',
            result: 'PAB'
          });
        }
      } else {
        const pBlack = playerByNum.get(blackNum);
        if (pWhite && pBlack) {
          const wKey = pWhite.localKey || String(pWhite.id || whiteNum);
          const bKey = pBlack.localKey || String(pBlack.id || blackNum);
          boards.push({
            board: boardNum++,
            whiteKey: wKey,
            blackKey: bKey,
            result: '-'
          });
        }
      }
    }

    const pairedKeys = new Set<string>();
    for (const b of boards) {
      if (b.whiteKey) pairedKeys.add(b.whiteKey);
      if (b.blackKey) pairedKeys.add(b.blackKey);
    }
    const unpairedKeys: string[] = [];
    for (const p of tournament.players) {
      const k = p.localKey || String(p.id);
      if (!pairedKeys.has(k) && k !== pabKey && !unpairedKeys.includes(k)) {
        unpairedKeys.push(k);
      }
    }

    return {
      round,
      boards,
      engine: {
        id: this.id,
        name: this.name,
        version: this.version,
        authoritative: true,
        engineType: 'authoritative_gacrux'
      },
      unpairedKeys,
      pabKey,
      ruleLog: [`Gacrux v1.9.57 authoritative Dutch pairing generated for round ${round}`],
      executionDurationMs: 0
    };
  }

  /**
   * Fallback parser for JSON or structured stdout (used in architecture test fixtures).
   */
  public parseEngineOutput(rawStdout: string, round: number): PairingEngineResult {
    try {
      const data = JSON.parse(rawStdout);
      const boards: BoardPairing[] = (data.boards || []).map((b: any, idx: number) => ({
        board: b.board || (idx + 1),
        whiteKey: String(b.whiteKey || b.white || ''),
        blackKey: String(b.blackKey || b.black || ''),
        result: b.result || '-'
      }));

      return {
        round,
        boards,
        engine: {
          id: this.id,
          name: this.name,
          version: this.version,
          authoritative: true,
          engineType: 'authoritative_gacrux'
        },
        unpairedKeys: data.unpairedKeys || [],
        pabKey: data.pabKey,
        ruleLog: data.ruleLog || [`Gacrux pairing generated for round ${round}`],
        executionDurationMs: data.durationMs || 0
      };
    } catch {
      const lines = rawStdout.split('\n').map(l => l.trim()).filter(Boolean);
      const boards: BoardPairing[] = [];
      let currentBoard = 1;
      let pabKey: string | undefined;

      for (const line of lines) {
        if (line.startsWith('#') || !line.includes('-')) continue;
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          if (parts[1].toUpperCase() === 'BYE' || parts[1].toUpperCase() === 'PAB') {
            pabKey = parts[0];
            boards.push({
              board: currentBoard++,
              whiteKey: parts[0],
              blackKey: '',
              result: 'PAB'
            });
          } else {
            boards.push({
              board: currentBoard++,
              whiteKey: parts[0],
              blackKey: parts[1],
              result: '-'
            });
          }
        }
      }

      return {
        round,
        boards,
        engine: {
          id: this.id,
          name: this.name,
          version: this.version,
          authoritative: true,
          engineType: 'authoritative_gacrux'
        },
        unpairedKeys: pabKey ? [pabKey] : [],
        pabKey,
        ruleLog: [`Gacrux parsed ${boards.length} boards for round ${round}`]
      };
    }
  }
}
