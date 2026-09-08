import assert from 'node:assert/strict';
import { buildTRFText, setTrfField } from '../../engine/trfParser';
import { buildPrivateSnapshot } from '../onlineCloudSync';
import { buildPublicHubSnapshot } from '../publicHubSnapshot';
import { createInitialEmptyTournament } from '../../data/initialData';
import { createCleanTournament, importTrfText, importTunxBytes } from '../../importers/tournamentFileImport';

function u16(value: number) { return [value & 0xff, (value >> 8) & 0xff]; }
function u32(value: number) { return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]; }
function utf16(value: string) {
  const bytes: number[] = [...u16(value.length)];
  for (const ch of value) bytes.push(ch.charCodeAt(0) & 0xff, (ch.charCodeAt(0) >> 8) & 0xff);
  return bytes;
}
function syntheticTunx() {
  const header = new Uint8Array(108);
  header.set([0x93, 0xff, 0x89, 0x44], 0);
  const metadata = Array.from({ length: 21 }, () => '');
  metadata[0] = 'Synthetic TUNX Open';
  metadata[3] = 'FA Test Arbiter';
  metadata[10] = 'Sofia';
  metadata[14] = '15+10';
  metadata[20] = 'BUL';
  const metadataBytes = metadata.flatMap(utf16);
  const config = new Uint8Array(4 + 0x1100);
  config.set([0x95, 0xff, 0x89, 0x44], 0);
  const cv = new DataView(config.buffer);
  cv.setUint16(4 + 0x00, 1, true); // total rounds
  cv.setUint8(4 + 0x0b, 0); // swiss
  cv.setUint8(4 + 0x11, 1); // current round
  cv.setUint16(4 + 0x13, 1, true); // players
  cv.setUint32(4 + 0x47, 20260908, true);
  cv.setUint32(4 + 0x4b, 20260908, true);
  const strings = Array.from({ length: 30 }, () => '');
  strings[0] = 'Player'; strings[1] = 'One'; strings[4] = 'FM'; strings[10] = 'BUL';
  const playerStrings = strings.flatMap(utf16);
  const numeric = new Uint8Array(110);
  const nv = new DataView(numeric.buffer);
  nv.setUint16(0x08, 2100, true);
  nv.setUint32(0x18, 2900001, true);
  const pairing = new Uint8Array(21);
  const pv = new DataView(pairing.buffer);
  pv.setUint16(0, 1, true);
  pv.setUint16(2, 0xfffe, true);
  pv.setUint16(4, 9, true); // full bye in upstream parser
  const total = header.length + metadataBytes.length + config.length + 4 + playerStrings.length + numeric.length + 4 + pairing.length;
  const out = new Uint8Array(total);
  let at = 0;
  out.set(header, at); at += header.length;
  out.set(metadataBytes, at); at += metadataBytes.length;
  out.set(config, at); at += config.length;
  out.set([0xa5, 0xff, 0x89, 0x44], at); at += 4;
  out.set(playerStrings, at); at += playerStrings.length;
  out.set(numeric, at); at += numeric.length;
  out.set([0xb3, 0xff, 0x89, 0x44], at); at += 4;
  out.set(pairing, at);
  return out;
}

const fresh: any = createCleanTournament('Created in Web');
assert.equal(fresh.name, 'Created in Web');
assert.equal(fresh.players.length, 0);
assert.equal(fresh.settings.city, '');
assert.equal(fresh.settings.tnr, '');
assert.equal(fresh.cloud, undefined);
assert.equal(fresh.online, undefined);

const trfSource: any = createInitialEmptyTournament('TRF Import Source');
trfSource.settings.organizer = 'TRF Import Source';
trfSource.settings.city = 'Sofia';
trfSource.settings.country = 'BUL';
trfSource.settings.startDate = '2026-09-08T10:00';
trfSource.settings.endDate = '2026-09-08T18:00';
trfSource.settings.chiefArbiter = 'FA Import Test';
trfSource.settings.timeControl = '15+10';
trfSource.settings.rounds = '1';
trfSource.players = [
  { id: 1, localKey: 'fid:2900001', name: 'One, Player', rating: 2100, fed: 'BUL', fideId: '2900001', birth: '1990-01-01', gender: 'm', title: 'FM', attendance: 'present', pairingNumber: 1, joinedFromRound: 1 },
  { id: 2, localKey: 'fid:2900002', name: 'Two, Player', rating: 2000, fed: 'BUL', fideId: '2900002', birth: '1991-01-01', gender: 'm', title: '', attendance: 'present', pairingNumber: 2, joinedFromRound: 1 }
];
trfSource.pairings.liveBoards = { '1': [{ board: 1, whiteKey: 'fid:2900001', blackKey: 'fid:2900002', result: '1 - 0' }] };
const trf = buildTRFText(trfSource, 26, 1);
assert.equal(trf.ok, true, trf.errors.join(' '));
// The exporter regression fixture is not a finalized-round fixture, so force the
// two authoritative 001 round slots here. A complete TRF round slot occupies
// columns 92..101; pad the physical line so parseTRF counts that slot.
const trfLines = trf.text.trimEnd().split(/\r?\n/).map(line => {
  if (!line.startsWith('001')) return line;
  line = line.padEnd(101, ' ');
  const no = Number.parseInt(line.slice(4, 8), 10);
  if (no === 1) {
    line = setTrfField(line, 92, 4, '2', true);
    line = setTrfField(line, 97, 1, 'w');
    line = setTrfField(line, 99, 1, '1');
  } else if (no === 2) {
    line = setTrfField(line, 92, 4, '1', true);
    line = setTrfField(line, 97, 1, 'b');
    line = setTrfField(line, 99, 1, '0');
  }
  return line;
});
const importedTrf: any = importTrfText(`${trfLines.join('\r\n')}\r\n`, 'sample.trf');
assert.equal(importedTrf.kind, 'trf');
assert.equal(importedTrf.playerCount, 2);
assert.equal(importedTrf.tournament.settings.tnr, '');
assert.equal(importedTrf.tournament.pairings.trfImportMeta.sourceType, 'trf');
assert.equal(Object.keys(importedTrf.tournament.pairings.liveBoards).length, 1);

const tunxBytes = syntheticTunx();
const importedTunx: any = importTunxBytes(tunxBytes, 'synthetic.TUNX');
assert.equal(importedTunx.kind, 'tunx');
assert.equal(importedTunx.tournament.name, 'Synthetic TUNX Open');
assert.equal(importedTunx.playerCount, 1);
assert.equal(importedTunx.tournament.players[0].pairingNumber, 1);
assert.equal(importedTunx.tournament.players[0].fideId, '2900001');
assert.equal(importedTunx.tournament.settings.city, 'Sofia');
assert.equal(importedTunx.tournament.settings.country, 'BUL');
assert.equal(importedTunx.tournament.settings.timeControl, '15+10');
assert.ok(importedTunx.tournament.regulations.tunxSourceTemplateBase64.length > 20);
assert.equal(importedTunx.tournament.regulations.tunxSourceTemplateFileName, 'synthetic.TUNX');
assert.equal(importedTunx.tournament.pairings.liveBoards['1'][0].result, '1 BYE');

const privateSnapshot = buildPrivateSnapshot(importedTunx.tournament.name, importedTunx.tournament);
assert.ok(JSON.stringify(privateSnapshot).includes('tunxSourceTemplateBase64'), 'Original TUNX source must travel only in private Desktop/Web snapshot.');
const publicSnapshot = buildPublicHubSnapshot(importedTunx.tournament);
assert.equal(publicSnapshot.rounds[0]?.pairings[0]?.blackKey, null, 'Hub bye pairing must not expose a pseudo-player key.');
assert.equal(JSON.stringify(publicSnapshot).includes('tunxSourceTemplateBase64'), false, 'Raw TUNX source must never enter the public Hub snapshot.');
assert.equal(JSON.stringify(publicSnapshot).includes('synthetic.TUNX'), false, 'Private import filename must not be exposed in the public Hub payload.');

console.log('WEB_NEW_TOURNAMENT_CLEAN_SEED=PASS');
console.log('WEB_TRF16_TRF26_FULL_IMPORT=PASS');
console.log('WEB_TUNX_BINARY_IMPORT=PASS');
console.log('TUNX_PRIVATE_CLOUD_ONLY=PASS');
