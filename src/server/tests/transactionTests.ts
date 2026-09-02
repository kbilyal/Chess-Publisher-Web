import { TransactionManager } from '../../transactions/TransactionManager';
import { canonicalJsonStringify, computeSha256 } from '../../transactions/hashUtils';
import { calculateResortPreflight, executeResortTransaction } from '../../transactions/resortWorkflow';
import { calculateResetPreflight, executeResetTransaction, executeUndoReset } from '../../transactions/resetWorkflow';
import { calculateTrfImportPreflight, executeTrfImportTransaction } from '../../transactions/trfImportWorkflow';
import { INITIAL_TOURNAMENT_DATA, createInitialEmptyTournament } from '../../data/initialData';
import { Tournament, Player } from '../../types';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

function cloneTournament(t: Tournament): Tournament {
  return JSON.parse(JSON.stringify(t));
}

export async function runAllTransactionTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void> | void) => {
    const start = performance.now();
    try {
      await fn();
      results.push({
        name,
        passed: true,
        message: 'Assertion passed successfully.',
        durationMs: performance.now() - start
      });
    } catch (err: any) {
      results.push({
        name,
        passed: false,
        message: err.message || String(err),
        durationMs: performance.now() - start
      });
    }
  };

  // -------------------------------------------------------------
  // Test 1: Resort successful commit
  // -------------------------------------------------------------
  await runTest('1. Resort successful commit', async () => {
    const tm = new TransactionManager<Tournament>();
    const initial = createInitialEmptyTournament("Resort Test");
    initial.players = [
      { id: 1, localKey: "alice-1", name: "Unrated Alice", rating: 1500, title: "", fed: "BUL", fideId: "1001", birth: "2000", gender: "f", attendance: "present", pairingNumber: 1, joinedFromRound: 1, fideK: 20 },
      { id: 2, localKey: "bob-2", name: "Grandmaster Bob", rating: 2600, title: "GM", fed: "USA", fideId: "1002", birth: "1990", gender: "m", attendance: "present", pairingNumber: 2, joinedFromRound: 1, fideK: 10 },
      { id: 3, localKey: "charlie-3", name: "Master Charlie", rating: 2300, title: "FM", fed: "GER", fideId: "1003", birth: "1995", gender: "m", attendance: "present", pairingNumber: 3, joinedFromRound: 1, fideK: 20 }
    ];
    initial.pairings.liveBoards = {};

    const preflight = calculateResortPreflight(initial);
    if (!preflight.diffReport.canCommitDirectly) throw new Error("Preflight should permit direct resort before Round 1.");
    if (preflight.diffReport.affectedCount !== 3) throw new Error(`Expected 3 players reordered, got ${preflight.diffReport.affectedCount}`);

    const result = await executeResortTransaction(tm, initial, { forceResortConfirmed: false, arbiterNotes: "Pre-round 1 resort" });
    if (!result.success) throw new Error("Transaction must report success: true");
    
    // Check FIDE ordering: GM Bob (2600) -> FM Charlie (2300) -> Alice (1500)
    const resorted = result.tournament.players;
    if (resorted[0].name !== "Grandmaster Bob" || resorted[0].pairingNumber !== 1) {
      throw new Error(`Expected rank 1 to be GM Bob, got ${resorted[0].name}`);
    }
    if (resorted[1].name !== "Master Charlie" || resorted[1].pairingNumber !== 2) {
      throw new Error(`Expected rank 2 to be FM Charlie, got ${resorted[1].name}`);
    }
    if (resorted[2].name !== "Unrated Alice" || resorted[2].pairingNumber !== 3) {
      throw new Error(`Expected rank 3 to be Alice, got ${resorted[2].name}`);
    }
  });

  // -------------------------------------------------------------
  // Test 2: Resort persistence failure -> rollback
  // -------------------------------------------------------------
  await runTest('2. Resort persistence failure -> rollback', async () => {
    const tm = new TransactionManager<Tournament>();
    const initial = cloneTournament(INITIAL_TOURNAMENT_DATA);
    const originalHash = tm.computeHash(initial);

    let caught = false;
    try {
      await executeResortTransaction(
        tm,
        initial,
        { forceResortConfirmed: true, arbiterNotes: "Resort with failing persistence" },
        async () => {
          throw new Error("Disk / network write failed simulated");
        }
      );
    } catch (err: any) {
      caught = true;
      if (!err.message.includes("Disk / network write failed")) {
        throw new Error(`Unexpected error message: ${err.message}`);
      }
    }

    if (!caught) throw new Error("Expected persistence failure to throw");
    
    // Ensure state integrity
    const latest = tm.getCurrentState();
    if (latest && tm.computeHash(latest) !== originalHash) {
      throw new Error("TransactionManager failed to rollback to exact original state on persistence error.");
    }
  });

  // -------------------------------------------------------------
  // Test 3: Resort after Round 1 -> blocked
  // -------------------------------------------------------------
  await runTest('3. Resort after Round 1 -> blocked', async () => {
    const tm = new TransactionManager<Tournament>();
    const initial = cloneTournament(INITIAL_TOURNAMENT_DATA);
    initial.pairings.liveBoards = {
      1: [{ board: 1, whiteKey: "p1", blackKey: "p2", result: "1 - 0" }]
    };
    
    const preflight = calculateResortPreflight(initial);
    if (!preflight.diffReport.hasRoundsStarted) {
      throw new Error("Tournament should be recognized as started (rounds > 0).");
    }
    if (preflight.diffReport.canCommitDirectly) {
      throw new Error("Standard resort must be blocked after Round 1 without force confirmation.");
    }

    let blocked = false;
    try {
      await executeResortTransaction(tm, initial, { forceResortConfirmed: false });
    } catch (err: any) {
      blocked = true;
      if (!err.message.includes("Rounds have already commenced") && !err.message.includes("Force Resort")) {
        throw new Error(`Unexpected block error message: ${err.message}`);
      }
    }

    if (!blocked) throw new Error("executeResortTransaction should have thrown when forceResort is false.");
  });

  // -------------------------------------------------------------
  // Test 4: Force Resort explicit confirmation
  // -------------------------------------------------------------
  await runTest('4. Force Resort explicit confirmation', async () => {
    const tm = new TransactionManager<Tournament>();
    const initial = cloneTournament(INITIAL_TOURNAMENT_DATA);
    initial.pairings.liveBoards = {
      1: [{ board: 1, whiteKey: "p1", blackKey: "p2", result: "1 - 0" }]
    };
    
    // Force resort must succeed when explicit confirmation is passed
    const result = await executeResortTransaction(tm, initial, { forceResortConfirmed: true, arbiterNotes: "Explicit arbiter force resort" });
    if (!result.success) throw new Error("Force resort should successfully commit");
    if (result.tournament.pairings.engine.needsResort !== false) {
      throw new Error("needsResort flag must be cleared upon successful commit");
    }
  });

  // -------------------------------------------------------------
  // Test 5: Reset successful
  // -------------------------------------------------------------
  await runTest('5. Reset successful', async () => {
    const tm = new TransactionManager<Tournament>();
    const initial = cloneTournament(INITIAL_TOURNAMENT_DATA);
    initial.pairings.liveBoards = {
      1: [{ board: 1, whiteKey: "p1", blackKey: "p2", result: "1 - 0" }],
      2: [{ board: 1, whiteKey: "p3", blackKey: "p4", result: "½ - ½" }]
    };

    // Mode: CLEAR_PAIRINGS_ONLY
    const preflight = calculateResetPreflight(initial, 'CLEAR_PAIRINGS_ONLY');
    if (preflight.diffReport.pairingsToDeleteRounds !== 2) {
      throw new Error(`Expected 2 rounds to be deleted, got ${preflight.diffReport.pairingsToDeleteRounds}`);
    }
    if (!preflight.diffReport.playersPreserved) {
      throw new Error("Players should be preserved in CLEAR_PAIRINGS_ONLY mode");
    }

    const result = await executeResetTransaction(tm, initial, 'CLEAR_PAIRINGS_ONLY');
    if (!result.success) throw new Error("Reset transaction must commit successfully");
    if (Object.keys(result.tournament.pairings.liveBoards || {}).length !== 0) {
      throw new Error("All liveBoards must be cleared after reset");
    }
    if (result.tournament.players.length !== initial.players.length) {
      throw new Error("Player count must remain identical in CLEAR_PAIRINGS_ONLY mode");
    }
  });

  // -------------------------------------------------------------
  // Test 6: Reset cancelled -> unchanged
  // -------------------------------------------------------------
  await runTest('6. Reset cancelled -> unchanged', async () => {
    const tm = new TransactionManager<Tournament>();
    const initial = cloneTournament(INITIAL_TOURNAMENT_DATA);
    const originalHash = tm.computeHash(initial);

    // Begin transaction then abort/cancel
    const tx = tm.begin('RESET_TOURNAMENT', initial, { reason: 'Reset intent' });
    const cancelledState = tm.cancelTransaction(tx.transactionId);

    if (tm.computeHash(cancelledState) !== originalHash) {
      throw new Error("Cancelled transaction mutated tournament state!");
    }
    const record = tm.getTransaction(tx.transactionId);
    if (record?.status !== 'CANCELLED') {
      throw new Error("Transaction status should be CANCELLED");
    }
  });

  // -------------------------------------------------------------
  // Test 7: Reset failure -> rollback
  // -------------------------------------------------------------
  await runTest('7. Reset failure -> rollback', async () => {
    const tm = new TransactionManager<Tournament>();
    const initial = cloneTournament(INITIAL_TOURNAMENT_DATA);
    const originalHash = tm.computeHash(initial);

    let caught = false;
    try {
      await executeResetTransaction(
        tm,
        initial,
        'FULL_RESET',
        async () => {
          throw new Error("Database persistence connection lost");
        }
      );
    } catch (err: any) {
      caught = true;
    }

    if (!caught) throw new Error("Persistence error should have thrown");
    const afterRollbackHash = tm.computeHash(tm.getCurrentState() || initial);
    if (afterRollbackHash !== originalHash) {
      throw new Error("Reset transaction failed to restore exact beforeState on failure.");
    }
  });

  // -------------------------------------------------------------
  // Test 8: Undo Reset
  // -------------------------------------------------------------
  await runTest('8. Undo Reset', async () => {
    const tm = new TransactionManager<Tournament>();
    const initial = cloneTournament(INITIAL_TOURNAMENT_DATA);
    const initialHash = tm.computeHash(initial);

    // Perform Full Reset
    await executeResetTransaction(tm, initial, 'FULL_RESET');
    
    // Verify reset took place
    const resetState = tm.getCurrentState()!;
    if (resetState.players.length !== 0) {
      throw new Error("State should be empty after FULL_RESET");
    }

    // Now execute Undo Reset
    const undoResult = await executeUndoReset(tm);
    if (!undoResult.success) {
      throw new Error("Undo Reset transaction should succeed");
    }

    const restoredHash = tm.computeHash(undoResult.tournament);
    if (restoredHash !== initialHash) {
      throw new Error("Undo Reset failed to restore exact initial tournament snapshot!");
    }
  });

  // -------------------------------------------------------------
  // Test 9: Valid TRF import
  // -------------------------------------------------------------
  await runTest('9. Valid TRF import', async () => {
    const tm = new TransactionManager<Tournament>();
    const current = createInitialEmptyTournament("Current Empty");
    
    const sampleTrf = [
      "012 Sofia Open 2026",
      "022 Sofia, Bulgaria",
      "032 BUL",
      "042 2026-05-01",
      "052 2026-05-07",
      "062 12",
      "072 0",
      "082 0",
      "092 Individual: Swiss System",
      "102 IA Nikolay Todorov",
      "122 90 min + 30 sec",
      "001    1 m GM Carlsen Magnus              2850 NOR   1503014 1990-11-30    0.0    1  12 w 1  11 b =   0",
      "001    2 m GM Nakamura Hikaru             2800 USA   2004887 1987-12-09    0.0    2  11 w 1  12 b 1   0",
      "001   11 m IM Test Player A               2400 BUL   2900001 2000-01-01    0.0   11   2 b 0   1 w =   0",
      "001   12 m FM Test Player B               2300 BUL   2900002 2002-02-02    0.0   12   1 b 0   2 w 0   0"
    ].join('\n');

    const preflight = calculateTrfImportPreflight(current, sampleTrf);
    if (!preflight.valid) {
      throw new Error(`TRF should be valid. Errors: ${preflight.conflictReport.validationErrors.join(', ')}`);
    }
    if (preflight.conflictReport.addedPlayers.length !== 4) {
      throw new Error(`Expected 4 added players, got ${preflight.conflictReport.addedPlayers.length}`);
    }

    const result = await executeTrfImportTransaction(tm, current, sampleTrf);
    if (!result.success) throw new Error("TRF import should succeed");
    if (result.tournament.name !== "Sofia Open 2026") {
      throw new Error(`Expected tournament name "Sofia Open 2026", got "${result.tournament.name}"`);
    }
    if (result.tournament.players.length !== 4) {
      throw new Error(`Expected 4 players in imported tournament, got ${result.tournament.players.length}`);
    }
  });

  // -------------------------------------------------------------
  // Test 10: Invalid TRF -> unchanged
  // -------------------------------------------------------------
  await runTest('10. Invalid TRF -> unchanged', async () => {
    const tm = new TransactionManager<Tournament>();
    const current = cloneTournament(INITIAL_TOURNAMENT_DATA);
    const initialHash = tm.computeHash(current);

    const corruptTrf = "NOT_A_VALID_TRF_FILE\nSOME_CORRUPT_DATA";

    const preflight = calculateTrfImportPreflight(current, corruptTrf);
    if (preflight.valid) {
      throw new Error("Corrupted TRF text should fail validation");
    }

    let threw = false;
    try {
      await executeTrfImportTransaction(tm, current, corruptTrf);
    } catch (err) {
      threw = true;
    }

    if (!threw) throw new Error("executeTrfImportTransaction must reject invalid TRF");
    if (tm.computeHash(current) !== initialHash) {
      throw new Error("Invalid TRF attempt corrupted tournament state!");
    }
  });

  // -------------------------------------------------------------
  // Test 11: TRF conflict cancelled -> unchanged
  // -------------------------------------------------------------
  await runTest('11. TRF conflict cancelled -> unchanged', async () => {
    const tm = new TransactionManager<Tournament>();
    const current = cloneTournament(INITIAL_TOURNAMENT_DATA);
    const initialHash = tm.computeHash(current);

    const tx = tm.begin('IMPORT_TRF', current, { reason: 'Arbiter inspecting conflict preview' });
    // Arbiter reviews conflict report in UI and clicks "Cancel"
    const rolledBack = tm.cancelTransaction(tx.transactionId);

    if (tm.computeHash(rolledBack) !== initialHash) {
      throw new Error("Cancelling TRF conflict preview altered tournament state.");
    }
  });

  // -------------------------------------------------------------
  // Test 12: Import persistence failure -> rollback
  // -------------------------------------------------------------
  await runTest('12. Import persistence failure -> rollback', async () => {
    const tm = new TransactionManager<Tournament>();
    const current = cloneTournament(INITIAL_TOURNAMENT_DATA);
    const initialHash = tm.computeHash(current);

    const sampleTrf = [
      "012 Imported Open",
      "001    1 m GM Topalov Veselin             2750 BUL   2900010 1975-03-15    0.0    1",
      "001    2 m GM Anand Viswanathan           2750 IND   5000017 1969-12-11    0.0    2"
    ].join('\n');

    let threw = false;
    try {
      await executeTrfImportTransaction(
        tm,
        current,
        sampleTrf,
        async () => {
          throw new Error("IndexedDB quota exceeded");
        }
      );
    } catch (err: any) {
      threw = true;
    }

    if (!threw) throw new Error("Persistence error should have thrown");
    const latest = tm.getCurrentState() || current;
    if (tm.computeHash(latest) !== initialHash) {
      throw new Error("Rollback on import persistence failure did not restore previous state.");
    }
  });

  // -------------------------------------------------------------
  // Test 13: Snapshot hash integrity
  // -------------------------------------------------------------
  await runTest('13. Snapshot hash integrity', async () => {
    const objA = { name: "Tournament", rounds: 5, active: true, list: [1, 2, 3] };
    const objB = { list: [1, 2, 3], active: true, name: "Tournament", rounds: 5 }; // Same keys, different insertion order

    const canonicalA = canonicalJsonStringify(objA);
    const canonicalB = canonicalJsonStringify(objB);

    if (canonicalA !== canonicalB) {
      throw new Error(`Canonical stringify failed order-invariance: "${canonicalA}" vs "${canonicalB}"`);
    }

    const hashA = computeSha256(canonicalA);
    const hashB = computeSha256(canonicalB);

    if (hashA !== hashB) {
      throw new Error(`Hash mismatch for identical semantic states: ${hashA} vs ${hashB}`);
    }

    // Mutate property and verify hash changes
    const objC = { ...objA, rounds: 6 };
    const hashC = computeSha256(canonicalJsonStringify(objC));
    if (hashA === hashC) {
      throw new Error("Hash collision on mutated object!");
    }
  });

  // -------------------------------------------------------------
  // Test 14: Pairings/results remain unchanged when operation is cancelled
  // -------------------------------------------------------------
  await runTest('14. Pairings/results remain unchanged when operation is cancelled', async () => {
    const tm = new TransactionManager<Tournament>();
    const initial = cloneTournament(INITIAL_TOURNAMENT_DATA);
    const beforeLiveBoards = JSON.stringify(initial.pairings.liveBoards);
    const beforeStandingsHash = computeSha256(canonicalJsonStringify(initial.players));

    // Open resort transaction
    const tx = tm.begin('RESORT_STARTING_LIST', initial, { reason: 'Trial resort' });
    
    // Simulate candidate mutation in preview
    const mutated = cloneTournament(initial);
    mutated.players.reverse();
    mutated.pairings.liveBoards = {}; // Simulate accidental wipe
    tm.setPreview(tx.transactionId, mutated, { staged: true });

    // Arbiter cancels
    const stateAfterCancel = tm.cancelTransaction(tx.transactionId);

    const afterLiveBoards = JSON.stringify(stateAfterCancel.pairings.liveBoards);
    const afterStandingsHash = computeSha256(canonicalJsonStringify(stateAfterCancel.players));

    if (beforeLiveBoards !== afterLiveBoards) {
      throw new Error("Live boards were corrupted by cancelled transaction!");
    }
    if (beforeStandingsHash !== afterStandingsHash) {
      throw new Error("Player data was corrupted by cancelled transaction!");
    }
  });

  return results;
}
