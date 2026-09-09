import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component = readFileSync('src/arbiter/OrganizerPairingsReadOnly.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const css = readFileSync('src/arbiter/organizer-pairings.css', 'utf8');
const printCss = readFileSync('src/arbiter/organizer-pairings-print.css', 'utf8');
const uiFixes = readFileSync('src/arbiter/arbiter-ui-fixes.css', 'utf8');

const has = (source, needle, message) => assert.ok(source.includes(needle), message || `Missing: ${needle}`);
const lacks = (source, needle, message) => assert.ok(!source.includes(needle), message || `Forbidden: ${needle}`);

has(app, '<OrganizerPairingsReadOnly cloud={cloud} />', 'Organizer app must mount pairings for the active tournament.');
has(component, 'data-organizer-pairings-readonly="true"', 'Pairings viewer must declare its read-only contract.');
has(component, 'Read-only monitor', 'Organizer must see that Pairings is observation-only.');
has(component, 'Print Pairings', 'The only tournament action in the Pairings viewer must be printing.');
has(component, "window.print()", 'Pairings viewer must expose browser print.');
has(component, 'generatedRounds', 'Organizer must be able to observe generated rounds.');
has(component, '<th>Bo.</th><th>SNo</th><th>White Player</th><th>Elo</th><th>Result</th><th>SNo</th><th>Black Player</th><th>Elo</th><th>Arbiter / Sign</th>', 'Printed bulletin must preserve the protected Pairings print columns.');
has(component, 'Chief Arbiter Signature &amp; Stamp:', 'Printed bulletin must preserve the chief-arbiter sign-off block.');
has(css, 'body.cp-organizer-pairings-printing *{visibility:hidden!important}', 'Legacy print mode may visually hide the organizer UI.');
has(css, '.organizer-pairings-print-sheet', 'Print mode must reveal only the official pairings sheet.');
has(printCss, 'position: static !important', 'A4 print sheet must be detached from floating-panel positioning.');
has(printCss, '.organizer-pairings-card', 'Interactive Organizer card must be removed from print layout.');
has(printCss, 'display: none !important', 'Interactive Organizer controls must not reserve print-page space.');

has(uiFixes, '#root > :not(.organizer-pairings-panel)', 'All non-print root siblings must be removed from print layout.');
has(uiFixes, 'display: none !important', 'Blank-page fix must remove hidden Web UI from layout instead of only hiding it visually.');
has(uiFixes, '.organizer-pairings-panel > :not(.organizer-pairings-print-sheet)', 'Only the official print sheet may remain inside the pairings panel during printing.');
has(uiFixes, 'position: static !important', 'Official bulletin must start at the normal print origin.');
has(uiFixes, 'page-break-before: auto !important', 'Print sheet must not force blank pages before the bulletin.');
has(uiFixes, 'min-height: 0 !important', 'Print root and sheet must not preserve viewport-height whitespace.');

for (const forbidden of [
  'onUpdateTournament',
  'handleSetResult',
  'submitResult',
  'syncNow',
  'publishOnline',
  'generateDutchPairings',
  'generateBergerSchedule',
  'executeFinalizeRoundTransaction',
  'executeUnlockRoundTransaction'
]) lacks(component, forbidden, `Read-only Pairings viewer must not contain write/core action: ${forbidden}`);

console.log('ORGANIZER_PAIRINGS_READONLY=PASS');
