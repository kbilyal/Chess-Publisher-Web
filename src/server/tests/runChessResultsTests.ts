import assert from 'node:assert/strict';
import { createInitialEmptyTournament } from '../../data/initialData';
import { buildChessResultsXml, validateChessResultsTournament } from '../../chessResults/publication';

const tournament = createInitialEmptyTournament('Chess-Results Contract Test');
tournament.chessResults.key = '123456';
tournament.players = tournament.players.slice(0, 3);
tournament.players.forEach((player, index) => { player.pairingNumber = index + 1; });
tournament.schedule.rows = Array.from({ length: Number(tournament.settings.rounds) }, (_, index) => ({
  no: String(index + 1),
  dateTime: `2026-10-${String(index + 2).padStart(2, '0')}T10:00`,
  event: `Round ${index + 1}`,
  description: `Round ${index + 1}`,
}));
tournament.pairings.liveBoards = { '1': [{ board: 1, whiteKey: tournament.players[0].localKey, blackKey: tournament.players[1].localKey, result: '1 - 0' }] };

const publication = buildChessResultsXml(tournament, { requireKey: true });
assert.equal(publication.key, '123456');
assert.equal(publication.players, 3);
assert.equal(publication.rounds, Number(tournament.settings.rounds));
assert.equal(publication.pairingRecords, 2);
assert.match(publication.xml, /<tournament[^>]*key="123456"/);
assert.match(publication.xml, /<round round="1" date="20261002" time="10:00"/);
assert.doesNotMatch(publication.xml, /<round\b[^>]*date=""/);
assert.doesNotMatch(publication.xml, /<round\b[^>]*time=""/);
assert.match(publication.xml, /<player[^>]*board="0"[^>]*teamno="0"/);
assert.match(publication.xml, /<playerpairing[^>]*whiteno="1"[^>]*blackno="2"[^>]*reswhite="1"[^>]*resblack="0"/);
assert.match(publication.xml, /<playerpairing[^>]*whiteno="3"[^>]*blackno="-2"[^>]*reswhite=""/);
assert.match(publication.xml, /sid="__CP_CR_SID__"/);

// Individual Swiss records use pairing="1"; board numbering belongs in board.
const individualPairings = [...publication.xml.matchAll(/<playerpairing\b[^>]*\/>/g)].map(match => match[0]);
assert.equal(individualPairings.length, 2);
individualPairings.forEach(record => assert.match(record, /\bpairing="1"/));
assert.doesNotMatch(publication.xml, /<playerpairing\b[^>]*\bpairing="2"/);

const draw = structuredClone(tournament);
draw.pairings.liveBoards = { '1': [{ board: 1, whiteKey: draw.players[0].localKey, blackKey: draw.players[1].localKey, result: '½ - ½' }] };
const drawPublication = buildChessResultsXml(draw, { requireKey: true });
assert.match(drawPublication.xml, /reswhite="0,5"[^>]*resblack="0,5"/);

const pab = structuredClone(tournament);
pab.pairings.liveBoards = { '1': [{ board: 1, whiteKey: pab.players[0].localKey, blackKey: '', result: 'PAB' }] };
const pabPublication = buildChessResultsXml(pab, { requireKey: true });
assert.match(pabPublication.xml, /<playerpairing[^>]*pairing="1"[^>]*whiteno="1"[^>]*blackno="-1"[^>]*forfeit="K"/);
assert.doesNotMatch(pabPublication.xml, /<playerpairing\b[^>]*\bpairing="[2-9]/);

const missingSchedule = structuredClone(tournament);
missingSchedule.schedule.rows = missingSchedule.schedule.rows.filter(row => row.no !== '2');
assert.throws(() => validateChessResultsTournament(missingSchedule), /date and time for every round.*Round 2/i);

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
  '99': [{ board: 1, whiteKey: staleRound.players[0].localKey, blackKey: staleRound.players[1].localKey, result: '-' }]
};
assert.throws(() => buildChessResultsXml(staleRound, { requireKey: true }), /round 99 is outside the declared/i);

const unknownPlayer = structuredClone(tournament);
unknownPlayer.pairings.liveBoards = { '1': [{ board: 1, whiteKey: 'missing-player', blackKey: unknownPlayer.players[1].localKey, result: '-' }] };
assert.throws(() => buildChessResultsXml(unknownPlayer, { requireKey: true }), /unknown White player/i);

const duplicateBoard = structuredClone(tournament);
duplicateBoard.pairings.liveBoards = {
  '1': [
    { board: 1, whiteKey: duplicateBoard.players[0].localKey, blackKey: duplicateBoard.players[1].localKey, result: '-' },
    { board: 1, whiteKey: duplicateBoard.players[2].localKey, blackKey: '', result: 'PAB' }
  ]
};
assert.throws(() => buildChessResultsXml(duplicateBoard, { requireKey: true }), /invalid or duplicate board number/i);

console.log('Chess-Results publication contract: round schedule/schema regression PASS');
