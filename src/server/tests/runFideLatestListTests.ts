import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractOfficialListVersion } from '../../../scripts/refresh-fide-rating-list';

const september = extractOfficialListVersion('<h2>Download September 2026 FRL</h2>', new Date('2026-08-01T00:00:00Z'));
assert.deepEqual(september, {
  listVersion: '2026-09',
  listDate: '2026-09-01',
  versionSource: 'official-download-page'
});

const multiple = extractOfficialListVersion(`
  <div>Archive: August 2026</div>
  <h2>Download September 2026 FRL</h2>
  <div>Previous: July 2026</div>
`);
assert.equal(multiple.listVersion, '2026-09', 'Latest month/year on the FIDE download page must win.');

const fallback = extractOfficialListVersion('temporarily unavailable', new Date('2027-02-14T12:00:00Z'));
assert.deepEqual(fallback, {
  listVersion: '2027-02',
  listDate: '2027-02-01',
  versionSource: 'utc-month-fallback'
});

const updater = fs.readFileSync(path.resolve(process.cwd(), 'scripts/refresh-fide-rating-list.ts'), 'utf8');
assert.match(updater, /players_list_foa\.zip/, 'Updater must use the official combined LEGACY list that includes unrated players.');
assert.match(updater, /MIN_EXPECTED_RECORDS/, 'Updater must fail closed on an implausibly small FIDE database.');
assert.match(updater, /archiveSha256/, 'Updater must pin the exact official archive by SHA-256.');
assert.match(updater, /Tournament data was not modified/, 'Rating-list refresh must remain separate from tournament mutation.');
assert.doesNotMatch(updater, /isBul|isTitled|>=\s*2100/, 'Latest-list updater must not intentionally reduce the global FIDE player population.');

console.log('PASS latest FIDE rating-list lifecycle: official monthly version detection + full combined source + integrity/sanity gates + tournament separation.');
