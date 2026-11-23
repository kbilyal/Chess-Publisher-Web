import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const [url, modules, executablePath] = process.argv.slice(2);
const { chromium } = createRequire(`${modules}/package.json`)('playwright-core');
const browser = await chromium.launch({ executablePath });
const token = 'ci-desktop-web-organizer';
const origin = new URL(url).origin;
const rows = new Map();
let failNextUpload = false;
let failedUploads = 0;
let putDelayMs = 0;
let conflictResponses = 0;
let rejectWith401 = false;
let uploadsAfter401 = 0;

async function installCloudFixture(page) {
  await page.route('https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, OPTIONS, POST, PUT',
      'access-control-allow-headers': 'Authorization, Content-Type, X-Client-Version, X-Expected-Revision'
    };
    const reply = (json, status = 200) => route.fulfill({ status, headers, json });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const auth = (await request.allHeaders()).authorization;
    if (auth !== `Bearer ${token}`) {
      if (origin.startsWith('https:') && path === '/api/v1/cloud/workspace') return route.continue();
      return reply({ ok: false }, 401);
    }
    if (path === '/api/v1/cloud/workspace') return reply({ ok: true, organizer: { id: 'ci-organizer', displayName: 'CI organizer' } });
    if (path === '/api/v1/cloud/tournaments') {
      if (method === 'GET') return reply({ ok: true, tournaments: [...rows.values()].map(row => row.tournament) });
      if (method === 'POST') {
        const { name, localKey } = request.postDataJSON();
        const id = `ci-${rows.size + 1}`;
        const tournament = { id, name, localKey, revision: 0, updatedAt: new Date().toISOString() };
        rows.set(id, { tournament, snapshot: null });
        return reply({ ok: true, tournament }, 201);
      }
    }
    const match = /^\/api\/v1\/cloud\/tournaments\/([^/]+)(?:\/(snapshot))?$/.exec(path);
    if (match) {
      const row = rows.get(match[1]);
      if (!row || (method === 'GET' && match[2] && !row.snapshot)) return reply({ error: 'not_found' }, 404);
      if (method === 'GET') return reply({ ok: true, ...row });
      if (method === 'PUT' && match[2]) {
        if (rejectWith401) {
          uploadsAfter401 += 1;
          return reply({ error: 'unauthorized' }, 401);
        }
        if (failNextUpload) {
          failNextUpload = false;
          failedUploads += 1;
          return reply({ error: 'temporarily_unavailable' }, 503);
        }
        if (putDelayMs > 0) await new Promise(resolve => setTimeout(resolve, putDelayMs));
        const { baseRevision, snapshot } = request.postDataJSON();
        if (baseRevision !== row.tournament.revision) {
          conflictResponses += 1;
          return reply({ error: 'cloud_revision_conflict' }, 409);
        }
        row.snapshot = snapshot;
        row.tournament = { ...row.tournament, revision: baseRevision + 1, updatedAt: new Date().toISOString() };
        return reply({ ok: true, tournament: row.tournament, revision: row.tournament.revision });
      }
    }
    return reply({ ok: true, settings: null });
  });
}

const chessResultsTnr = '987654321';
const chessResultsCalls = [];
const chessResultsProof = 'fixture-owner-proof';
async function installChessResultsFixture(context) {
  await context.route('https://chess-publisher-chess-results.kyamranbilyal.workers.dev/api/chess-results/**', async route => {
    const request = route.request();
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type',
    };
    const reply = (json, status = 200) => route.fulfill({ status, headers, json });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const operation = new URL(request.url()).pathname.split('/').at(-1);
    const body = request.postDataJSON();
    chessResultsCalls.push({ operation, body, auth: (await request.allHeaders()).authorization });
    if (operation === 'test') return reply({ ok: true, sidVerified: true });
    if (operation === 'create') return reply({ ok: true, key: chessResultsTnr, ownershipProof: chessResultsProof });
    if (operation === 'publish') {
      if (chessResultsCalls.filter(call => call.operation === 'publish').length === 1) {
        return reply({ ok: false, code: 'UPLOAD_FAILED', message: 'Fixture upload interrupted.' }, 502);
      }
      return reply({ ok: true, key: chessResultsTnr, uploaded: true });
    }
    if (operation === 'admin-link') {
      const sid = 'A'.repeat(32);
      const creator = 'B'.repeat(32);
      const url = body.section === 'upload'
        ? 'https://chess-results.com/UploadData.aspx?tnr=' + chessResultsTnr + '&sid=' + sid + '&sid1=' + creator + '&source=21&lan=0&time=22112026213520'
        : 'https://chess-results.com/Stammdaten.aspx?key1=' + chessResultsTnr + '&tnr_sec=' + sid + '&luser_sec=' + creator;
      return reply({ ok: true, key: chessResultsTnr, url });
    }
    return reply({ ok: false, code: 'Unexpected fixture operation' }, 404);
  });
  await context.route('https://chess-results.com/**', route => route.fulfill({
    contentType: 'text/html', body: '<title>Chess-Results authenticated page fixture</title>',
  }));
}

async function verifyChessResults(page) {
  await installChessResultsFixture(page.context());
  await page.locator('#tabMain').click();
  await page.locator('#tournamentType').selectOption('test');
  await page.locator('#tabChessResults').click();
  await page.evaluate(() => { void testChessResultsConnection(); });
  await page.locator('#appMessageText').filter({ hasText: 'connection test passed' }).waitFor();
  await page.locator('#appMessageOk').click();
  await page.locator('#crXmlPublishButton').click();
  await page.waitForFunction(() => chessResultsState().lastError.includes('Fixture upload interrupted'));
  assert.equal(await page.evaluate(() => chessResultsState().key), chessResultsTnr);
  await page.locator('#crXmlPublishButton').click();
  await page.waitForFunction(() => chessResultsState().publishCount === 1);

  for (const [button, path] of [
    ['#crXmlOpenAdminButton', '/Stammdaten.aspx'],
    ['#crXmlOpenUploadButton', '/UploadData.aspx'],
  ]) {
    const [tab] = await Promise.all([page.waitForEvent('popup'), page.locator(button).click()]);
    await tab.waitForURL(url => url.pathname === path);
    assert.equal(await tab.evaluate(() => window.opener), null);
    await tab.close();
  }

  assert.deepEqual(chessResultsCalls.map(call => call.operation), ['test', 'create', 'publish', 'publish', 'admin-link', 'admin-link']);
  assert.ok(chessResultsCalls.every(call => call.auth === 'Bearer ' + token));
  const creation = chessResultsCalls[1].body;
  assert.equal(creation.federation, 'XXX');
  assert.equal(creation.mode, 'test');
  assert.ok(creation.clientId);
  for (const call of chessResultsCalls.slice(2)) {
    assert.equal(call.body.key, chessResultsTnr);
    assert.equal(call.body.ownershipProof, chessResultsProof);
  }
  assert.match(chessResultsCalls[3].body.xml, /<chessresults>[\s\S]*<players>[\s\S]*<playerpairings>/);
  assert.equal(chessResultsCalls.at(-1).body.section, 'upload');
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes('UploadData.aspx?tnr=')), false);
  console.log('Chess-Results Desktop workflow in Chrome passed, including failed upload retry, Admin and Upload Data.');
}

function savedResult() {
  const snapshot = [...rows.values()][0]?.snapshot;
  const tournament = snapshot?.data?.tournaments?.['Browser workflow test'];
  return tournament?.pairings?.liveBoards?.['1']?.[0]?.result;
}

async function waitForCloudSave() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (savedResult() === '1 - 0') return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Cloud autosave did not upload the result (records: ${rows.size}, interrupted uploads: ${failedUploads}).`);
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await installCloudFixture(page);
  await page.goto(new URL('workspace.html', url).href);
  await page.getByRole('heading', { name: 'ChessPublisher Web' }).waitFor();
  assert.deepEqual(
    await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('cp-desktop-web:signed-out:'))),
    []
  );
  const input = page.getByLabel('Organizer Token');
  await input.fill('ci-invalid-public-pairing-token');
  await page.getByRole('button', { name: 'Отвори приложението' }).click();
  await page.getByText('Organizer Token е невалиден или достъпът е отнет.').waitFor();
  await input.fill(token);
  await page.getByRole('button', { name: 'Отвори приложението' }).click();
  const tournamentName = page.getByRole('textbox', { name: 'Tournament name', exact: true });
  await tournamentName.waitFor();
  assert.equal(await tournamentName.getAttribute('placeholder'), 'eg. My tournament');
  assert.equal(await tournamentName.inputValue(), '');
  const swiss = page.getByRole('radio', { name: 'Swiss Dutch' });
  assert.equal(await swiss.isChecked(), true);
  await tournamentName.press('Tab');
  assert.equal(await swiss.evaluate(input => input === document.activeElement), true);
  assert.equal(await swiss.evaluate(input => getComputedStyle(input).boxShadow), 'none', 'The focused radio has no extra ring');
  assert.equal(await swiss.evaluate(input => getComputedStyle(input.parentElement).outlineStyle), 'solid', 'Keyboard focus is visible on the format row');
  await swiss.press('ArrowDown');
  const bakuRadio = page.getByRole('radio', { name: 'Accelerated Baku' });
  assert.equal(await bakuRadio.isChecked(), true);
  await bakuRadio.press('ArrowUp');
  assert.equal(await swiss.isChecked(), true);
  console.log('Pairing-system radios use a single native indicator and show keyboard focus on the format row.');
  await tournamentName.fill('Browser workflow test');
  await tournamentName.press('Enter');
  await page.locator('#main').waitFor();
  assert.equal(await page.locator('#mainTournamentSelect').inputValue(), 'Browser workflow test');
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await page.locator('#fileMenu button[onclick="fileNewTournament()"]').click();
  const tournamentDialog = page.getByRole('dialog', { name: 'Tournaments' });
  await tournamentDialog.waitFor();
  assert.equal(await tournamentName.getAttribute('placeholder'), 'eg. My tournament');
  assert.equal(await tournamentName.inputValue(), '');
  await tournamentDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await tournamentDialog.waitFor({ state: 'hidden' });
  console.log('Tournament created in the desktop workspace.');

  const timeControl = page.locator('#timeControl');
  assert.equal(await timeControl.locator('option[value="60+30"]').textContent(), '60+30 (Fast Classical)');
  assert.equal(await timeControl.locator('option[value="45+30"]').textContent(), '45+30 (Fast Classical)');
  await timeControl.selectOption('60+30');
  assert.equal(await page.locator('#tournamentRatingType').inputValue(), 'Standard');
  await page.evaluate(() => {
    const tournament = getCurrentTournament();
    Object.assign(tournament.settings, {
      fideRated: 'Yes', startDate: '2026-11-19T08:00', endDate: '2026-11-19T22:00',
      rounds: '3', lastSwissRounds: '3'
    });
    tournament.schedule.rows = ['09:00', '13:00', '17:00'].map((time, index) => ({
      event: 'Round ' + (index + 1), dateTime: '2026-11-19T' + time
    }));
    refreshEverything();
  });
  const fideDetails = page.locator('#cpFideEligibility');
  const fideSummary = page.locator('#cpFideEligibility summary');
  const mainScroll = await page.evaluate(() => {
    const content = document.querySelector('.content');
    const main = document.getElementById('main');
    const cStyle = getComputedStyle(content);
    const prevTop = main.scrollTop;
    main.scrollTop = main.scrollHeight;
    const scrolled = main.scrollTop;
    const notes = document.getElementById('generalNotes')?.closest('.groupbox');
    const notesVisible = notes ? notes.getBoundingClientRect().bottom <= content.getBoundingClientRect().bottom + 4 : false;
    main.scrollTop = prevTop;
    return {
      contentTrapped: content.scrollHeight > content.clientHeight + 4 && cStyle.overflowY === 'hidden',
      mainScrollable: main.scrollHeight > main.clientHeight && scrolled > 0,
      notesVisible
    };
  });
  assert.equal(mainScroll.contentTrapped, false, JSON.stringify(mainScroll));
  assert.equal(mainScroll.mainScrollable, true, JSON.stringify(mainScroll));
  assert.equal(mainScroll.notesVisible, true, JSON.stringify(mainScroll));

  await fideSummary.click();
  const eligibilityResult = page.locator('#cpEligibilityResult');
  await eligibilityResult.filter({ hasText: 'Select the event purpose.' }).waitFor();
  await page.locator('#cpEligibilityPurpose').selectOption('norm');
  await page.locator('#cpFastStandard button[type="submit"]').click();
  await eligibilityResult.filter({ hasText: 'Standard rating: Ineligible' }).waitFor();
  assert.equal(await page.evaluate(() => cpSmartScheduleProfile().maxRoundsPerDay), 2);
  assert.ok(await page.evaluate(() => window.__cpTrfCompliance.validate(26, 1, {syncUi: false})
    .warnings.some(warning => warning.includes('FIDE Fast Classical 60+30') && warning.includes('Ineligible'))));
  await page.locator('#cpEligibilityPurpose').selectOption('rating');
  await page.locator('#cpFastStandard button[type="submit"]').click();
  await eligibilityResult.filter({ hasText: 'Standard rating: Eligible' }).waitFor();
  assert.ok(await page.evaluate(() => cpSmartScheduleProfile().maxRoundsPerDay > 2));
  assert.equal(await page.evaluate(() => window.__cpTrfCompliance.validate(26, 1, {syncUi: false})
    .warnings.some(warning => /FIDE Fast Classical|FIDE Rating Regulations 1.1/.test(warning))), false);
  await fideSummary.click();
  assert.equal(await fideDetails.evaluate(el => el.open), false);
  await fideSummary.focus();
  await fideSummary.press('Enter');
  assert.equal(await fideDetails.evaluate(el => el.open), true, 'Enter must open #cpFideEligibility');
  await fideSummary.press('Space');
  assert.equal(await fideDetails.evaluate(el => el.open), false, 'Space must close #cpFideEligibility');
  console.log('Fast Classical review, Smart Schedule and rating export preflight passed.');

  await page.locator('#tabRegistration').click();
  // The approved compact design starts with manual entry closed; expand it
  // through its real UI control before exercising the existing player workflow.
  const manualDisclosure = page.locator('.cp-reg-manual-collapse-btn');
  await manualDisclosure.waitFor();
  assert.equal(await manualDisclosure.getAttribute('aria-expanded'), 'false');
  // Temporary fixture-only DOM geometry to investigate preview fidelity.
  // No user data, token, or tournament snapshot is logged.
  if (process.env.CP_REG_UI_SCREENSHOT) {
    const layout = await page.evaluate(() => {
      const inspect = selector => Array.from(document.querySelectorAll(selector)).slice(0, 5).map(el => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, id: el.id, className: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
          text: (el.innerText || '').slice(0, 110), display: cs.display, visibility: cs.visibility,
          width: Math.round(r.width), height: Math.round(r.height),
          parent: el.parentElement?.id || el.parentElement?.className?.slice?.(0, 60) || '' };
      });
      return {
        groups: Array.from(document.querySelectorAll('#registration > *')).map(el =>
          ({ id: el.id, cls: typeof el.className === 'string' ? el.className.slice(0, 100) : '', text: (el.innerText || '').slice(0, 85) })),
        selectors: Object.fromEntries([
          '#cpPlayersRatingDataBox', '#cpPlayersRatingDataBox > *', '.cp-reg-command-strip',
          '.cp-reg-strip-left', '.cp-reg-strip-right', '.cp-reg-fide-mini',
          '#btnAutoUpdateFide', '#btnToggleRatingTools', '#btnUpdateRegisteredFromFide',
          '#cpRatingListLibraryStatus', '.player-import-toolbar',
          '#registration #fideResultsBox', '#registration #startingRankBox',
          '#registration .rating-control-bar', '#registration .publish-strip-pro',
          '#registration .cp-reg-subbar', '#registration .fide-results-title'
        ].map(k => [k, inspect(k)])),
      };
    });
    console.log('REGISTRATION_LAYOUT_INSPECTION=' + JSON.stringify(layout));
  }
  // Optional non-production visual evidence, at the approved preview viewport.
  // The browser returns to its previous viewport before functional checks.
  if (process.env.CP_REG_UI_SCREENSHOT) {
    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 1696, height: 896 });
    await page.screenshot({ path: process.env.CP_REG_UI_SCREENSHOT });
    if (originalViewport) await page.setViewportSize(originalViewport);
  }
  await manualDisclosure.click();
  assert.equal(await manualDisclosure.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#manualName').isVisible(), true);
  for (const name of ['Alpha One', 'Beta Two', 'Gamma Three', 'Delta Four']) {
    await page.locator('#manualName').fill(name);
    await page.locator('#manualAddPlayerBtn').click();
    await page.waitForFunction(expected => getCurrentTournament().players.some(player => player.name === expected), name);
    await page.evaluate(() => cpFlushPersistence());
  }
  // Second screenshot uses real registered test players instead of mock preview
  // data. Restore viewport and use the disclosure control like an organizer.
  if (process.env.CP_REG_UI_SCREENSHOT) {
    const disclosure = page.locator('.cp-reg-manual-collapse-btn');
    if (await disclosure.getAttribute('aria-expanded') === 'true') await disclosure.click();
    const previousViewport = page.viewportSize();
    await page.setViewportSize({ width: 1696, height: 896 });
    await page.screenshot({
      path: process.env.CP_REG_UI_SCREENSHOT.replace(/\.png$/, '-with-players.png')
    });
    if (previousViewport) await page.setViewportSize(previousViewport);
  }

  await page.evaluate(() => {
    const tournament = getCurrentTournament();
    Object.assign(tournament.settings, {
      fideRated: 'No', startDate: '2026-11-19T10:00', endDate: '2026-11-19T16:00',
      timeControl: '15+5', timeControlPreset: '15+5', rounds: '3', lastSwissRounds: '3'
    });
    tournament.regulations.rating = 'Unrated';
    refreshEverything();
    saveAll();
  });
  await page.locator('#tabPairings').click();
  const resortButton = page.locator('#pairingsResortStartingListBtn');
  const generateButton = page.locator('#btnGenerateGacrux');
  const publishButton = page.locator('#pairingsChessResultsPublishBtn');
  const actionBoxes = await Promise.all([resortButton, generateButton, publishButton].map(button => button.boundingBox()));
  assert.ok(actionBoxes.every(Boolean), 'The three pairing actions must be visible');
  assert.ok(actionBoxes.every(box => Math.abs(box.y + box.height / 2 - (actionBoxes[1].y + actionBoxes[1].height / 2)) <= 2),
    'Resort Starting List, Generate Pairings and Publish must share a row at desktop width');

  const roundLog = page.locator('#roundControlLog');
  await page.getByRole('region', { name: 'Round Control Log', exact: true }).waitFor();
  const logStyles = await roundLog.evaluate(log => {
    const style = node => {
      const css = getComputedStyle(node);
      return [css.backgroundColor, css.color, css.fontFamily, css.fontSize, css.lineHeight, css.borderRadius, css.overflowY];
    };
    return [style(log), style(document.querySelector('#crLiveLog'))];
  });
  assert.deepEqual(logStyles[0], logStyles[1], 'Round and Publish logs must share the console styling');
  await roundLog.locator('.cp-log-warn').filter({ hasText: /Resort Starting List required/ }).waitFor();
  await resortButton.click();
  const resortMessage = page.locator('#appMessageText');
  assert.match(await resortMessage.textContent(), /resorted successfully/);
  await page.locator('#appMessageOk').click();
  await roundLog.locator('.cp-log-ok').filter({ hasText: /ready for Round 1/ }).waitFor();
  assert.match(await roundLog.innerText(), /Not paired \/ BYE/);
  const preflight = await page.evaluate(() => ({
    validation: validateOfficialPairingSetup(1, 'dutch'),
    pairing: getPairingGenerationState(),
    rated: hasRatedCalculation()
  }));
  assert.equal(preflight.validation.ok && preflight.pairing.canGenerate && !preflight.rated, true, JSON.stringify(preflight));
  console.log('Four players registered and resorted; testing the desktop pairing action.');
  try {
    await generateButton.click();
    const chooseWhite = page.locator('#firstRoundColorModal button').filter({ hasText: 'White' });
    await chooseWhite.waitFor({ timeout: 10000 });
    assert.equal(await resortButton.isDisabled(), true, 'Resort stays locked during generation');
    await chooseWhite.click();
    await page.waitForFunction(() => getCurrentTournament().pairings.liveBoards['1']?.length === 2, undefined, { timeout: 35000 });
    await page.locator('#appMessageOk').click({ timeout: 10000 });
    await page.waitForFunction(() => !document.getElementById('pairingsResortStartingListBtn').disabled);
    await roundLog.locator('.cp-log-warn').filter({ hasText: /Results Round 1: 2 missing/ }).waitFor();
    console.log('Round Control Log styling, readiness and the relocated resort action passed.');
  } catch (error) {
    throw new Error(`Round failed: ${await page.locator('#appMessageText').textContent()} · ${await page.locator('#status').textContent()} · ${errors.join('; ')}`, { cause: error });
  }
  const checks = await page.evaluate(async () => {
    const line = (n, opponent, color, score, outcome, name = 'Player ' + n) => {
      const row = ('001 '+String(n).padStart(4)+'      '+name).padEnd(80)
        + String(score).padStart(4)+' '+String(n).padStart(4)+'  ';
      return row + String(opponent).padStart(4)+' '+color+' '+outcome+'  ';
    };
    const trf = ['012 Checker test','142 3',line(1,2,'w','1.0','1'),line(2,1,'b','0.0','0')].join('\r\n');
    const cyrillicTrf = ['012 Проба кирилица','142 3',line(1,2,'w','1.0','1','Иван Ѝ-Петров'),line(2,1,'b','0.0','0','Борис А-Я')].join('\r\n');
    const expected = [{startNo:1,rank:1,values:{PTS:1}}, {startNo:2,rank:2,values:{PTS:0}}];
    const check = async (input = trf, tieBreaks = ['PTS']) => (await window.cpDesktopWebEngine('/tiebreak-checker/check',{
      body:JSON.stringify({round:1,mode:'swiss',tieBreaks,trf:input,expected})
    })).json();
    const pass = await check();
    const cyrillicPass = await check(cyrillicTrf, ['PTS']);
    const emptyTieBreaks = await check(trf, []);
    expected[0].values.PTS = 0;
    return [pass, await check(), cyrillicPass, emptyTieBreaks];
  });
  assert.equal(checks[0].state,'pass',JSON.stringify(checks[0]));
  assert.equal(checks[1].state,'fail',JSON.stringify(checks[1]));
  assert.equal(checks[2].state,'pass',JSON.stringify(checks[2]));
  assert.equal(checks[3].state,'pass',JSON.stringify(checks[3]));

  // Verify Quick Result Entry UI buttons are enabled & clickable, Chess-Results options unclipped, and 5-width x 8-tab responsive matrix
  await page.locator('#pairings aside.result-palette .result-main-action:not([disabled])').first().waitFor({ timeout: 10000 });
  await page.locator('#livePairingsBody tr[data-board-index]').first().click();
  await page.locator('#pairings aside.result-palette .result-main-action').nth(2).click();
  assert.equal(await page.evaluate(() => getCurrentTournament().pairings.liveBoards['1'][0].result), '0 - 1');
  await page.locator('#tabChessResults').click();
  await page.locator('#chessresults .crpub-options summary').click();
  const crDeleteOther = page.locator('#crXmlDeleteOtherButton');
  await crDeleteOther.waitFor({ state: 'visible' });
  const crBox = await crDeleteOther.boundingBox();
  assert.ok(crBox && crBox.width > 20 && crBox.height > 15);
  await page.locator('#chessresults .crpub-options summary').click();

  const viewports = [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
    { width: 1440, height: 920 }
  ];
  const allTabs = [
    ['tabMain', 'main'],
    ['tabRegistration', 'registration'],
    ['tabPairings', 'pairings'],
    ['tabStandings', 'standings'],
    ['tabSchedule', 'schedule'],
    ['tabChessResults', 'chessresults'],
    ['tabExport', 'exportPage'],
    ['tabHub', 'hub']
  ];
  for (const vp of viewports) {
    await page.setViewportSize(vp);
    const menuOverlap = await page.locator('#classicMenuBar').evaluate(menu => {
      const tabsTop = document.querySelector('.tabs').getBoundingClientRect().top;
      return [menu, ...menu.children].filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > tabsTop + 1;
      }).map(element => element.id || element.textContent.trim());
    });
    assert.deepEqual(menuOverlap, [], `${vp.width}px classic menu overlaps workspace tabs`);
    await page.locator('#cpDesktopWebSignOut').click({ trial: true });
    for (const [tabId, pageId] of allTabs) {
      await page.locator(`#${tabId}`).click();
      await page.locator(`#${pageId}.active`).waitFor();
      await page.waitForTimeout(50);
      const audit = await page.evaluate((pid) => {
        const docOverflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const appWin = document.getElementById('appWindow');
        const appOverflowX = appWin.scrollWidth - appWin.clientWidth;
        const appOverflowKids = appOverflowX > 2
          ? Array.from(appWin.children).map(c => `${c.id || c.className}:${c.scrollWidth}/${c.clientWidth}`)
          : [];
        const pg = document.getElementById(pid);
        const pageOverflowX = pg.scrollWidth - pg.clientWidth;
        const content = document.querySelector('.content');
        const ccs = getComputedStyle(content);
        const trappedVertical = content.scrollHeight > content.clientHeight + 4 && ccs.overflowY === 'hidden';
        let overlapsEngineBar = false;
        if (pid === 'pairings') {
          const pal = pg.querySelector('aside.result-palette');
          const eng = pg.querySelector('.cp-ws-engine-bar');
          if (pal && eng) overlapsEngineBar = pal.getBoundingClientRect().bottom > eng.getBoundingClientRect().top + 1;
        }
        const blocked = [];
        for (const el of pg.querySelectorAll('button, summary')) {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || el.disabled) continue;
          const closedDet = el.closest('details:not([open])');
          if (closedDet && el.tagName !== 'SUMMARY') continue;
          if (el.closest('[style*="display: none"], .hidden, .cp-reg-hidden-shell, .cp-ws-collapsed .cp-ws-collapsible-body, .cp-reg-drawer-collapsed .cp-reg-drawer-body, .cp-reg-manual-collapsed > .toolbar, .cp-ws-nr-collapsed .cp-ws-nr-body')) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) continue;
          if (r.right > window.innerWidth + 2 && !el.closest('.table-frame, .live-pairing-table-wrap, #nextRoundTableContainer')) {
            blocked.push({ reason: 'clipped-right', id: el.id, text: el.textContent.trim().slice(0, 25), right: Math.round(r.right) });
            continue;
          }
          const contentRect = content.getBoundingClientRect();
          const scrollWrap = el.closest('.table-frame, .live-pairing-table-wrap, #nextRoundTableContainer');
          const box = scrollWrap ? scrollWrap.getBoundingClientRect() : contentRect;
          const topBound = Math.max(contentRect.top, box.top);
          const bottomBound = Math.min(contentRect.bottom, box.bottom);
          const leftBound = Math.max(0, box.left);
          const rightBound = Math.min(window.innerWidth, box.right);
          if (r.top >= topBound && r.bottom <= bottomBound && r.left >= leftBound && r.right <= rightBound) {
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (hit && hit !== el && !el.contains(hit)) {
              blocked.push({ reason: 'hit-blocked', id: el.id, text: el.textContent.trim().slice(0, 25), hitBy: hit.tagName + '#' + hit.id });
            }
          }
        }
        return { docOverflowX, appOverflowX, appOverflowKids, pageOverflowX, trappedVertical, overlapsEngineBar, blocked };
      }, pageId);
      assert.ok(audit.docOverflowX <= 2, `${vp.width}px ${pageId} docOverflowX=${audit.docOverflowX}`);
      assert.ok(audit.appOverflowX <= 2, `${vp.width}px ${pageId} appOverflowX=${audit.appOverflowX} (${audit.appOverflowKids.join(', ')})`);
      assert.ok(audit.pageOverflowX <= 4, `${vp.width}px ${pageId} pageOverflowX=${audit.pageOverflowX}`);
      assert.equal(audit.trappedVertical, false, `${vp.width}px ${pageId} trappedVertical`);
      assert.equal(audit.overlapsEngineBar, false, `${vp.width}px ${pageId} overlapsEngineBar`);
      assert.deepEqual(audit.blocked, [], `${vp.width}px ${pageId} blocked controls: ${JSON.stringify(audit.blocked)}`);
    }
  }
  console.log('All eight workspace tabs and Sign out passed pointer checks at all five viewports.');
  await page.setViewportSize({ width: 1440, height: 920 });
  await page.locator('#tabPairings').click();
  await page.locator('#cpWebCloudSaveStatus').filter({ hasText: 'Saved to private Cloud' }).waitFor({ timeout: 10000 });

  failNextUpload = true;
  await page.evaluate(() => {
    const board = getCurrentTournament().pairings.liveBoards['1'][0];
    board.result = '1 - 0';
    saveData();
  });
  await waitForCloudSave();
  assert.equal(failedUploads, 1);
  assert.equal(rows.size, 1);
  await page.locator('#cpWebCloudSaveStatus').filter({ hasText: 'Saved to private Cloud' }).waitFor({ timeout: 10000 });

  await page.locator('#tabHub').click();
  await page.locator('#cloudSyncCurrentBtn:not([disabled])').waitFor({ timeout: 10000 });
  await page.locator('#cloudListFriendlyStatus').filter({ hasText: 'Current tournament is synchronized.' }).waitFor({ timeout: 10000 });
  putDelayMs = 600;
  await page.evaluate(() => {
    const board = getCurrentTournament().pairings.liveBoards['1'][0];
    board.result = '½ - ½';
    saveData();
  });
  await page.locator('#cpWebCloudSaveStatus').filter({ hasText: 'Saving to private Cloud…' }).waitFor({ timeout: 10000 });
  await page.locator('#cloudSyncCurrentBtn').click();
  await page.locator('#cpWebCloudSaveStatus').filter({ hasText: 'Saved to private Cloud' }).waitFor({ timeout: 10000 });
  await page.locator('#cloudListFriendlyStatus').filter({ hasText: 'Current tournament is synchronized.' }).waitFor({ timeout: 10000 });
  putDelayMs = 0;
  assert.equal(conflictResponses, 0);

  await page.evaluate(() => {
    const board = getCurrentTournament().pairings.liveBoards['1'][0];
    board.result = '1 - 0';
    saveData();
  });
  await waitForCloudSave();
  await page.locator('#cpWebCloudSaveStatus').filter({ hasText: 'Saved to private Cloud' }).waitFor({ timeout: 10000 });

  await page.evaluate(() => cpNativeHubSecretSet('manage-hub_test123', 'secret-manage-xyz'));
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes('secret-manage-xyz')), false);
  assert.equal(await page.locator('#autosaveToggle').count(), 0);
  assert.equal(await page.locator('#tabDgt, #dgt').count(), 0);
  await page.evaluate(() => cpPersistActiveTabUiPreference('dgt'));
  await page.reload();
  await page.waitForFunction(() => getCurrentTournament()?.pairings?.liveBoards?.['1']?.[0]?.result === '1 - 0');
  assert.equal(await page.evaluate(() => cpNativeHubSecretGet('manage-hub_test123')), 'secret-manage-xyz');
  await page.locator('#main.active').waitFor();
  assert.equal(await page.locator('#tabDgt, #dgt').count(), 0);
  for (const tab of ['tabMain', 'tabRegistration', 'tabPairings', 'tabStandings', 'tabSchedule', 'tabExport']) {
    await page.locator(`#${tab}`).waitFor();
  }
  await verifyChessResults(page);

  await page.locator('#cpDesktopWebSignOut').click();
  await page.getByRole('heading', { name: 'ChessPublisher Web' }).waitFor();
  assert.deepEqual(
    await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('cp.desktop-web.'))),
    []
  );
  assert.equal(await page.evaluate(secret => JSON.stringify(localStorage).includes(secret), token), false);
  assert.deepEqual(errors, []);

  const fresh = await browser.newPage();
  const freshErrors = [];
  fresh.on('pageerror', error => freshErrors.push(error.message));
  await installCloudFixture(fresh);
  await fresh.goto(url);
  await fresh.getByLabel('Organizer Token').fill(token);
  await fresh.getByRole('button', { name: 'Отвори приложението' }).click();
  const draftName = fresh.getByRole('textbox', { name: 'Tournament name', exact: true });
  await draftName.fill('Unfinished draft');
  const baku = fresh.getByRole('radio', { name: 'Accelerated Baku' });
  await baku.check();
  assert.equal(await baku.evaluate(input => getComputedStyle(input).boxShadow), 'none');
  assert.equal(await baku.evaluate(input => getComputedStyle(input.parentElement).outlineStyle), 'none');
  const localOpen = fresh.getByRole('button', { name: 'Open local file…' });
  const [fileChooser] = await Promise.all([fresh.waitForEvent('filechooser'), localOpen.click()]);
  assert.equal(await fileChooser.element().getAttribute('accept'), '.json,application/json');
  await fresh.evaluate(() => window.dispatchEvent(new Event('focus')));
  await fresh.locator('#cpNewOnlineChoice').click();
  await fresh.locator('#cpNewTournamentOnlinePanel').waitFor();
  await fresh.getByRole('button', { name: 'Create new', exact: true }).click();
  assert.equal(await draftName.inputValue(), 'Unfinished draft');
  assert.equal(await baku.isChecked(), true);
  await fresh.locator('#cpNewOnlineChoice').click();
  const cloudRow = fresh.locator('#cpNewOnlineTournamentBody tr').filter({ hasText: 'Browser workflow test' });
  await cloudRow.getByRole('button', { name: 'Open', exact: true }).click();
  await fresh.waitForFunction(() => getCurrentTournament()?.pairings?.liveBoards?.['1']?.[0]?.result === '1 - 0');

  await fresh.locator('#mainTournamentName').fill('Browser workflow renamed');
  await fresh.evaluate(() => renameCurrentTournament());
  await fresh.waitForFunction(() =>
    getCurrentTournament()?.name === 'Browser workflow renamed' &&
    data?.currentTournament === 'Browser workflow renamed'
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    if ([...rows.values()][0]?.snapshot?.data?.currentTournament === 'Browser workflow renamed') break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal([...rows.values()][0]?.snapshot?.data?.currentTournament, 'Browser workflow renamed');
  await fresh.locator('#cpWebCloudSaveStatus').filter({ hasText: 'Saved to private Cloud' }).waitFor({ timeout: 10000 });
  await fresh.reload();
  await fresh.waitForFunction(() =>
    getCurrentTournament()?.name === 'Browser workflow renamed' &&
    data?.currentTournament === 'Browser workflow renamed'
  );
  console.log('Tournament rename persistence and Cloud autosave passed.');

  await fresh.evaluate(() => newTournamentPrompt());
  await fresh.locator('#cpNewBakuChoice').check();
  await fresh.locator('#firstTournamentName').fill('Baku test');
  await fresh.locator('#cpNewTournamentCreateBtn').click();
  await fresh.locator('#main').waitFor();
  assert.equal(await fresh.locator('#mainTournamentSelect').inputValue(), 'Baku test');
  await fresh.locator('#tabRegistration').click();
  // A newly opened tournament also starts in the approved compact mode.
  const bakuManualDisclosure = fresh.locator('.cp-reg-manual-collapse-btn');
  await bakuManualDisclosure.waitFor();
  if (await bakuManualDisclosure.getAttribute('aria-expanded') === 'false') {
    await bakuManualDisclosure.click();
  }
  await fresh.locator('#manualName').waitFor({ state: 'visible' });
  for (const name of ['Baku One', 'Baku Two', 'Baku Three', 'Baku Four', 'Baku Five', 'Baku Six']) {
    await fresh.locator('#manualName').fill(name);
    await fresh.locator('#manualAddPlayerBtn').click();
    await fresh.waitForFunction(expected => getCurrentTournament().players.some(player => player.name === expected), name);
    await fresh.evaluate(() => cpFlushPersistence());
  }
  await fresh.evaluate(async () => {
    const tournament = getCurrentTournament();
    Object.assign(tournament.settings, {
      fideRated: 'No', startDate: '2026-11-19T10:00', endDate: '2026-11-19T16:00',
      timeControl: '15+5', timeControlPreset: '15+5', rounds: '5', lastSwissRounds: '5'
    });
    tournament.regulations.rating = 'Unrated';
    refreshEverything();
    saveAll();
    await resortStartingList();
  });
  await fresh.locator('#appMessageOk').click();
  const bakuTrf = await fresh.evaluate(() => buildPairingEngineTRF('w'));
  assert.match(bakuTrf, /^192\s+\S*_BAKU/m);
  assert.match(bakuTrf, /^250\s+/m);
  await fresh.locator('#tabPairings').click();
  await fresh.locator('#btnGenerateGacrux').click();
  await fresh.locator('#firstRoundColorModal button').filter({ hasText: 'White' }).click({ timeout: 10000 });
  await fresh.waitForFunction(() => getCurrentTournament().pairings.liveBoards['1']?.length === 3, undefined, { timeout: 35000 });
  await fresh.locator('#appMessageOk').click({ timeout: 10000 });
  console.log('Accelerated Baku pairing in browser workspace passed.');

  await fresh.locator('#cpWebCloudSaveStatus').filter({ hasText: 'Saved to private Cloud' }).waitFor({ timeout: 10000 });
  rejectWith401 = true;
  await fresh.evaluate(() => {
    const board = getCurrentTournament().pairings.liveBoards['1'][0];
    board.result = '1 - 0';
    saveData();
  });
  await fresh.locator('#cpWebCloudSaveStatus').filter({ hasText: 'Session expired · Sign in again' }).waitFor({ timeout: 15000 });
  const uploadsBeforeWait = uploadsAfter401;
  await new Promise(resolve => setTimeout(resolve, 1000));
  assert.equal(uploadsAfter401, uploadsBeforeWait);
  assert.deepEqual(freshErrors, []);
  console.log('Automatic private Cloud save, retry after 503, 401 stop, and restore in a fresh browser passed.');

  // Touch-context verification for #cpFideEligibility summary
  const touchCtx = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const touchPage = await touchCtx.newPage();
  await installCloudFixture(touchPage);
  await touchPage.goto(new URL('workspace.html', url).href);
  await touchPage.getByLabel('Organizer Token').fill(token);
  await touchPage.getByRole('button', { name: 'Отвори приложението' }).click();
  const touchName = touchPage.getByRole('textbox', { name: 'Tournament name', exact: true });
  await touchName.waitFor();
  await touchName.fill('Touch Check');
  await touchName.press('Enter');
  await touchPage.locator('#main.active').waitFor();
  const touchSummary = touchPage.locator('#cpFideEligibility summary');
  await touchSummary.tap();
  assert.equal(await touchPage.locator('#cpFideEligibility').evaluate(el => el.open), true, 'Touch tap must open #cpFideEligibility');
  await touchSummary.tap();
  assert.equal(await touchPage.locator('#cpFideEligibility').evaluate(el => el.open), false, 'Touch tap must close #cpFideEligibility');
  await touchCtx.close();
  console.log('Touch FIDE Eligibility toggle passed.');
} finally {
  await browser.close();
}
