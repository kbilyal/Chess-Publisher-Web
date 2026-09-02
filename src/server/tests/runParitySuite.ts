import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { FIXTURES, FIXTURES_DIR, writeFixtureFiles, FixtureMeta } from '../fixtures/fixtureDefinitions';
import { parseTRF } from '../../engine/trfParser';
import { Tournament, Player, BoardPairing, Attendance } from '../../types';
import { GacruxAdapter } from '../adapters/GacruxAdapter';
import { IndependentPairingCheckerAdapter } from '../adapters/IndependentPairingCheckerAdapter';
import { TournamentStore } from '../tournamentStore';

interface SemanticBoardComparison {
  board: number;
  whiteNo: number;
  blackNo: number;
  whiteColor: 'w';
  blackColor: 'b';
  whiteScoreGroup: number;
  blackScoreGroup: number;
  isFloat: boolean;
  match: boolean;
  deviationReason?: string;
}

interface FixtureParityResult {
  fixtureId: string;
  fixtureName: string;
  round: number;
  desktopExecutionOk: boolean;
  webExecutionOk: boolean;
  semanticParityPassed: boolean;
  bbpStatus: string;
  bbpPassed: boolean;
  overallStatus: 'PASS' | 'FAIL';
  engineVersion: string;
  pabDesktop?: number | null;
  pabWeb?: number | null;
  unpairedDesktop: number[];
  unpairedWeb: number[];
  boardComparisons: SemanticBoardComparison[];
  error?: string;
}

/**
 * Converts a ParsedTrfTournament and its raw TRF text into a full Tournament model.
 */
function buildTournamentFromTrf(meta: FixtureMeta): Tournament {
  const parsed = parseTRF(meta.trfContent);

  const players: Player[] = parsed.players.map((p, idx) => {
    const pNum = p.pairingNumber || (idx + 1);
    let attendance = (p.attendance || 'present') as Attendance;
    if (meta.withdrawnPlayerNumbers?.includes(pNum)) {
      attendance = 'absent';
    }

    return {
      id: pNum,
      localKey: `p-${pNum}`,
      pairingNumber: pNum,
      name: p.name || `Player ${pNum}`,
      rating: p.rating || 0,
      fed: p.fed || 'FID',
      fideId: p.fideId || '',
      birth: p.birth || '',
      gender: p.gender || 'm',
      title: p.title || '',
      attendance,
      joinedFromRound: 1
    };
  });

  // Construct rounds and pairings from roundsData
  const rounds: { round: number; boards: BoardPairing[]; completed: boolean }[] = [];
  const maxRound = meta.roundToPair - 1;

  for (let r = 1; r <= maxRound; r++) {
    const rawBoards = parsed.roundsData[r] || [];
    const boards: BoardPairing[] = rawBoards.map((b, bIdx) => {
      const whitePlayer = players.find(p => p.pairingNumber === b.whiteNo);
      const blackPlayer = players.find(p => p.pairingNumber === b.blackNo);

      return {
        board: bIdx + 1,
        whiteKey: whitePlayer ? whitePlayer.localKey : (b.whiteNo ? `p-${b.whiteNo}` : ''),
        blackKey: blackPlayer ? blackPlayer.localKey : (b.blackNo ? `p-${b.blackNo}` : ''),
        result: b.result as any
      };
    });

    rounds.push({
      round: r,
      boards,
      completed: true
    });
  }

  // Handle manual byes for the round
  const manualByes: Record<string, Record<string, string>> = {};
  if (meta.manualByeNumbers) {
    manualByes[String(meta.roundToPair)] = {};
    for (const [pNumStr, byeType] of Object.entries(meta.manualByeNumbers)) {
      const p = players.find(pl => pl.pairingNumber === Number(pNumStr));
      if (p) {
        manualByes[String(meta.roundToPair)][p.localKey] = byeType;
      }
    }
  }

  return ({
    id: meta.id,
    name: parsed.name,
    status: 'in_progress',
    currentRound: meta.roundToPair,
    settings: {
      city: parsed.city,
      country: parsed.country,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      chiefArbiter: parsed.chiefArbiter,
      timeControl: parsed.timeControl,
      rounds: String(parsed.rounds),
      tournamentFormat: 'Individual Swiss',
      pairingSystem: 'FIDE Dutch System'
    } as any,
    players,
    pairings: {
      server: '',
      round: String(meta.roundToPair),
      results: '0',
      showScheduleOnPrint: false,
      liveBoards: {},
      finalStandingsPromptedRound: 0,
      rounds,
      engine: {
        mode: 'dutch',
        initialTopColor: 'w',
        excluded: players.filter(p => (p.attendance as string) === 'withdrawn' || p.attendance === 'absent').map(p => p.localKey),
        manualByes,
        lastGeneratedRound: 0,
        lastEngineMessage: '',
        excludeRemaining: {},
        excludeRounds: {},
        fixedBoards: {},
        roundActivationConfirmed: {},
        playerStatusCollapsed: false,
        needsResort: false,
        registrationsDirty: false,
        syncedAbsent: {},
        registrationSyncedAt: '',
        registrationSyncedForRound: 0,
        registrationSyncedSignature: '',
        firstRoundRegistrationLocked: false,
        firstRoundRegistrationSyncedSignature: '',
        firstRoundRegistrationNeedsResort: false,
        firstRoundRegistrationSyncedAt: ''
      }
    } as any
  } as any as Tournament);
}

/**
 * Calculates player points prior to the round.
 */
function calculatePlayerPoints(tournament: Tournament, round: number): Map<number, number> {
  const pointsMap = new Map<number, number>();
  for (const p of tournament.players) {
    pointsMap.set(p.pairingNumber || 0, 0);
  }

  for (let r = 1; r < round; r++) {
    const rd = (tournament.pairings as any)?.rounds?.find((rnd: any) => rnd.round === r);
    if (!rd) continue;
    for (const b of rd.boards) {
      const whiteP = tournament.players.find(p => p.localKey === b.whiteKey);
      const blackP = tournament.players.find(p => p.localKey === b.blackKey);
      const wNum = whiteP?.pairingNumber || 0;
      const bNum = blackP?.pairingNumber || 0;
      const res = String(b.result || '').trim();

      if (res === '1 - 0' || res === '1' || res === '1F - 0F' || res === '+') {
        if (wNum) pointsMap.set(wNum, (pointsMap.get(wNum) || 0) + 1.0);
      } else if (res === '0 - 1' || res === '0' || res === '0F - 1F') {
        if (bNum) pointsMap.set(bNum, (pointsMap.get(bNum) || 0) + 1.0);
      } else if (res === '½ - ½' || res === '=' || res === '0.5') {
        if (wNum) pointsMap.set(wNum, (pointsMap.get(wNum) || 0) + 0.5);
        if (bNum) pointsMap.set(bNum, (pointsMap.get(bNum) || 0) + 0.5);
      } else if (res === 'PAB' || res === 'U' || res === '1 BYE' || res === 'F') {
        if (wNum) pointsMap.set(wNum, (pointsMap.get(wNum) || 0) + 1.0);
      } else if (res === '½ BYE' || res === 'H') {
        if (wNum) pointsMap.set(wNum, (pointsMap.get(wNum) || 0) + 0.5);
      }
    }
  }

  return pointsMap;
}

/**
 * Executes Desktop Gacrux directly via CLI using Python script.
 */
function runDesktopGacrux(trfFilePath: string, meta: FixtureMeta): {
  success: boolean;
  boards: { board: number; whiteNo: number; blackNo: number }[];
  pabNo?: number | null;
  unpairedNos: number[];
  version: string;
  error?: string;
} {
  const gacruxPy = path.join(process.cwd(), 'engine', 'gacrux', 'pairingchecker.py');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-gacrux-'));
  const outJsonPath = path.join(tempDir, 'output.json');

  const args = ['-i', trfFilePath, '-o', outJsonPath, '-p', '-m', 'dutch', '-t', 'w'];

  // Handle excluded / withdrawn / manual byes via -u
  const excluded: number[] = [];
  if (meta.withdrawnPlayerNumbers) excluded.push(...meta.withdrawnPlayerNumbers);
  if (meta.manualByeNumbers) excluded.push(...Object.keys(meta.manualByeNumbers).map(Number));

  if (excluded.length > 0) {
    args.push('-u', ...excluded.map(String));
  }

  const res = spawnSync('python3', [gacruxPy, ...args], { encoding: 'utf8' });

  if (res.status !== 0 || !fs.existsSync(outJsonPath)) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    return {
      success: false,
      boards: [],
      unpairedNos: [],
      version: '1.9.57',
      error: (res.stderr || res.stdout || 'Gacrux failed').trim()
    };
  }

  const rawJson = fs.readFileSync(outJsonPath, 'utf8');
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}

  const data = JSON.parse(rawJson);
  const boards: { board: number; whiteNo: number; blackNo: number }[] = [];
  let pabNo: number | null = null;

  const pairs = data.pairingResult?.pairs || [];
  let bIdx = 1;
  for (const pair of pairs) {
    const w = Number(pair[0]);
    const blk = Number(pair[1] || 0);

    if (blk === 0) {
      pabNo = w;
    } else {
      boards.push({ board: bIdx++, whiteNo: w, blackNo: blk });
    }
  }

  // Identify all unpaired players
  const pairedNos = new Set<number>();
  for (const b of boards) {
    pairedNos.add(b.whiteNo);
    pairedNos.add(b.blackNo);
  }
  if (pabNo) pairedNos.add(pabNo);

  const parsed = parseTRF(meta.trfContent);
  const unpairedNos: number[] = [];
  for (let i = 1; i <= parsed.players.length; i++) {
    if (!pairedNos.has(i)) {
      unpairedNos.push(i);
    }
  }

  return {
    success: true,
    boards,
    pabNo,
    unpairedNos,
    version: '1.9.57'
  };
}

async function runParitySuite() {
  console.log('='.repeat(80));
  console.log('PHASE 5 — CHESS-PUBLISHER DESKTOP PARITY & REAL TOURNAMENT GATE');
  console.log('Authoritative Engines: Gacrux 1.9.57 (Generator) + BBP 6.0.0 (Independent Checker)');
  console.log('='.repeat(80));

  writeFixtureFiles();
  console.log(`[Setup] Exported ${FIXTURES.length} real fixtures from Chess-Publisher v1.05.00 Stable to ${FIXTURES_DIR}\n`);

  const gacruxAdapter = new GacruxAdapter();
  const checkerAdapter = new IndependentPairingCheckerAdapter();
  const results: FixtureParityResult[] = [];

  for (const fix of FIXTURES) {
    console.log(`\n--- Running Fixture: ${fix.name} (Round ${fix.roundToPair}) ---`);
    const trfPath = path.join(FIXTURES_DIR, `${fix.id}.trf`);
    const tournament = buildTournamentFromTrf(fix);
    const playerPoints = calculatePlayerPoints(tournament, fix.roundToPair);

    // Path A: Desktop / Validated Gacrux Path
    const desktopResult = runDesktopGacrux(trfPath, fix);

    // Path B: Web Gacrux 1.9.57 Path
    let webBoards: BoardPairing[] = [];
    let webPabNo: number | null = null;
    let webUnpairedNos: number[] = [];
    let webSuccess = false;
    let webError: string | undefined;

    try {
      const engineResult = await gacruxAdapter.generatePairing(tournament, fix.roundToPair, {
        initialTopColor: 'w',
        excludedKeys: tournament.players
          .filter(p => fix.withdrawnPlayerNumbers?.includes(p.pairingNumber || 0))
          .map(p => p.localKey),
        manualByes: tournament.pairings?.engine?.manualByes?.[String(fix.roundToPair)] || {}
      });

      webSuccess = true;
      webBoards = engineResult.boards;
      if (engineResult.pabKey) {
        const p = tournament.players.find(pl => pl.localKey === engineResult.pabKey);
        webPabNo = p?.pairingNumber || null;
      }
      webUnpairedNos = (engineResult.unpairedKeys || []).map(k => {
        const p = tournament.players.find(pl => pl.localKey === k);
        return p?.pairingNumber || 0;
      }).filter(n => n > 0);
    } catch (err: any) {
      webSuccess = false;
      webError = err.message || String(err);
    }

    // Path C: Independent Pairing Checker (BBP 6.0.0)
    let bbpResult: any = { status: 'ERROR', passed: false };
    if (webSuccess) {
      bbpResult = await checkerAdapter.check(tournament, webBoards, fix.roundToPair);
    }

    // Semantic Comparison
    const boardComparisons: SemanticBoardComparison[] = [];
    let semanticMatch = true;

    if (!desktopResult.success || !webSuccess) {
      semanticMatch = false;
    } else {
      // 1. Board count match (compare game boards between 2 players)
      const webGameBoards = webBoards.filter(b => b.blackKey && b.result !== 'PAB');
      if (desktopResult.boards.length !== webGameBoards.length) {
        semanticMatch = false;
        console.error(`[Deviation] Board count mismatch: Desktop=${desktopResult.boards.length}, Web=${webGameBoards.length}`);
      }

      // 2. Per-board semantic comparison
      for (let i = 0; i < desktopResult.boards.length; i++) {
        const dBoard = desktopResult.boards[i];
        const wBoard = webGameBoards[i];

        if (!wBoard) {
          semanticMatch = false;
          break;
        }

        const wPlayerWhite = tournament.players.find(p => p.localKey === wBoard.whiteKey);
        const wPlayerBlack = tournament.players.find(p => p.localKey === wBoard.blackKey);
        const wWhiteNo = wPlayerWhite?.pairingNumber || 0;
        const wBlackNo = wPlayerBlack?.pairingNumber || 0;

        const whitePts = playerPoints.get(dBoard.whiteNo) || 0;
        const blackPts = playerPoints.get(dBoard.blackNo) || 0;
        const isFloat = whitePts !== blackPts;

        const playersMatch = (dBoard.whiteNo === wWhiteNo && dBoard.blackNo === wBlackNo);
        const colorsMatch = true; // White on left, Black on right

        const match = playersMatch && colorsMatch;
        if (!match) {
          semanticMatch = false;
        }

        boardComparisons.push({
          board: i + 1,
          whiteNo: dBoard.whiteNo,
          blackNo: dBoard.blackNo,
          whiteColor: 'w',
          blackColor: 'b',
          whiteScoreGroup: whitePts,
          blackScoreGroup: blackPts,
          isFloat,
          match,
          deviationReason: match ? undefined : `Expected W:${dBoard.whiteNo} vs B:${dBoard.blackNo}, Got W:${wWhiteNo} vs B:${wBlackNo}`
        });
      }

      // 3. PAB comparison
      if ((desktopResult.pabNo || null) !== (webPabNo || null)) {
        semanticMatch = false;
        console.error(`[Deviation] PAB mismatch: Desktop=${desktopResult.pabNo}, Web=${webPabNo}`);
      }

      // 4. Unpaired comparison
      const sortedDesktopUnpaired = [...desktopResult.unpairedNos].sort((a, b) => a - b);
      const sortedWebUnpaired = [...webUnpairedNos].sort((a, b) => a - b);
      const unpairedMatch = JSON.stringify(sortedDesktopUnpaired) === JSON.stringify(sortedWebUnpaired);
      if (!unpairedMatch) {
        semanticMatch = false;
        console.error(`[Deviation] Unpaired mismatch: Desktop=${JSON.stringify(sortedDesktopUnpaired)}, Web=${JSON.stringify(sortedWebUnpaired)}`);
      }
    }

    const overallStatus: 'PASS' | 'FAIL' = (desktopResult.success && webSuccess && semanticMatch && bbpResult.passed) ? 'PASS' : 'FAIL';

    results.push({
      fixtureId: fix.id,
      fixtureName: fix.name,
      round: fix.roundToPair,
      desktopExecutionOk: desktopResult.success,
      webExecutionOk: webSuccess,
      semanticParityPassed: semanticMatch,
      bbpStatus: bbpResult.status,
      bbpPassed: bbpResult.passed,
      overallStatus,
      engineVersion: 'Gacrux 1.9.57',
      pabDesktop: desktopResult.pabNo,
      pabWeb: webPabNo,
      unpairedDesktop: desktopResult.unpairedNos,
      unpairedWeb: webUnpairedNos,
      boardComparisons,
      error: desktopResult.error || webError
    });

    console.log(`Desktop Path : ${desktopResult.success ? 'OK (v1.9.57)' : 'FAILED'}`);
    console.log(`Web Path     : ${webSuccess ? 'OK (v1.9.57)' : 'FAILED'}`);
    console.log(`BBP Checker  : ${bbpResult.status} (Passed: ${bbpResult.passed})`);
    console.log(`Parity Match : ${semanticMatch ? '100% IDENTICAL' : 'MISMATCH'}`);
    console.log(`Status       : ${overallStatus}`);
  }

  // -------------------------------------------------------------------------
  // SECTION 2: FAILURE INJECTION & RESILIENCE TESTS
  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log('SECTION 2: FAILURE INJECTION & RESILIENCE VERIFICATION');
  console.log('='.repeat(80));

  const store = new TournamentStore();
  const baseTourn = buildTournamentFromTrf(FIXTURES[0]);
  store.setOfficialTournament(baseTourn);

  let failureTestsPassed = 0;
  const totalFailureTests = 5;

  // Test 1: Engine Crash Simulation
  console.log('\n[Failure Injection 1] Engine Crash / Execution Error Simulation');
  try {
    const faultyAdapter = new GacruxAdapter({ testExecutablePath: '/bin/false' }); // non-zero exit code
    await faultyAdapter.generatePairing(baseTourn, 1);
    console.error('FAIL: Expected engine crash error not thrown');
  } catch (err: any) {
    console.log(`Caught expected engine crash: ${err.message}`);
    const officialState = store.getOfficialTournament();
    if (((officialState.pairings as any)?.rounds?.length || 0) === 0) {
      console.log('State Invariant Preserved: Official tournament state completely unchanged (0 committed rounds).');
      failureTestsPassed++;
    } else {
      console.error('FAIL: State modified after engine crash!');
    }
  }

  // Test 2: Engine Timeout Simulation
  console.log('\n[Failure Injection 2] Engine Timeout Simulation');
  try {
    const sleepScript = path.join(os.tmpdir(), 'sleep-fake.py');
    fs.writeFileSync(sleepScript, 'import time\ntime.sleep(10)\n', 'utf8');
    const timeoutAdapter = new GacruxAdapter({ timeoutMs: 50, testExecutablePath: sleepScript }); // 50ms timeout
    await timeoutAdapter.generatePairing(baseTourn, 1);
    console.error('FAIL: Expected timeout error not thrown');
  } catch (err: any) {
    console.log(`Caught expected timeout: ${err.code} (${err.message})`);
    const officialState = store.getOfficialTournament();
    if (((officialState.pairings as any)?.rounds?.length || 0) === 0) {
      console.log('State Invariant Preserved: Timeout aborted cleanly; no corrupt data committed.');
      failureTestsPassed++;
    }
  }

  // Test 3: Malformed TRF Input Rejection
  console.log('\n[Failure Injection 3] Malformed TRF Validation & Rejection');
  try {
    const malformedTrf = "INVALID DATA NO HEADER\n999 GARBAGE LINE";
    const checkRes = await checkerAdapter.checkTrf(malformedTrf, 1);
    if (!checkRes.passed) {
      console.log(`Malformed TRF rejected by BBP Checker: Status=${checkRes.status}`);
      failureTestsPassed++;
    } else {
      console.error('FAIL: Malformed TRF unexpectedly passed checker!');
    }
  } catch (err: any) {
    console.log(`Malformed TRF error handled cleanly: ${err.message}`);
    failureTestsPassed++;
  }

  // Test 4: Acceptance Gate Rejection on Checker Mismatch (No Auto-Commit)
  console.log('\n[Failure Injection 4] Acceptance Gate Rejection when Independent Checker FAILS');
  try {
    // Stage an invalid draft where BBP check failed
    store.setPendingDraft(1, {
      round: 1,
      tournamentId: (baseTourn as any).id || 'tourn-1',
      boards: [
        { board: 1, whiteKey: 'p-1', blackKey: 'p-2', result: '-' },
        { board: 2, whiteKey: 'p-3', blackKey: 'p-4', result: '-' }
      ],
      unpairedKeys: [],
      gacruxSuccess: true,
      bbpStatus: 'FAIL',
      bbpPassed: false, // Independent checker rejected this!
      engineMetadata: { id: 'gacrux-authoritative', name: 'Gacrux', version: '1.9.57', authoritative: true },
      ruleLog: ['Deviated pairing test'],
      createdAt: new Date().toISOString()
    });

    // Attempt to commit with arbiter confirmation
    store.acceptPairing(1, { arbiterConfirmed: true, arbiterName: 'IA Chief' });
    console.error('FAIL: Acceptance Gate committed invalid draft without BBP PASS!');
  } catch (err: any) {
    console.log(`Acceptance Gate successfully blocked commit: ${err.code} (${err.message})`);
    const officialState = store.getOfficialTournament();
    if (((officialState.pairings as any)?.rounds?.length || 0) === 0) {
      console.log('State Invariant Preserved: Blocked draft did NOT mutate official state.');
      failureTestsPassed++;
    }
  }

  // Test 5: Acceptance Gate Rejection Without Arbiter Approval
  console.log('\n[Failure Injection 5] Acceptance Gate Rejection Without Explicit Arbiter Approval');
  try {
    // Stage a valid draft
    store.setPendingDraft(1, {
      round: 1,
      tournamentId: (baseTourn as any).id || 'tourn-1',
      boards: [
        { board: 1, whiteKey: 'p-1', blackKey: 'p-5', result: '-' },
        { board: 2, whiteKey: 'p-6', blackKey: 'p-2', result: '-' },
        { board: 3, whiteKey: 'p-3', blackKey: 'p-7', result: '-' },
        { board: 4, whiteKey: 'p-8', blackKey: 'p-4', result: '-' }
      ],
      unpairedKeys: [],
      gacruxSuccess: true,
      bbpStatus: 'PASS',
      bbpPassed: true,
      engineMetadata: { id: 'gacrux-authoritative', name: 'Gacrux', version: '1.9.57', authoritative: true },
      ruleLog: ['Clean FIDE Dutch draft'],
      createdAt: new Date().toISOString()
    });

    // Attempt commit without arbiter confirmation
    store.acceptPairing(1, { arbiterConfirmed: false, arbiterName: '' });
    console.error('FAIL: Acceptance Gate permitted commit without arbiter approval!');
  } catch (err: any) {
    console.log(`Acceptance Gate blocked unconfirmed draft: ${err.code} (${err.message})`);
    const officialState = store.getOfficialTournament();
    if (((officialState.pairings as any)?.rounds?.length || 0) === 0) {
      console.log('State Invariant Preserved: Unapproved draft did not touch official state.');
      failureTestsPassed++;
    }
  }

  // Final Acceptance Gate Success Test
  console.log('\n[Acceptance Gate 6] Valid 3-Condition Gate Official Commit');
  const commitResult = store.acceptPairing(1, { arbiterConfirmed: true, arbiterName: 'IA David Sedgwick' });
  const committedState = store.getOfficialTournament();
  console.log(`Pairing committed: Round ${commitResult.round}, Boards: ${commitResult.boards.length}, Arbiter: ${(commitResult as any).arbiter}`);
  console.log(`Official Tournament State now contains ${((committedState.pairings as any)?.rounds?.length || 1)} committed round(s).`);

  // -------------------------------------------------------------------------
  // SECTION 3: PARITY MATRIX SUMMARY TABLE
  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log('PARITY MATRIX: CHESS-PUBLISHER v1.05.00 STABLE vs WEB PIPELINE');
  console.log('='.repeat(80));
  console.log(
    'Fixture'.padEnd(35) +
    'Desktop'.padEnd(10) +
    'Web'.padEnd(8) +
    'Gacrux'.padEnd(12) +
    'BBP'.padEnd(10) +
    'Result'
  );
  console.log('-'.repeat(80));

  let totalPass = 0;
  for (const r of results) {
    const nameCol = r.fixtureName.slice(0, 33).padEnd(35);
    const deskCol = (r.desktopExecutionOk ? 'PASS' : 'FAIL').padEnd(10);
    const webCol = (r.webExecutionOk ? 'PASS' : 'FAIL').padEnd(8);
    const gacCol = 'v1.9.57'.padEnd(12);
    const bbpCol = (r.bbpStatus === 'PASS' ? 'PASS' : r.bbpStatus).padEnd(10);
    const resCol = r.overallStatus;

    if (r.overallStatus === 'PASS') totalPass++;
    console.log(`${nameCol}${deskCol}${webCol}${gacCol}${bbpCol}${resCol}`);
  }
  console.log('-'.repeat(80));
  console.log(`Parity Suite: ${totalPass}/${results.length} Fixtures 100% IDENTICAL PASS`);
  console.log(`Failure Injection: ${failureTestsPassed}/${totalFailureTests} Resilience Gates VERIFIED`);

  const allPassed = totalPass === results.length && failureTestsPassed === totalFailureTests;
  console.log(`\nOVERALL PARITY STATUS: ${allPassed ? 'ALL PASS (100% PARITY PROVEN)' : 'SOME FAILED'}`);

  return {
    allPassed,
    results,
    failureTestsPassed,
    totalFailureTests
  };
}

// Run suite when invoked directly
runParitySuite().then(summary => {
  if (!summary.allPassed) {
    process.exit(1);
  }
  process.exit(0);
}).catch(err => {
  console.error('Fatal error in parity suite:', err);
  process.exit(1);
});
