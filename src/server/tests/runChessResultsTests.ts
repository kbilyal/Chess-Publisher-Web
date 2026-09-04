import assert from 'node:assert/strict';
import { createInitialEmptyTournament } from '../../data/initialData';
import { buildChessResultsXml, validateChessResultsTournament } from '../../chessResults/publication';

const tournament = createInitialEmptyTournament('Chess-Results Contract Test');
tournament.chessResults.key = '123456';
tournament.players = tournament.players.slice(0, 2);
tournament.players.forEach((player, index) => { player.pairingNumber = index + 1; });
tournament.pairings.liveBoards = { '1': [{ board: 1, whiteKey: tournament.players[0].localKey, blackKey: tournament.players[1].localKey, result: '1 - 0' }] };

const publication = buildChessResultsXml(tournament, { requireKey: true });
assert.equal(publication.key, '123456');
assert.equal(publication.players, 2);
assert.equal(publication.rounds, Number(tournament.settings.rounds));
assert.equal(publication.pairingRecords, 1);
assert.match(publication.xml, /<tournament[^>]*key="123456"/);
assert.match(publication.xml, /<round round="1"/);
assert.match(publication.xml, /<playerpairing[^>]*whiteno="1"[^>]*blackno="2"[^>]*reswhite="1\.0"/);
assert.match(publication.xml, /sid="__CP_CR_SID__"/);

const invalid = structuredClone(tournament);
invalid.settings.tournamentFormat = 'Individual Round Robin';
assert.throws(() => validateChessResultsTournament(invalid), /Individual Swiss/);

const duplicate = structuredClone(tournament);
duplicate.players[1].pairingNumber = 1;
assert.throws(() => validateChessResultsTournament(duplicate), /duplicate starting number/i);

console.log('Chess-Results publication contract: 8/8 PASS');
