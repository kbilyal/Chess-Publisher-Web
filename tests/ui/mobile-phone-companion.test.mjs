import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const phoneMode = read('src/companion/mobilePhoneMode.ts');
const main = read('src/main.tsx');
const phoneCss = read('src/companion-mobile-phone.css');
const workspace = read('src/companion/CompanionWorkspace.tsx');
const screens = read('src/companion/CompanionCloudScreens.tsx');
const registration = read('src/companion/CompanionRegistration.tsx');
const portal = read('src/arbiter/ArbiterPortal.tsx');

const has = (source, needle, message) => assert.ok(source.includes(needle), message || `Missing: ${needle}`);
const lacks = (source, needle, message) => assert.ok(!source.includes(needle), message || `Forbidden: ${needle}`);

has(phoneMode, 'export function isMobilePhoneDevice()', 'Phone detector must export isMobilePhoneDevice.');
has(phoneMode, 'export function installMobilePhoneMode()', 'Phone detector must export installMobilePhoneMode.');
has(phoneMode, '/\\biPad\\b|Tablet|PlayBook|Silk/i.test(ua)', 'Phone detector must explicitly exclude tablets.');
has(phoneMode, 'dataset.cpPhone', 'Phone detector must set data-cp-phone on the document root.');

has(main, 'installMobilePhoneMode()', 'main.tsx must initialize mobile phone mode.');
has(main, "import './companion-mobile-phone.css';", 'main.tsx must load companion-mobile-phone.css.');
assert.ok(
  main.indexOf("import './companion-mobile-phone.css';") > main.indexOf("import './mobile-ergonomics.css';"),
  'companion-mobile-phone.css must load after mobile-ergonomics.css.'
);

lacks(phoneCss, '@media print', 'Mobile phone stylesheet must not contain @media print rules.');
has(phoneCss, ':root[data-cp-phone="true"]', 'Phone-only styles must scope cleanly with data-cp-phone="true".');
has(phoneCss, '.companion-mobile-sheet', 'Mobile More bottom sheet styling is required.');

has(workspace, 'Full Web Workspace', 'Companion workspace must expose Full Web Workspace link.');
has(workspace, 'desktop=1', 'Companion Full Web Workspace link must include desktop=1.');
has(workspace, 'companion-mobile-more-btn', 'Companion mobile header must include More workspace options button.');
has(workspace, 'companion-mobile-sync-meta', 'Companion mobile header must include live sync status chip.');
has(workspace, 'companion-sidebar-status', 'Companion must preserve .companion-sidebar-status in the DOM.');
has(workspace, 'data-unified-sync="true"', 'Companion must preserve unified SYNC button.');

has(screens, "webUrl.searchParams.set('desktop', '1');", 'Entry screen portal link must include desktop=1.');
has(screens, 'https://chess-publisher.org/app/?desktop=1', 'My Tournaments Full Web Workspace links must include desktop=1.');
has(screens, 'companion-mobile-desktop-switch', 'My Tournaments must expose the phone Full Web Workspace switch.');

has(registration, 'id="companion-roster-section"', 'Registration must mark the roster card for quick jump scrolling.');
has(registration, 'companion-reg-phone-jump', 'Registration must expose phone quick-jump links while keeping both FIDE search and roster visible.');
has(portal, 'arbiter-round-progress-track', 'Guest Arbiter must include a visual round completion progress track.');

console.log('MOBILE_PHONE_COMPANION=PASS');
