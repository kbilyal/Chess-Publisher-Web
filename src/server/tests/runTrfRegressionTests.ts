import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createInitialEmptyTournament } from '../../data/initialData';
import { buildTRFText, parseTRF } from '../../engine/trfParser';

function createRegressionTournament() {
  const tournament: any = createInitialEmptyTournament('TRF Regression Tournament');
  tournament.settings.organizer = 'Chess-Publisher Regression';
  tournament.settings.city = 'Kardzhali';
  tournament.settings.country = 'BUL';
  tournament.settings.startDate = '2026-09-07T10:00';
  tournament.settings.endDate = '2026-09-07T18:00';
  tournament.settings.chiefArbiter = 'FA Regression Arbiter';
  tournament.settings.timeControl = '15+5';
  tournament.settings.rounds = '7';
  tournament.settings.tournamentFormat = 'Individual Swiss';
  tournament.regulations.tieBreaks = ['Buchholz Cut-1', 'Sonneborn-Berger', 'Direct Encounter'];
  tournament.players = [
    {
      id: 1,
      localKey: 'local:trf-a',
      name: 'Alpha, Player',
      rating: 2100,
      nationalRating: 0,
      fed: 'BUL',
      fideId: '2900001',
      birth: '1990-01-02',
      gender: 'm',
      title: 'FM',
      attendance: 'present',
      pairingNumber: 1,
      joinedFromRound: 1,
      fideK: 20
    },
    {
      id: 2,
      localKey: 'local:trf-b',
      name: 'Beta, Player',
      rating: 0,
      nationalRating: 0,
      fed: 'BUL',
      fideId: '-',
      birth: '2004-05-06',
      gender: 'f',
      title: '',
      attendance: 'present',
      pairingNumber: 2,
      joinedFromRound: 1,
      fideK: 20
    }
  ];
  return tournament;
}

const tournament = createRegressionTournament();
const trf26 = buildTRFText(tournament, 26);
const trf16 = buildTRFText(tournament, 16);

assert.equal(trf26.ok, true, `TRF26 generation failed: ${trf26.errors.join(' | ')}`);
assert.equal(trf16.ok, true, `TRF16 generation failed: ${trf16.errors.join(' | ')}`);
assert.equal(trf26.playerCount, 2);
assert.equal(trf16.playerCount, 2);
assert.equal(trf26.roundsCount, 7);
assert.equal(trf16.roundsCount, 7);

for (const marker of ['012 TRF Regression Tournament', '022 Kardzhali', '032 BUL', '102 FA Regression Arbiter', '122 15+5', '182 Chess-Publisher']) {
  assert.ok(trf26.text.includes(marker), `TRF26 missing mandatory marker: ${marker}`);
  assert.ok(trf16.text.includes(marker), `TRF16 missing mandatory marker: ${marker}`);
}

for (const marker of ['192 FIDE_DUTCH_2025', '212 PTS,BH/C1,SB,DE', '222 900+5']) {
  assert.ok(trf26.text.includes(marker), `TRF26 missing descriptor: ${marker}`);
  assert.ok(!trf16.text.includes(marker), `TRF16 must not contain TRF26-only descriptor: ${marker}`);
}

assert.ok(trf26.text.includes('001    1'), 'TRF26 first player record is missing.');
assert.ok(trf26.text.includes('001    2'), 'TRF26 second player record is missing.');
assert.ok(trf26.text.endsWith('\r\n'), 'TRF26 must terminate with CRLF.');
assert.ok(trf16.text.endsWith('\r\n'), 'TRF16 must terminate with CRLF.');

const parsed26 = parseTRF(trf26.text);
const parsed16 = parseTRF(trf16.text);
assert.equal(parsed26.version, 26, 'Generated TRF26 must parse back as version 26.');
assert.equal(parsed16.version, 16, 'Generated TRF16 must parse back as version 16.');
assert.equal(parsed26.name, 'TRF Regression Tournament');
assert.equal(parsed26.city, 'Kardzhali');
assert.equal(parsed26.country, 'BUL');
assert.equal(parsed26.players.length, 2, 'TRF26 round-trip player count changed.');
assert.equal(parsed16.players.length, 2, 'TRF16 round-trip player count changed.');

const fixturePath = path.join(process.cwd(), 'src/server/fixtures/data/fixture-10-imported-trf26.trf');
const fixture = fs.readFileSync(fixturePath, 'utf8');
const parsedFixture = parseTRF(fixture);
assert.equal(parsedFixture.version, 26, 'Known imported TRF26 fixture must remain recognized as TRF26.');
assert.ok(parsedFixture.players.length > 0, 'Known TRF26 fixture lost its player records.');

console.log('PASS explicit TRF regression: TRF16 + TRF26 generation, descriptors, CRLF, round-trip parsing and imported TRF26 fixture.');
