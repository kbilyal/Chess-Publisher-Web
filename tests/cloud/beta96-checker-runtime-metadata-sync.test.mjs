import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sync = readFileSync('src/cloud/onlineCloudSync.ts', 'utf8');
const workerPatch = readFileSync('scripts/patch-cloud-sync-checker-provenance-worker.py', 'utf8');
const has = (needle, message) => assert.ok(sync.includes(needle), message || `Missing: ${needle}`);
const workerHas = (needle, message) => assert.ok(workerPatch.includes(needle), message || `Worker patch missing: ${needle}`);

assert.match(sync, /PORTABLE_FINGERPRINT_SCHEMA\s*=\s*7/, 'Schema 7 must remain the Desktop/Web contract.');
has("'lastcheckeruisource'", 'Checker runtime source must be installation-local.');
has("'lastcheckeruibuildversion'", 'Checker build version must be installation-local.');
has("'lastcheckeruicheckedat'", 'Checker timestamp must be installation-local.');
has('sanitizePortableValue(clone(tournament || {}))', 'Schema-7 fingerprint must pass through installation-local sanitization.');
has('stripForPrivateCloud', 'Private snapshot sanitizer must remain present.');
has('stripVolatileSyncMetadata(sanitizePortableValue(clone(tournament || {})))', 'Private Cloud upload and fingerprint must strip runtime-only metadata recursively.');

// The Cloudflare Worker owns authoritative contentFingerprint/unchanged decisions,
// so it must ignore the exact same runtime-only checker provenance as the Web client.
workerHas('private_cloud_sync_checker_provenance_v1', 'Live Worker migration must carry a durable provenance-parity marker.');
workerHas('lastcheckeruisource', 'Worker must ignore checker runtime source.');
workerHas('lastcheckeruibuildversion', 'Worker must ignore checker build version.');
workerHas('lastcheckeruicheckedat', 'Worker must ignore checker timestamp.');
workerHas('private_cloud_sync_lineage_v1', 'Worker migration must require the canonical private Cloud lineage baseline.');
workerHas('Expected exactly one checker-provenance insertion anchor', 'Worker migration must be a one-point fail-closed edit.');

// Contract-level behavioral reference: only the newly classified runtime keys are ignored.
const runtimeKeys = new Set(['lastcheckeruisource','lastcheckeruibuildversion','lastcheckeruicheckedat']);
const sanitize = value => {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (runtimeKeys.has(key.toLowerCase())) continue;
    out[key] = sanitize(item);
  }
  return out;
};
const base = { name: 'Freeze', settings: { city: 'Sofia' }, pairings: { engine: { lastCheckerUiState: 'accepted' } } };
const a = structuredClone(base);
a.pairings.engine.lastCheckerUiSource = 'desktop-gacrux-native';
a.pairings.engine.lastCheckerUiBuildVersion = '1.06.00-beta.95';
a.pairings.engine.lastCheckerUiCheckedAt = '2026-09-10T12:00:00Z';
const b = structuredClone(a);
b.pairings.engine.lastCheckerUiCheckedAt = '2026-09-10T12:01:00Z';
assert.deepEqual(sanitize(a), sanitize(base), 'Checker provenance must not alter portable content.');
assert.deepEqual(sanitize(b), sanitize(base), 'Changing only checker timestamp must not alter portable content.');
const real = structuredClone(base);
real.settings.city = 'Plovdiv';
assert.notDeepEqual(sanitize(real), sanitize(base), 'Real tournament content must remain sync-visible.');

console.log('BETA96_CHECKER_RUNTIME_METADATA_SYNC=PASS');
