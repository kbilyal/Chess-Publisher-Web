import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const app = read('src/App.tsx');
const header = read('src/components/Header.tsx');
const main = read('src/main.tsx');
const css = read('src/ui-v6-approved.css');

for (const marker of [
  'data-active-tab={activeTab}',
  'cpv6-workspace-setup',
  'cpv6-setup-rail',
  'Tournament Progress',
  'Quick Actions',
  "setActiveTab('players')",
  "setActiveTab('pairings')",
  "setActiveTab('standings')",
  "setActiveTab('chessresults')",
  "setActiveTab('onlinecloud')"
]) assert.ok(app.includes(marker), `approved UI v6 app contract missing: ${marker}`);

for (const marker of [
  'cpv6-sidebar',
  'cpv6-topbar',
  'cpv6-mobile-nav',
  'onSelectTab(tab)',
  'onCreateNewTournament',
  'onExportPortableJson',
  'onImportPortableJson',
  'onOpenResetTournament',
  'onUndoReset',
  'onOpenTestRunner'
]) assert.ok(header.includes(marker), `approved UI v6 header contract missing: ${marker}`);

const baseCss = main.indexOf("import './index.css';");
const approvedCss = main.indexOf("import './ui-v6-approved.css';");
assert.ok(baseCss >= 0 && approvedCss > baseCss, 'approved UI layer must load after base styles');

for (const marker of [
  'grid-template-columns: minmax(0, 1fr) 308px',
  '.cpv6-progress-ring',
  '.cpv6-quick-actions',
  'data-active-tab="setup"',
  '@media (max-width: 1023px)',
  '@media (max-width: 720px)',
  '@media print'
]) assert.ok(css.includes(marker), `approved UI v6 CSS contract missing: ${marker}`);

assert.ok(!app.includes('executePairing'), 'presentation shell must not execute pairing logic directly');
assert.ok(!header.includes('executePairing'), 'header must not execute pairing logic directly');
assert.ok(!css.includes('MutationObserver'), 'approved UI v6 must not use runtime DOM migration');

console.log('Approved UI v6 regression PASS: responsive dashboard shell, real navigation actions, setup overview, and no runtime DOM migration or pairing execution in presentation files.');
