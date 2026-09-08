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
assert.match(publication.xml, /<tournament[^>]*currentround="1"[^>]*rankinground="1"[^>]*sortstartrank="2"/);
assert.match(publication.xml, /<tournament[^>]*ratednational="-"[^>]*tb1no="0"[^>]*tb5no="0"[^>]*replay="1"/);
assert.match(publication.xml, /<tournament[^>]*endstatus="N"/);
assert.match(publication.xml, /<round round="1" date="20261002" time="10:00" replay="1"/);
assert.match(publication.xml, /<player[^>]*firstname=""[^>]*atitle=""/);
assert.match(publication.xml, /<player[^>]*board=""[^>]*teamno="0"/);
assert.match(publication.xml, /<player[^>]*tb1=""[^>]*tb5=""[^>]*pts="1\.0"[^>]*equal="N"/);
assert.match(publication.xml, /sid="__CP_CR_SID__"/);

// Official 2026 Individual Swiss reference XML uses pairing as the sequential
// table index and board="1" for every player-pairing record.
const individualPairings = [...publication.xml.matchAll(/<playerpairing\b[^>]*\/>/g)].map(match => match[0]);
assert.equal(individualPairings.length, 2);
assert.match(individualPairings[0], /\bpairing="1"\b[^>]*\bboard="1"/);
assert.match(individualPairings[0], /\bwhiteno="1"[^>]*\bblackno="2"[^>]*\breswhite="1\.0"[^>]*\bresblack="0\.0"/);
assert.match(individualPairings[1], /\bpairing="2"\b[^>]*\bboard="1"/);
assert.match(individualPairings[1], /\bwhiteno="3"[^>]*\bblackno="-2"[^>]*\breswhite=""/);

const twoTables = structuredClone(tournament);
twoTables.pairings.liveBoards = {
  '1': [
    { board: 4, whiteKey: twoTables.players[0].localKey, blackKey: twoTables.players[1].localKey, result: '1 - 0' },
    { board: 9, whiteKey: twoTables.players[2].localKey, blackKey: '', result: 'PAB' },
  ],
};
const twoTablesPublication = buildChessResultsXml(twoTables, { requireKey: true });
const twoTableRecords = [...twoTablesPublication.xml.matchAll(/<playerpairing\b[^>]*\/>/g)].map(match => match[0]);
assert.equal(twoTableRecords.length, 2);
assert.match(twoTableRecords[0], /pairing="1"[^>]*board="1"/);
assert.match(twoTableRecords[1], /pairing="2"[^>]*board="1"/);
assert.doesNotMatch(twoTablesPublication.xml, /<playerpairing\b[^>]*board="4"/);
assert.doesNotMatch(twoTablesPublication.xml, /<playerpairing\b[^>]*board="9"/);

const draw = structuredClone(tournament);
draw.pairings.liveBoards = { '1': [{ board: 1, whiteKey: draw.players[0].localKey, blackKey: draw.players[1].localKey, result: '½ - ½' }] };
const drawPublication = buildChessResultsXml(draw, { requireKey: true });
assert.match(drawPublication.xml, /reswhite="0\.5"[^>]*resblack="0\.5"/);

const pab = structuredClone(tournament);
pab.pairings.liveBoards = { '1': [{ board: 1, whiteKey: pab.players[0].localKey, blackKey: '', result: 'PAB' }] };
const pabPublication = buildChessResultsXml(pab, { requireKey: true });
assert.match(pabPublication.xml, /<playerpairing[^>]*pairing="1"[^>]*board="1"[^>]*whiteno="1"[^>]*blackno="-1"[^>]*reswhite="1\.0"[^>]*resblack="0\.0"[^>]*forfeit="K"/);
assert.match(pabPublication.xml, /<playerpairing[^>]*pairing="2"[^>]*board="1"[^>]*blackno="-2"/);

// Round date/time is optional in the current Chess-Results schema. A tournament
// must remain publishable before the full schedule has been entered.
const preRound = structuredClone(tournament);
preRound.pairings.liveBoards = {};
preRound.schedule.rows = [];
const preRoundPublication = buildChessResultsXml(preRound, { requireKey: true });
assert.equal(preRoundPublication.pairingRecords, 0);
assert.match(preRoundPublication.xml, /<tournament[^>]*currentround="0"[^>]*rankinground="0"[^>]*sortstartrank="2"/);
assert.match(preRoundPublication.xml, /<round round="1" date="" time="" replay="1"/);
assert.match(preRoundPublication.xml, /<player[^>]*rank="1"[^>]*tb1=""[^>]*tb5=""[^>]*pts="0\.0"[^>]*equal="N"/);

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

console.log('Chess-Results publication contract: 2026 Individual Swiss schema parity PASS');
