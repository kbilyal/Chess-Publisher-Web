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
  await page.locator('#firstTournamentName').waitFor();
  await page.locator('#firstTournamentName').fill('Browser workflow test');
  await page.locator('#cpNewTournamentCreateBtn').click();
  await page.locator('#main').waitFor();
  assert.equal(await page.locator('#mainTournamentSelect').inputValue(), 'Browser workflow test');
  console.log('Tournament created in the desktop workspace.');

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
  await fresh.locator('#cpNewOnlineChoice').click();
  const cloudRow = fresh.locator('#cpNewOnlineTournamentBody tr').filter({ hasText: 'Browser workflow test' });
  await cloudRow.getByRole('button', { name: 'Open', exact: true }).click();
  await fresh.waitForFunction(() => getCurrentTournament()?.pairings?.liveBoards?.['1']?.[0]?.result === '1 - 0');
  console.log('Automatic private Cloud save, retry after 503, and restore in a fresh browser passed.');
} finally {
  await browser.close();
}
