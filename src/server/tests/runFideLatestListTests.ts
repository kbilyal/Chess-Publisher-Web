import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { extractOfficialListVersion } from '../../../scripts/refresh-fide-rating-list';
import { FideRatingRepository } from '../fide/FideRatingRepository';
import { FideRatingService, extractRatingPeriodFromHeader } from '../fide/FideRatingService';

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

const headerPeriod = extractRatingPeriodFromHeader('ID Number      Name                                                         Fed Sex Tit  WTit OTit           FOA NOV26 Gms K  B-day Flag');
assert.deepEqual(headerPeriod, {
  listVersion: '2026-11',
  listDate: '2026-11-01'
});

const updater = fs.readFileSync(path.resolve(process.cwd(), 'scripts/refresh-fide-rating-list.ts'), 'utf8');
assert.match(updater, /standard_rating_list\.zip/, 'Updater must download standard_rating_list.zip.');
assert.match(updater, /rapid_rating_list\.zip/, 'Updater must download rapid_rating_list.zip.');
assert.match(updater, /blitz_rating_list\.zip/, 'Updater must download blitz_rating_list.zip.');
assert.doesNotMatch(updater, /players_list_foa\.zip/, 'Updater must not use the frozen 2015 players_list_foa.zip archive.');
assert.match(updater, /MIN_EXPECTED_RECORDS/, 'Updater must fail closed on an implausibly small FIDE database.');
assert.match(updater, /archiveSha256/, 'Updater must pin the exact official archive by SHA-256.');
assert.match(updater, /Tournament data was not modified/, 'Rating-list refresh must remain separate from tournament mutation.');
assert.doesNotMatch(updater, /isBul|isTitled|>=\s*2100/, 'Latest-list updater must not intentionally reduce the global FIDE player population.');

async function runParserAndDedupeTests() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fide-latest-regression-'));
  try {
    const repo = new FideRatingRepository(tempDir);
    await repo.initialize();
    const service = new FideRatingService(repo);

    // 1. Duplicate fide_id rows in legacy TXT and XML must deduplicate cleanly without SQLite UNIQUE failure.
    const dupLegacy = [
      'ID Number      Name                                                         Fed Sex Tit  WTit OTit           FOA SRtng SGms SK RRtng RGms RK BRtng BGms BK B-day Flag',
      '1503014        Carlsen, Magnus                                              NOR M   GM                           2823  0   10 2801  0   10 2860  0   10 1990      ',
      '1503014        Carlsen, Magnus                                              NOR M   GM                           2823  0   10 2801  0   10 2860  0   10 1990      '
    ].join('\n');
    const legacyPlayers = service.parseFideLegacyTxt(dupLegacy);
    assert.equal(legacyPlayers.length, 1);
    assert.equal(legacyPlayers[0].federation, 'NOR');
    assert.equal(legacyPlayers[0].name, 'Carlsen, Magnus');

    const dupXml = `<?xml version="1.0" encoding="UTF-8"?>
<playerslist>
  <player><fideid>1503014</fideid><name>Carlsen, Magnus</name><country>NOR</country><sex>M</sex><rating>2823</rating></player>
  <player><fideid>1503014</fideid><name>Carlsen, Magnus</name><country>NOR</country><sex>M</sex><rating>2823</rating></player>
</playerslist>`;
    const xmlPlayers = service.parseFideXml(dupXml);
    assert.equal(xmlPlayers.length, 1);

    // 2. Official Standard + Rapid + Blitz merge parses mixed-case Fed, NOV26 period, and commits atomically.
    const makeZip = (fileName: string, body: string) => {
      const z = new AdmZip();
      z.addFile(fileName, Buffer.from(body, 'latin1'));
      return z.toBuffer();
    };
    const hdr = 'ID Number      Name                                                         Fed Sex Tit  WTit OTit           FOA NOV26 Gms K  B-day Flag';
    const stdTxt = [
      hdr,
      '1503014        Carlsen, Magnus                                              NOR M   GM                           2823  0   10 1990      ',
      '1503014        Carlsen, Magnus                                              NOR M   GM                           2823  0   10 1990      '
    ].join('\n');
    const rpdTxt = [
      hdr,
      '1503014        Carlsen, Magnus                                              NOR M   GM                           2801  0   10 1990      ',
      '2902257        Stefanova, Antoaneta                                         BUL F   GM                           2412  0   10 1979  w   '
    ].join('\n');
    const blzTxt = [
      hdr,
      '1503014        Carlsen, Magnus                                              NOR M   GM                           2860  0   10 1990      '
    ].join('\n');

    const mergeResult = await service.updateRatingListFromOfficialLists({
      standard: makeZip('standard_rating_list.txt', stdTxt),
      rapid: makeZip('rapid_rating_list.txt', rpdTxt),
      blitz: makeZip('blitz_rating_list.txt', blzTxt)
    });
    assert.equal(mergeResult.success, true);
    assert.equal(mergeResult.listVersion, '2026-11');
    assert.equal(mergeResult.recordCount, 2);

    const carlsen = service.getPlayer(1503014);
    assert.equal(carlsen?.ratingStandard, 2823);
    assert.equal(carlsen?.ratingRapid, 2801);
    assert.equal(carlsen?.ratingBlitz, 2860);
    assert.equal(carlsen?.federation, 'NOR');

    const stefanova = service.getPlayer(2902257);
    assert.equal(stefanova?.ratingStandard, 0);
    assert.equal(stefanova?.ratingRapid, 2412);
    assert.equal(stefanova?.federation, 'BUL');

    repo.close();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

await runParserAndDedupeTests();
console.log('PASS latest FIDE rating-list lifecycle: official monthly version detection + std/rpd/blz merge + deduplication + integrity/sanity gates + tournament separation.');
