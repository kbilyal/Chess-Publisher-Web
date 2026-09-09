import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const patch = readFileSync('scripts/patch-arbiter-b2-snapshot-worker.py', 'utf8');

assert.ok(patch.includes('arbiter_snapshot_b2_v1'), 'B2 snapshot fix marker is required.');
assert.ok(patch.includes('await b2DownloadJson(env, objectKey)'), 'Arbiter snapshot loader must use the same Backblaze B2 reader as private Cloud.');
assert.ok(patch.includes('validateCloudSnapshot(snapshot)'), 'Arbiter snapshot must pass the private Cloud snapshot validator.');
assert.ok(patch.includes('source.replace(old, new, 1)'), 'The upgrade must replace exactly the obsolete Arbiter snapshot loader.');

console.log('ARBITER_B2_SNAPSHOT_CONTRACT=PASS');
