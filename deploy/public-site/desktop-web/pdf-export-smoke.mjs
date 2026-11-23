import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const [url, modules, executablePath, artifacts] = process.argv.slice(2);
const { chromium } = createRequire(`${modules}/package.json`)('playwright-core');
const browser = await chromium.launch({ executablePath });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev/**', route => {
    const request = route.request();
    const headers = {
      'access-control-allow-origin': new URL(url).origin,
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
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
  await page.locator('#createScreen').waitFor({ state: 'hidden', timeout: 10000 });
  await page.locator('#main').waitFor();
  await page.waitForFunction(
    () => typeof getCurrentTournament === 'function' && typeof data !== 'undefined' && data.currentTournament === 'Sofia Open',
    null,
    { timeout: 10000 },
  );
  await page.evaluate(() => {
    const tournament = getCurrentTournament();
    Object.assign(tournament.settings, {
      city: 'Sofia', venue: 'Central Chess Club', timeControl: '90+30', timeControlPreset: '90+30',
      startDate: '2026-11-23T09:30', endDate: '2026-11-25T18:00',
    });
    tournament.telegram.language = 'bg';
    tournament.schedule.rows = [{ event: 'Round 2', dateTime: '2026-11-24T10:00' }];
    tournament.players = Array.from({ length: 121 }, (_, index) => ({
      name: index === 0 ? 'Александър Иванов <Юноши>' : `Player ${String(index + 1).padStart(3, '0')}`,
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
    await page.waitForFunction(
      () => document.body.getAttribute('data-print-requested') === 'true',
      null,
      { timeout: 10000 },
    );
    try {
      await page.waitForFunction(
        ({ source, flags }) => new RegExp(source, flags).test(document.title),
        { source: documentTitle.source, flags: documentTitle.flags },
        { timeout: 10000 },
      );
    } catch (error) {
      throw new Error(`PDF document title did not match ${documentTitle}; actual title: ${JSON.stringify(await page.title())}`, { cause: error });
    }
    assert.equal(await page.locator('body').getAttribute('data-print-requested'), 'true');
    assert.equal(await printRoot.innerHTML(), await dialog.locator('.cp-pdf-paper').innerHTML());
    assert.match(await page.title(), documentTitle);
    await page.emulateMedia({ media: 'print' });
    await printRoot.locator('.cp-pdf-report').waitFor({ state: 'visible', timeout: 10000 });
    await dialog.waitFor({ state: 'hidden', timeout: 10000 });
    await page.waitForFunction(
      () => getComputedStyle(document.body).backgroundColor === 'rgb(255, 255, 255)',
      null,
      { timeout: 10000 },
    );
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
    await page.waitForFunction(
      expected => document.title === expected && !document.querySelector('#screenPrintReport .cp-pdf-report'),
      originalTitle,
      { timeout: 10000 },
    );
    assert.equal(await page.title(), originalTitle);
    assert.equal(await printRoot.locator('.cp-pdf-report').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--cp-pdf-page-label')), '');
  }

  await page.locator('#tabRegistration').click();
  const startingButton = page.locator('#registration button[onclick="openStartingListExportDialog()"]');
  await startingButton.click();
  await dialog.waitFor();
  await preview.locator('h1').waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await dialog.getAttribute('lang'), 'en');
  assert.equal(await preview.getAttribute('lang'), 'en');
  assert.equal(await preview.locator('h1').textContent(), 'Starting list');
  assert.equal(await preview.getByRole('columnheader', { name: 'Player', exact: true }).count(), 1);
  assert.equal(await preview.locator('tbody tr').count(), 121);
  assert.match(await preview.locator('tbody tr').first().textContent(), /Иванов <Юноши>/);
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
  await preview.locator('h1').waitFor({ state: 'visible', timeout: 10000 });
  const results = preview.locator('tbody .cp-pdf-result');
  async function verifyMixedResults() {
    const headers = (await preview.getByRole('columnheader').allTextContents()).map(text => text.trim());
    assert.deepEqual(headers.slice(-3), ['White', 'Result', 'Black']);
    const [whiteName, blackName] = await results.first().evaluate(cell => [
      cell.previousElementSibling.querySelector('.cp-pdf-player-name').textContent.trim(),
      cell.nextElementSibling.querySelector('.cp-pdf-player-name').textContent.trim(),
    ]);
    assert.match(whiteName, /Иванов <Юноши>/);
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
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
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
  await preview.locator('h1').waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await signOff.count(), 1, 'The selected sign-off option is saved');
  assert.equal(await preview.locator('.cp-pdf-round-details').getByText('Round start').count(), 0);
  assert.deepEqual(await preview.locator('.cp-pdf-round-summary span').allTextContents(),
    ['1 game', '1 recorded', '0 pending']);
  await verifyPrint('pairings-one-board.pdf', /Sofia Open - Pairings - Round 1/, true);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await page.locator('#pairings button[onclick="openPairingsExportDialog(\'txt\')"]').click();
  const txtDialog = page.locator('#pairingsExportModal');
  await txtDialog.waitFor();
  const resultMode = txtDialog.locator('input[name="peResultMode"]:checked');
  assert.equal(await resultMode.inputValue(), 'none');
  await txtDialog.getByRole('radio', { name: 'Current result' }).check();
  await txtDialog.locator('#peShowPoints').uncheck();
  await txtDialog.locator('#peShowTitle').uncheck();
  const titleBeforeTxt = await page.title();
  const printRootBeforeTxt = await printRoot.innerHTML();
  await page.evaluate(() => {
    window.__cpTxtPrintCalls = 0;
    window.print = () => { window.__cpTxtPrintCalls++; };
  });
  const txtPrint = printRoot.locator('.final-txt-print > pre.final-txt-pre');
  const printTextStyle = element => {
    const style = getComputedStyle(element);
    return { fontFamily: style.fontFamily, whiteSpace: style.whiteSpace };
  };
  await txtDialog.getByRole('button', { name: 'Print TXT', exact: true }).click();
  await page.waitForFunction(() => window.__cpTxtPrintCalls === 1);
  const printedTxt = await txtPrint.textContent();
  const [tournament, , round, , columns, board, end] = printedTxt.split(/\r?\n/);
  assert.equal(tournament, 'Sofia Open');
  assert.equal(round, 'Round 1');
  assert.match(columns, /Bo\.\s+SNo\.\s+White\s+Res\.\s+Black\s+SNo\./);
  assert.match(board, /^\s*1\s+2\s+Player 002\s+½ - ½\s+Александър Иванов <Юноши>\s+1$/);
  assert.equal(board.length, columns.length);
  assert.equal(end, '');
  assert.match(await page.title(), /Sofia Open - Pairings - Round 1/);
  await txtDialog.waitFor({ state: 'hidden' });
  await page.emulateMedia({ media: 'print' });
  await txtPrint.waitFor();
  const pairingsStyle = await txtPrint.evaluate(printTextStyle);
  assert.match(pairingsStyle.fontFamily, /monospace/i);
  assert.equal(pairingsStyle.whiteSpace, 'pre');
  await page.pdf({ path: artifacts && join(artifacts, 'pairings-txt.pdf'), preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => {
    if (document.querySelector('#screenPrintReport .final-txt-pre')) {
      window.dispatchEvent(new Event('afterprint'));
    }
  });
  await txtDialog.waitFor();
  assert.equal(await page.title(), titleBeforeTxt);
  assert.equal(await printRoot.innerHTML(), printRootBeforeTxt);
  assert.equal(await resultMode.inputValue(), 'current');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    txtDialog.locator('#pairingsExportRunBtn').click(),
  ]);
  assert.equal(download.suggestedFilename(), 'Sofia Open_Pairings_R1.txt');
  assert.equal((await readFile(await download.path(), 'utf8')).replace(/^\uFEFF/, ''), printedTxt);
  await txtDialog.waitFor({ state: 'hidden' });

  await page.locator('#tabStandings').click();
  await page.locator('#standings button[onclick="printFinalStandingsTxt()"]').click();
  await page.waitForFunction(() => window.__cpTxtPrintCalls === 2);
  assert.match(await txtPrint.textContent(), /FINAL STANDINGS|КРАЙНО КЛАСИРАНЕ/);
  assert.match(await txtPrint.textContent(), /Александър Иванов <Юноши>/);
  assert.match(await page.title(), /Sofia Open - Final Standings/);
  await page.emulateMedia({ media: 'print' });
  await txtPrint.waitFor();
  assert.deepEqual(await txtPrint.evaluate(printTextStyle), pairingsStyle);
  await page.pdf({ path: artifacts && join(artifacts, 'standings-txt.pdf'), preferCSSPageSize: true });
  assert.deepEqual(errors, []);
  console.log('English PDF previews and mobile controls passed. Pairings TXT download and print matched the selected round. Standings TXT print passed.');
} finally {
  await browser.close();
}
