import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInitialEmptyTournament } from '../../data/initialData';
import { buildChessResultsXml } from '../../chessResults/publication';

function createTournament() {
  const tournament = createInitialEmptyTournament('Pin Board regression');
  tournament.chessResults.key = '123456';
  tournament.settings.tnr = '123456';
  tournament.players = tournament.players.slice(0, 2);
  tournament.players.forEach((player, index) => { player.pairingNumber = index + 1; });
  tournament.pairings.liveBoards = {};
  return tournament;
}

const disabled = createTournament();
disabled.chessResults.pinBoardEnabled = false;
disabled.chessResults.pinBoardText = 'Private draft that must not be published';
const disabledPublication = buildChessResultsXml(disabled, { requireKey: true });
assert.match(disabledPublication.xml, /<tournament[^>]*remark=""/, 'Disabled Pin Board must publish an empty remark.');
assert.doesNotMatch(disabledPublication.xml, /Private draft that must not be published/, 'Disabled draft text must never leak into Chess-Results XML.');

const enabled = createTournament();
enabled.chessResults.pinBoardEnabled = true;
enabled.chessResults.pinBoardText = 'Round 3\nstarts <now> & "live"';
const enabledPublication = buildChessResultsXml(enabled, { requireKey: true });
assert.ok(
  enabledPublication.xml.includes('remark="Round 3 starts &lt;now&gt; &amp; &quot;live&quot;"'),
  'Enabled Pin Board text must be normalized and XML-escaped in tournament remark.'
);

const capped = createTournament();
capped.chessResults.pinBoardEnabled = true;
capped.chessResults.pinBoardText = 'X'.repeat(650);
const cappedPublication = buildChessResultsXml(capped, { requireKey: true });
const remark = cappedPublication.xml.match(/\bremark="([^"]*)"/)?.[1] || '';
assert.equal(remark.length, 599, 'Chess-Results Pin Board remark must be capped at 599 characters.');

const component = readFileSync(resolve(process.cwd(), 'src/companion/ChessResultsPinBoard.tsx'), 'utf8');
const workspace = readFileSync(resolve(process.cwd(), 'src/companion/CompanionWorkspace.tsx'), 'utf8');
const publication = readFileSync(resolve(process.cwd(), 'src/chessResults/publication.ts'), 'utf8');

assert.match(component, /data-chess-results-pin-board="true"/, 'Companion must expose a dedicated Pin Board control.');
assert.match(component, /data-chess-results-pin-board-enabled="true"/, 'Pin Board enable switch is missing.');
assert.match(component, /data-chess-results-pin-board-text="true"/, 'Pin Board text input is missing.');
assert.match(component, /CHESS_RESULTS_PIN_BOARD_MAX_LENGTH = 599/, 'UI limit must match the Chess-Results remark contract.');
assert.match(component, /maxLength=\{CHESS_RESULTS_PIN_BOARD_MAX_LENGTH\}/, 'Textarea must enforce the 599-character limit before publish.');
assert.match(component, /\.\.\.previous\.chessResults[\s\S]*pinBoardEnabled/, 'Enable toggle must point-update chessResults without replacing unrelated tournament state.');
assert.match(component, /\.\.\.previous\.chessResults[\s\S]*pinBoardText/, 'Text edit must point-update chessResults without replacing unrelated tournament state.');
assert.match(workspace, /<ChessResultsPinBoard[\s\S]*disabled=\{publishBlocked\}/, 'Pin Board editing must be locked while publish/SYNC/conflict protection is active.');
assert.match(publication, /attr\('remark', cr\.pinBoardEnabled \? text\(cr\.pinBoardText, 599\) : ''\)/, 'Publication must remain mapped only to the established Chess-Results remark attribute.');

console.log('PASS Chess-Results Pin Board: disabled privacy, enabled remark, XML escaping, 599-char cap, guarded Companion UI.');
