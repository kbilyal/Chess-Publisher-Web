import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const manifest = JSON.parse(readFileSync('SYNC-FREEZE-v1.06.00-beta.96.json', 'utf8'));
const gitBlobSha = path => {
  const body = readFileSync(path);
  const head = Buffer.from(`blob ${body.length}\0`, 'utf8');
  return createHash('sha1').update(Buffer.concat([head, body])).digest('hex');
};

assert.match(manifest.status, /^ACTIVE\b/, 'SYNC freeze must remain ACTIVE.');
assert.equal(manifest.fingerprintContentSchema, 7, 'Portable fingerprint schema must remain 7.');
assert.equal(manifest.testedWindowsPortableSha256, '5e18d6f9e02dc68e7af0df25ed0a1da17a1f11692fafedbdf8120f1869f8c803', 'Freeze must stay anchored to the exact user-tested Windows package.');

for (const [path, expected] of Object.entries(manifest.protectedGitBlobs || {})) {
  assert.equal(gitBlobSha(path), expected, `Protected SYNC blob changed without a new approved freeze baseline: ${path}`);
}

for (const [path, markers] of Object.entries(manifest.semanticGuards || {})) {
  const source = readFileSync(path, 'utf8');
  for (const marker of markers) assert.ok(source.includes(marker), `Protected SYNC integration marker missing: ${path} :: ${marker}`);
}

const sync = readFileSync('src/cloud/onlineCloudSync.ts', 'utf8');
const api = readFileSync('src/cloud/cloudWorkspaceApi.ts', 'utf8');
const provider = readFileSync('src/cloud/OnlineCloudProviderV2.tsx', 'utf8');
const companion = readFileSync('src/companion/companionCloudActions.ts', 'utf8');
const legacy = readFileSync('production-web/webview/CloudWorkspaceAdapter.js', 'utf8');

assert.match(sync, /PORTABLE_FINGERPRINT_SCHEMA\s*=\s*7/, 'Web schema-7 fingerprint contract is protected.');
assert.match(sync, /lastcheckeruisource/, 'Checker source provenance stays runtime-only.');
assert.match(sync, /lastcheckeruibuildversion/, 'Checker build provenance stays runtime-only.');
assert.match(sync, /lastcheckeruicheckedat/, 'Checker timestamp provenance stays runtime-only.');
assert.match(api, /X-Expected-Revision/, 'Guarded Cloud writes remain required.');
assert.match(provider, /cloudTournamentId/, 'Provider keeps durable Cloud identity.');
assert.match(provider, /baseRevision/, 'Provider keeps common-base revision lineage.');
assert.match(companion, /cloudTournamentId/, 'Companion roundtrip keeps the same Cloud tournament identity.');
assert.match(legacy, /cloudTournamentId/, 'Legacy compatibility path keeps Cloud identity.');
assert.equal(manifest.liveWorker?.sha256, '13773e265867f802631d03bcecd8bd259a74f5fdff87fd3fa52a663a5264fa22', 'Freeze must retain the verified live Worker baseline.');

console.log('BETA96 WEB SYNC PROTECTED CORE: PASS');
