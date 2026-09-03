import fs from 'fs';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';
import { FideRatingRepository } from '../fide/FideRatingRepository';
import { FideRatingService } from '../fide/FideRatingService';
import { Tournament, Player } from '../../types';
import { INITIAL_TOURNAMENT_DATA } from '../../data/initialData';
import {
  computeFidePlayerDiff,
  generateFideSyncPreflight,
  applyFidePlayerSync
} from '../../transactions/fideSyncWorkflow';

function createTestFideZip(playersXml: string): Buffer {
  const zip = new AdmZip();
  zip.addFile('players_list.xml', Buffer.from(playersXml, 'utf-8'));
  return zip.toBuffer();
}

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<playerslist>
  <player>
    <fideid>1503014</fideid>
    <name>Carlsen, Magnus</name>
    <country>NOR</country>
    <sex>M</sex>
    <title>GM</title>
    <rating>2832</rating>
    <rapid_rating>2823</rapid_rating>
    <blitz_rating>2886</blitz_rating>
    <birthday>1990</birthday>
    <flag></flag>
  </player>
  <player>
    <fideid>2004887</fideid>
    <name>Nakamura, Hikaru</name>
    <country>USA</country>
    <sex>M</sex>
    <title>GM</title>
    <rating>2802</rating>
    <rapid_rating>2746</rapid_rating>
    <blitz_rating>2874</blitz_rating>
    <birthday>1987-12-09</birthday>
    <flag></flag>
  </player>
  <player>
    <fideid>2902257</fideid>
    <name>Stefanova, Antoaneta</name>
    <country>BUL</country>
    <sex>F</sex>
    <title>GM</title>
    <w_title>WGM</w_title>
    <rating>2433</rating>
    <rapid_rating>2412</rapid_rating>
    <blitz_rating>2398</blitz_rating>
    <birthday>1979</birthday>
    <flag>w</flag>
  </player>
  <player>
    <fideid>2905540</fideid>
    <name>Cheparinov, Ivan</name>
    <country>BUL</country>
    <sex>M</sex>
    <title>GM</title>
    <rating>2660</rating>
    <rapid_rating>2645</rapid_rating>
    <blitz_rating>2652</blitz_rating>
    <birthday>1986-11-26</birthday>
    <flag></flag>
  </player>
</playerslist>`;

function createMockPlayer(overrides: Partial<Player> & { localKey: string }): Player {
  return {
    id: 1,
    name: 'Test Player',
    rating: 2000,
    title: '',
    fed: 'FID',
    fideId: '',
    birth: '',
    gender: 'm',
    pairingNumber: 1,
    attendance: 'present',
    joinedFromRound: 1,
    ...overrides
  };
}

function createMockTournament(players: Player[]): Tournament {
  const t: Tournament = JSON.parse(JSON.stringify(INITIAL_TOURNAMENT_DATA));
  t.players = players;
  t.pairings.liveBoards = {
    '1': [
      {
        board: 1,
        whiteKey: players[0]?.localKey || 'p1',
        blackKey: players[1]?.localKey || 'p2',
        result: '1 - 0',
        entryType: 'NORMAL_GAME'
      },
      {
        board: 2,
        whiteKey: players[2]?.localKey || 'p3',
        blackKey: 'BYE',
        result: '½ BYE',
        entryType: 'REQUESTED_BYE',
        byePoints: 0.5
      }
    ]
  };
  t.pairings.finalizedRounds = { '1': true };
  t.pairings.roundStatus = { '1': 'RESULTS_FINALIZED' };
  return t;
}

async function runTests() {
  console.log('================================================================');
  console.log('CHESS-PUBLISHER: BATCH C — FIDE PLAYER SYNCHRONIZATION TEST SUITE');
  console.log('================================================================\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fide-sync-tests-'));
  const testRepo = new FideRatingRepository(tmpDir);
  await testRepo.initialize();

  const testService = new FideRatingService(testRepo);
  const archiveBuf = createTestFideZip(SAMPLE_XML);
  await testService.updateRatingList({
    customSourceBuffer: archiveBuf,
    customSourceName: 'Sample test archive'
  });

  const fideLookup = (id: number) => testService.getPlayer(id);

  let passed = 0;
  const total = 20;

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  // 1. selected player unchanged
  try {
    const p = createMockPlayer({
      id: 1,
      name: 'Carlsen, Magnus',
      rating: 2832,
      stdRating: 2832,
      rapidRating: 2823,
      blitzRating: 2886,
      title: 'GM',
      fed: 'NOR',
      fideId: '1503014',
      birth: '1990',
      gender: 'm',
      pairingNumber: 1,
      localKey: 'p-carlsen'
    });
    const diff = computeFidePlayerDiff(p, fideLookup(1503014), 'Standard', false);
    assert(diff.status === 'UNCHANGED', 'Status should be UNCHANGED');
    assert(diff.diffs.length === 0, 'No diffs for identical player');
    console.log('✅ [PASS] 1. Selected player unchanged');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 1. Selected player unchanged:', e.message);
  }

  // 2. selected player rating change preview
  try {
    const p = createMockPlayer({
      id: 1,
      name: 'Carlsen, Magnus',
      rating: 2800, // outdated
      stdRating: 2800,
      rapidRating: 2823,
      blitzRating: 2886,
      title: 'GM',
      fed: 'NOR',
      fideId: '1503014',
      birth: '1990',
      gender: 'm',
      pairingNumber: 1,
      localKey: 'p-carlsen'
    });
    const diff = computeFidePlayerDiff(p, fideLookup(1503014), 'Standard', false);
    assert(diff.status === 'CHANGED', 'Status should be CHANGED');
    const rDiff = diff.diffs.find(d => d.field === 'ratingStandard');
    assert(!!rDiff && rDiff.oldValue === 2800 && rDiff.newValue === 2832, 'Rating diff detected correctly');
    console.log('✅ [PASS] 2. Selected player rating change preview');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 2. Selected player rating change preview:', e.message);
  }

  // 3. title change preview
  try {
    const p = createMockPlayer({
      id: 2,
      name: 'Nakamura, Hikaru',
      rating: 2802,
      stdRating: 2802,
      title: 'IM', // outdated title
      fed: 'USA',
      fideId: '2004887',
      birth: '1987-12-09',
      gender: 'm',
      pairingNumber: 2,
      localKey: 'p-nakamura'
    });
    const diff = computeFidePlayerDiff(p, fideLookup(2004887), 'Standard', false);
    assert(diff.status === 'CHANGED', 'Status should be CHANGED');
    const tDiff = diff.diffs.find(d => d.field === 'title');
    assert(!!tDiff && tDiff.oldValue === 'IM' && tDiff.newValue === 'GM', 'Title diff IM -> GM detected');
    console.log('✅ [PASS] 3. Title change preview');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 3. Title change preview:', e.message);
  }

  // 4. federation change preview
  try {
    const p = createMockPlayer({
      id: 3,
      name: 'Stefanova, Antoaneta',
      rating: 2433,
      title: 'GM',
      fed: 'FID', // outdated fed
      fideId: '2902257',
      birth: '1979',
      gender: 'f',
      pairingNumber: 3,
      localKey: 'p-stefanova'
    });
    const diff = computeFidePlayerDiff(p, fideLookup(2902257), 'Standard', false);
    assert(diff.status === 'CHANGED', 'Status should be CHANGED');
    const fDiff = diff.diffs.find(d => d.field === 'fed');
    assert(!!fDiff && fDiff.oldValue === 'FID' && fDiff.newValue === 'BUL', 'Fed diff FID -> BUL detected');
    console.log('✅ [PASS] 4. Federation change preview');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 4. Federation change preview:', e.message);
  }

  // 5. all three rating types preserved
  try {
    const p = createMockPlayer({
      id: 1,
      name: 'Carlsen, Magnus',
      rating: 2500,
      title: 'GM',
      fed: 'NOR',
      fideId: '1503014',
      gender: 'm',
      pairingNumber: 1,
      localKey: 'p-carlsen'
    });
    const tourn = createMockTournament([p]);
    (tourn.settings as any).tournamentRatingType = 'Rapid';

    const applied = applyFidePlayerSync(
      tourn,
      [{ playerKey: 'p-carlsen', selectedFields: ['ratingStandard', 'ratingRapid', 'ratingBlitz'] }],
      fideLookup,
      { arbiterConfirmed: true }
    );
    const updated = applied.tournament.players[0];
    assert(updated.stdRating === 2832, 'Standard rating preserved: 2832');
    assert(updated.rapidRating === 2823, 'Rapid rating preserved: 2823');
    assert(updated.blitzRating === 2886, 'Blitz rating preserved: 2886');
    assert(updated.rating === 2823, 'Active tournament rating mapped to Rapid: 2823');
    console.log('✅ [PASS] 5. All three rating types preserved');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 5. All three rating types preserved:', e.message);
  }

  // 6. partial birth data preserved
  try {
    const p = createMockPlayer({
      id: 1,
      name: 'Carlsen, Magnus',
      rating: 2832,
      title: 'GM',
      fed: 'NOR',
      fideId: '1503014',
      birth: '',
      gender: 'm',
      pairingNumber: 1,
      localKey: 'p-carlsen'
    });
    const tourn = createMockTournament([p]);
    const applied = applyFidePlayerSync(
      tourn,
      [{ playerKey: 'p-carlsen', selectedFields: ['birth'] }],
      fideLookup,
      { arbiterConfirmed: true }
    );
    const updated = applied.tournament.players[0];
    assert(updated.birth === '1990', 'Partial birth year 1990 preserved without fabricated day/month');
    console.log('✅ [PASS] 6. Partial birth data preserved');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 6. Partial birth data preserved:', e.message);
  }

  // 7. unmatched player reported
  try {
    const p = createMockPlayer({
      id: 99,
      name: 'Unknown Player',
      rating: 1500,
      fed: 'BUL',
      fideId: '88888888', // non-existent
      gender: 'm',
      pairingNumber: 99,
      localKey: 'p-unknown'
    });
    const diff = computeFidePlayerDiff(p, fideLookup(88888888), 'Standard', false);
    assert(diff.status === 'UNMATCHED', 'Unmatched player status is UNMATCHED');
    assert(diff.diffs.length === 0, 'No diffs for unmatched player');
    assert(!!diff.warning, 'Warning message is provided');
    console.log('✅ [PASS] 7. Unmatched player reported');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 7. Unmatched player reported:', e.message);
  }

  // 8. duplicate tournament FIDE ID reported
  try {
    const p1 = createMockPlayer({
      id: 1,
      name: 'Player One',
      rating: 2800,
      fed: 'NOR',
      fideId: '1503014',
      gender: 'm',
      pairingNumber: 1,
      localKey: 'p1'
    });
    const p2 = createMockPlayer({
      id: 2,
      name: 'Player Two',
      rating: 2800,
      fed: 'NOR',
      fideId: '1503014', // Duplicate FIDE ID
      gender: 'm',
      pairingNumber: 2,
      localKey: 'p2'
    });
    const tourn = createMockTournament([p1, p2]);
    const preflight = generateFideSyncPreflight(tourn, fideLookup);
    assert(preflight.duplicateCount === 2, 'Two players flagged as duplicate FIDE ID');
    assert(preflight.players[0].status === 'DUPLICATE_FIDE_ID', 'Player 1 flagged DUPLICATE_FIDE_ID');
    assert(preflight.players[1].status === 'DUPLICATE_FIDE_ID', 'Player 2 flagged DUPLICATE_FIDE_ID');
    console.log('✅ [PASS] 8. Duplicate tournament FIDE ID reported');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 8. Duplicate tournament FIDE ID reported:', e.message);
  }

  // 9. bulk sync mixed changed/unchanged/unmatched
  try {
    const p1 = createMockPlayer({
      id: 1,
      name: 'Carlsen, Magnus',
      rating: 2832,
      stdRating: 2832,
      rapidRating: 2823,
      blitzRating: 2886,
      title: 'GM',
      fed: 'NOR',
      fideId: '1503014',
      birth: '1990',
      gender: 'm',
      pairingNumber: 1,
      localKey: 'p1'
    }); // Unchanged
    const p2 = createMockPlayer({
      id: 2,
      name: 'Nakamura, Hikaru',
      rating: 2700, // Changed (authoritative is 2802)
      stdRating: 2700,
      title: 'GM',
      fed: 'USA',
      fideId: '2004887',
      birth: '1987-12-09',
      gender: 'm',
      pairingNumber: 2,
      localKey: 'p2'
    }); // Changed
    const p3 = createMockPlayer({
      id: 3,
      name: 'Local Club Player',
      rating: 1600,
      fed: 'BUL',
      fideId: '',
      gender: 'm',
      pairingNumber: 3,
      localKey: 'p3'
    }); // Unmatched

    const tourn = createMockTournament([p1, p2, p3]);
    const preflight = generateFideSyncPreflight(tourn, fideLookup);
    assert(preflight.totalPlayers === 3, 'Total players 3');
    assert(preflight.changedCount === 1, '1 changed player');
    assert(preflight.unchangedCount === 1, '1 unchanged player');
    assert(preflight.unmatchedCount === 1, '1 unmatched player');
    console.log('✅ [PASS] 9. Bulk sync mixed changed/unchanged/unmatched');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 9. Bulk sync mixed changed/unchanged/unmatched:', e.message);
  }

  // 10. no mutation before confirmation
  try {
    const p = createMockPlayer({
      id: 1,
      name: 'Carlsen, Magnus',
      rating: 2800,
      fed: 'NOR',
      fideId: '1503014',
      gender: 'm',
      pairingNumber: 1,
      localKey: 'p1'
    });
    const tourn = createMockTournament([p]);
    const snapshotBefore = JSON.stringify(tourn);

    // Preflight diff
    generateFideSyncPreflight(tourn, fideLookup);
    assert(JSON.stringify(tourn) === snapshotBefore, 'Preflight does not mutate state');

    // Attempt apply without confirmation
    let threw = false;
    try {
      applyFidePlayerSync(
        tourn,
        [{ playerKey: 'p1', selectedFields: ['ratingStandard'] }],
        fideLookup,
        { arbiterConfirmed: false }
      );
    } catch (err: any) {
      threw = true;
      assert(err.code === 'ARBITER_CONFIRMATION_REQUIRED', 'Throws ARBITER_CONFIRMATION_REQUIRED');
    }
    assert(threw, 'Unconfirmed apply was blocked');
    assert(JSON.stringify(tourn) === snapshotBefore, 'Unconfirmed apply did not mutate state');
    console.log('✅ [PASS] 10. No mutation before confirmation');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 10. No mutation before confirmation:', e.message);
  }

  // 11. confirmed selected fields apply
  try {
    const p = createMockPlayer({
      id: 2,
      name: 'Nakamura, H.',
      rating: 2750,
      stdRating: 2750,
      title: 'IM',
      fed: 'USA',
      fideId: '2004887',
      birth: '1987-12-09',
      gender: 'm',
      pairingNumber: 2,
      localKey: 'p2'
    });
    const tourn = createMockTournament([p]);
    const applied = applyFidePlayerSync(
      tourn,
      [{ playerKey: 'p2', selectedFields: ['name', 'ratingStandard', 'title'] }],
      fideLookup,
      { arbiterConfirmed: true }
    );
    const updated = applied.tournament.players[0];
    assert(updated.name === 'Nakamura, Hikaru', 'Name updated from authoritative record');
    assert(updated.rating === 2802, 'Rating updated to 2802');
    assert(updated.title === 'GM', 'Title updated to GM');
    console.log('✅ [PASS] 11. Confirmed selected fields apply');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 11. Confirmed selected fields apply:', e.message);
  }

  // 12. deselected field remains unchanged
  try {
    const p = createMockPlayer({
      id: 2,
      name: 'Custom Nickname Nakamura',
      rating: 2750,
      stdRating: 2750,
      title: 'IM',
      fed: 'USA',
      fideId: '2004887',
      birth: '1987-12-09',
      gender: 'm',
      pairingNumber: 2,
      localKey: 'p2'
    });
    const tourn = createMockTournament([p]);
    // Notice 'name' is omitted from selectedFields
    const applied = applyFidePlayerSync(
      tourn,
      [{ playerKey: 'p2', selectedFields: ['ratingStandard', 'title'] }],
      fideLookup,
      { arbiterConfirmed: true }
    );
    const updated = applied.tournament.players[0];
    assert(updated.name === 'Custom Nickname Nakamura', 'Deselected name field was preserved exactly');
    assert(updated.rating === 2802, 'Selected rating field was updated');
    assert(updated.title === 'GM', 'Selected title field was updated');
    console.log('✅ [PASS] 12. Deselected field remains unchanged');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 12. Deselected field remains unchanged:', e.message);
  }

  // 13. tournament-specific fields preserved
  try {
    const p = createMockPlayer({
      id: 1,
      name: 'Carlsen, Magnus',
      rating: 2800,
      fed: 'NOR',
      fideId: '1503014',
      gender: 'm',
      pairingNumber: 7, // tournament specific rank
      localKey: 'p1',
      attendance: 'absent', // tournament specific attendance
      joinedFromRound: 2 // tournament specific late entry
    });
    const tourn = createMockTournament([p]);
    const applied = applyFidePlayerSync(
      tourn,
      [{ playerKey: 'p1', selectedFields: ['ratingStandard'] }],
      fideLookup,
      { arbiterConfirmed: true }
    );
    const updated = applied.tournament.players[0];
    assert(updated.pairingNumber === 7, 'pairingNumber preserved');
    assert(updated.attendance === 'absent', 'attendance preserved');
    assert(updated.joinedFromRound === 2, 'joinedFromRound preserved');
    console.log('✅ [PASS] 13. Tournament-specific fields preserved');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 13. Tournament-specific fields preserved:', e.message);
  }

  // 14. pairings/results unchanged
  try {
    const p1 = createMockPlayer({
      id: 1,
      name: 'Carlsen, Magnus',
      rating: 2800,
      fed: 'NOR',
      fideId: '1503014',
      gender: 'm',
      pairingNumber: 1,
      localKey: 'p1'
    });
    const p2 = createMockPlayer({
      id: 2,
      name: 'Nakamura, Hikaru',
      rating: 2700,
      fed: 'USA',
      fideId: '2004887',
      gender: 'm',
      pairingNumber: 2,
      localKey: 'p2'
    });
    const tourn = createMockTournament([p1, p2]);
    const liveBoardsBefore = JSON.stringify(tourn.pairings.liveBoards);

    const applied = applyFidePlayerSync(
      tourn,
      [{ playerKey: 'p1', selectedFields: ['ratingStandard'] }],
      fideLookup,
      { arbiterConfirmed: true }
    );
    const liveBoardsAfter = JSON.stringify(applied.tournament.pairings.liveBoards);
    assert(liveBoardsBefore === liveBoardsAfter, 'Pairings and results are completely unchanged');
    console.log('✅ [PASS] 14. Pairings/results unchanged');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 14. Pairings/results unchanged:', e.message);
  }

  // 15. requested byes unchanged
  try {
    const p1 = createMockPlayer({
      id: 1,
      name: 'Stefanova, Antoaneta',
      rating: 2400,
      fed: 'BUL',
      fideId: '2902257',
      gender: 'f',
      pairingNumber: 1,
      localKey: 'p3'
    });
    const tourn = createMockTournament([p1]);
    const byeBoard = tourn.pairings.liveBoards['1'][1];
    assert(byeBoard.entryType === 'REQUESTED_BYE', 'Bye board exists before sync');

    const applied = applyFidePlayerSync(
      tourn,
      [{ playerKey: 'p3', selectedFields: ['ratingStandard'] }],
      fideLookup,
      { arbiterConfirmed: true }
    );
    const updatedByeBoard = applied.tournament.pairings.liveBoards['1'][1];
    assert(updatedByeBoard.entryType === 'REQUESTED_BYE', 'Bye board entryType preserved');
    assert(updatedByeBoard.result === '½ BYE', 'Bye board result preserved');
    assert(updatedByeBoard.byePoints === 0.5, 'Bye points preserved');
    console.log('✅ [PASS] 15. Requested byes unchanged');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 15. Requested byes unchanged:', e.message);
  }

  // 16. no automatic starting-list resort
  try {
    // Player A has rank 1 and rating 2800. Player B has rank 2 and rating 2700.
    const pA = createMockPlayer({
      id: 1,
      name: 'Player A',
      rating: 2800,
      stdRating: 2800,
      fed: 'BUL',
      fideId: '2902257', // Stefanova: actual FIDE rating 2433
      gender: 'f',
      pairingNumber: 1,
      localKey: 'pA'
    });
    const pB = createMockPlayer({
      id: 2,
      name: 'Player B',
      rating: 2700,
      stdRating: 2700,
      fed: 'BUL',
      fideId: '2905540', // Cheparinov: actual FIDE rating 2660
      gender: 'm',
      pairingNumber: 2,
      localKey: 'pB'
    });
    // If synced: pA becomes 2433, pB becomes 2660. So pB now has higher rating than pA!
    const tourn = createMockTournament([pA, pB]);
    const applied = applyFidePlayerSync(
      tourn,
      [
        { playerKey: 'pA', selectedFields: ['ratingStandard'] },
        { playerKey: 'pB', selectedFields: ['ratingStandard'] }
      ],
      fideLookup,
      { arbiterConfirmed: true }
    );
    const updatedA = applied.tournament.players.find(p => p.localKey === 'pA')!;
    const updatedB = applied.tournament.players.find(p => p.localKey === 'pB')!;
    assert(updatedA.pairingNumber === 1, 'Player A pairingNumber STILL 1 (no auto-resort)');
    assert(updatedB.pairingNumber === 2, 'Player B pairingNumber STILL 2 (no auto-resort)');
    assert(applied.startingListOutdated === true, 'startingListOutdated is flagged true');
    console.log('✅ [PASS] 16. No automatic starting-list resort');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 16. No automatic starting-list resort:', e.message);
  }

  // 17. failed persistence rolls back
  try {
    const p = createMockPlayer({
      id: 1,
      name: 'Carlsen, Magnus',
      rating: 2800,
      fed: 'NOR',
      fideId: '1503014',
      gender: 'm',
      pairingNumber: 1,
      localKey: 'p1'
    });
    const tourn = createMockTournament([p]);
    const snapshotBefore = JSON.stringify(tourn);

    // Provide an invalid lookup that throws
    let threw = false;
    try {
      applyFidePlayerSync(
        tourn,
        [{ playerKey: 'p1', selectedFields: ['ratingStandard'] }],
        () => { throw new Error('Simulated database corruption failure'); },
        { arbiterConfirmed: true }
      );
    } catch (e: any) {
      threw = true;
      assert(e.message.includes('Simulated database corruption failure'), 'Caught simulated failure');
    }
    assert(threw, 'Error thrown and caught');
    assert(JSON.stringify(tourn) === snapshotBefore, 'Tournament state safely rolled back');
    console.log('✅ [PASS] 17. Failed persistence rolls back');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 17. Failed persistence rolls back:', e.message);
  }

  // 18. stale/missing FIDE database handled safely
  try {
    const emptyRepo = new FideRatingRepository(fs.mkdtempSync(path.join(os.tmpdir(), 'fide-empty-')));
    await emptyRepo.initialize();
    const emptyService = new FideRatingService(emptyRepo);

    const p = createMockPlayer({
      id: 1,
      name: 'Carlsen, Magnus',
      rating: 2832,
      fed: 'NOR',
      fideId: '1503014',
      gender: 'm',
      pairingNumber: 1,
      localKey: 'p1'
    });
    const tourn = createMockTournament([p]);
    const preflight = generateFideSyncPreflight(
      tourn,
      (id) => emptyService.getPlayer(id),
      undefined,
      emptyService.getStatus()
    );
    assert(preflight.unmatchedCount === 1, 'Player safely categorized as UNMATCHED');
    assert(preflight.databaseMetadata?.recordCount === 0, 'Database reported 0 records');
    console.log('✅ [PASS] 18. Stale/missing FIDE database handled safely');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 18. Stale/missing FIDE database handled safely:', e.message);
  }

  // 19. client cannot inject arbitrary authoritative values
  try {
    const p = createMockPlayer({
      id: 1,
      name: 'Carlsen, Magnus',
      rating: 2800,
      fed: 'NOR',
      fideId: '1503014',
      gender: 'm',
      pairingNumber: 1,
      localKey: 'p1'
    });
    const tourn = createMockTournament([p]);

    // Client passes arbitrary extra properties in selection, or claims fake values
    const maliciousSelection: any = {
      playerKey: 'p1',
      selectedFields: ['ratingStandard'],
      fakeInjectedRating: 9999,
      fakeInjectedTitle: 'World Champion Forever'
    };

    const applied = applyFidePlayerSync(
      tourn,
      [maliciousSelection],
      fideLookup,
      { arbiterConfirmed: true }
    );
    const updated = applied.tournament.players[0];
    assert(updated.rating === 2832, 'Rating is authoritative 2832, NOT injected 9999');
    assert((updated.title as string) !== 'World Champion Forever', 'Arbitrary client values ignored');
    console.log('✅ [PASS] 19. Client cannot inject arbitrary authoritative values');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 19. Client cannot inject arbitrary authoritative values:', e.message);
  }

  // 20. restart/persistence behavior remains valid
  try {
    const p = createMockPlayer({
      id: 1,
      name: 'Stefanova, Antoaneta',
      rating: 2400,
      fed: 'FID',
      fideId: '2902257',
      gender: 'f',
      pairingNumber: 1,
      localKey: 'p-stefanova'
    });
    const tourn = createMockTournament([p]);
    const applied = applyFidePlayerSync(
      tourn,
      [{ playerKey: 'p-stefanova', selectedFields: ['fed', 'ratingStandard', 'title'] }],
      fideLookup,
      { arbiterConfirmed: true }
    );

    // Write to disk and re-read
    const stateFile = path.join(tmpDir, 'tournament_persisted.json');
    fs.writeFileSync(stateFile, JSON.stringify(applied.tournament, null, 2), 'utf-8');

    const raw = fs.readFileSync(stateFile, 'utf-8');
    const restored: Tournament = JSON.parse(raw);
    const restoredPlayer = restored.players[0];
    assert(restoredPlayer.fed === 'BUL', 'Restored fed is BUL');
    assert(restoredPlayer.rating === 2433, 'Restored rating is 2433');
    assert(restoredPlayer.title === 'GM', 'Restored title is GM');
    console.log('✅ [PASS] 20. Restart/persistence behavior remains valid');
    passed++;
  } catch (e: any) {
    console.error('❌ [FAIL] 20. Restart/persistence behavior remains valid:', e.message);
  }

  // Cleanup
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n================================================================');
  console.log(`FIDE PLAYER SYNCHRONIZATION TEST RESULTS: ${passed}/${total} PASS`);
  console.log('================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error in FIDE sync test suite:', err);
  process.exit(1);
});
