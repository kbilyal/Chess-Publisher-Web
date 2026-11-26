import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const main = read('src/main.tsx');
const portal = read('src/arbiter/ArbiterPortal.tsx');
const css = read('src/mobile-ergonomics.css');

const has = (source, needle, message) => assert.ok(source.includes(needle), message || `Missing: ${needle}`);
const lacks = (source, needle, message) => assert.ok(!source.includes(needle), message || `Forbidden: ${needle}`);

has(main, "import './mobile-ergonomics.css';", 'Mobile ergonomics stylesheet must be loaded.');
assert.ok(
  main.indexOf("import './mobile-ergonomics.css';") > main.indexOf("import './arbiter/arbiter-desktop-dense.css';"),
  'Mobile ergonomics stylesheet must load after all desktop and arbiter stylesheets.'
);

has(css, '@media screen and (min-width: 641px)', 'Desktop/tablet visibility rule for extras wrapper must exist.');
has(css, '@media screen and (max-width: 820px)', 'Companion mobile breakpoint must exist.');
has(css, '@media screen and (max-width: 640px)', 'Guest Arbiter phone breakpoint must exist.');
lacks(css, '@media print', 'Mobile ergonomics stylesheet must not interfere with print layout.');

has(portal, 'const [boardQuery, setBoardQuery] = useState', 'Guest Arbiter must support quick board/player search.');
has(portal, 'const [expandedExtras, setExpandedExtras] = useState', 'Guest Arbiter must support collapsible forfeit/clear controls on mobile.');
has(portal, 'arbiter-round-progress', 'Guest Arbiter must display entered/total round progress.');
has(portal, 'Forfeit / Clear', 'Guest Arbiter must label the mobile forfeit/clear disclosure toggle.');
has(portal, 'data-has-draft={isDraft ? \'true\' : \'false\'}', 'Unsent draft cards must expose a visual draft marker.');
has(portal, 'const roundBoards = view.pairings.liveBoards[String(activeRound)] || [];', 'Unified SYNC must still send all active-round drafts regardless of search filter.');

has(css, '.cp-arbiter-result-filter', 'Mobile unified bottom dock must style the result filter.');
has(css, '.arbiter-shell .arbiter-send-all', 'Mobile unified bottom dock must align SYNC beside the filter.');
has(css, '.organizer-pairings-panel:not(.is-open)', 'Mobile FABs must be positioned without overlapping.');
has(css, '.organizer-arbiter-panel.is-open .organizer-arbiter-card', 'Mobile Arbiter Access panel must render as a bottom sheet.');
has(css, '.organizer-pairings-panel.is-open .organizer-pairings-card', 'Mobile Pairings panel must render as a bottom sheet.');

console.log('MOBILE_ERGONOMICS_UI=PASS');
