import assert from 'node:assert/strict';
import { createInitialEmptyTournament } from '../../data/initialData';
import { buildChessResultsXml } from '../../chessResults/publication';
import { buildPublicHubSnapshot } from '../publicHubSnapshot';
import { getPlayerPublicationOrder, orderPlayersForPublication } from '../../publication/playerPublicationOrder';

const tournament = createInitialEmptyTournament('Publication player order test');
tournament.chessResults.key = '123456';
tournament.players = tournament.players.slice(0, 3);

const names = ['Zulu Player', 'Alpha Player', 'Mike Player'];
const ratings = [1900, 1700, 1800];
tournament.players.forEach((player, index) => {
  player.name = names[index];
  player.rating = ratings[index];
  player.stdRating = ratings[index];
  player.pairingNumber = index + 1;
});

tournament.pairings.liveBoards = {
  '1': [{
    board: 1,
    whiteKey: tournament.players[0].localKey,
    blackKey: tournament.players[1].localKey,
    result: '1 - 0'
  }]
};

const originalPairingNumbers = tournament.players.map(player => player.pairingNumber);

// Existing tournaments without an explicit preference now publish by rating,
// removing registration-order publication while leaving official numbers intact.
assert.equal(getPlayerPublicationOrder(tournament), 'rating');
assert.deepEqual(orderPlayersForPublication(tournament).map(player => player.name), ['Zulu Player', 'Mike Player', 'Alpha Player']);

(tournament.settings as any).playerPublicationOrder = 'rating';
const hubRating = buildPublicHubSnapshot(tournament);
assert.deepEqual(hubRating.players.map((player: any) => player.name), ['Zulu Player', 'Mike Player', 'Alpha Player']);

const chessRating = buildChessResultsXml(tournament, { requireKey: true });
const ratingPlayerTags = [...chessRating.xml.matchAll(/<player\b[^>]*\/>/g)].map(match => match[0]);
assert.equal(ratingPlayerTags.length, 3);
assert.match(ratingPlayerTags[0], /no="1"[^>]*lastname="Zulu Player"/);
assert.match(ratingPlayerTags[1], /no="2"[^>]*lastname="Mike Player"/);
assert.match(ratingPlayerTags[2], /no="3"[^>]*lastname="Alpha Player"/);
assert.match(chessRating.xml, /<playerpairing\b[^>]*whiteno="1"[^>]*blackno="3"/);

(tournament.settings as any).playerPublicationOrder = 'name';
const hubName = buildPublicHubSnapshot(tournament);
assert.deepEqual(hubName.players.map((player: any) => player.name), ['Alpha Player', 'Mike Player', 'Zulu Player']);

const chessName = buildChessResultsXml(tournament, { requireKey: true });
const namePlayerTags = [...chessName.xml.matchAll(/<player\b[^>]*\/>/g)].map(match => match[0]);
assert.match(namePlayerTags[0], /no="1"[^>]*lastname="Alpha Player"/);
assert.match(namePlayerTags[1], /no="2"[^>]*lastname="Mike Player"/);
assert.match(namePlayerTags[2], /no="3"[^>]*lastname="Zulu Player"/);
assert.match(chessName.xml, /<playerpairing\b[^>]*whiteno="3"[^>]*blackno="1"/);

(tournament.settings as any).playerPublicationOrder = 'starting';
assert.deepEqual(orderPlayersForPublication(tournament).map(player => player.name), ['Zulu Player', 'Alpha Player', 'Mike Player']);

assert.deepEqual(
  tournament.players.map(player => player.pairingNumber),
  originalPairingNumbers,
  'Publication ordering must never mutate official pairing/starting numbers.'
);

console.log('PASS publication player order: Web sort preference drives Chess-Results + Hub without mutating official starting numbers.');
