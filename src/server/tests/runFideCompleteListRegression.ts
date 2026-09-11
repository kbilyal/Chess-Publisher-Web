import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { buildFideNameQueryVariants } from '../../companion/fideBrowserDatabase';
import { FideRatingRepository } from '../fide/FideRatingRepository';
import { FideRatingService } from '../fide/FideRatingService';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fide-complete-list-regression-'));

  try {
    const repository = new FideRatingRepository(tempDir);
    const service = new FideRatingService(repository);

    // These are intentionally ordinary players: foreign federation, no title,
    // and well below the old 2100 threshold. The old streaming XML parser
    // incorrectly discarded both records.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<playerslist>
  <player>
    <fideid>9900001</fideid>
    <name>Ordinary, Standard</name>
    <country>GER</country>
    <sex>M</sex>
    <title></title>
    <rating>1784</rating>
    <rapid_rating>1712</rapid_rating>
    <blitz_rating>1698</blitz_rating>
    <birthday>1994</birthday>
    <flag></flag>
  </player>
  <player>
    <fideid>9900002</fideid>
    <name>Ordinary, Rapid</name>
    <country>TUR</country>
    <sex>F</sex>
    <title></title>
    <rating>0</rating>
    <rapid_rating>1649</rapid_rating>
    <blitz_rating>1511</blitz_rating>
    <birthday>2001</birthday>
    <flag></flag>
  </player>
</playerslist>`;

    const zipPath = path.join(tempDir, 'players_list_xml.zip');
    const zip = new AdmZip();
    zip.addFile('players_list.xml', Buffer.from(xml, 'utf8'));
    zip.writeZip(zipPath);

    const players = await (service as any).parseLargeXmlZip(zipPath);
    const standardPlayer = players.find((player: any) => player.fideId === 9900001);
    const rapidPlayer = players.find((player: any) => player.fideId === 9900002);

    assert(standardPlayer, 'Large XML parser dropped an untitled sub-2100 non-BUL Standard player.');
    assert(rapidPlayer, 'Large XML parser dropped an untitled sub-2100 non-BUL Rapid player.');
    assert(standardPlayer.ratingStandard === 1784, `Standard rating mismatch: ${standardPlayer.ratingStandard}`);
    assert(standardPlayer.ratingRapid === 1712, `Rapid rating mismatch: ${standardPlayer.ratingRapid}`);
    assert(standardPlayer.ratingBlitz === 1698, `Blitz rating mismatch: ${standardPlayer.ratingBlitz}`);
    assert(rapidPlayer.ratingStandard === 0, `Expected unrated Standard=0, got ${rapidPlayer.ratingStandard}`);
    assert(rapidPlayer.ratingRapid === 1649, `Rapid rating mismatch: ${rapidPlayer.ratingRapid}`);
    assert(rapidPlayer.ratingBlitz === 1511, `Blitz rating mismatch: ${rapidPlayer.ratingBlitz}`);
    assert(rapidPlayer.gender === 'f', `Gender normalization mismatch: ${rapidPlayer.gender}`);

    const givenSurnameVariants = buildFideNameQueryVariants('Kyamran Bilyal');
    const surnameGivenVariants = buildFideNameQueryVariants('Bilyal Kyamran');
    const commaVariants = buildFideNameQueryVariants('Bilyal, Kyamran');
    for (const variants of [givenSurnameVariants, surnameGivenVariants, commaVariants]) {
      assert(variants.includes('Kyamran Bilyal'), 'FIDE name search must accept Given Surname without a comma.');
      assert(variants.includes('Bilyal Kyamran'), 'FIDE name search must accept Surname Given without a comma.');
      assert(variants.includes('Bilyal, Kyamran'), 'FIDE name search fallback must generate the canonical comma form automatically.');
    }

    const browserSearchSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'companion', 'fideBrowserDatabase.ts'),
      'utf8'
    );
    assert(
      browserSearchSource.includes('https://lichess.org/api/fide/player'),
      'Web fallback must use the public FIDE player API mirror when the packaged list is incomplete.'
    );
    assert(
      browserSearchSource.includes('ratingRapid') && browserSearchSource.includes('ratingBlitz') && browserSearchSource.includes('ratingStandard'),
      'Web fallback must preserve separate Standard, Rapid and Blitz ratings.'
    );

    repository.close();
    console.log('PASS FIDE complete-list regression: ordinary players preserved + Standard/Rapid/Blitz fields retained + name order/comma-independent search variants preserved.');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error('FAIL FIDE complete-list regression:', error);
  process.exitCode = 1;
});