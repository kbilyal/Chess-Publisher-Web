import { Tournament, BoardPairing, GameResult } from '../../types';
import { INITIAL_TOURNAMENT_DATA } from '../../data/initialData';
import { 
  validateBoardHardInvariants, 
  getRoundLifecycleState
} from '../../engine/roundEntryValidator';
import { executeFinalizeRoundTransaction } from '../../transactions/finalizeRoundWorkflow';
import { executeUnlockRoundTransaction } from '../../transactions/unlockRoundWorkflow';
import { calculateTournamentStandings } from '../../engine/tiebreaks';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

function createMockTournament(numPlayers: number = 6): Tournament {
  const t: Tournament = JSON.parse(JSON.stringify(INITIAL_TOURNAMENT_DATA));
  t.players = t.players.slice(0, numPlayers);
  t.players.forEach((p, idx) => {
    p.pairingNumber = idx + 1;
    p.id = idx + 1;
    p.localKey = `player_${idx + 1}`;
  });
  t.pairings = {
    ...t.pairings,
    liveBoards: {},
    finalizedRounds: {},
    roundStatus: {},
    finalizedAt: {},
    finalizedBy: {},
    finalizedSnapshots: {}
  };
  return t;
}

export async function runAllRoundFinalizationTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void> | void) => {
    const t0 = performance.now();
    try {
      await fn();
      results.push({
        name,
        passed: true,
        message: 'Passed as expected',
        durationMs: performance.now() - t0
      });
    } catch (err: any) {
      results.push({
        name,
        passed: false,
        message: err.message || String(err),
        durationMs: performance.now() - t0
      });
    }
  };

  // -------------------------------------------------------------
  // GROUP 1: Invariant Validation for Normal Games (Tests 1-6)
  // -------------------------------------------------------------
  await runTest('1. validateBoardHardInvariants: normal game with result "1 - 0" is VALID', () => {
    const board: BoardPairing = { board: 1, whiteKey: 'p1', blackKey: 'p2', result: '1 - 0', entryType: 'NORMAL_GAME' };
    const res = validateBoardHardInvariants(board);
    if (!res.valid) throw new Error(`Expected valid, got: ${res.error}`);
  });

  await runTest('2. validateBoardHardInvariants: normal game with result "0 - 1" is VALID', () => {
    const board: BoardPairing = { board: 1, whiteKey: 'p1', blackKey: 'p2', result: '0 - 1', entryType: 'NORMAL_GAME' };
    const res = validateBoardHardInvariants(board);
    if (!res.valid) throw new Error(`Expected valid, got: ${res.error}`);
  });

  await runTest('3. validateBoardHardInvariants: normal game with result "½ - ½" is VALID', () => {
    const board: BoardPairing = { board: 1, whiteKey: 'p1', blackKey: 'p2', result: '½ - ½', entryType: 'NORMAL_GAME' };
    const res = validateBoardHardInvariants(board);
    if (!res.valid) throw new Error(`Expected valid, got: ${res.error}`);
  });

  await runTest('4. validateBoardHardInvariants: normal game with forfeit "1F - 0F" is VALID', () => {
    const board: BoardPairing = { board: 1, whiteKey: 'p1', blackKey: 'p2', result: '1F - 0F', entryType: 'NORMAL_GAME' };
    const res = validateBoardHardInvariants(board);
    if (!res.valid) throw new Error(`Expected valid, got: ${res.error}`);
  });

  await runTest('5. validateBoardHardInvariants: normal game with forfeit "0F - 1F" is VALID', () => {
    const board: BoardPairing = { board: 1, whiteKey: 'p1', blackKey: 'p2', result: '0F - 1F', entryType: 'NORMAL_GAME' };
    const res = validateBoardHardInvariants(board);
    if (!res.valid) throw new Error(`Expected valid, got: ${res.error}`);
  });

  await runTest('6. validateBoardHardInvariants: normal game with pending result "-" is VALID', () => {
    const board: BoardPairing = { board: 1, whiteKey: 'p1', blackKey: 'p2', result: '-', entryType: 'NORMAL_GAME' };
    const res = validateBoardHardInvariants(board);
    if (!res.valid) throw new Error(`Expected valid, got: ${res.error}`);
  });

  // -------------------------------------------------------------
  // GROUP 2: Invariant Rejection of Corrupted Bye Results (Tests 7-11)
  // -------------------------------------------------------------
  await runTest('7. validateBoardHardInvariants: rejects PAB with played result "1 - 0"', () => {
    const board: BoardPairing = { board: 4, whiteKey: 'p1', blackKey: '', result: '1 - 0', entryType: 'PAB' };
    const res = validateBoardHardInvariants(board);
    if (res.valid) throw new Error('Expected invalidation for PAB having played result "1 - 0"');
  });

  await runTest('8. validateBoardHardInvariants: rejects PAB with played result "0 - 1"', () => {
    const board: BoardPairing = { board: 4, whiteKey: 'p1', blackKey: '', result: '0 - 1', entryType: 'PAB' };
    const res = validateBoardHardInvariants(board);
    if (res.valid) throw new Error('Expected invalidation for PAB having played result "0 - 1"');
  });

  await runTest('9. validateBoardHardInvariants: rejects PAB with played result "½ - ½"', () => {
    const board: BoardPairing = { board: 4, whiteKey: 'p1', blackKey: '', result: '½ - ½', entryType: 'PAB' };
    const res = validateBoardHardInvariants(board);
    if (res.valid) throw new Error('Expected invalidation for PAB having played result "½ - ½"');
  });

  await runTest('10. validateBoardHardInvariants: rejects REQUESTED_BYE with played result "0 - 1"', () => {
    const board: BoardPairing = { board: 4, whiteKey: 'p1', blackKey: '', result: '0 - 1', entryType: 'REQUESTED_BYE' };
    const res = validateBoardHardInvariants(board);
    if (res.valid) throw new Error('Expected invalidation for REQUESTED_BYE having played result "0 - 1"');
  });

  await runTest('11. validateBoardHardInvariants: rejects UNPAIRED entry with played result "1 - 0"', () => {
    const board: BoardPairing = { board: 4, whiteKey: 'p1', blackKey: '', result: '1 - 0', entryType: 'UNPAIRED' };
    const res = validateBoardHardInvariants(board);
    if (res.valid) throw new Error('Expected invalidation for UNPAIRED having played result "1 - 0"');
  });

  // -------------------------------------------------------------
  // GROUP 3: Administrative Entry Acceptance (Tests 12-14)
  // -------------------------------------------------------------
  await runTest('12. validateBoardHardInvariants: accepts PAB with "PAB" and "-" result codes', () => {
    const b1: BoardPairing = { board: 4, whiteKey: 'p1', blackKey: '', result: 'PAB', entryType: 'PAB', pabPoints: 1.0 };
    const b2: BoardPairing = { board: 4, whiteKey: 'p1', blackKey: '', result: '-', entryType: 'PAB', pabPoints: 1.0 };
    const res1 = validateBoardHardInvariants(b1);
    const res2 = validateBoardHardInvariants(b2);
    if (!res1.valid || !res2.valid) throw new Error('Expected valid PAB entries');
  });

  await runTest('13. validateBoardHardInvariants: accepts REQUESTED_BYE with "½ BYE" and "1 BYE" result codes', () => {
    const b1: BoardPairing = { board: 4, whiteKey: 'p1', blackKey: '', result: '½ BYE', entryType: 'REQUESTED_BYE', byePoints: 0.5 };
    const b2: BoardPairing = { board: 4, whiteKey: 'p1', blackKey: '', result: '1 BYE', entryType: 'REQUESTED_BYE', byePoints: 1.0 };
    const res1 = validateBoardHardInvariants(b1);
    const res2 = validateBoardHardInvariants(b2);
    if (!res1.valid || !res2.valid) throw new Error('Expected valid REQUESTED_BYE entries');
  });

  await runTest('14. validateBoardHardInvariants: accepts ZERO_POINT_BYE with "0 BYE" result code', () => {
    const b1: BoardPairing = { board: 4, whiteKey: 'p1', blackKey: '', result: '0 BYE', entryType: 'ZERO_POINT_BYE', byePoints: 0.0 };
    const b2: BoardPairing = { board: 4, whiteKey: 'p1', blackKey: '', result: '-', entryType: 'ZERO_POINT_BYE', byePoints: 0.0 };
    const res1 = validateBoardHardInvariants(b1);
    const res2 = validateBoardHardInvariants(b2);
    if (!res1.valid || !res2.valid) throw new Error('Expected valid ZERO_POINT_BYE entries');
  });

  // -------------------------------------------------------------
  // GROUP 4: Round Lifecycle State Machine (Tests 15-22)
  // -------------------------------------------------------------
  await runTest('15. getRoundLifecycleState: returns ROUND_ACTIVE when boards have pending results', () => {
    const t = createMockTournament();
    t.pairings.liveBoards['1'] = [
      { board: 1, whiteKey: 'player_1', blackKey: 'player_2', result: '1 - 0', entryType: 'NORMAL_GAME' },
      { board: 2, whiteKey: 'player_3', blackKey: 'player_4', result: '-', entryType: 'NORMAL_GAME' },
      { board: 3, whiteKey: 'player_5', blackKey: '', result: 'PAB', entryType: 'PAB', pabPoints: 1.0 }
    ];
    const state = getRoundLifecycleState(t, 1);
    if (state.status !== 'ROUND_ACTIVE') throw new Error(`Expected ROUND_ACTIVE, got ${state.status}`);
    if (state.isComplete) throw new Error('Expected isComplete = false');
  });

  await runTest('16. getRoundLifecycleState: returns ALL_RESULTS_ENTERED when all games have outcomes', () => {
    const t = createMockTournament();
    t.pairings.liveBoards['1'] = [
      { board: 1, whiteKey: 'player_1', blackKey: 'player_2', result: '1 - 0', entryType: 'NORMAL_GAME' },
      { board: 2, whiteKey: 'player_3', blackKey: 'player_4', result: '½ - ½', entryType: 'NORMAL_GAME' },
      { board: 3, whiteKey: 'player_5', blackKey: '', result: 'PAB', entryType: 'PAB', pabPoints: 1.0 }
    ];
    const state = getRoundLifecycleState(t, 1);
    if (state.status !== 'ALL_RESULTS_ENTERED') throw new Error(`Expected ALL_RESULTS_ENTERED, got ${state.status}`);
    if (!state.isComplete) throw new Error('Expected isComplete = true');
  });

  await runTest('17. getRoundLifecycleState: returns RESULTS_FINALIZED when round in finalizedRounds', () => {
    const t = createMockTournament();
    t.pairings.liveBoards['1'] = [
      { board: 1, whiteKey: 'player_1', blackKey: 'player_2', result: '1 - 0', entryType: 'NORMAL_GAME' }
    ];
    t.pairings.finalizedRounds = { '1': true };
    t.pairings.roundStatus = { '1': 'RESULTS_FINALIZED' };
    const state = getRoundLifecycleState(t, 1);
    if (state.status !== 'RESULTS_FINALIZED') throw new Error(`Expected RESULTS_FINALIZED, got ${state.status}`);
    if (!state.isFinalized) throw new Error('Expected isFinalized = true');
  });

  await runTest('18. getRoundLifecycleState: canFinalize is TRUE only when ALL_RESULTS_ENTERED', () => {
    const t = createMockTournament();
    t.pairings.liveBoards['1'] = [
      { board: 1, whiteKey: 'player_1', blackKey: 'player_2', result: '1 - 0', entryType: 'NORMAL_GAME' }
    ];
    const state = getRoundLifecycleState(t, 1);
    if (!state.canFinalize) throw new Error('Expected canFinalize = true');
  });

  await runTest('19. getRoundLifecycleState: canFinalize is FALSE when results are missing', () => {
    const t = createMockTournament();
    t.pairings.liveBoards['1'] = [
      { board: 1, whiteKey: 'player_1', blackKey: 'player_2', result: '-', entryType: 'NORMAL_GAME' }
    ];
    const state = getRoundLifecycleState(t, 1);
    if (state.canFinalize) throw new Error('Expected canFinalize = false');
  });

  await runTest('20. getRoundLifecycleState: canFinalize is FALSE when round is already finalized', () => {
    const t = createMockTournament();
    t.pairings.liveBoards['1'] = [
      { board: 1, whiteKey: 'player_1', blackKey: 'player_2', result: '1 - 0', entryType: 'NORMAL_GAME' }
    ];
    t.pairings.finalizedRounds = { '1': true };
    t.pairings.roundStatus = { '1': 'RESULTS_FINALIZED' };
    const state = getRoundLifecycleState(t, 1);
    if (state.canFinalize) throw new Error('Expected canFinalize = false for already finalized round');
  });

  await runTest('21. getRoundLifecycleState: canGenerateNext is FALSE when latest round is not finalized', () => {
    const t = createMockTournament();
    t.pairings.liveBoards['1'] = [
      { board: 1, whiteKey: 'player_1', blackKey: 'player_2', result: '1 - 0', entryType: 'NORMAL_GAME' }
    ];
    const state = getRoundLifecycleState(t, 1);
    if (state.canGenerateNext) throw new Error('Expected canGenerateNext = false when round is unfinalized');
  });

  await runTest('22. getRoundLifecycleState: canGenerateNext is TRUE when latest round is finalized', () => {
    const t = createMockTournament();
    t.pairings.liveBoards['1'] = [
      { board: 1, whiteKey: 'player_1', blackKey: 'player_2', result: '1 - 0', entryType: 'NORMAL_GAME' }
    ];
    t.pairings.finalizedRounds = { '1': true };
    t.pairings.roundStatus = { '1': 'RESULTS_FINALIZED' };
    const state = getRoundLifecycleState(t, 1);
    if (!state.canGenerateNext) throw new Error('Expected canGenerateNext = true when round is finalized');
  });

  // -------------------------------------------------------------
  // GROUP 5: Finalization Transaction Workflow (Tests 23-27)
  // -------------------------------------------------------------
  await runTest('23. Finalize workflow creates state snapshot before committing', async () => {
    const t = createMockTournament();
    t.pairings.liveBoards['1'] = [
      { board: 1, whiteKey: 'player_1', blackKey: 'player_2', result: '1 - 0', entryType: 'NORMAL_GAME' }
    ];
    const tx = await executeFinalizeRoundTransaction(t, 1, { arbiterName: 'Test Arbiter' });
    if (!tx.transactionId || !tx.snapshotHash) throw new Error('Expected transactionId and snapshotHash in result');
  });

  await runTest('24. Finalize workflow rejects finalization when round has unplayed boards ("-")', async () => {
    const t = createMockTournament();
    t.pairings.liveBoards['1'] = [
      { board: 1, whiteKey: 'player_1', blackKey: 'player_2', result: '-', entryType: 'NORMAL_GAME' }
    ];
    let threw = false;
    try {
      await executeFinalizeRoundTransaction(t, 1, { arbiterName: 'Test Arbiter' });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected transaction rejection for pending round results');
  });

  await runTest('25. Finalize workflow rejects finalization when round has corrupted bye results ("0 - 1")', async () => {
    const t = createMockTournament();
    t.pairings.liveBoards['1'] = [
      { board: 1, whiteKey: 'player_1', blackKey: 'player_2', result: '1 - 0', entryType: 'NORMAL_GAME' },
      { board: 2, whiteKey: 'player_3', blackKey: '', result: '0 - 1', entryType: 'PAB' }
    ];
    let threw = false;
    try {
      await executeFinalizeRoundTransaction(t, 1, { arbiterName: 'Test Arbiter' });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected transaction rejection for corrupted bye board');
  });

  await runTest('26. Finalize workflow commits state, sets roundStatus and finalizedRounds', async () => {
    const t = createMockTournament();
    t.pairings.liveBoards['1'] = [
      { board: 1, whiteKey: 'player_1', blackKey: 'player_2', result: '1 - 0', entryType: 'NORMAL_GAME' },
      { board: 2, whiteKey: 'player_3', blackKey: 'player_4', result: '0 - 1', entryType: 'NORMAL_GAME' },
      { board: 3, whiteKey: 'player_5', blackKey: '', result: 'PAB', entryType: 'PAB', pabPoints: 1.0 }
    ];
    const tx = await executeFinalizeRoundTransaction(t, 1, { arbiterName: 'Chief Arbiter' });
    if (!tx.tournament.pairings.finalizedRounds?.['1']) {
      throw new Error('Expected round 1 in finalizedRounds record');
    }
    if (tx.tournament.pairings.roundStatus?.['1'] !== 'RESULTS_FINALIZED') {
      throw new Error(`Expected roundStatus 1 = RESULTS_FINALIZED, got ${tx.tournament.pairings.roundStatus?.['1']}`);
    }
  });

  await runTest('27. Finalize workflow recalculates standings and tie-breaks accurately', async () => {
    const t = createMockTournament();
    t.pairings.liveBoards['1'] = [
      { board: 1, whiteKey: 'player_1', blackKey: 'player_2', result: '1 - 0', entryType: 'NORMAL_GAME' },
      { board: 2, whiteKey: 'player_3', blackKey: 'player_4', result: '½ - ½', entryType: 'NORMAL_GAME' },
      { board: 3, whiteKey: 'player_5', blackKey: '', result: 'PAB', entryType: 'PAB', pabPoints: 1.0 }
    ];
    const standings = calculateTournamentStandings(t);
    const p1 = standings.players.find(p => p.key === 'player_1');
    const p2 = standings.players.find(p => p.key === 'player_2');
    const p5 = standings.players.find(p => p.key === 'player_5');

    if (p1?.score !== 1.0) throw new Error(`Expected player 1 score = 1.0, got ${p1?.score}`);
    if (p2?.score !== 0.0) throw new Error(`Expected player 2 score = 0.0, got ${p2?.score}`);
    if (p5?.score !== 1.0) throw new Error(`Expected player 5 (PAB) score = 1.0, got ${p5?.score}`);
  });

  // -------------------------------------------------------------
  // GROUP 6: Unlock Workflow & Dependency Blocking (Tests 28-30)
  // -------------------------------------------------------------
  await runTest('28. Unlock workflow permits unlocking latest finalized round with arbiter confirmation', async () => {
    const t = createMockTournament();
    t.pairings.liveBoards['1'] = [
      { board: 1, whiteKey: 'player_1', blackKey: 'player_2', result: '1 - 0', entryType: 'NORMAL_GAME' }
    ];
    t.pairings.finalizedRounds = { '1': true };
    t.pairings.roundStatus = { '1': 'RESULTS_FINALIZED' };

    const unlockResult = await executeUnlockRoundTransaction(t, 1, {
      arbiterConfirmed: true,
      arbiterName: 'Chief Arbiter'
    });

    if (unlockResult.blocked) throw new Error(`Expected unlock allowed, was blocked: ${unlockResult.message}`);
    if (unlockResult.tournament?.pairings.finalizedRounds?.['1']) {
      throw new Error('Expected round 1 marked false in finalizedRounds');
    }
  });

  await runTest('29. Unlock workflow rejects unlocking when arbiter confirmation is missing', async () => {
    const t = createMockTournament();
    t.pairings.liveBoards['1'] = [
      { board: 1, whiteKey: 'player_1', blackKey: 'player_2', result: '1 - 0', entryType: 'NORMAL_GAME' }
    ];
    t.pairings.finalizedRounds = { '1': true };
    t.pairings.roundStatus = { '1': 'RESULTS_FINALIZED' };

    const unlockResult = await executeUnlockRoundTransaction(t, 1, {
      arbiterConfirmed: false,
      arbiterName: 'Chief Arbiter'
    });

    if (unlockResult.success || !unlockResult.blocked) {
      throw new Error('Expected unlock rejection when arbiter confirmation is omitted');
    }
  });

  await runTest('30. Unlock workflow HARD BLOCKS unlocking an earlier round when dependent rounds exist', async () => {
    const t = createMockTournament();
    t.pairings.liveBoards['1'] = [
      { board: 1, whiteKey: 'player_1', blackKey: 'player_2', result: '1 - 0', entryType: 'NORMAL_GAME' }
    ];
    t.pairings.liveBoards['2'] = [
      { board: 1, whiteKey: 'player_1', blackKey: 'player_3', result: '1 - 0', entryType: 'NORMAL_GAME' }
    ];
    t.pairings.finalizedRounds = { '1': true, '2': true };
    t.pairings.roundStatus = { '1': 'RESULTS_FINALIZED', '2': 'RESULTS_FINALIZED' };

    const unlockResult = await executeUnlockRoundTransaction(t, 1, {
      arbiterConfirmed: true,
      arbiterName: 'Chief Arbiter'
    });

    if (!unlockResult.blocked) {
      throw new Error('Expected unlock of Round 1 to be HARD BLOCKED because Round 2 exists and depends on it');
    }
  });

  return results;
}
