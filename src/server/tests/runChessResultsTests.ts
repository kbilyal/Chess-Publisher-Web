import assert from 'node:assert/strict';
import { createInitialEmptyTournament } from '../../data/initialData';
import { buildChessResultsXml, validateChessResultsTournament } from '../../chessResults/publication';

const tournament = createInitialEmptyTournament('Chess-Results Contract Test');
tournament.chessResults.key = '123456';
tournament.players = tournament.players.slice(0, 3);
tournament.players.forEach((player, index) => { player.pairingNumber = index + 1; });
tournament.pairings.liveBoards = { '1': [{ board: 1, whiteKey: tournament.players[0].localKey, blackKey: tournament.players[1].localKey, result: '1 - 0' }] };

const publication = buildChessResultsXml(tournament, { requireKey: true });
assert.equal(publication.key, '123456');
assert.equal(publication.players, 3);
assert.equal(publication.rounds, Number(tournament.settings.rounds));
assert.equal(publication.pairingRecords, 2);
assert.match(publication.xml, /<tournament[^>]*key="123456"/);
assert.match(publication.xml, /<round round="1"/);
assert.match(publication.xml, /<playerpairing[^>]*whiteno="1"[^>]*blackno="2"[^>]*reswhite="1\.0"/);
assert.match(publication.xml, /<playerpairing[^>]*whiteno="3"[^>]*blackno="-2"[^>]*reswhite=""/);
assert.match(publication.xml, /sid="__CP_CR_SID__"/);

// Chess-Results defines `pairing` as a team-pairing index. Individual Swiss
// records must all use pairing="1"; board numbering belongs in `board`.
const individualPairings = [...publication.xml.matchAll(/<playerpairing\b[^>]*\/>/g)].map(match => match[0]);
assert.equal(individualPairings.length, 2);
individualPairings.forEach(record => assert.match(record, /\bpairing="1"/));
assert.doesNotMatch(publication.xml, /<playerpairing\b[^>]*\bpairing="2"/);

const pab = structuredClone(tournament);
pab.pairings.liveBoards = { '1': [{ board: 1, whiteKey: pab.players[0].localKey, blackKey: '', result: 'PAB' }] };
const pabPublication = buildChessResultsXml(pab, { requireKey: true });
assert.match(pabPublication.xml, /<playerpairing[^>]*pairing="1"[^>]*whiteno="1"[^>]*blackno="-1"[^>]*forfeit="K"/);
assert.doesNotMatch(pabPublication.xml, /<playerpairing\b[^>]*\bpairing="[2-9]/);

const invalid = structuredClone(tournament);
invalid.settings.tournamentFormat = 'Individual Round Robin';
assert.throws(() => validateChessResultsTournament(invalid), /Individual Swiss/);

const duplicate = structuredClone(tournament);
duplicate.players[1].pairingNumber = 1;
assert.throws(() => validateChessResultsTournament(duplicate), /duplicate starting number/i);

const gap = structuredClone(tournament);
gap.players[2].pairingNumber = 4;
assert.throws(() => validateChessResultsTournament(gap), /continuous from 1 to 3/i);

const staleRound = structuredClone(tournament);
staleRound.pairings.liveBoards = {
  ...staleRound.pairings.liveBoards,
  '99': [{ board: 1, whiteKey: staleRound.players[0].localKey, blackKey: staleRound.players[1].localKey, result: '' }]
};
assert.throws(() => buildChessResultsXml(staleRound, { requireKey: true }), /round 99 is outside the declared/i);

const unknownPlayer = structuredClone(tournament);
unknownPlayer.pairings.liveBoards = { '1': [{ board: 1, whiteKey: 'missing-player', blackKey: unknownPlayer.players[1].localKey, result: '' }] };
assert.throws(() => buildChessResultsXml(unknownPlayer, { requireKey: true }), /unknown White player/i);

const duplicateBoard = structuredClone(tournament);
duplicateBoard.pairings.liveBoards = {
  '1': [
    { board: 1, whiteKey: duplicateBoard.players[0].localKey, blackKey: duplicateBoard.players[1].localKey, result: '' },
    { board: 1, whiteKey: duplicateBoard.players[2].localKey, blackKey: '', result: 'PAB' }
  ]
};
assert.throws(() => buildChessResultsXml(duplicateBoard, { requireKey: true }), /invalid or duplicate board number/i);

console.log('Chess-Results publication contract: upload-index regression PASS');
