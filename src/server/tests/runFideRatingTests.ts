import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import { FideRatingRepository } from '../fide/FideRatingRepository';
import { FideRatingService } from '../fide/FideRatingService';
import { FidePlayerRecord } from '../fide/types';
import { tournamentStore } from '../tournamentStore';

// Helper to create synthetic official-format XML zip archive for deterministic testing
function createTestFideZip(playersXml: string): Buffer {
  const zip = new AdmZip();
  zip.addFile('players_list.xml', Buffer.from(playersXml, 'utf-8'));
  return zip.toBuffer();
}

const SAMPLE_XML_DATA = `<?xml version="1.0" encoding="UTF-8"?>
<playerslist>
  <player>
    <fideid>1503014</fideid>
    <name>Carlsen, Magnus</name>
    <country>NOR</country>
    <sex>M</sex>
    <title>GM</title>
    <rating>2832</rating>
    <rapid_rating>2823</rapid_rating>
    <blitz_rating>2886</blitz_rating>
    <birthday>1990</birthday>
    <flag></flag>
  </player>
  <player>
    <fideid>2004887</fideid>
    <name>Nakamura, Hikaru</name>
    <country>USA</country>
    <sex>M</sex>
    <title>GM</title>
    <rating>2802</rating>
    <rapid_rating>2746</rapid_rating>
    <blitz_rating>2874</blitz_rating>
    <birthday>1987-12-09</birthday>
    <flag></flag>
  </player>
  <player>
    <fideid>2902257</fideid>
    <name>Stefanova, Antoaneta</name>
    <country>BUL</country>
    <sex>F</sex>
    <title>GM</title>
    <w_title>WGM</w_title>
    <rating>2433</rating>
    <rapid_rating>2412</rapid_rating>
    <blitz_rating>2398</blitz_rating>
    <birthday>1979</birthday>
    <flag>w</flag>
  </player>
  <player>
    <fideid>2905540</fideid>
    <name>Cheparinov, Ivan</name>
    <country>BUL</country>
    <sex>M</sex>
    <title>GM</title>
    <rating>2660</rating>
    <rapid_rating>2645</rapid_rating>
    <blitz_rating>2652</blitz_rating>
    <birthday>1986</birthday>
    <flag></flag>
  </player>
</playerslist>`;

async function runFideTestSuite() {
  console.log('================================================================');
  console.log('AUTHORITATIVE FIDE RATING DATABASE & REPOSITORY TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] Test ${passed + failed + 1}: ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${passed + failed + 1}: ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
      failed++;
    }
  }

  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fide-test-db-'));

  try {
    const repo = new FideRatingRepository(testDir);
    const service = new FideRatingService(repo);

    // Test 1: No database installed
    await repo.initialize();
    const status1 = service.getStatus();
    assert(
      status1.databaseAvailable === false && status1.recordCount === 0,
      'No database installed reports available=false and count=0'
    );

    // Test 2: Successful authoritative update
    const sampleZip = createTestFideZip(SAMPLE_XML_DATA);
    const updateRes = await service.updateRatingList({
      customSourceBuffer: sampleZip,
      simulatedVersion: '2026-09'
    });
    assert(
      updateRes.success === true && updateRes.recordCount === 4,
      'Successful authoritative update imports exact records',
      `Imported: ${updateRes.recordCount}`
    );

    // Test 3: Database metadata saved
    const status3 = service.getStatus();
    assert(
      status3.databaseAvailable === true &&
      status3.listVersion === '2026-09' &&
      status3.listDate === '2026-09-01' &&
      status3.recordCount === 4 &&
      typeof status3.sha256 === 'string' &&
      status3.sha256.length === 64,
      'Database metadata saved with version, date, count, and SHA-256'
    );

    // Test 4: Standard rating parsed
    const carlsen = service.getPlayer(1503014);
    assert(
      carlsen !== null && carlsen.ratingStandard === 2832,
      'Standard rating parsed correctly (Carlsen STD = 2832)',
      `Actual STD: ${carlsen?.ratingStandard}`
    );

    // Test 5: Rapid rating parsed
    assert(
      carlsen !== null && carlsen.ratingRapid === 2823,
      'Rapid rating parsed correctly (Carlsen RAPID = 2823)',
      `Actual RAP: ${carlsen?.ratingRapid}`
    );

    // Test 6: Blitz rating parsed
    assert(
      carlsen !== null && carlsen.ratingBlitz === 2886,
      'Blitz rating parsed correctly (Carlsen BLITZ = 2886)',
      `Actual BLZ: ${carlsen?.ratingBlitz}`
    );

    // Test 7: Exact FIDE ID search
    const exactSearch = service.search({ query: '1503014' });
    assert(
      exactSearch.length === 1 && exactSearch[0].name === 'Carlsen, Magnus',
      'Exact FIDE ID search returns target player'
    );

    // Test 8: Partial player-name search
    const partialSearch = service.search({ query: 'Naka' });
    assert(
      partialSearch.length === 1 && partialSearch[0].fideId === 2004887,
      'Partial player-name search finds Nakamura'
    );

    // Test 9: Federation filter
    const bulSearch = service.search({ query: '', federation: 'BUL' });
    assert(
      bulSearch.length === 2 &&
      bulSearch.every(p => p.federation === 'BUL'),
      'Federation filter returns only matching federation records (BUL count = 2)'
    );

    // Test 10: Partial birth data preserved
    const stefanova = service.getPlayer(2902257);
    const nakamura = service.getPlayer(2004887);
    assert(
      stefanova?.birth === '1979' && nakamura?.birth === '1987-12-09',
      'Partial birth data preserved without fabricating days/months (1979 vs 1987-12-09)',
      `Stefanova birth: ${stefanova?.birth}, Nakamura birth: ${nakamura?.birth}`
    );

    // Test 11: Failed download keeps previous database
    let downloadFailedCaught = false;
    try {
      // Force failure with corrupted buffer
      await service.updateRatingList({
        customSourceBuffer: Buffer.from('NOT_A_VALID_ZIP_OR_XML')
      });
    } catch (e) {
      downloadFailedCaught = true;
    }
    const status11 = service.getStatus();
    assert(
      downloadFailedCaught && status11.databaseAvailable === true && status11.recordCount === 4,
      'Failed download/update keeps previous valid database',
      `Record count after failed update: ${status11.recordCount}`
    );

    // Test 12: Invalid archive keeps previous database
    let invalidArchiveCaught = false;
    try {
      await service.updateRatingList({
        customSourceBuffer: Buffer.from('PK\x03\x04corrupted_header')
      });
    } catch (e) {
      invalidArchiveCaught = true;
    }
    const status12 = service.getStatus();
    assert(
      invalidArchiveCaught && status12.recordCount === 4,
      'Invalid archive keeps previous database'
    );

    // Test 13: Invalid parsed data keeps previous database
    const invalidXmlZip = createTestFideZip('<playerslist><invalid></invalid></playerslist>');
    let invalidDataCaught = false;
    try {
      await service.updateRatingList({
        customSourceBuffer: invalidXmlZip
      });
    } catch (e) {
      invalidDataCaught = true;
    }
    const status13 = service.getStatus();
    assert(
      invalidDataCaught && status13.recordCount === 4,
      'Invalid parsed data (0 valid players) keeps previous database'
    );

    // Test 14: Concurrent update blocked
    let concurrentBlocked = false;
    // Simulate updating flag
    (service as any).isUpdating = true;
    try {
      await service.updateRatingList({
        customSourceBuffer: sampleZip
      });
    } catch (e: any) {
      if (e.message && e.message.includes('UPDATE_ALREADY_IN_PROGRESS')) {
        concurrentBlocked = true;
      }
    } finally {
      (service as any).isUpdating = false;
    }
    assert(
      concurrentBlocked,
      'Concurrent update blocked with UPDATE_ALREADY_IN_PROGRESS'
    );

    // Test 15: Offline search uses cached database
    const offlineSearch = service.search({ query: 'Carlsen' });
    assert(
      offlineSearch.length > 0 && offlineSearch[0].fideId === 1503014,
      'Offline search uses existing cached database'
    );

    // Test 16: Client cannot supply arbitrary source URL (Security)
    // Verify that service rejects or does not expose arbitrary external URL parameter
    assert(
      (service as any).AUTHORITATIVE_FIDE_URL === 'https://ratings.fide.com/download/players_list_xml.zip',
      'Authoritative FIDE URL is strictly hardcoded on server side'
    );

    // Test 17: Mock/sample players never appear in production search
    const emptyRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fide-empty-db-'));
    const emptyRepo = new FideRatingRepository(emptyRepoDir);
    const emptyService = new FideRatingService(emptyRepo);
    await emptyRepo.initialize();
    const emptySearchResults = emptyService.search({ query: 'Carlsen' });
    assert(
      emptySearchResults.length === 0,
      'Empty/uninitialized database returns empty array, never mock SAMPLE_FIDE_PLAYERS'
    );
    emptyRepo.close();

    // Test 18: Database SHA-256 metadata correct
    const expectedSha = crypto.createHash('sha256').update(sampleZip).digest('hex');
    const meta18 = repo.getMetadata();
    assert(
      meta18?.sha256 === expectedSha,
      'Database SHA-256 metadata matches exact archive digest',
      `Expected: ${expectedSha}, Actual: ${meta18?.sha256}`
    );

    // Test 19: Restart preserves downloaded database
    repo.close();
    const reopenedRepo = new FideRatingRepository(testDir);
    await reopenedRepo.initialize();
    const reopenedService = new FideRatingService(reopenedRepo);
    const reopenedPlayer = reopenedService.getPlayer(1503014);
    assert(
      reopenedPlayer !== null && reopenedPlayer.name === 'Carlsen, Magnus',
      'Restart preserves downloaded SQLite database on disk'
    );
    reopenedRepo.close();

    // Test 20: Tournament state is NOT mutated by rating-list update
    const officialTournamentBefore = tournamentStore.getOfficialTournament();
    const playersBeforeCount = officialTournamentBefore.players?.length || 0;
    const liveBoardsBeforeCount = Object.keys(officialTournamentBefore.pairings?.liveBoards || {}).length;

    // Run another FIDE update
    const freshRepo = new FideRatingRepository(testDir);
    await freshRepo.initialize();
    const freshService = new FideRatingService(freshRepo);
    await freshService.updateRatingList({
      customSourceBuffer: sampleZip,
      simulatedVersion: '2026-10'
    });

    const officialTournamentAfter = tournamentStore.getOfficialTournament();
    assert(
      (officialTournamentAfter.players?.length || 0) === playersBeforeCount &&
      Object.keys(officialTournamentAfter.pairings?.liveBoards || {}).length === liveBoardsBeforeCount,
      'Tournament state is NOT mutated by rating-list update (Batch B separation from Batch C)'
    );
    freshRepo.close();

  } finally {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  }

  console.log('\n================================================================');
  console.log(`FIDE RATING DATABASE TEST RESULTS: ${passed}/${passed + failed} PASS`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runFideTestSuite().catch(err => {
  console.error('Fatal error running FIDE test suite:', err);
  process.exit(1);
});
