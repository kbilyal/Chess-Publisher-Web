import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
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

  // Verify the *actual website copy* of the CSS, not the standalone source
  // repository's generated HTML. Read-only layout checks, no DOM rewrites.
  const themeState = await page.evaluate(() => {
    const rect = selector => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { left: Math.round(r.left), top: Math.round(r.top),
        width: Math.round(r.width), height: Math.round(r.height) };
    };
    const main = document.querySelector('#main.page.active');
    return {
      stylesheet: [...document.querySelectorAll('link[rel="stylesheet"]')]
        .some(node => (node.getAttribute('href') || '').endsWith('workspace-tabs.css')),
      display: main ? getComputedStyle(main).display : '',
      primary: main ? getComputedStyle(main).getPropertyValue('--cpw-primary').trim() : '',
      general: rect('#main > .tournament-general-box'),
      essentials: rect('#main > .pairing-essentials-box'),
      rules: rect('#main > .setup-rules-box'),
      tournamentSelectCount: document.querySelectorAll('#mainTournamentSelect').length
    };
  });
  assert.equal(themeState.stylesheet, true);
  assert.equal(themeState.display, 'grid');
  assert.equal(themeState.primary, '#0f3d91');
  assert.ok(themeState.general && themeState.essentials && themeState.rules, JSON.stringify(themeState));
  assert.ok(themeState.general.width > themeState.essentials.width * 1.7, JSON.stringify(themeState));
  assert.ok(themeState.essentials.left < themeState.rules.left, JSON.stringify(themeState));
  assert.ok(Math.abs(themeState.essentials.top - themeState.rules.top) <= 2, JSON.stringify(themeState));
  assert.equal(themeState.tournamentSelectCount, 1);
  console.log('Actual /app/ Setup redesign geometry and original controls verified.');


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
  await page.locator('#cpFideEligibility summary').click();
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
  await page.locator('#cpFideEligibility summary').click();
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

  await page.evaluate(async () => {
    const tournament = getCurrentTournament();
    Object.assign(tournament.settings, {
      fideRated: 'No', startDate: '2026-11-19T10:00', endDate: '2026-11-19T16:00',
      timeControl: '15+5', timeControlPreset: '15+5', rounds: '3', lastSwissRounds: '3'
    });
    tournament.regulations.rating = 'Unrated';
    refreshEverything();
    saveAll();
    await resortStartingList();
  });
  const resortMessage = page.locator('#appMessageText');
  assert.match(await resortMessage.textContent(), /resorted successfully/);
  await page.locator('#appMessageOk').click();
  await page.locator('#tabPairings').click();
  const preflight = await page.evaluate(() => ({
    validation: validateOfficialPairingSetup(1, 'dutch'),
    pairing: getPairingGenerationState(),
    rated: hasRatedCalculation()
  }));
  assert.equal(preflight.validation.ok && preflight.pairing.canGenerate && !preflight.rated, true, JSON.stringify(preflight));
  console.log('Four players registered and resorted; testing the desktop pairing action.');
  try {
    await page.locator('#btnGenerateGacrux').click();
    await page.locator('#firstRoundColorModal button').filter({ hasText: 'White' }).click({ timeout: 10000 });
    await page.waitForFunction(() => getCurrentTournament().pairings.liveBoards['1']?.length === 2, undefined, { timeout: 35000 });
    await page.locator('#appMessageOk').click({ timeout: 10000 });
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


  // Optional synthetic-only visual evidence for PR design review. The exact
  // browser-generated UI is captured; no credentials, real user records or
  // external service data are used by this test fixture.
  const visualDir = process.env.CP_WEBSITE_UI_SCREENSHOTS_DIR;
  if (visualDir) {
    await mkdir(visualDir, { recursive: true });
    for (const [tabId, pageId] of [
      ['tabMain', 'main'],
      ['tabPairings', 'pairings'],
      ['tabStandings', 'standings'],
      ['tabSchedule', 'schedule'],
      ['tabExport', 'exportPage'],
      ['tabChessResults', 'chessresults'],
    ]) {
      await page.locator('#' + tabId).click();
      await page.locator('#' + pageId + '.active').waitFor();
      if (pageId === 'standings') {
        const kpi = await page.evaluate(() => {
          const strip = document.querySelector('#standings > .final-standings-top');
          if (!strip) return null;
          const box = strip.getBoundingClientRect();
          const cards = [...strip.children].map(child => child.getBoundingClientRect());
          return { width:Math.round(box.width), height:Math.round(box.height),
            cards:cards.map(c=>({width:Math.round(c.width),height:Math.round(c.height),
              right:Math.round(c.right)})), right:Math.round(box.right),
            display:getComputedStyle(strip).display };
        });
        assert.ok(kpi && kpi.cards.length >= 4, JSON.stringify(kpi));
        assert.equal(kpi.display, 'flex');
        assert.ok(kpi.cards.every(c => c.right <= kpi.right + 2), JSON.stringify(kpi));
        console.log('CP_STANDINGS_COMPACT_KPIS=' + JSON.stringify(kpi));
        const stateLabel = await page.evaluate(() => {
          const els = [...document.querySelectorAll('#standings *')].filter(el =>
            el.textContent?.includes('Tournament state:') &&
            el.textContent.trim().length < 130 &&
            el.children.length >= 2);
          const node = els.at(-1);
          if (!node) return {found:false};
          const style = getComputedStyle(node);
          return {found:true,tag:node.tagName,className:String(node.className||''),
            id:node.id,display:style.display,gap:style.gap,columnGap:style.columnGap,
            childElements:[...node.children].map(x=>({tag:x.tagName,
              cls:String(x.className||''),text:x.textContent.trim().slice(0,70)})),
            text:node.textContent.trim().slice(0,110)};
        });
        console.log('CP_STANDINGS_STATE_DOM=' + JSON.stringify(stateLabel));
        assert.equal(stateLabel.id, 'standingsStateLine');
        assert.equal(stateLabel.display, 'block',
          'Round-state text must use natural inline flow, including punctuation');

      }
      if (pageId === 'chessresults') {
        const cards = await page.evaluate(() => {
          const rect = selector => {
            const n=document.querySelector(selector);
            if (!n) return null;
            const r=n.getBoundingClientRect();
            return {height:Math.round(r.height),width:Math.round(r.width),
              left:Math.round(r.left),top:Math.round(r.top)};
          };
          return {publication:rect('#chessresults > .crpub-box'),
            log:rect('#chessresults > .crlog-box'),
            pin:rect('#chessresults > .crpin-box')};
        });
        assert.ok(cards.publication && cards.log && cards.pin, JSON.stringify(cards));
        assert.ok(cards.publication.left < cards.log.left, JSON.stringify(cards));
        assert.ok(cards.publication.height < cards.log.height + cards.pin.height + 40,
          'Publication panel should not stretch across both right-hand cards: ' + JSON.stringify(cards));
        console.log('CP_CHESSRESULTS_COMPACT_CARDS=' + JSON.stringify(cards));
      }
      if (pageId === 'schedule') {
        const panels = await page.evaluate(() => {
          const page = document.querySelector('#schedule.page.active');
          const r = page.getBoundingClientRect();
          return { display: getComputedStyle(page).display, width: Math.round(r.width),
            sections: Array.from(page.querySelectorAll(':scope > .groupbox'), item => {
              const b = item.getBoundingClientRect();
              return {width:Math.round(b.width),top:Math.round(b.top)};
            }) };
        });
        assert.equal(panels.display, 'flex');
        assert.equal(panels.sections.length, 3);
        assert.ok(panels.sections.every(p => p.width >= panels.width - 50),
          'Round/Event Schedule must retain full width: ' + JSON.stringify(panels));
        assert.ok(panels.sections.every((p,i) => i === 0 || p.top > panels.sections[i-1].top),
          'Keyboard/visual order must remain natural: ' + JSON.stringify(panels));
        console.log('CP_SCHEDULE_FULL_WIDTH=' + JSON.stringify(panels));
      }
      if (pageId === 'pairings') {
        const columns = await page.evaluate(() => {
          const n = document.querySelector('#pairings > .live-pairing-layout');
          if (!n) return null;
          const panel = n.querySelector('.live-pairing-panel');
          const boardGrid = panel?.querySelector('.swiss-workspace');
          const boardTracks = boardGrid
            ? getComputedStyle(boardGrid).gridTemplateColumns : '';
          return { display: getComputedStyle(n).display,
            boardTracks, sidebarTrack: Number.parseFloat(boardTracks.split(' ').at(-1)) || 0,
            tracks: getComputedStyle(n).gridTemplateColumns,
            width: Math.round(n.getBoundingClientRect().width),
            children: Array.from(n.children, child => ({
              cls: String(child.className || '').slice(0, 100),
              width: Math.round(child.getBoundingClientRect().width)
            })),
            panel: panel ? { display: getComputedStyle(panel).display,
              tracks: getComputedStyle(panel).gridTemplateColumns,
              children: Array.from(panel.children, child => ({
                cls: String(child.className || '').slice(0, 100),
                width: Math.round(child.getBoundingClientRect().width),
                display: getComputedStyle(child).display
              }))
            } : null };
        });
        console.log('CP_PAIRINGS_COLUMNS=' + JSON.stringify(columns));
        assert.ok(columns.sidebarTrack >= 255 && columns.sidebarTrack <= 285,
          'Original board sidebar must have a readable 270px track: ' + JSON.stringify(columns));
      }
      await page.screenshot({ path: join(visualDir, pageId + '-desktop.png'),
        animations: 'disabled' });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#tabPairings').click();
    await page.locator('#pairings.active').waitFor();
    const mobileDom = await page.evaluate(() => {
      function describe(node) {
        if (!node) return null;
        const style = getComputedStyle(node), rect = node.getBoundingClientRect();
        return {
          tag: node.tagName.toLowerCase(), id: node.id || '',
          className: String(node.className || '').slice(0, 110),
          width: Math.round(rect.width), height: Math.round(rect.height),
          scrollWidth: node.scrollWidth,
          display: style.display, flexDirection: style.flexDirection,
          gridTemplateColumns: style.gridTemplateColumns,
          children: [...node.children].slice(0, 7).map(n => ({
            tag:n.tagName.toLowerCase(), id:n.id || '',cls:String(n.className||'').slice(0,80),
            width:Math.round(n.getBoundingClientRect().width),
            display:getComputedStyle(n).display
          }))
        };
      }
      const manager=document.getElementById('nextRoundManager');
      const history=document.querySelector('#pairings > .program-historybar');
      const save = [...document.querySelectorAll('button')]
        .find(node => (node.textContent || '').trim() === 'Save'
          && node.getBoundingClientRect().top < 75);
      return { viewport: innerWidth,
        save: describe(save),
        saveRight: Math.round(save?.getBoundingClientRect().right || 0),
        saveLeft: Math.round(save?.getBoundingClientRect().left || 0),
        headerWidth: Math.round(document.querySelector('#appWindow > .desktop-header-strip')?.getBoundingClientRect().width || 0),
        headerScrollWidth: document.querySelector('#appWindow > .desktop-header-strip')?.scrollWidth || 0,
        saveParent: describe(save?.parentElement),
        saveGrandparent: describe(save?.parentElement?.parentElement),
        appRoot: describe(document.getElementById('appWindow')),
        page: describe(document.getElementById('pairings')),
        manager: describe(manager), managerFirst:describe(manager?.firstElementChild),
        managerSecond:describe(manager?.children?.[1]), history:describe(history),
        titlebar:describe(document.querySelector('#appWindow > .titlebar')) };
    });
    console.log('CP_MOBILE_PAIRINGS_DOM=' + JSON.stringify(mobileDom));
    assert.ok(mobileDom.managerFirst?.children?.[0]?.width >= 280,
      'Mobile next-round heading is squeezed: ' + JSON.stringify(mobileDom.managerFirst));
    assert.ok(mobileDom.managerFirst?.height <= 145,
      'Mobile next-round heading is taller than its content: ' + JSON.stringify(mobileDom.managerFirst));
    assert.ok(mobileDom.history?.children?.[2]?.width >= 270,
      'Round history help text must get its own readable line: ' + JSON.stringify(mobileDom.history));
    assert.ok(mobileDom.history?.height <= 125,
      'Round history must remain compact at 390px: ' + JSON.stringify(mobileDom.history));
    assert.ok(mobileDom.save && mobileDom.save.width >= 38,
      'Save action must not collapse at mobile width: ' + JSON.stringify(mobileDom));
    assert.ok(mobileDom.saveRight <= mobileDom.viewport + 1 && mobileDom.saveLeft >= 0,
      'Save action must be fully visible without horizontal scrolling: ' + JSON.stringify(mobileDom));
    assert.ok(mobileDom.headerScrollWidth <= mobileDom.headerWidth + 2,
      'Header controls must fit without horizontal scrolling: ' + JSON.stringify(mobileDom));
    await page.screenshot({ path: join(visualDir, 'pairings-mobile-390.png'),
      animations: 'disabled' });
    await page.setViewportSize({ width: 1440, height: 920 });
  }

  // Check tablet and small-laptop breakpoints on the same real workspace
  // after all original pairing, Cloud and Chess-Results actions have run.
  for (const width of [768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [tab, section] of [
      ['tabMain', 'main'], ['tabPairings', 'pairings'],
      ['tabStandings', 'standings'], ['tabSchedule', 'schedule'],
      ['tabExport', 'exportPage'], ['tabChessResults', 'chessresults'],
    ]) {
      await page.locator('#' + tab).click();
      await page.locator('#' + section + '.active').waitFor();
      const metrics = await page.evaluate(section => {
        const node = document.getElementById(section);
        const bounds = node.getBoundingClientRect();
        return {
          viewport: innerWidth, tab: section,
          documentOverflow: Math.round(document.documentElement.scrollWidth - innerWidth),
          appOverflow: Math.round(document.getElementById('appWindow').scrollWidth - innerWidth),
          pageWidth: Math.round(bounds.width),
          pageHeight: Math.round(bounds.height),
          layout: getComputedStyle(node).display
        };
      }, section);
      console.log('CP_RESPONSIVE_MATRIX=' + JSON.stringify(metrics));
      assert.ok(metrics.pageWidth >= 200 && metrics.pageHeight >= 80,
        'Workspace page collapsed: ' + JSON.stringify(metrics));
      assert.ok(metrics.documentOverflow <= 2 && metrics.appOverflow <= 2,
        'Outer document or application overflow: ' + JSON.stringify(metrics));
      if (visualDir && ((width === 768 && section === 'standings') ||
          (width === 1024 && ['pairings', 'chessresults'].includes(section)))) {
        await page.screenshot({ path: join(visualDir, section + '-' + width + '.png'), animations: 'disabled' });
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 920 });

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
} finally {
  await browser.close();
}
