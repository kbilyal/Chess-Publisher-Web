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
        if (failNextUpload) {
          failNextUpload = false;
          failedUploads += 1;
          return reply({ error: 'temporarily_unavailable' }, 503);
        }
        const { baseRevision, snapshot } = request.postDataJSON();
        if (baseRevision !== row.tournament.revision) return reply({ error: 'cloud_revision_conflict' }, 409);
        row.snapshot = snapshot;
        row.tournament = { ...row.tournament, revision: baseRevision + 1, updatedAt: new Date().toISOString() };
        return reply({ ok: true, tournament: row.tournament, revision: row.tournament.revision });
      }
    }
    return reply({ ok: true, settings: null });
  });
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
  assert.equal(await page.getByRole('radio', { name: 'Swiss Dutch' }).isChecked(), true);
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
  for (const name of ['Alpha One', 'Beta Two', 'Gamma Three', 'Delta Four']) {
    await page.locator('#manualName').fill(name);
    await page.locator('#manualAddPlayerBtn').click();
    await page.waitForFunction(expected => getCurrentTournament().players.some(player => player.name === expected), name);
    await page.evaluate(() => cpFlushPersistence());
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
  } catch (error) {
    throw new Error(`Round failed: ${await page.locator('#appMessageText').textContent()} · ${await page.locator('#status').textContent()} · ${errors.join('; ')}`, { cause: error });
  }
  const checks = await page.evaluate(async () => {
    const line = (n, opponent, color, score, outcome) => {
      const row = ('001 '+String(n).padStart(4)+'      Player '+n).padEnd(80)
        + String(score).padStart(4)+' '+String(n).padStart(4)+'  ';
      return row + String(opponent).padStart(4)+' '+color+' '+outcome+'  ';
    };
    const trf = ['012 Checker test','142 3',line(1,2,'w','1.0','1'),line(2,1,'b','0.0','0')].join('\r\n');
    const expected = [{startNo:1,rank:1,values:{PTS:1}}, {startNo:2,rank:2,values:{PTS:0}}];
    const check = async () => (await window.cpDesktopWebEngine('/tiebreak-checker/check',{
      body:JSON.stringify({round:1,mode:'swiss',tieBreaks:['PTS'],trf,expected})
    })).json();
    const pass = await check();
    expected[0].values.PTS = 0;
    return [pass,await check()];
  });
  assert.equal(checks[0].state,'pass',JSON.stringify(checks[0]));
  assert.equal(checks[1].state,'fail',JSON.stringify(checks[1]));
  failNextUpload = true;
  await page.evaluate(() => {
    const board = getCurrentTournament().pairings.liveBoards['1'][0];
    board.result = '1 - 0';
    saveData();
  });
  await waitForCloudSave();
  assert.equal(failedUploads, 1);
  assert.equal(rows.size, 1);
  assert.equal(await page.locator('#autosaveToggle').count(), 0);
  assert.equal(await page.locator('#tabDgt, #dgt').count(), 0);
  await page.evaluate(() => cpPersistActiveTabUiPreference('dgt'));
  await page.reload();
  await page.waitForFunction(() => getCurrentTournament()?.pairings?.liveBoards?.['1']?.[0]?.result === '1 - 0');
  await page.locator('#main.active').waitFor();
  assert.equal(await page.locator('#tabDgt, #dgt').count(), 0);
  for (const tab of ['tabMain', 'tabRegistration', 'tabPairings', 'tabStandings', 'tabSchedule', 'tabExport']) {
    await page.locator(`#${tab}`).waitFor();
  }
  await page.locator('#cpDesktopWebSignOut').click();
  await page.getByRole('heading', { name: 'ChessPublisher Web' }).waitFor();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('cp.desktop-web.session')), null);
  assert.equal(await page.evaluate(secret => JSON.stringify(localStorage).includes(secret), token), false);
  const fresh = await browser.newPage();
  await installCloudFixture(fresh);
  await fresh.goto(url);
  await fresh.getByLabel('Organizer Token').fill(token);
  await fresh.getByRole('button', { name: 'Отвори приложението' }).click();
  const draftName = fresh.getByRole('textbox', { name: 'Tournament name', exact: true });
  await draftName.fill('Unfinished draft');
  const baku = fresh.getByRole('radio', { name: 'Accelerated Baku' });
  await baku.check();
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
  console.log('Automatic private Cloud save, retry after 503, and restore in a fresh browser passed.');
} finally {
  await browser.close();
}
