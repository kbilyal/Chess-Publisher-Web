import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const [url, modules, executablePath, artifacts] = process.argv.slice(2);
const { chromium } = createRequire(`${modules}/package.json`)('playwright-core');
const browser = await chromium.launch({ executablePath });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev/**', route => {
    const request = route.request();
    const headers = {
      'access-control-allow-origin': new URL(url).origin,
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type, X-Client-Version, X-Expected-Revision',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    return route.fulfill({ headers, json: { ok: true, organizer: { id: 'pdf-test', displayName: 'PDF test' }, tournaments: [] } });
  });
  await page.goto(new URL('workspace.html', url).href);
  await page.getByRole('heading', { name: 'ChessPublisher Web' }).waitFor();
  await page.getByLabel('Organizer Token').fill('ci-pdf-export-organizer');
  await page.getByRole('button', { name: 'Отвори приложението' }).click();
  const name = page.getByRole('textbox', { name: 'Tournament name', exact: true });
  try {
    await name.fill('Sofia Open', { timeout: 10000 });
  } catch (error) {
    throw new Error(`Workspace did not open at ${page.url()}: ${errors.join('; ')} · ${(await page.locator('body').innerText()).slice(0, 300)}`, { cause: error });
  }
  await name.press('Enter');
  await page.locator('#main').waitFor();
  await page.evaluate(() => {
    const tournament = getCurrentTournament();
    Object.assign(tournament.settings, {
      city: 'Sofia', venue: 'Central Chess Club', timeControl: '90+30', timeControlPreset: '90+30',
      startDate: '2026-11-23T09:30', endDate: '2026-11-25T18:00',
    });
    tournament.telegram.language = 'bg';
    tournament.schedule.rows = [{ event: 'Round 2', dateTime: '2026-11-24T10:00' }];
    tournament.players = Array.from({ length: 121 }, (_, index) => ({
      name: index === 0 ? 'Александър Александров <Юноши>' : `Player ${String(index + 1).padStart(3, '0')}`,
      pairingNumber: index + 1, rating: 2450 - index, title: index === 0 ? 'GM' : '',
      fed: 'BUL', fideId: String(2900000 + index), gender: 'M', birth: '2000',
    }));
    const keys = tournament.players.map((player, index) => playerKey(player, index));
    tournament.pairings.liveBoards = {
      1: [{ board: 1, whiteKey: keys[1], blackKey: keys[0], result: '½ - ½' }],
      2: [...Array.from({ length: 60 }, (_, index) => ({
        board: index + 1, whiteKey: keys[index * 2], blackKey: keys[index * 2 + 1],
        result: ['1 - 0', '½ - ½', '0F - 1F'][index] ?? '-',
      })), { board: 61, whiteKey: keys[120], blackKey: '', result: 'PAB' }],
    };
    tournament.pairings.round = '2';
    tournament.pairings.exportOptions = { ...pairingsExportDefaults(), resultMode: 'none' };
    refreshEverything();
    // Stage the production print root, then let Chromium produce the PDF below.
    window.print = () => { document.body.dataset.printRequested = 'true'; };
  });

  const dialog = page.locator('#cpPdfDialog');
  const preview = dialog.locator('.cp-pdf-report');
  const printRoot = page.locator('#screenPrintReport');
  if (artifacts) await mkdir(artifacts, { recursive: true });
  async function verifyPrint(filename, documentTitle, singlePage = false) {
    const originalTitle = await page.title();
    await dialog.getByRole('button', { name: 'Print / Save PDF' }).click();
    assert.equal(await page.locator('body').getAttribute('data-print-requested'), 'true');
    assert.equal(await printRoot.innerHTML(), await dialog.locator('.cp-pdf-paper').innerHTML());
    assert.match(await page.title(), documentTitle);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await printRoot.locator('.cp-pdf-report').isVisible(), true);
    assert.equal(await dialog.isVisible(), false);
    assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).backgroundColor), 'rgb(255, 255, 255)');
    const pdf = await page.pdf({ path: artifacts && join(artifacts, filename), preferCSSPageSize: true, printBackground: true });
    const pages = (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
    if (singlePage) assert.equal(pages, 1, 'One board and sign-off must fit on one page');
    else assert.ok(pages >= 2, 'Long tables must span multiple pages');
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => {
      if (document.querySelector('#screenPrintReport .cp-pdf-report')) {
        window.dispatchEvent(new Event('afterprint'));
      }
      delete document.body.dataset.printRequested;
    });
    assert.equal(await page.title(), originalTitle);
    assert.equal(await printRoot.locator('.cp-pdf-report').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--cp-pdf-page-label')), '');
  }

  await page.locator('#tabRegistration').click();
  const startingButton = page.locator('#registration button[onclick="openStartingListExportDialog()"]');
  await startingButton.click();
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute('lang'), 'en');
  assert.equal(await preview.getAttribute('lang'), 'en');
  assert.equal(await preview.locator('h1').textContent(), 'Starting list');
  assert.equal(await preview.getByRole('columnheader', { name: 'Player', exact: true }).count(), 1);
  assert.equal(await preview.locator('tbody tr').count(), 121);
  assert.match(await preview.locator('tbody tr').first().textContent(), /Александров <Юноши>/);
  await dialog.getByRole('button', { name: 'FIDE details' }).click();
  assert.equal(await preview.getByRole('columnheader', { name: 'FIDE ID' }).count(), 1);
  if (artifacts) await dialog.screenshot({ path: join(artifacts, 'starting-list-preview.png') });
  await verifyPrint('starting-list.pdf', /Sofia Open - Starting list/);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await startingButton.evaluate(element => element === document.activeElement), true);

  await page.locator('#tabPairings').click();
  await page.locator('#pairingsRound').selectOption('2');
  await page.locator('#pairings button[onclick="openPairingsExportDialog(\'pdf\')"]').click();
  await dialog.waitFor();
  const results = preview.locator('tbody .cp-pdf-result');
  async function verifyMixedResults() {
    const headers = (await preview.getByRole('columnheader').allTextContents()).map(text => text.trim());
    assert.deepEqual(headers.slice(-3), ['White', 'Result', 'Black']);
    const [whiteName, blackName] = await results.first().evaluate(cell => [
      cell.previousElementSibling.querySelector('.cp-pdf-player-name').textContent.trim(),
      cell.nextElementSibling.querySelector('.cp-pdf-player-name').textContent.trim(),
    ]);
    assert.match(whiteName, /Александров <Юноши>/);
    assert.equal(blackName, 'Player 002');
    assert.deepEqual((await results.allTextContents()).slice(0, 4), ['1 - 0', '½ - ½', '0F - 1F', '']);
    assert.equal(await results.nth(3).getByRole('img', { name: 'Blank space for handwritten result' }).count(), 1);
    assert.equal(await preview.locator('.cp-pdf-score-box').count(), 57);
    assert.equal(await results.last().locator('.cp-pdf-score-box').count(), 0);
  }
  await verifyMixedResults();
  await dialog.getByRole('button', { name: 'Compact' }).click();
  await verifyMixedResults();
  await dialog.getByRole('button', { name: 'Standard' }).click();
  assert.equal(await preview.locator('h1').textContent(), 'Pairings');
  assert.equal(await preview.locator('.cp-pdf-round-card strong').textContent(), '2');
  assert.match(await preview.locator('.cp-pdf-round-details').textContent(), /Round start\s*24 Nov 2026/);
  assert.match(await preview.locator('.cp-pdf-round-details').textContent(), /Time control\s*90\+30/);
  assert.deepEqual(await preview.locator('.cp-pdf-round-summary span').allTextContents(),
    ['60 games', '3 recorded', '57 pending', '1 bye']);
  assert.match(await preview.locator('tbody tr').last().textContent(), /Bye\s*PAB/);
  assert.equal(await preview.getByRole('heading', { name: 'Arbiter sign-off' }).count(), 0);
  await dialog.getByRole('button', { name: 'Arbiter sheet' }).click();
  const signOff = preview.getByRole('region', { name: 'Arbiter sign-off' });
  assert.deepEqual(await signOff.locator('span').allTextContents(), ['Name', 'Signature', 'Date / time']);
  await dialog.getByText('Customize fields', { exact: true }).click();
  const signOffOption = dialog.getByRole('checkbox', { name: 'Arbiter sign-off' });
  await signOffOption.uncheck();
  assert.equal(await signOff.count(), 0);
  await signOffOption.check();
  await dialog.getByText('Customize fields', { exact: true }).click();
  if (artifacts) await dialog.screenshot({ path: join(artifacts, 'pairings-preview.png') });
  await verifyPrint('pairings.pdf', /Sofia Open - Pairings - Round 2/);

  await page.setViewportSize({ width: 390, height: 780 });
  const box = await dialog.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390, 'Dialog must fit on a phone');
  if (artifacts) await dialog.screenshot({ path: join(artifacts, 'pairings-mobile.png') });
  await dialog.getByRole('button', { name: 'Actual size' }).click();
  assert.equal(await dialog.getByRole('button', { name: 'Actual size' }).getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#pairingsRound').selectOption('1');
  await page.locator('#pairings button[onclick="openPairingsExportDialog(\'pdf\')"]').click();
  await dialog.waitFor();
  assert.equal(await signOff.count(), 1, 'The selected sign-off option is saved');
  assert.equal(await preview.locator('.cp-pdf-round-details').getByText('Round start').count(), 0);
  assert.deepEqual(await preview.locator('.cp-pdf-round-summary span').allTextContents(),
    ['1 game', '1 recorded', '0 pending']);
  await verifyPrint('pairings-one-board.pdf', /Sofia Open - Pairings - Round 1/, true);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await page.evaluate(() => openPairingsExportDialog('txt'));
  assert.equal(await page.locator('#pairingsExportModal').isVisible(), true);
  assert.equal(await page.locator('#pairingsExportModal input[name="peResultMode"]:checked').inputValue(), 'none');
  const printTxtButton = page.locator('#pairingsExportModal [data-cp-pairings-txt-print]');
  await printTxtButton.waitFor({ state: 'visible' });
  await page.evaluate(() => {
    window.__cpPairingsTxtPrintCalls = 0;
    window.print = () => { window.__cpPairingsTxtPrintCalls++; };
  });
  await printTxtButton.click();
  await page.waitForFunction(() => window.__cpPairingsTxtPrintCalls === 1);
  const printedTxt = await page.locator('#screenPrintReport .final-txt-pre').textContent();
  assert.match(printedTxt, /Sofia Open/);
  assert.match(printedTxt, /Round 1/);
  assert.match(printedTxt, /Bo\.\s+SNo\./);
  assert.equal(await page.locator('#pairingsExportModal').isVisible(), false);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  assert.equal(await page.locator('#pairingsExportModal').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log('English PDF previews, mixed scores, round summary, arbiter sign-off, A4 pagination, mobile and TXT printing passed.');
} finally {
  await browser.close();
}
