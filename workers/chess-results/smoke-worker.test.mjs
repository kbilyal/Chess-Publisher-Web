import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./smoke-worker.js', import.meta.url), 'utf8');
assert.match(source, /upload-smoke/i);
assert.match(source, /SMOKE_TEST_TNR_REQUIRED/);
assert.match(source, /payload\?\.mode !== 'test'/);
assert.match(source, /payload\?\.federation !== 'XXX'/);
assert.match(source, /ownershipWorker\.fetch\(forwarded, env\)/);
console.log('PASS smoke route guard regression');
