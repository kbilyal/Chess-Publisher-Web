import fs from 'node:fs';
import assert from 'node:assert/strict';

const patch = fs.readFileSync('scripts/patch-arbiter-pending-replace-worker.py', 'utf8');

assert.match(patch, /arbiter_pending_delivery_replace_v1/, 'point-fix marker must be present');
assert.match(patch, /baseRevision\) \|\| baseRevision !== currentRevision/, 'revision guard must remain authoritative');
assert.match(patch, /body\.replace\(same_session, "  if \(existing\) \{"/, 'any latest pending delivery row must be replaceable');
assert.match(patch, /SET session_id = \?, result = \?/, 'replacement must move the delivery record to the current session');
assert.match(patch, /bind\(session\.id, resultValue/, 'replacement must bind the current session id');
assert.match(patch, /if \("arbiter_result_conflict" in body\)/, 'patch must reject leaving the obsolete pending lock behind');
assert.match(patch, /arbiter_canonical_snapshot_read_v1/, 'canonical B2 read fix must be a required baseline');
assert.match(patch, /arbiter_clear_result_v1/, 'Clear result support must be a required baseline');

console.log('Arbiter pending delivery replacement contract: PASS');
