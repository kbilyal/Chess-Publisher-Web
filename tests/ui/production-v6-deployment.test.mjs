import fs from 'node:fs';

const cssPath = 'production-web/web/ui-v6-production.css';
const lockPath = 'production-web/web/ui-v6-cascade-lock.css';
const jsPath = 'production-web/web/ui-v6-production.js';
const deployPath = '.github/workflows/deploy-web.yml';

for (const path of [cssPath, lockPath, jsPath, deployPath]) {
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
}

const css = fs.readFileSync(cssPath, 'utf8');
const lock = fs.readFileSync(lockPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const deploy = fs.readFileSync(deployPath, 'utf8');

const requireText = (source, needle, message) => {
  if (!source.includes(needle)) throw new Error(message || `Missing marker: ${needle}`);
};

requireText(css, 'Production UI v6 approved target', 'Production v6 CSS identity is missing.');
requireText(css, '--cpv6-sidebar: 252px', 'Approved 252px navigation rail is missing.');
requireText(css, 'grid-template-columns: repeat(2, minmax(0, 1fr)) 308px', 'Approved two-column setup + 308px overview rail is missing.');
requireText(css, '.cpv6-prod-setup-rail', 'Setup overview rail styling is missing.');
requireText(css, 'env(safe-area-inset-bottom)', 'Mobile bottom navigation does not account for safe-area.');
requireText(css, 'background: rgba(255,255,255,.97)', 'Approved white mobile navigation surface is missing.');
requireText(css, '@media (max-width: 768px)', 'Dedicated mobile layout is missing.');

requireText(lock, 'UI v6 cascade lock', 'UI v6 high-specificity cascade lock is missing.');
requireText(lock, '#appWindow > .tabs::before', 'Legacy workspace pseudo-label cleanup is missing.');
requireText(lock, 'content: none !important', 'Legacy workspace pseudo-label can still render.');
requireText(lock, 'html[data-cp-production-web="1"][data-cp-ui-v6-production="1"] #appWindow > .titlebar', 'Production shell titlebar is not locked to v6.');
requireText(lock, 'grid-template-columns: 252px minmax(0, 1fr)', 'Desktop shell grid is not locked to approved v6 width.');
requireText(lock, '@media (min-width: 769px) and (max-width: 1099px)', 'Compact desktop breakpoint must keep the left navigation rail.');
requireText(lock, 'grid-template-columns: 232px minmax(0, 1fr)', 'Compact desktop shell must retain a usable left navigation rail.');
requireText(lock, '.cpv6-prod-sidebar-footer', 'Compact desktop sidebar chrome restoration is missing.');
requireText(lock, 'background: rgba(255,255,255,.98)', 'Mobile shell is not locked to the approved white surface.');
requireText(lock, '#appWindow > .tabs > .tab > *', 'Mobile tab child hit-target protection is missing.');
requireText(lock, 'pointer-events: none !important', 'Mobile tab children can still intercept taps.');
requireText(lock, 'touch-action: manipulation !important', 'Mobile tab touch behavior is not hardened.');
requireText(lock, '.tab[data-cpv6-mobile-label]::after', 'Compact mobile tab label rendering is missing.');
requireText(lock, 'font-size: 0 !important', 'Original long mobile labels are still painted under compact labels.');
requireText(lock, 'content: attr(data-cpv6-mobile-label)', 'Mobile tab labels are not rendered from safe compact labels.');

requireText(js, "root.dataset.cpUiV6Production = '1'", 'Production v6 root marker is missing.');
requireText(js, 'cpv6-prod-brand', 'Production v6 sidebar brand bridge is missing.');
requireText(js, 'cpv6-prod-setup-rail', 'Production v6 setup overview bridge is missing.');
requireText(js, 'activateTabByText', 'Quick actions are not routed through the existing tab controls.');
requireText(js, 'window.getCurrentTournament', 'UI bridge does not read the existing tournament through its public getter.');
requireText(js, 'UI-only redesign. Tournament rules and calculation engines are unchanged.', 'Protected-engine presentation notice is missing.');
requireText(js, 'tab.dataset.cpv6MobileLabel = shortLabel', 'Mobile compact label metadata is missing.');
requireText(js, 'span.dataset.cpv6Icon = icon', 'Presentation icon metadata is missing.');
requireText(js, "span.textContent = ''", 'Presentation icon must not alter the original tab textContent.');

if (/span\.textContent\s*=\s*icon/.test(js)) {
  throw new Error('Presentation icon text must not alter legacy tab labels.');
}

const forbiddenJs = [
  /\.remove\s*\(/,
  /\.innerHTML\s*=\s*['"`]\s*<[^>]*class=["'][^"']*tab/,
  /window\.showTab\s*=/,
  /window\.(?:generate|pair|pairings|exportTRF|exportTrf|chessResults|cloudSync)\w*\s*=/i,
  /Gacrux|bbpPairings|pairingchecker\.py/
];
for (const pattern of forbiddenJs) {
  if (pattern.test(js)) throw new Error(`Presentation bridge crosses protected boundary: ${pattern}`);
}

const forbiddenFunctionalHide = [
  /\.tabs\s+\.tab[^\{]*\{[^\}]*display\s*:\s*none/is,
  /button[^\{]*\{[^\}]*display\s*:\s*none/is,
  /\.groupbox[^\{]*\{[^\}]*display\s*:\s*none/is,
  /input[^\{]*\{[^\}]*display\s*:\s*none/is
];
for (const pattern of forbiddenFunctionalHide) {
  if (pattern.test(css) || pattern.test(lock)) throw new Error(`Production v6 hides an existing functional control: ${pattern}`);
}

requireText(deploy, 'production-web/web/ui-v6-production.css', 'Deploy gate does not require production v6 CSS.');
requireText(deploy, 'production-web/web/ui-v6-cascade-lock.css', 'Deploy gate does not require the production v6 cascade lock.');
requireText(deploy, 'production-web/web/ui-v6-production.js', 'Deploy gate does not require production v6 JS.');
requireText(deploy, '/web/ui-v6-production.css?v=${GITHUB_SHA}', 'Deploy artifact does not verify cache-busted v6 CSS.');
requireText(deploy, '/web/ui-v6-cascade-lock.css?v=${GITHUB_SHA}', 'Deploy artifact does not verify cache-busted v6 cascade lock.');
requireText(deploy, '/web/ui-v6-production.js?v=${GITHUB_SHA}', 'Deploy artifact does not verify cache-busted v6 JS.');
requireText(deploy, 'cp -R production-web/. dist/', 'Canonical production-web source must remain the deployment base.');
requireText(deploy, "! grep -q 'src/main.tsx' dist/index.html", 'Deploy boundary must continue blocking raw Vite source entry.');

console.log('PASS production UI v6 deployment contract');
