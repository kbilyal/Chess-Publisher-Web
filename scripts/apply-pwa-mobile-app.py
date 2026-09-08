from pathlib import Path
import json, struct, zlib, binascii

ROOT = Path('.')


def write_png(path: Path, size: int, maskable: bool = False):
    bg = (8, 24, 45, 255)
    blue = (32, 154, 255, 255)
    white = (255, 255, 255, 255)
    px = [[bg for _ in range(size)] for _ in range(size)]
    margin = int(size * (0.17 if maskable else 0.10))
    radius = int(size * 0.15)
    x0 = y0 = margin
    x1 = y1 = size - margin - 1
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            cx = min(max(x, x0 + radius), x1 - radius)
            cy = min(max(y, y0 + radius), y1 - radius)
            if (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2:
                px[y][x] = blue
    # Draw simple CP monogram using thick geometric strokes, independent of fonts.
    h = int(size * 0.30)
    w = int(size * 0.38)
    sx = (size - w) // 2
    sy = (size - h) // 2
    t = max(5, int(size * 0.035))
    # C
    cw = w // 2 - t
    for y in range(sy, sy + h):
        for x in range(sx, sx + cw):
            if x < sx + t or y < sy + t or y >= sy + h - t:
                px[y][x] = white
    # P
    px0 = sx + w // 2
    pw = w // 2
    for y in range(sy, sy + h):
        for x in range(px0, px0 + pw):
            top_half = y < sy + h // 2
            if x < px0 + t or (top_half and (y < sy + t or y >= sy + h // 2 - t or x >= px0 + pw - t)):
                px[y][x] = white
    raw = bytearray()
    for row in px:
        raw.append(0)
        for p in row:
            raw.extend(p)
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', binascii.crc32(kind + data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


manifest = {
    'name': 'Chess-Publisher Web Companion',
    'short_name': 'Chess-Publisher',
    'description': 'Mobile and desktop companion for synchronized Chess-Publisher tournaments.',
    'id': '/',
    'start_url': '/',
    'scope': '/',
    'display': 'standalone',
    'display_override': ['standalone', 'minimal-ui'],
    'background_color': '#08182d',
    'theme_color': '#08182d',
    'orientation': 'any',
    'categories': ['productivity', 'utilities'],
    'prefer_related_applications': False,
    'icons': [
        {'src': '/icons/chess-publisher-icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
        {'src': '/icons/chess-publisher-icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
        {'src': '/icons/chess-publisher-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}
    ]
}
Path('public/manifest.webmanifest').write_text(json.dumps(manifest, indent=2) + '\n')
write_png(Path('public/icons/chess-publisher-icon-192.png'), 192)
write_png(Path('public/icons/chess-publisher-icon-512.png'), 512)
write_png(Path('public/icons/chess-publisher-maskable-512.png'), 512, True)

Path('public/sw.js').write_text("""const CACHE = 'chess-publisher-pwa-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/chess-publisher-icon-192.png', '/icons/chess-publisher-icon-512.png', '/icons/chess-publisher-maskable-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE && key.startsWith('chess-publisher-pwa-')).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put('/', copy));
      return response;
    }).catch(() => caches.match('/')));
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
      return response;
    })));
  }
});
""")

Path('src/pwa').mkdir(parents=True, exist_ok=True)
Path('src/pwa/registerPwa.ts').write_text("""export function registerChessPublisherPwa() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(error => {
      console.warn('Chess-Publisher PWA service worker could not be registered.', error);
    });
  }, { once: true });
}

registerChessPublisherPwa();
""")

Path('src/pwa/PwaInstallPrompt.tsx').write_text("""import React, { useEffect, useState } from 'react';
import { Download, Share2, Smartphone, X } from 'lucide-react';
import './pwa-install.css';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
const isiOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;

export function PwaInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => standalone());
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('cp-pwa-install-dismissed') === '1');
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const appInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', appInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', appInstalled);
    };
  }, []);

  if (installed || dismissed || !isMobile() || (!promptEvent && !isiOS())) return null;

  const install = async () => {
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        setPromptEvent(null);
      }
      return;
    }
    if (isiOS()) setShowIosHelp(true);
  };

  const dismiss = () => {
    sessionStorage.setItem('cp-pwa-install-dismissed', '1');
    setDismissed(true);
  };

  return (
    <aside className="pwa-install-card" aria-label="Install Chess-Publisher app">
      <button type="button" className="pwa-install-close" onClick={dismiss} aria-label="Dismiss install suggestion"><X size={16} /></button>
      <img src="/icons/chess-publisher-icon-192.png" alt="" className="pwa-install-icon" />
      <div className="pwa-install-copy">
        <strong>Install Chess-Publisher</strong>
        <span>Open it as its own phone app — without browser tabs or the address bar.</span>
        {showIosHelp && <span className="pwa-ios-help"><Share2 size={14} /> Tap Share, then <b>Add to Home Screen</b>.</span>}
      </div>
      <button type="button" className="pwa-install-button" onClick={install}>
        {isiOS() && !promptEvent ? <Smartphone size={17} /> : <Download size={17} />}
        {isiOS() && !promptEvent ? 'How to install' : 'Install app'}
      </button>
    </aside>
  );
}
""")

Path('src/pwa/pwa-install.css').write_text(""".pwa-install-card {
  position: fixed;
  right: 14px;
  bottom: calc(86px + env(safe-area-inset-bottom, 0px));
  z-index: 5000;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  width: min(520px, calc(100vw - 28px));
  padding: 12px 42px 12px 12px;
  border: 1px solid rgba(120, 170, 220, .28);
  border-radius: 16px;
  background: rgba(7, 24, 43, .97);
  color: #fff;
  box-shadow: 0 18px 50px rgba(0, 0, 0, .28);
  backdrop-filter: blur(16px);
}
.pwa-install-icon { width: 44px; height: 44px; border-radius: 11px; }
.pwa-install-copy { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.pwa-install-copy strong { font-size: 13px; line-height: 1.2; }
.pwa-install-copy span { color: #b8c8da; font-size: 11px; line-height: 1.35; }
.pwa-install-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; padding: 0 12px; border: 0; border-radius: 10px; background: #219aff; color: #fff; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
.pwa-install-close { position: absolute; right: 10px; top: 10px; display: grid; width: 26px; height: 26px; place-items: center; border: 0; border-radius: 8px; background: transparent; color: #9fb3c8; cursor: pointer; }
.pwa-ios-help { display: inline-flex !important; align-items: center; gap: 5px; color: #d9eaff !important; }
@media (min-width: 800px) { .pwa-install-card { bottom: 18px; } }
@media (max-width: 520px) {
  .pwa-install-card { left: 10px; right: 10px; bottom: calc(78px + env(safe-area-inset-bottom, 0px)); width: auto; grid-template-columns: 40px minmax(0, 1fr); padding: 11px 38px 11px 11px; }
  .pwa-install-icon { width: 40px; height: 40px; }
  .pwa-install-button { grid-column: 1 / -1; width: 100%; }
}
""")

Path('tests/ui/pwa-install.test.mjs').write_text("""import assert from 'node:assert/strict';
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
""")

# Patch index.html.
path = Path('index.html')
text = path.read_text()
anchor = '    <meta name="theme-color" content="#08182d" />\n'
insert = '''    <meta name="theme-color" content="#08182d" />\n    <meta name="mobile-web-app-capable" content="yes" />\n    <meta name="apple-mobile-web-app-capable" content="yes" />\n    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />\n    <meta name="apple-mobile-web-app-title" content="Chess-Publisher" />\n    <link rel="manifest" href="/manifest.webmanifest" />\n    <link rel="icon" type="image/png" sizes="192x192" href="/icons/chess-publisher-icon-192.png" />\n    <link rel="apple-touch-icon" sizes="192x192" href="/icons/chess-publisher-icon-192.png" />\n'''
if anchor not in text:
    raise SystemExit('index.html theme-color anchor missing')
path.write_text(text.replace(anchor, insert, 1))

# Patch main.tsx.
path = Path('src/main.tsx')
text = path.read_text()
anchor = "import './cloud/installOrganizerApiAuth';\n"
if anchor not in text:
    raise SystemExit('main.tsx auth import anchor missing')
path.write_text(text.replace(anchor, anchor + "import './pwa/registerPwa';\n", 1))

# Patch App.tsx without touching Companion behavior.
path = Path('src/App.tsx')
text = path.read_text()
anchor = "import { createCompanionCloudFacade } from './companion/companionCloudActions';\n"
if anchor not in text:
    raise SystemExit('App.tsx import anchor missing')
text = text.replace(anchor, anchor + "import { PwaInstallPrompt } from './pwa/PwaInstallPrompt';\n", 1)
old = '  return <CompanionWorkspace cloud={companionCloud} />;\n'
new = '''  return (\n    <>\n      <CompanionWorkspace cloud={companionCloud} />\n      <PwaInstallPrompt />\n    </>\n  );\n'''
if old not in text:
    raise SystemExit('App.tsx return anchor missing')
path.write_text(text.replace(old, new, 1))

# Permanent deploy gate for installability.
path = Path('.github/workflows/deploy-web.yml')
text = path.read_text()
anchor = "      - name: Organizer login and My Tournaments contract\n        run: node tests/ui/companion-cloud-screens.test.mjs\n\n"
insert = anchor + "      - name: PWA mobile installability contract\n        run: node tests/ui/pwa-install.test.mjs\n\n"
if anchor not in text:
    raise SystemExit('deploy-web.yml insertion anchor missing')
path.write_text(text.replace(anchor, insert, 1))

print('Applied installable Chess-Publisher PWA support with standalone mobile mode, icons, service worker and install UI.')
