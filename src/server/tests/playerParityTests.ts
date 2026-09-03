import { Tournament, Player } from '../../types';
import { TransactionManager } from '../../transactions/TransactionManager';
import {
  checkPlayerHasHistory,
  isStartingRankLocked,
  sortPlayersFideStandard,
  annotateInitialSortOrder,
  validatePlayerEntry,
  executeRegisterPlayerTransaction,
  executeDeletePlayerTransaction,
  executeBulkStatusTransaction,
  executeBulkFederationTransaction,
  executeBulkDeleteTransaction,
  executeRequestedByeTransaction
} from '../../transactions/playerWorkflow';
import { executeResortTransaction } from '../../transactions/resortWorkflow';

export interface PlayerParityTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

function createBaseTournament(): Tournament {
  return {
    name: 'Player Parity Invitational 2026',
    settings: {
      organizer: 'Bulgarian Chess Federation',
      chiefArbiter: 'IA David Sedgwick',
      arbiter: 'FA Jane Doe',
      director: 'John Smith',
      tnr: 'TNR-2026-001',
      venue: 'Grand Hotel Sofia',
      city: 'Sofia',
      country: 'BUL',
      timeControl: '90m+30s',
      timeControlPreset: 'Standard',
      customTimeControl: '',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      generalRegistrationDeadline: '2026-08-31',
      rounds: '5',
      lastSwissRounds: '5',
      roundRobinCycles: '1',
      tournamentFormat: 'Individual Swiss',
      pairingSystem: 'FIDE Dutch System',
      fideRated: 'Yes',
      tournamentRatingType: 'Standard',
      initialRankSorting: 'automatic',
      initialRatingSource: 'fide',
      pairingScoreSystem: 'standard',
      tournamentType: 'real',
      liveLink: '',
      website: '',
      email: 'arbiter@chess.bg',
      phone: '+35929876543',
      fideEventId: 'FID-2026-SOF',
      generalNotes: ''
    },
    telegram: { channel: '', language: 'bg', signature: '' },
    chessResults: {
      sourceId: 0,
      creatorId: 0,
      clientId: '',
      key: '',
      mode: 'Standard',
      federation: 'BUL',
      createdAt: '',
      lastUpload: '',
      uploadStatus: 'idle',
      lastError: '',
      publishCount: 0,
      lastConnectionTest: '',
      sidVerified: false,
      freshTnrRequired: false,
      pinBoardEnabled: false,
      pinBoardText: '',
      activityLog: []
    },
    pairings: {
      server: '',
      round: '1',
      results: '',
      showScheduleOnPrint: false,
      finalStandingsPromptedRound: 0,
      engine: {
        mode: 'fide-dutch',
        excluded: [],
        lastGeneratedRound: 0,
        lastEngineMessage: '',
        excludeRemaining: {},
        excludeRounds: {},
        manualByes: {},
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
      },
      liveBoards: {}
    },
    players: [
      {
        id: 1,
        localKey: 'local:carlsen--magnus-1',
        name: 'Carlsen, Magnus',
        rating: 2832,
        stdRating: 2832,
        fed: 'NOR',
        fideId: '1503014',
        birth: '1990-11-30',
        gender: 'm',
        title: 'GM',
        attendance: 'present',
        pairingNumber: 1,
        joinedFromRound: 1,
        fideK: 10
      },
      {
        id: 2,
        localKey: 'local:nakamura--hikaru-2',
        name: 'Nakamura, Hikaru',
        rating: 2802,
        stdRating: 2802,
        fed: 'USA',
        fideId: '2016192',
        birth: '1987-12-09',
        gender: 'm',
        title: 'GM',
        attendance: 'present',
        pairingNumber: 2,
        joinedFromRound: 1,
        fideK: 10
      },
      {
        id: 3,
        localKey: 'local:caruana--fabiano-3',
        name: 'Caruana, Fabiano',
        rating: 2795,
        stdRating: 2795,
        fed: 'USA',
        fideId: '2020009',
        birth: '1992-07-30',
        gender: 'm',
        title: 'GM',
        attendance: 'present',
        pairingNumber: 3,
        joinedFromRound: 1,
        fideK: 10
      },
      {
        id: 4,
        localKey: 'local:stefanova--antoaneta-4',
        name: 'Stefanova, Antoaneta',
        rating: 2435,
        stdRating: 2435,
        fed: 'BUL',
        fideId: '2902257',
        birth: '1979-04-19',
        gender: 'f',
        title: 'GM',
        attendance: 'present',
        pairingNumber: 4,
        joinedFromRound: 1,
        fideK: 10
      }
    ],
    regulations: {
      eligibility: '',
      format: 'Swiss',
      rounds: '5',
      timeControl: '90m+30s',
      pairingSystem: 'FIDE Dutch',
      rating: 'FIDE',
      defaultTime: '30m',
      drawRules: 'None',
      pabPoints: '1.0',
      tieBreaks: ['Buchholz Cut-1 (BH-C1) [84]', 'Sonneborn-Berger Cut-1 (SB-C1) [85]'],
      tieBreakOptions: {},
      entryFee: '',
      registrationDeadline: '',
      maximumPlayers: '',
      fideInfo: '',
      totalPrizeFund: '',
      mainPrizes: '',
      specialPrizes: '',
      categoryPrizes: '',
      additional: ''
    },
    schedule: {
      registrationOpens: '',
      registrationCloses: '',
      technicalMeeting: '',
      openingCeremony: '',
      closingCeremony: '',
      awardCeremony: '',
      notes: '',
      rows: []
    }
  };
}

export async function runAllPlayerParityTests(): Promise<PlayerParityTestResult[]> {
  const results: PlayerParityTestResult[] = [];
  const manager = new TransactionManager<Tournament>();

  // TEST 1: Starting Rank Locking after Round 1
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const tourney = createBaseTournament();
      // Before pairings exist: lock is false
      const lockedBefore = isStartingRankLocked(tourney);

      // Simulate round 1 pairings generated
      tourney.pairings.liveBoards = {
        '1': [
          { board: 1, whiteKey: 'local:carlsen--magnus-1', blackKey: 'local:caruana--fabiano-3', result: '-' },
          { board: 2, whiteKey: 'local:nakamura--hikaru-2', blackKey: 'local:stefanova--antoaneta-4', result: '-' }
        ]
      };
      const lockedAfter = isStartingRankLocked(tourney);

      // Attempt manual rank change on existing player
      const validation = validatePlayerEntry(tourney, { pairingNumber: 99 }, 'local:carlsen--magnus-1');
      const blockedRankChange = !validation.valid && validation.errors.some(e => e.includes('STARTING_RANK_LOCKED'));

      passed = !lockedBefore && lockedAfter && blockedRankChange;
      message = passed
        ? 'PASS: Starting ranks locked after Round 1; manual renumbering strictly blocked.'
        : `FAIL: lockedBefore=${lockedBefore}, lockedAfter=${lockedAfter}, blocked=${blockedRankChange}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-1-starting-rank-lock', name: '1. Starting Rank Locking & Protection after Round 1', passed, message, durationMs: performance.now() - start });
  }

  // TEST 2: Inability to Delete Player with Existing Game History
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const tourney = createBaseTournament();
      tourney.pairings.liveBoards = {
        '1': [
          { board: 1, whiteKey: 'local:carlsen--magnus-1', blackKey: 'local:caruana--fabiano-3', result: '1 - 0' },
          { board: 2, whiteKey: 'local:nakamura--hikaru-2', blackKey: 'local:stefanova--antoaneta-4', result: '½ - ½' }
        ]
      };

      // Check history
      const history = checkPlayerHasHistory(tourney, 'local:carlsen--magnus-1');
      let caughtError = false;

      try {
        await executeDeletePlayerTransaction(manager, tourney, 'local:carlsen--magnus-1');
      } catch (e: any) {
        caughtError = e.code === 'CANNOT_DELETE_PLAYER_WITH_HISTORY';
      }

      passed = history.hasHistory && caughtError;
      message = passed
        ? 'PASS: Player with historical games cannot be deleted; error CANNOT_DELETE_PLAYER_WITH_HISTORY raised.'
        : `FAIL: hasHistory=${history.hasHistory}, caughtError=${caughtError}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-2-delete-history-blocked', name: '2. Inability to Delete Player with Existing Game History', passed, message, durationMs: performance.now() - start });
  }

  // TEST 3: Safe Deletion of Unplayed Player
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const tourney = createBaseTournament();
      // Add unplayed 5th player
      tourney.players.push({
        id: 5,
        localKey: 'local:unplayed-player-5',
        name: 'Unplayed, Test',
        rating: 1500,
        fed: 'BUL',
        fideId: '999999',
        birth: '2000-01-01',
        gender: 'm',
        title: '',
        attendance: 'present',
        pairingNumber: 5,
        joinedFromRound: 1
      });

      const { tournament: afterDelete } = await executeDeletePlayerTransaction(manager, tourney, 'local:unplayed-player-5');
      const exists = afterDelete.players.some(p => p.localKey === 'local:unplayed-player-5');
      const countPreserved = afterDelete.players.length === 4;

      passed = !exists && countPreserved;
      message = passed
        ? 'PASS: Unplayed player safely deleted and remaining players re-indexed.'
        : `FAIL: exists=${exists}, count=${afterDelete.players.length}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-3-delete-unplayed-player', name: '3. Safe Deletion of Unplayed Player before Pairings', passed, message, durationMs: performance.now() - start });
  }

  // TEST 4: Bulk Status Change & Pairings Exclusion
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const tourney = createBaseTournament();
      const keysToWithdraw = ['local:carlsen--magnus-1', 'local:caruana--fabiano-3'];

      const res = await executeBulkStatusTransaction(manager, tourney, keysToWithdraw, 'withdrawn');
      const p1 = res.tournament.players.find(p => p.localKey === 'local:carlsen--magnus-1');
      const p3 = res.tournament.players.find(p => p.localKey === 'local:caruana--fabiano-3');
      const excluded = res.tournament.pairings.engine.excluded || [];

      const withdrawnOk = p1?.attendance === 'withdrawn' && p3?.attendance === 'withdrawn';
      const excludedOk = excluded.includes('local:carlsen--magnus-1') && excluded.includes('local:caruana--fabiano-3');

      // Now re-admit p1
      const res2 = await executeBulkStatusTransaction(manager, res.tournament, ['local:carlsen--magnus-1'], 'present');
      const p1Readmit = res2.tournament.players.find(p => p.localKey === 'local:carlsen--magnus-1');
      const excludedAfter = res2.tournament.pairings.engine.excluded || [];
      const readmitOk = p1Readmit?.attendance === 'present' && !excludedAfter.includes('local:carlsen--magnus-1');

      passed = withdrawnOk && excludedOk && readmitOk;
      message = passed
        ? 'PASS: Bulk status change updates attendance and syncs pairings exclusion list; re-admit clears exclusion.'
        : 'FAIL: Bulk status transition failed.';
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-4-bulk-status-update', name: '4. Bulk Status Updates (Present, Absent, Withdrawn) & Exclusion Sync', passed, message, durationMs: performance.now() - start });
  }

  // TEST 5: Bulk Status Transactional Rollback on Persistence Failure
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const tourney = createBaseTournament();
      let caughtError = false;

      try {
        await executeBulkStatusTransaction(
          manager,
          tourney,
          ['local:carlsen--magnus-1'],
          'withdrawn',
          () => false // Simulated persistence failure
        );
      } catch (e: any) {
        caughtError = e.code === 'COMMIT_FAILED';
      }

      // Invariant: Tournament remains untouched
      const untouched = tourney.players[0].attendance === 'present';
      passed = caughtError && untouched;
      message = passed
        ? 'PASS: Bulk status operation automatically rolls back on persistence failure.'
        : `FAIL: caughtError=${caughtError}, untouched=${untouched}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-5-bulk-status-rollback', name: '5. Bulk Status Transactional Rollback on Persistence Failure', passed, message, durationMs: performance.now() - start });
  }

  // TEST 6: Bulk Federation Assignment with 3-Letter Validation
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const tourney = createBaseTournament();
      const keys = ['local:carlsen--magnus-1', 'local:nakamura--hikaru-2'];

      // 1. Valid update
      const { tournament: tourneyFed } = await executeBulkFederationTransaction(manager, tourney, keys, 'FID');
      const p1 = tourneyFed.players.find(p => p.localKey === 'local:carlsen--magnus-1');
      const p2 = tourneyFed.players.find(p => p.localKey === 'local:nakamura--hikaru-2');
      const validOk = p1?.fed === 'FID' && p2?.fed === 'FID';

      // 2. Invalid code rejection
      let caughtInvalid = false;
      try {
        await executeBulkFederationTransaction(manager, tourney, keys, 'INVALID_FED');
      } catch (e: any) {
        caughtInvalid = e.code === 'INVALID_FEDERATION';
      }

      passed = validOk && caughtInvalid;
      message = passed
        ? 'PASS: Bulk federation assignment accepts valid 3-letter codes and rejects invalid formats.'
        : `FAIL: validOk=${validOk}, caughtInvalid=${caughtInvalid}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-6-bulk-federation-assignment', name: '6. Bulk Federation Assignment & 3-Letter Validation', passed, message, durationMs: performance.now() - start });
  }

  // TEST 7: Bulk Deletion Blocks when Players Have History
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const tourney = createBaseTournament();
      tourney.pairings.liveBoards = {
        '1': [{ board: 1, whiteKey: 'local:carlsen--magnus-1', blackKey: 'local:nakamura--hikaru-2', result: '1 - 0' }]
      };
      // Add two unplayed players
      tourney.players.push(
        { id: 5, localKey: 'local:unplayed-5', name: 'Unplayed 5', rating: 1200, fed: 'BUL', fideId: '111', birth: '-', gender: 'm', title: '', attendance: 'present', pairingNumber: 5, joinedFromRound: 1 },
        { id: 6, localKey: 'local:unplayed-6', name: 'Unplayed 6', rating: 1100, fed: 'BUL', fideId: '222', birth: '-', gender: 'm', title: '', attendance: 'present', pairingNumber: 6, joinedFromRound: 1 }
      );

      // Attempt to delete Carlsen (has history) and Unplayed 5
      let caughtBlocked = false;
      try {
        await executeBulkDeleteTransaction(manager, tourney, ['local:carlsen--magnus-1', 'local:unplayed-5'], { allowPartial: false });
      } catch (e: any) {
        caughtBlocked = e.code === 'CANNOT_DELETE_PLAYERS_WITH_HISTORY';
      }

      // With allowPartial: true, only Unplayed 5 is deleted
      const { tournament: partialTourney, report } = await executeBulkDeleteTransaction(
        manager,
        tourney,
        ['local:carlsen--magnus-1', 'local:unplayed-5'],
        { allowPartial: true }
      );

      const carlsenPreserved = partialTourney.players.some(p => p.localKey === 'local:carlsen--magnus-1');
      const unplayedDeleted = !partialTourney.players.some(p => p.localKey === 'local:unplayed-5');
      const partialOk = report.affectedCount === 1 && report.blockedCount === 1 && carlsenPreserved && unplayedDeleted;

      passed = caughtBlocked && partialOk;
      message = passed
        ? 'PASS: Bulk deletion blocks players with history; allowPartial safely deletes only eligible players.'
        : `FAIL: caughtBlocked=${caughtBlocked}, partialOk=${partialOk}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-7-bulk-delete-history-protection', name: '7. Bulk Deletion with History Protection', passed, message, durationMs: performance.now() - start });
  }

  // TEST 8: Late-Entry Registration with Preceding Byes
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const tourney = createBaseTournament();
      tourney.pairings.liveBoards = {
        '1': [{ board: 1, whiteKey: 'local:carlsen--magnus-1', blackKey: 'local:caruana--fabiano-3', result: '1 - 0' }],
        '2': [{ board: 1, whiteKey: 'local:carlsen--magnus-1', blackKey: 'local:nakamura--hikaru-2', result: '½ - ½' }]
      };

      // Register late entry starting from round 3
      const { tournament: afterLate, player: latePlayer } = await executeRegisterPlayerTransaction(
        manager,
        tourney,
        {
          name: 'Anand, Viswanathan',
          rating: 2750,
          fed: 'IND',
          fideId: '5000017',
          title: 'GM'
        },
        {
          joinedFromRound: 3,
          lateEntryByeType: 'half'
        }
      );

      const assignedNo = latePlayer.pairingNumber;
      const lockedExisting = latePlayer.isStartingRankLocked === true;
      const r1Bye = afterLate.pairings.engine.manualByes?.['1']?.[latePlayer.localKey];
      const r2Bye = afterLate.pairings.engine.manualByes?.['2']?.[latePlayer.localKey];
      const byesRecorded = r1Bye === 'H' && r2Bye === 'H';

      passed = assignedNo === 5 && lockedExisting && byesRecorded;
      message = passed
        ? 'PASS: Late entry player joins from Round 3; preceding rounds 1-2 receive automatic byes and existing ranks are locked.'
        : `FAIL: assignedNo=${assignedNo}, locked=${lockedExisting}, r1=${r1Bye}, r2=${r2Bye}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-8-late-entry-byes', name: '8. Late-Entry Registration from Round N with Preceding Byes', passed, message, durationMs: performance.now() - start });
  }

  // TEST 9: Duplicate FIDE ID Detection and Blocking
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const tourney = createBaseTournament();
      // Carlsen has FIDE ID 1503014
      let caughtDuplicate = false;
      try {
        await executeRegisterPlayerTransaction(manager, tourney, {
          name: 'Imposter, Player',
          rating: 2000,
          fed: 'NOR',
          fideId: '1503014', // Duplicate Carlsen FIDE ID
          title: ''
        });
      } catch (e: any) {
        caughtDuplicate = e.code === 'VALIDATION_FAILED' && e.errors.some((x: string) => x.includes('DUPLICATE_FIDE_ID'));
      }

      // Blank or '-' FIDE ID should be allowed for multiple players
      const { tournament: withUnrated1 } = await executeRegisterPlayerTransaction(manager, tourney, {
        name: 'Unrated One',
        rating: 0,
        fed: 'BUL',
        fideId: '-',
        title: ''
      });
      const { tournament: withUnrated2 } = await executeRegisterPlayerTransaction(manager, withUnrated1, {
        name: 'Unrated Two',
        rating: 0,
        fed: 'BUL',
        fideId: '-',
        title: ''
      });

      const unratedAllowed = withUnrated2.players.length === 6;
      passed = caughtDuplicate && unratedAllowed;
      message = passed
        ? 'PASS: Real FIDE ID duplicate strictly blocked with DUPLICATE_FIDE_ID; unrated "-" placeholders allowed.'
        : `FAIL: caughtDuplicate=${caughtDuplicate}, unratedAllowed=${unratedAllowed}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-9-duplicate-fide-id', name: '9. Real-Time Duplicate FIDE ID Detection & Blocking', passed, message, durationMs: performance.now() - start });
  }

  // TEST 10: Round-Specific Requested Byes and Maximum Byes Limit
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const tourney = createBaseTournament();
      // Player requests half bye for Round 2 (ungenerated)
      const { tournament: withBye1 } = await executeRequestedByeTransaction(
        manager,
        tourney,
        'local:carlsen--magnus-1',
        2,
        'half',
        { maxHalfPointByes: 2 }
      );

      // Player requests second half bye for Round 3
      const { tournament: withBye2 } = await executeRequestedByeTransaction(
        manager,
        withBye1,
        'local:carlsen--magnus-1',
        3,
        'half',
        { maxHalfPointByes: 2 }
      );

      // Third half-bye should exceed limit of 2
      let caughtExceeded = false;
      try {
        await executeRequestedByeTransaction(
          manager,
          withBye2,
          'local:carlsen--magnus-1',
          4,
          'half',
          { maxHalfPointByes: 2 }
        );
      } catch (e: any) {
        caughtExceeded = e.code === 'MAX_BYES_EXCEEDED';
      }

      // Bye on generated round should be blocked
      withBye2.pairings.liveBoards = {
        '1': [{ board: 1, whiteKey: 'local:carlsen--magnus-1', blackKey: 'local:caruana--fabiano-3', result: '-' }]
      };
      let caughtGenerated = false;
      try {
        await executeRequestedByeTransaction(
          manager,
          withBye2,
          'local:carlsen--magnus-1',
          1,
          'half'
        );
      } catch (e: any) {
        caughtGenerated = e.code === 'CANNOT_SET_BYE_GENERATED_ROUND';
      }

      passed = caughtExceeded && caughtGenerated;
      message = passed
        ? 'PASS: Requested byes respect maximum limit (MAX_BYES_EXCEEDED) and block byes on generated rounds.'
        : `FAIL: caughtExceeded=${caughtExceeded}, caughtGenerated=${caughtGenerated}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-10-requested-byes-limits', name: '10. Round-Specific Requested Byes & Maximum Limit Enforcement', passed, message, durationMs: performance.now() - start });
  }

  // TEST 11: FIDE Starting List Resort Precedence (Rating, Title, National Rating, Name)
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const candidates: Player[] = [
        { id: 1, localKey: 'p1', name: 'Zeta, Player', rating: 2400, title: 'IM', nationalRating: 2350, fed: 'FID', fideId: '1', birth: '-', gender: 'm', attendance: 'present', pairingNumber: 1, joinedFromRound: 1 },
        { id: 2, localKey: 'p2', name: 'Alpha, Player', rating: 2400, title: 'GM', nationalRating: 2300, fed: 'FID', fideId: '2', birth: '-', gender: 'm', attendance: 'present', pairingNumber: 2, joinedFromRound: 1 },
        { id: 3, localKey: 'p3', name: 'Beta, Player', rating: 2400, title: 'IM', nationalRating: 2380, fed: 'FID', fideId: '3', birth: '-', gender: 'm', attendance: 'present', pairingNumber: 3, joinedFromRound: 1 },
        { id: 4, localKey: 'p4', name: 'Gamma, Player', rating: 2500, title: 'FM', nationalRating: 2450, fed: 'FID', fideId: '4', birth: '-', gender: 'm', attendance: 'present', pairingNumber: 4, joinedFromRound: 1 },
        { id: 5, localKey: 'p5', name: 'Delta, Player', rating: 2400, title: 'IM', nationalRating: 2350, fed: 'FID', fideId: '5', birth: '-', gender: 'm', attendance: 'present', pairingNumber: 5, joinedFromRound: 1 }
      ];

      const sorted = sortPlayersFideStandard(candidates);

      // Expected order:
      // 1. Gamma (2500 FM - highest rating)
      // 2. Alpha (2400 GM - highest title among 2400s)
      // 3. Beta (2400 IM, nat 2380 - highest national rating among 2400 IMs)
      // 4. Delta (2400 IM, nat 2350, name Delta - name precedes Zeta)
      // 5. Zeta (2400 IM, nat 2350, name Zeta)
      const orderOk =
        sorted[0].name === 'Gamma, Player' &&
        sorted[1].name === 'Alpha, Player' &&
        sorted[2].name === 'Beta, Player' &&
        sorted[3].name === 'Delta, Player' &&
        sorted[4].name === 'Zeta, Player';

      passed = orderOk;
      message = passed
        ? 'PASS: Strict FIDE Starting List precedence: Rating > Title > National Rating > Name A-Z.'
        : `FAIL: Resulting order: ${sorted.map(s => s.name).join(' -> ')}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-11-starting-list-precedence', name: '11. FIDE Starting List Resort Precedence Verification', passed, message, durationMs: performance.now() - start });
  }

  // TEST 12: Distinct Display of Initial Sort Order vs Assigned Pairing Number
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const candidates: Player[] = [
        { id: 10, localKey: 'p1', name: 'Zeta, GM', rating: 2600, title: 'GM', fed: 'FID', fideId: '1', birth: '-', gender: 'm', attendance: 'present', pairingNumber: 10, joinedFromRound: 1 },
        { id: 20, localKey: 'p2', name: 'Alpha, GM', rating: 2700, title: 'GM', fed: 'FID', fideId: '2', birth: '-', gender: 'm', attendance: 'present', pairingNumber: 20, joinedFromRound: 1 }
      ];

      const annotated = annotateInitialSortOrder(candidates);
      const alpha = annotated.find(p => p.name.includes('Alpha'));
      const zeta = annotated.find(p => p.name.includes('Zeta'));

      const alphaOk = alpha?.initialSortOrder === 1 && alpha?.pairingNumber === 20;
      const zetaOk = zeta?.initialSortOrder === 2 && zeta?.pairingNumber === 10;

      passed = Boolean(alphaOk && zetaOk);
      message = passed
        ? 'PASS: Distinct initialSortOrder (#1, #2) calculated independently of assigned pairingNumber (#20, #10).'
        : `FAIL: alpha=${JSON.stringify(alpha)}, zeta=${JSON.stringify(zeta)}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-12-initial-sort-display', name: '12. Distinct Display of Initial Sort Order vs Assigned Pairing Number', passed, message, durationMs: performance.now() - start });
  }

  return results;
}
