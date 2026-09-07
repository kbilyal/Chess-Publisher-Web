import fs from 'node:fs';

const cssPath = 'production-web/web/ui-v6-production.css';
const jsPath = 'production-web/web/ui-v6-production.js';
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

requireText(css, 'Production UI v6 approved target', 'Production v6 CSS identity is missing.');
requireText(css, '--cpv6-sidebar: 252px', 'Approved 252px navigation rail is missing.');
requireText(css, 'grid-template-columns: repeat(2, minmax(0, 1fr)) 308px', 'Approved two-column setup + 308px overview rail is missing.');
requireText(css, '.cpv6-prod-setup-rail', 'Setup overview rail styling is missing.');
requireText(css, 'env(safe-area-inset-bottom)', 'Mobile bottom navigation does not account for safe-area.');
requireText(css, 'background: rgba(255,255,255,.97)', 'Approved white mobile navigation surface is missing.');
requireText(css, '@media (max-width: 768px)', 'Dedicated mobile layout is missing.');

requireText(js, "root.dataset.cpUiV6Production = '1'", 'Production v6 root marker is missing.');
requireText(js, 'cpv6-prod-brand', 'Production v6 sidebar brand bridge is missing.');
requireText(js, 'cpv6-prod-setup-rail', 'Production v6 setup overview bridge is missing.');
requireText(js, 'activateTabByText', 'Quick actions are not routed through the existing tab controls.');
requireText(js, 'window.getCurrentTournament', 'UI bridge does not read the existing tournament through its public getter.');
requireText(js, 'UI-only redesign. Tournament rules and calculation engines are unchanged.', 'Protected-engine presentation notice is missing.');

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
  if (pattern.test(css)) throw new Error(`Production v6 hides an existing functional control: ${pattern}`);
}

requireText(deploy, 'production-web/web/ui-v6-production.css', 'Deploy gate does not require production v6 CSS.');
requireText(deploy, 'production-web/web/ui-v6-production.js', 'Deploy gate does not require production v6 JS.');
requireText(deploy, '/web/ui-v6-production.css?v=${GITHUB_SHA}', 'Deploy artifact does not verify cache-busted v6 CSS.');
requireText(deploy, '/web/ui-v6-production.js?v=${GITHUB_SHA}', 'Deploy artifact does not verify cache-busted v6 JS.');
requireText(deploy, 'cp -R production-web/. dist/', 'Canonical production-web source must remain the deployment base.');
requireText(deploy, "! grep -q 'src/main.tsx' dist/index.html", 'Deploy boundary must continue blocking raw Vite source entry.');

console.log('PASS production UI v6 deployment contract');
