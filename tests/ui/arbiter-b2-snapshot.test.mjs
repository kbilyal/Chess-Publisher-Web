import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const patch = readFileSync('scripts/patch-arbiter-b2-snapshot-worker.py', 'utf8');

assert.ok(patch.includes('arbiter_snapshot_b2_v1'), 'B2 snapshot fix marker is required.');
assert.ok(patch.includes('await b2DownloadJson(env, objectKey)'), 'Arbiter snapshot loader must use the same Backblaze B2 reader as private Cloud.');
assert.ok(patch.includes('validateCloudSnapshot(snapshot)'), 'Arbiter snapshot must pass the private Cloud snapshot validator.');
assert.ok(!patch.includes('const buckets = Object.values(env).filter'), 'Arbiter snapshot loader must not discover R2 buckets dynamically.');
assert.ok(!patch.includes('Try the next R2 binding'), 'The obsolete R2 fallback must not remain in the fixed loader.');

console.log('ARBITER_B2_SNAPSHOT_CONTRACT=PASS');
