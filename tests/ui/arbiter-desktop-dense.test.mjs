import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dense = readFileSync('src/arbiter/arbiter-desktop-dense.css', 'utf8');
const mobile = readFileSync('src/arbiter/arbiter-ui-fixes.css', 'utf8');
const main = readFileSync('src/main.tsx', 'utf8');
const portal = readFileSync('src/arbiter/ArbiterPortal.tsx', 'utf8');

const has = (source, needle, message) => assert.ok(source.includes(needle), message || `Missing: ${needle}`);
const lacks = (source, needle, message) => assert.ok(!source.includes(needle), message || `Forbidden: ${needle}`);

has(dense, '@media screen and (min-width: 900px)', 'Dense Arbiter UI must be desktop-only.');
lacks(dense, '@media (max-width:', 'Desktop density stylesheet must not redefine phone breakpoints.');
lacks(dense, '@media screen and (max-width:', 'Desktop density stylesheet must not redefine phone breakpoints.');
has(dense, '@media screen and (min-width: 1200px)', 'Wide desktop must have a dedicated one-row layout.');
has(dense, 'grid-column: 5 !important;', 'Wide desktop result controls must live in the fifth compact column.');
has(dense, 'grid-template-columns: minmax(190px, 1.15fr) minmax(190px, 1fr) 82px;', 'Desktop controls must keep standard, special and clear actions on one strip.');
has(dense, 'min-height: 34px !important;', 'Desktop result buttons must use compact 34px controls.');
has(dense, '.arbiter-shell .arbiter-board-card', 'Desktop board cards must have dedicated dense styling.');
has(dense, 'min-height: 62px;', 'Desktop board rows must remain compact.');
has(dense, '.arbiter-shell .arbiter-send-all', 'Unified SYNC must be restyled without changing its behavior.');
has(dense, '.cp-arbiter-result-filter', 'Result filters must be compact on desktop.');

has(mobile, '@media (max-width: 640px)', 'Existing phone layout must remain present.');
has(mobile, 'min-height: 64px !important;', 'Existing phone result touch targets must remain 64px.');
has(mobile, 'font-size: 20px !important;', 'Existing phone result labels must remain large.');

has(main, "import './arbiter/arbiter-desktop-dense.css';", 'Desktop density stylesheet must be loaded.');
assert.ok(
  main.indexOf("import './arbiter/arbiter-desktop-dense.css';") > main.indexOf("import './arbiter/arbiter-print-filter-fixes.css';"),
  'Desktop density stylesheet must load after existing Arbiter fixes.'
);

has(portal, 'data-unified-arbiter-sync="true"', 'Unified Arbiter SYNC contract must remain unchanged.');
has(portal, 'Clear result', 'Clear result must remain available in dense desktop mode.');
has(portal, 'arbiter-color-badge white', 'White colour badge must remain available.');
has(portal, 'arbiter-color-badge black', 'Black colour badge must remain available.');

console.log('ARBITER_DESKTOP_DENSE_UI=PASS');
