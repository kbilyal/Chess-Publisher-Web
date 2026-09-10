import assert from 'node:assert/strict';
import { buildPlayersXml, looksLikePlayersXml, parsePlayersXml } from '../../src/importers/playersXml';
import { importPlayersXmlText, importTournamentFile } from '../../src/importers/tournamentFileImport';

const looseXml = `<?xml version="1.0"?>
<Players>
 <Tournament Key="1484437" Name="Autumn Open & Blitz"/>
 <Player PlayerUniqueId="55" PlayerSno="1" Lastname="Eren" Firstname="Ataberk" AcademicTitle="" Federation="TUR" Rating="2370" Birthday="19990000" Title="IM" FIDEId="6349765" NatId="" NatRating="0" Boardnumber="0" Gender="m" TeamSno="0" TeamUniqueId="0" Type="" Group="" Source="FIDE" ClubNo="0" Club="" FIDEFactor="10" />
 <Player PlayerUniqueId="31" PlayerSno="2" Lastname="Naymanova" Firstname="Patricie" AcademicTitle="" Federation="BUL" Rating="2056" Birthday="20050117" Title="WFM" FIDEId="2925907" NatId="BG-31" NatRating="2010" Boardnumber="0" Gender="f" TeamSno="0" TeamUniqueId="0" Type="U20" Group="A" Source="FIDE" ClubNo="0" Club="Club A" FIDEFactor="20" />
 <Player PlayerUniqueId="52" PlayerSno="3" Lastname="Angelov" Firstname="Zvetomir" AcademicTitle="" Federation="BUL" Rating="2060" Birthday="19730000" Title="AGM" FIDEId="2905353" NatId="" NatRating="0" Boardnumber="0" Gender="m" TeamSno="0" TeamUniqueId="0" Type="S50" Group="" Source="FIDE" ClubNo="0" Club="" FIDEFactor="20" />
 <Player PlayerUniqueId="60" PlayerSno="4" Lastname="Local" Firstname="Player" AcademicTitle="" Federation="BUL" Rating="0" Birthday="0" Title="" FIDEId="0" NatId="" NatRating="0" Boardnumber="0" Gender="m" TeamSno="0" TeamUniqueId="0" Type="" Group="" Source="" ClubNo="0" Club="" FIDEFactor="0" />
</Players>`;

assert.equal(looksLikePlayersXml(looseXml), true);
const parsed = parsePlayersXml(looseXml);
assert.equal(parsed.tournamentName, 'Autumn Open & Blitz');
assert.equal(parsed.sourceTournamentKey, '1484437');
assert.equal(parsed.players.length, 4);
assert.equal(parsed.players[0].id, 55);
assert.equal(parsed.players[0].pairingNumber, 1);
assert.equal(parsed.players[0].name, 'Eren, Ataberk');
assert.equal(parsed.players[0].fideId, '6349765');
assert.equal(parsed.players[0].birth, '1999');
assert.equal(parsed.players[0].fideK, 10);
assert.equal(parsed.players[1].birth, '2005-01-17');
assert.equal(parsed.players[1].nationalId, 'BG-31');
assert.equal(parsed.players[1].nationalRating, 2010);
assert.equal(parsed.players[1].type, 'U20');
assert.equal(parsed.players[1].group, 'A');
assert.equal(parsed.players[1].club, 'Club A');
assert.equal(parsed.players[2].title as string, 'AGM');
assert.equal(parsed.players[3].fideId, '-');
assert.equal(parsed.players[3].birth, '-');

const imported = importPlayersXmlText(looseXml, 'Players.XML');
assert.equal(imported.kind, 'players-xml');
assert.equal(imported.playerCount, 4);
assert.equal(imported.roundsImported, 0);
assert.equal(imported.tournament.name, 'Autumn Open & Blitz');
assert.equal(imported.tournament.settings.tnr, '');
assert.equal(imported.tournament.chessResults?.key || '', '');
assert.equal(imported.tournament.pairings.trfImportMeta?.sourceType, 'players-xml');
assert.equal(imported.tournament.pairings.trfImportMeta?.sourceTournamentKey, '1484437');
assert.deepEqual(imported.tournament.pairings.liveBoards, {});

const exported = buildPlayersXml(imported.tournament);
assert.match(exported, /^<\?xml version="1\.0"\?>/);
assert.match(exported, /Name="Autumn Open &amp; Blitz"/);
assert.match(exported, /PlayerSno="1"/);
assert.match(exported, /FIDEId="6349765"/);
assert.match(exported, /Birthday="19990000"/);
assert.match(exported, /Birthday="20050117"/);
assert.match(exported, /Title="AGM"/);
assert.match(exported, /Type="U20"/);
assert.match(exported, /Group="A"/);
assert.match(exported, /Club="Club A"/);
assert.match(exported, /FIDEFactor="10"/);

const roundTrip = parsePlayersXml(exported);
assert.equal(roundTrip.tournamentName, imported.tournament.name);
assert.equal(roundTrip.sourceTournamentKey, '1484437');
assert.equal(roundTrip.players.length, 4);
assert.equal(roundTrip.players[0].name, 'Eren, Ataberk');
assert.equal(roundTrip.players[1].nationalId, 'BG-31');
assert.equal(roundTrip.players[2].title as string, 'AGM');
assert.equal(roundTrip.players[3].fideId, '-');

const bytes = new TextEncoder().encode(looseXml);
const fileLike = {
  name: 'Players.XML',
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
} as File;
const routed = await importTournamentFile(fileLike);
assert.equal(routed.kind, 'players-xml');
assert.equal(routed.playerCount, 4);

await assert.rejects(
  () => importTournamentFile({
    name: 'other.xml',
    arrayBuffer: async () => new TextEncoder().encode('<Other/>').buffer
  } as File),
  /Players XML roster/
);

console.log('PASS Players XML: loose source import, roster mapping, safe source-key handling, valid export and round-trip compatibility.');
