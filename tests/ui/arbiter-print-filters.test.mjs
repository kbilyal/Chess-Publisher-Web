import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const printInstaller = readFileSync('src/arbiter/installIsolatedPairingsPrint.ts', 'utf8');
const filterInstaller = readFileSync('src/arbiter/installArbiterResultFilters.ts', 'utf8');
const fixes = readFileSync('src/arbiter/arbiter-print-filter-fixes.css', 'utf8');
const portal = readFileSync('src/arbiter/ArbiterPortal.tsx', 'utf8');
const main = readFileSync('src/main.tsx', 'utf8');

const has = (source, needle, message) => assert.ok(source.includes(needle), message || `Missing: ${needle}`);
const lacks = (source, needle, message) => assert.ok(!source.includes(needle), message || `Forbidden: ${needle}`);

has(main, "import './arbiter/installIsolatedPairingsPrint'", 'Isolated print handler must load before the app is rendered.');
has(main, "import './arbiter/installArbiterResultFilters'", 'Arbiter result filters must load with the Arbiter portal.');
has(main, "import './arbiter/arbiter-print-filter-fixes.css'", 'Final print/filter CSS must load after legacy print CSS.');

has(printInstaller, "closest('.organizer-pairings-print')", 'Print action must be intercepted at the actual Pairings print button.');
has(printInstaller, "querySelector<HTMLElement>('.organizer-pairings-print-sheet')", 'Only the official Pairings bulletin may be cloned.');
has(printInstaller, 'cloneNode(true)', 'Print bulletin must be detached from the React/App layout.');
has(printInstaller, 'document.body.appendChild(root)', 'Detached print root must live directly under body.');
has(printInstaller, "document.body.classList.add(PRINT_BODY_CLASS)", 'Isolated print mode must have an explicit body gate.');
has(printInstaller, 'event.stopImmediatePropagation()', 'Legacy in-place print click must not run in parallel.');
has(printInstaller, 'window.requestAnimationFrame(() => {', 'Print must wait for cloned sheet layout.');
has(printInstaller, 'window.print()', 'Isolated bulletin must use the browser print dialog.');

has(fixes, 'body.cp-organizer-pairings-isolated-print > *', 'All ordinary body children must be removed from print layout.');
has(fixes, 'body.cp-organizer-pairings-isolated-print > #cp-organizer-pairings-print-root', 'The isolated print root must be the only printable body child.');
has(fixes, '#cp-organizer-pairings-print-root .organizer-pairings-print-sheet', 'Official sheet must be explicitly restored inside the isolated root.');
has(fixes, 'position: static !important', 'Print sheet must start at normal page origin.');
has(fixes, 'page-break-before: auto !important', 'Print must not force blank pages before the bulletin.');
has(fixes, 'min-height: 0 !important', 'Print root must not preserve viewport-height whitespace.');

has(filterInstaller, "type ArbiterResultFilter = 'all' | 'missing'", 'Arbiter must expose exactly All and Missing filters.');
has(filterInstaller, "data-filter=\"all\"", 'All filter button must exist.');
has(filterInstaller, "data-filter=\"missing\"", 'Missing filter button must exist.');
has(filterInstaller, "card.getAttribute('data-result-missing') === 'true'", 'Missing must be derived from the server-confirmed board result marker, not a removed send button.');
has(filterInstaller, "currentFilter === 'missing'", 'Missing filter must hide completed boards.');
has(filterInstaller, 'cp-arbiter-filter-hidden', 'Filtered cards must use an explicit non-destructive UI class.');
has(fixes, '.arbiter-board-card.cp-arbiter-filter-hidden', 'Filter must hide only board cards, never mutate tournament data.');

has(portal, 'const submitAll = async () => {', 'Protected bulk submit must remain in ArbiterPortal.');
has(portal, "const roundBoards = view.pairings.liveBoards[String(activeRound)] || []", 'Unified SYNC must continue to use all current-round boards, independent of UI filters.');
has(portal, 'data-unified-arbiter-sync="true"', 'Arbiter must expose one unified SYNC action.');
has(portal, '↕ SYNC', 'Unified Arbiter SYNC label must remain visible.');
has(portal, "data-result-missing={currentResult === '-' ? 'true' : 'false'}", 'Each board must expose the non-destructive Missing marker.');
lacks(portal, 'className="arbiter-send"', 'Per-board Send/Update actions must not return.');
lacks(portal, 'Send all results', 'Legacy Send All label must not return beside unified SYNC.');
lacks(filterInstaller, 'submitResult(', 'Filter helper must never submit or mutate tournament results.');
lacks(filterInstaller, 'localStorage.setItem', 'Filter helper must never write tournament state.');

console.log('ARBITER_PRINT_FILTERS=PASS');
