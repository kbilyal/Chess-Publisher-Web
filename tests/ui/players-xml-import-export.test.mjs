import assert from 'node:assert/strict';
import fs from 'node:fs';

const screens = fs.readFileSync('src/companion/CompanionCloudScreens.tsx', 'utf8');
const registration = fs.readFileSync('src/companion/CompanionRegistration.tsx', 'utf8');
const importer = fs.readFileSync('src/importers/tournamentFileImport.ts', 'utf8');
const playersXml = fs.readFileSync('src/importers/playersXml.ts', 'utf8');

const has = (source, marker, message) => assert.ok(source.includes(marker), message || `Missing ${marker}`);
const lacks = (source, marker, message) => assert.ok(!source.includes(marker), message || `Forbidden ${marker}`);

assert.equal((screens.match(/<strong>Import tournament<\/strong>/g) || []).length, 1, 'My Tournaments must keep one Import tournament button.');
has(screens, 'TRF16 · TRF26 · TUNX · Players XML', 'The existing importer must advertise Players XML.');
has(screens, '.xml,.XML', 'The existing file picker must accept XML extensions.');
has(screens, 'application/xml,text/xml', 'The existing file picker must accept XML MIME types.');

has(importer, "export type TournamentImportKind = 'trf' | 'tunx' | 'players-xml'", 'Players XML must use the normal tournament import pipeline.');
has(importer, 'importPlayersXmlText', 'Players XML importer is missing.');
has(importer, "sourceType: 'players-xml'", 'Players XML source metadata must be preserved.');
has(importer, "settings: { ...next.settings, tnr: '' }", 'Imported source Tournament Key must not become an active Chess-Results TNR.');
has(importer, "chessResults = { ...next.chessResults, key: '', freshTnrRequired: false }", 'Players XML import must not claim Chess-Results ownership.');
has(importer, "liveBoards: {}", 'Players-only XML must not fabricate pairings.');

has(playersXml, 'export function parsePlayersXml', 'Players XML parser is missing.');
has(playersXml, 'export function buildPlayersXml', 'Players XML exporter is missing.');
has(playersXml, ".replace(/&/g, '&amp;')", 'Players XML export must escape ampersands.');
lacks(playersXml, 'DOMParser', 'Loose source XML must not depend on strict DOMParser well-formedness.');
has(playersXml, "PlayerUniqueId", 'Export schema must preserve PlayerUniqueId.');
has(playersXml, "PlayerSno", 'Export schema must preserve PlayerSno.');
has(playersXml, "FIDEFactor", 'Export schema must preserve FIDEFactor.');

has(registration, "import { downloadPlayersXml } from '../importers/playersXml';", 'Players page must use the shared XML exporter.');
has(registration, 'Export players (XML)', 'Players page must expose a separate XML export button.');
has(registration, 'disabled={!players.length}', 'Players XML export must be disabled for an empty roster.');
has(registration, 'downloadPlayersXml(tournament)', 'Export button must export the active tournament roster.');

console.log('PASS Players XML UI contract: one import picker accepts roster XML and Players page exposes a separate XML export action.');
