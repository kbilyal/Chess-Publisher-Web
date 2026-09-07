import fs from 'node:fs';

const cssPath = 'production-web/web/mobile-app-v7.css';
const jsPath = 'production-web/web/mobile-app-v7.js';
const deployPath = '.github/workflows/deploy-web.yml';

for (const path of [cssPath, jsPath, deployPath]) {
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
}

const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const deploy = fs.readFileSync(deployPath, 'utf8');

const requireText = (source, needle, message) => {
  if (!source.includes(needle)) throw new Error(message || `Missing marker: ${needle}`);
};

requireText(css, 'Mobile App v7', 'Mobile app CSS identity is missing.');
requireText(css, '@media (max-width: 768px)', 'Mobile shell must be phone-only.');
requireText(css, 'grid-template-columns: repeat(5, minmax(0, 1fr))', 'Five-slot bottom navigation is missing.');
requireText(css, '.cp-mobile-more-sheet', 'More bottom sheet styling is missing.');
requireText(css, 'env(safe-area-inset-bottom)', 'Safe-area handling is missing.');
requireText(css, 'left: -10000px !important', 'Legacy tab strip must be moved off-canvas on phones.');
requireText(css, 'touch-action: manipulation', 'Mobile touch targets are not hardened.');

requireText(js, "root.dataset.cpMobileApp = '7'", 'Mobile app runtime marker is missing.');
requireText(js, "{ key: 'main', label: 'Setup'", 'Setup primary navigation is missing.');
requireText(js, "{ key: 'registration', label: 'Players'", 'Players primary navigation is missing.');
requireText(js, "{ key: 'pairings', label: 'Pairings'", 'Pairings primary navigation is missing.');
requireText(js, "{ key: 'standings', label: 'Standings'", 'Standings primary navigation is missing.');
requireText(js, "label: 'Online & Cloud'", 'Online & Cloud More item is missing.');
requireText(js, "label: 'Chess-Results'", 'Chess-Results More item is missing.');
requireText(js, 'window.showTab(legacyId, tab)', 'Mobile navigation must delegate to the existing showTab function.');
requireText(js, 'tab.click()', 'Existing tab button fallback is missing.');
requireText(js, 'friendlyDisabledMessage', 'Disabled tournament stages need user feedback.');
requireText(js, 'Add players first. Pairings will unlock automatically.', 'Pairings disabled feedback is missing.');

if (/tabDgt|DGT Boards|label:\s*['"]DGT/i.test(js)) {
  throw new Error('DGT must not appear in the Web mobile navigation.');
}

const forbiddenLogic = [
  /window\.showTab\s*=/,
  /executePairing|generatePairings|pairingchecker|Gacrux|bbpPairings/i,
  /exportTRF|exportTrf/i,
  /window\.(?:saveAll|cloudSync|chessResults)\w*\s*=/i
];
for (const pattern of forbiddenLogic) {
  if (pattern.test(js)) throw new Error(`Mobile presentation crosses protected logic boundary: ${pattern}`);
}

requireText(deploy, 'production-web/web/mobile-app-v7.css', 'Deploy workflow does not require mobile app CSS.');
requireText(deploy, 'production-web/web/mobile-app-v7.js', 'Deploy workflow does not require mobile app JS.');
requireText(deploy, '/web/mobile-app-v7.css?v=${GITHUB_SHA}', 'Deploy artifact does not verify cache-busted mobile CSS.');
requireText(deploy, '/web/mobile-app-v7.js?v=${GITHUB_SHA}', 'Deploy artifact does not verify cache-busted mobile JS.');

console.log('PASS Mobile App v7 presentation contract: five-slot app navigation, More sheet, disabled-state feedback, DGT excluded, protected logic untouched.');
