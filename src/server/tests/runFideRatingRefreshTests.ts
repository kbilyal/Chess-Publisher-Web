import fs from 'fs';
import path from 'path';
import { INITIAL_TOURNAMENT_DATA } from '../../data/initialData';
import { Player, Tournament } from '../../types';
import { applyFidePlayerSync } from '../../transactions/fideSyncWorkflow';
import { FidePlayerRecord } from '../fide/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createPlayer(): Player {
  return {
    id: 1,
    localKey: 'monthly-rating-player',
    name: 'Monthly, Player',
    rating: 1710,
    stdRating: 1800,
    rapidRating: 1710,
    blitzRating: 1650,
    title: '',
    fed: 'GER',
    fideId: '9901001',
    birth: '1990',
    gender: 'm',
    pairingNumber: 7,
    attendance: 'present',
    joinedFromRound: 1
  };
}

function createTournament(player: Player): Tournament {
  const tournament: Tournament = JSON.parse(JSON.stringify(INITIAL_TOURNAMENT_DATA));
  tournament.players = [player];
  (tournament.settings as any).tournamentRatingType = 'Rapid';
  tournament.pairings.liveBoards = {
    '1': [{
      board: 1,
      whiteKey: player.localKey,
      blackKey: 'BYE',
      result: '1 - 0',
      entryType: 'NORMAL_GAME'
    }]
  } as any;
  tournament.pairings.finalizedRounds = { '1': true };
  tournament.pairings.roundStatus = { '1': 'RESULTS_FINALIZED' } as any;
  return tournament;
}

function main() {
  const player = createPlayer();
  const tournament = createTournament(player);
  const pairingsBefore = JSON.stringify(tournament.pairings);
  const authoritative: FidePlayerRecord = {
    fideId: 9901001,
    name: 'Different Name Must Not Be Applied',
    federation: 'FRA',
    title: 'FM',
    birth: '1991',
    ratingStandard: 1834,
    ratingRapid: 1762,
    ratingBlitz: 1688
  };

  const result = applyFidePlayerSync(
    tournament,
    [{
      playerKey: player.localKey,
      selectedFields: ['ratingStandard', 'ratingRapid', 'ratingBlitz']
    }],
    id => id === authoritative.fideId ? authoritative : null,
    { arbiterConfirmed: true, arbiterName: 'Web Organizer' }
  );

  const updated = result.tournament.players[0];
  assert(updated.stdRating === 1834, `Standard rating was not refreshed: ${updated.stdRating}`);
  assert(updated.rapidRating === 1762, `Rapid rating was not refreshed: ${updated.rapidRating}`);
  assert(updated.blitzRating === 1688, `Blitz rating was not refreshed: ${updated.blitzRating}`);
  assert(updated.rating === 1762, `Active Rapid tournament rating was not refreshed: ${updated.rating}`);
  assert(updated.pairingNumber === 7, `Pairing number changed unexpectedly: ${updated.pairingNumber}`);
  assert(updated.name === 'Monthly, Player', 'Rating-only refresh changed player name.');
  assert(updated.fed === 'GER', 'Rating-only refresh changed federation.');
  assert(updated.title === '', 'Rating-only refresh changed title.');
  assert(JSON.stringify(result.tournament.pairings) === pairingsBefore, 'Rating refresh changed pairings/results state.');

  const companionSource = fs.readFileSync(
    path.join(process.cwd(), 'src', 'companion', 'CompanionRegistration.tsx'),
    'utf8'
  );
  assert(companionSource.includes('Update FIDE ratings'), 'Web Registration roster is missing the Update FIDE ratings button.');
  assert(companionSource.includes("setBusyKey('ratings-refresh')"), 'FIDE rating refresh does not expose a protected busy state.');
  assert(companionSource.includes('applyFidePlayerSync'), 'Web rating refresh must use the protected FIDE_PLAYER_SYNC transaction.');
  assert(companionSource.includes("['ratingStandard', 'ratingRapid', 'ratingBlitz']"), 'Web rating refresh must preserve separate Standard/Rapid/Blitz fields.');

  console.log('PASS FIDE monthly rating refresh: ratings updated by control while pairing/results and non-rating player data stay unchanged.');
}

try {
  main();
} catch (error) {
  console.error('FAIL FIDE monthly rating refresh:', error);
  process.exitCode = 1;
}
