import { GacruxAdapter } from '../adapters/GacruxAdapter';
import { IndependentPairingCheckerAdapter } from '../adapters/IndependentPairingCheckerAdapter';
import { auditStore } from '../auditStore';
import { Tournament, BoardPairing } from '../../types';
import { createInitialEmptyTournament } from '../../data/initialData';

export interface ParityTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export async function runAllPhase4ParityTests(): Promise<ParityTestResult[]> {
  const results: ParityTestResult[] = [];
  const gacrux = new GacruxAdapter();
  const bbp = new IndependentPairingCheckerAdapter();

  // Test 1: Real Gacrux 1.9.57 and BBP 6.0.0 Availability and Version Confirmation
  {
    const start = performance.now();
    const gacruxAvail = await gacrux.isAvailable();
    const bbpAvail = await bbp.isAvailable();
    const gacruxDiag = await gacrux.getDiagnostic();
    const passed = gacruxAvail && bbpAvail && gacrux.version === '1.9.57' && bbp.version === '6.0.0';
    results.push({
      id: 'p4-test-1-engine-availability',
      name: '1. Upstream Gacrux 1.9.57 & BBP 6.0.0 Binaries Present and Online',
      passed,
      message: passed
        ? `PASS: Gacrux ${gacrux.version} and BBP ${bbp.version} discovered and verified.`
        : `FAIL: Gacrux (${gacruxAvail}, v=${gacrux.version}) or BBP (${bbpAvail}, v=${bbp.version}) missing.`,
      durationMs: performance.now() - start
    });
  }

  // Test 2: 8 Players Round 1 - Gacrux Generation & BBP Independent Checker Dual Agreement
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const tourn = createInitialEmptyTournament('8-Player Round 1 Championship');
      tourn.players = tourn.players.slice(0, 8);

      const draft = await gacrux.generatePairing(tourn, 1);
      const check = await bbp.check(tourn, draft.boards, 1);

      // In 8 players, round 1 top-half vs bottom-half: 1v5, 6v2, 3v7, 8v4
      const boardCountOk = draft.boards.length === 4;
      const bbpPassed = check.status === 'PASS' && check.passed === true;
      passed = boardCountOk && bbpPassed;
      message = passed
        ? `PASS: Gacrux generated 4 boards; BBP 6.0.0 confirmed 100% FIDE Dutch compliance.`
        : `FAIL: Boards: ${draft.boards.length}, BBP Status: ${check.status} (${JSON.stringify(check.violations)})`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({
      id: 'p4-test-2-8player-r1-dual-agreement',
      name: '2. 8-Player Round 1: Gacrux Draft & BBP Checker Dual Agreement',
      passed,
      message,
      durationMs: performance.now() - start
    });
  }

  // Test 3: Odd Player Count (7 Players) with Pairing Allocated Bye (PAB)
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const tourn = createInitialEmptyTournament('7-Player Odd Tournament');
      tourn.players = tourn.players.slice(0, 7);

      const draft = await gacrux.generatePairing(tourn, 1);
      const pabBoard = draft.boards.find(b => b.result === 'PAB' || !b.blackKey);
      const check = await bbp.check(tourn, draft.boards, 1);

      passed = draft.boards.length === 4 && !!pabBoard && check.status === 'PASS' && check.passed === true;
      message = passed
        ? `PASS: 7 players paired into 3 games + 1 PAB (${pabBoard?.whiteKey}); verified by BBP.`
        : `FAIL: PAB found: ${!!pabBoard}, BBP Status: ${check.status}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({
      id: 'p4-test-3-odd-player-pab',
      name: '3. Odd Player (7 Players) PAB Handled and Verified by BBP',
      passed,
      message,
      durationMs: performance.now() - start
    });
  }

  // Test 4: Round 2 Dutch Pairing with Score Groups
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const tourn = createInitialEmptyTournament('Round 2 Championship');
      tourn.players = tourn.players.slice(0, 8);

      // Simulate completed Round 1
      tourn.pairings.round = '1';
      tourn.pairings.results = '1';
      tourn.pairings.liveBoards = {
        '1': [
          { board: 1, whiteKey: tourn.players[0].localKey, blackKey: tourn.players[4].localKey, result: '1 - 0' },
          { board: 2, whiteKey: tourn.players[5].localKey, blackKey: tourn.players[1].localKey, result: '0 - 1' },
          { board: 3, whiteKey: tourn.players[2].localKey, blackKey: tourn.players[6].localKey, result: '½ - ½' },
          { board: 4, whiteKey: tourn.players[7].localKey, blackKey: tourn.players[3].localKey, result: '½ - ½' }
        ]
      };

      const draft = await gacrux.generatePairing(tourn, 2);
      const check = await bbp.check(tourn, draft.boards, 2);

      passed = draft.boards.length === 4 && check.status === 'PASS' && check.passed === true;
      message = passed
        ? `PASS: Round 2 paired score groups (1.0 vs 1.0, 0.5 vs 0.5, 0.0 vs 0.0); verified by BBP.`
        : `FAIL: Round 2 check failed: status=${check.status}, violations=${JSON.stringify(check.violations)}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({
      id: 'p4-test-4-round-2-score-groups',
      name: '4. Round 2: Score Group Pairings Verified by BBP',
      passed,
      message,
      durationMs: performance.now() - start
    });
  }

  // Test 5: Corrupted / Illegal Pairings Caught by BBP Independent Checker
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const tourn = createInitialEmptyTournament('Corrupted Pairing Test');
      tourn.players = tourn.players.slice(0, 8);

      const draft = await gacrux.generatePairing(tourn, 1);
      // Intentionally corrupt pairings by swapping opponents illegally (e.g. 1 vs 2)
      const corrupted: BoardPairing[] = [
        { board: 1, whiteKey: draft.boards[0].whiteKey, blackKey: draft.boards[1].blackKey, result: '-' },
        { board: 2, whiteKey: draft.boards[1].whiteKey, blackKey: draft.boards[0].blackKey, result: '-' },
        ...draft.boards.slice(2)
      ];

      const check = await bbp.check(tourn, corrupted, 1);
      passed = check.status === 'FAIL' && check.passed === false && check.violations.length > 0;
      message = passed
        ? `PASS: Illegal pairing correctly flagged with status=FAIL and ${check.violations.length} violations.`
        : `FAIL: Corrupted pairing was not flagged: status=${check.status}, passed=${check.passed}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({
      id: 'p4-test-5-corrupted-pairing-rejected',
      name: '5. Illegal / Corrupted Pairings Caught by BBP Checker',
      passed,
      message,
      durationMs: performance.now() - start
    });
  }

  // Test 6: Capability Guard - Unsupported Tournament System Never Converts to PASS
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const tourn = createInitialEmptyTournament('Round Robin Tournament');
      tourn.settings.tournamentFormat = 'Individual Round Robin'; // Non-Swiss system!
      tourn.players = tourn.players.slice(0, 6);

      const dummyBoards: BoardPairing[] = [
        { board: 1, whiteKey: tourn.players[0].localKey, blackKey: tourn.players[1].localKey, result: '-' }
      ];

      const check = await bbp.check(tourn, dummyBoards, 1);
      passed = check.status === 'CHECKER_UNSUPPORTED_FEATURE' && check.passed === false;
      message = passed
        ? `PASS: Unsupported system safely returned CHECKER_UNSUPPORTED_FEATURE (never converted to PASS).`
        : `FAIL: Expected CHECKER_UNSUPPORTED_FEATURE, got: ${check.status}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({
      id: 'p4-test-6-unsupported-system-guard',
      name: '6. Unsupported System Returns CHECKER_UNSUPPORTED_FEATURE (Never PASS)',
      passed,
      message,
      durationMs: performance.now() - start
    });
  }

  // Test 7: Engine Execution Record Upstream Metadata Verification
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const records = auditStore.getAll();
      const lastRecord = records[0];

      const repoOk = lastRecord?.upstreamRepository === 'OttoMilvang/TieBreakServer';
      const commitOk = lastRecord?.upstreamCommit === '14a34a2c2f36509b110e4f25d6247f31fc4bf2f5';
      const cmdOk = typeof lastRecord?.invokedCommandLine === 'string' && lastRecord.invokedCommandLine.includes('pairingchecker.py');
      const formatOk = lastRecord?.inputFormat === 'TRF';
      const hashOk = typeof lastRecord?.inputDigest === 'string' && lastRecord.inputDigest.length === 64;

      passed = repoOk && commitOk && cmdOk && formatOk && hashOk;
      message = passed
        ? `PASS: Audit record includes upstream repo (${lastRecord.upstreamRepository}), commit, CLI command, and SHA-256 digest.`
        : `FAIL: Record metadata incomplete: repo=${repoOk}, commit=${commitOk}, cmd=${cmdOk}, hash=${hashOk}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({
      id: 'p4-test-7-audit-record-upstream-metadata',
      name: '7. EngineExecutionRecord Preserves Upstream Repository, Commit & SHA-256 Digest',
      passed,
      message,
      durationMs: performance.now() - start
    });
  }

  return results;
}
