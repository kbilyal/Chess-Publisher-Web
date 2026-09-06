import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');
const sha256 = (rel: string) => createHash('sha256').update(readFileSync(resolve(root, rel))).digest('hex');
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const adapter = read('production-web/web/linux-native-engine-adapter.js');
const entry = read('workers/web-engine/src/entry.py');
const runtime = read('workers/web-engine/src/engine_runtime.py');
const wrangler = read('workers/web-engine/wrangler.toml');

assert(adapter.includes('const CANONICAL_WEB_ORIGIN="https://web.chess-publisher.org"'), 'browser adapter identifies the canonical production Web origin');
assert(adapter.includes('const CUSTOM_ENGINE_BASE="https://engine.chess-publisher.org"'), 'canonical Web engine uses a first-party Cloudflare custom domain');
assert(adapter.includes('const DIRECT_ENGINE_BASE="https://chess-publisher-web-engine.kyamranbilyal.workers.dev"'), 'direct workers.dev endpoint remains an emergency fallback');
assert(adapter.includes('location.origin===CANONICAL_WEB_ORIGIN?CUSTOM_ENGINE_BASE:DIRECT_ENGINE_BASE'), 'canonical production Web selects the first-party engine domain');
assert(adapter.includes('primary.replace(CUSTOM_ENGINE_BASE,DIRECT_ENGINE_BASE)') && adapter.includes('usedFallback:true'), 'browser engine retries the direct Worker only after a custom-domain transport failure');
assert(adapter.includes('const ENGINE_PREFIX=`${ENGINE_BASE}/api/engine`'), 'browser engine API prefix is built from the selected Worker route');
assert(adapter.includes('mode:"cors"') && adapter.includes('credentials:"omit"'), 'browser engine transport remains credential-free apart from explicit bearer auth');
assert(adapter.includes('nativeTransportError') && adapter.includes('Transport: custom='), 'browser engine preserves both transport failure reasons instead of hiding them');
assert(adapter.includes('Authorization') && adapter.includes('organizer-primary'), 'browser engine requests use the shared Organizer Token');
assert(adapter.includes('${ENGINE_PREFIX}/pair'), 'browser pairing path is routed to the Web engine Worker');
assert(adapter.includes('${ENGINE_PREFIX}/tiebreak-checker/check'), 'desktop tie-break checker path is routed to the Web engine Worker');
assert(adapter.includes('${ENGINE_PREFIX}/trf26-exchange/check'), 'TRF26 exchange checker path is routed to the Web engine Worker');
assert(!adapter.includes('operations are Desktop only'), 'production pairing adapter no longer hard-blocks browser pairing as Desktop-only');
assert(!adapter.includes('/api/prototype') && !adapter.includes('generateLocalSwissFallback'), 'no prototype/synthetic pairing fallback is present');

assert(entry.includes('A valid Organizer Token is required for Web engine operations.'), 'Worker requires Organizer Token authentication');
assert(entry.includes('origin_not_allowed') && entry.includes('WEB_ORIGIN'), 'Worker enforces the Web origin boundary');
assert(entry.includes('run_pairing') && entry.includes('run_tiebreak'), 'Worker exposes both Gacrux pairing and tie-break execution');
assert(entry.includes('HUB_SERVICE') && entry.includes('/api/v1/organizer/me'), 'Worker validates Organizer Token through the bound Hub organizer identity route');
assert(entry.includes('hub_service.fetch'), 'Worker uses the Hub service binding before any public fallback');
assert(entry.includes('if status in (401, 403)'), 'invalid Organizer Token is distinguished from Hub transport failure');
assert(runtime.includes('GACRUX_VERSION = "1.9.57"'), 'Worker is pinned to Gacrux 1.9.57');
assert(runtime.includes('"-x", "weighted"'), 'Worker uses the desktop weighted Dutch Gacrux mode');
assert(runtime.includes('assert_pairing_trf_history_width'), 'Worker preserves desktop TRF history-width safety');
assert(runtime.includes('sync_pairing_trf_scores'), 'Worker preserves desktop TRF score reconciliation');
assert(runtime.includes('Gacrux deterministic verification failed'), 'Worker fails closed on nondeterministic Gacrux output');
assert(runtime.includes('"state": "unavailable"') && runtime.includes('"checker": "bbpPairings"'), 'optional BBP status is reported truthfully instead of being faked');

assert(wrangler.includes('name = "chess-publisher-web-engine"'), 'Web engine has an isolated Worker deployment');
assert(wrangler.includes('workers_dev = true'), 'direct workers.dev endpoint remains enabled');
assert(wrangler.includes('pattern = "engine.chess-publisher.org"') && wrangler.includes('custom_domain = true'), 'production engine is exposed through a Cloudflare-managed custom domain');
assert(!wrangler.includes('pattern = "web.chess-publisher.org/api/engine/*"'), 'Web engine no longer relies on a route over the DNS-only GitHub Pages hostname');
assert(wrangler.includes('compatibility_flags = ["python_workers"]'), 'Cloudflare Python Worker runtime is enabled');
assert(wrangler.includes('binding = "HUB_SERVICE"') && wrangler.includes('service = "chess-publisher-hub-api-beta"'), 'Web engine has a direct Hub service binding');
assert(!wrangler.includes('global_fetch_strictly_public'), 'Web engine auth does not weaken Worker-to-Worker fetch restrictions');

const protectedHashes: Record<string, string> = {
  'production-web/hub/client/hub-api-client.js': '2311446a69c16a14e041dbf08d4e198280d3a3f1232b739bf8e089d8ffdac9f0',
  'production-web/hub/client/hub-snapshot.js': 'd980c520d74a71e66b3a3aa2a54e5ed626ea3618c53159145f9e48b445effac9',
  'production-web/webview/HubAdapter.js': '5477080af2e9dce1dcb25b622bf4aa8e77bc977a2f60759d175e6a8464bf8348',
};
for (const [path, expected] of Object.entries(protectedHashes)) {
  assert(sha256(path) === expected, `${path} remains byte-identical to the protected baseline`);
}

console.log('Production Web engine integration gate: PASS');
