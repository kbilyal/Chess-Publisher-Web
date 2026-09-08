import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('public/manifest.webmanifest', 'utf8'));
const index = fs.readFileSync('index.html', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const sw = fs.readFileSync('public/sw.js', 'utf8');

assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, '/');
assert.equal(manifest.scope, '/');
assert(manifest.icons.some(icon => icon.sizes === '192x192' && icon.type === 'image/png'));
assert(manifest.icons.some(icon => icon.sizes === '512x512' && icon.type === 'image/png'));
assert(manifest.icons.some(icon => icon.purpose === 'maskable'));
assert.match(index, /rel="manifest" href="\/manifest\.webmanifest"/);
assert.match(index, /apple-mobile-web-app-capable/);
assert.match(index, /apple-touch-icon/);
assert.match(main, /\.\/pwa\/registerPwa/);
assert.match(app, /PwaInstallPrompt/);
assert.match(sw, /pathname\.startsWith\('\/api\/'\)/);
for (const file of ['public/icons/chess-publisher-icon-192.png', 'public/icons/chess-publisher-icon-512.png', 'public/icons/chess-publisher-maskable-512.png']) {
  const bytes = fs.readFileSync(file);
  assert(bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), `${file} is not a PNG`);
}
console.log('PWA installability contract: standalone + Android/iOS install metadata + icons + service worker PASS');
