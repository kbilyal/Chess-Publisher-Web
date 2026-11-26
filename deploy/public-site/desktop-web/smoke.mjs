import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const [url, modules, executablePath] = process.argv.slice(2);
const { chromium } = createRequire(`${modules}/package.json`)('playwright-core');
const browser = await chromium.launch({ executablePath });
const screenshotDir = process.env.CP_AUDIT_SCREENSHOT_DIR || '';
if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });
async function snap(page, name) {
  if (!screenshotDir) return;
  await page.screenshot({ path: join(screenshotDir, `${name}.png`) });
}

const origin = new URL(url).origin;
const userA = { id: 'usr_smoke_a', email: 'a@example.com', name: 'Smoke Org A', organizerId: 'org_smoke_a' };
const userB = { id: 'usr_smoke_b', email: 'b@example.com', name: 'Smoke Org B', organizerId: 'org_smoke_b' };
const rows = new Map();
const hubRows = new Map();
let activeAuthUser = userA;
let failNextUpload = false;
let failedUploads = 0;
let putDelayMs = 0;
let conflictResponses = 0;
let rejectWith401 = false;
let uploadsAfter401 = 0;
let arbiterGrant = null;

function sha256Hex(v) {
  return createHash('sha256').update(String(v)).digest('hex');
}

async function seedGoogleCookieSession(page, user) {
  const scope = sha256Hex(user.organizerId);
  await page.addInitScript(({ user: u, scope: s }) => {
    if (!sessionStorage.getItem('cp.desktop-web.session')) {
      sessionStorage.setItem('cp.desktop-web.session', JSON.stringify({
        authMode: 'cookie',
        scope: s,
        user: u
      }));
    }
  }, { user, scope });
}

async function installCloudFixture(page, expectedUser = userA) {
  await page.route('https://accounts.google.com/**', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
  );
  const handleApiRoute = async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET, OPTIONS, POST, PUT, DELETE',
      'access-control-allow-headers': 'Authorization, Content-Type, X-Client-Version, X-Expected-Revision, X-Expected-Organizer'
    };
    const reply = (json, status = 200) => route.fulfill({ status, headers, json });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });

    if (path === '/api/auth/config') return reply({ ok: true, googleClientId: 'smoke-client.apps.googleusercontent.com' });
    if (path === '/api/auth/me') {
      if (rejectWith401) return reply({ ok: true, authenticated: false, user: null });
      return reply({ ok: true, authenticated: true, user: activeAuthUser, organizer: { id: activeAuthUser.organizerId, displayName: activeAuthUser.name } });
    }
    if (path === '/api/auth/logout' && method === 'POST') return reply({ ok: true });

    const expectedOrg = (await request.allHeaders())['x-expected-organizer'];
    if (expectedOrg !== expectedUser.organizerId || rejectWith401) {
      if (path.includes('/snapshot') && method === 'PUT') uploadsAfter401 += 1;
      return reply({ ok: false, error: 'session_expired' }, 401);
    }

    if (path === '/api/v1/cloud/workspace') {
      return reply({ ok: true, organizer: { id: expectedUser.organizerId, displayName: expectedUser.name }, storage: { tournamentCount: rows.size, revisionCount: rows.size } });
    }
    if (path === '/api/v1/cloud/settings') {
      return reply({ ok: true, revision: 0, settings: null });
    }
    if (path === '/api/v1/cloud/tournaments') {
      if (method === 'GET') return reply({ ok: true, tournaments: [...rows.values()].map(r => r.tournament) });
      if (method === 'POST') {
        const { name, localKey } = request.postDataJSON();
        const id = `cloud_${String(rows.size + 1).padStart(32, '0')}`;
        const tournament = { id, name, localKey, revision: 0, updatedAt: new Date().toISOString() };
        rows.set(id, { tournament, snapshot: null, revisions: [] });
        return reply({ ok: true, tournament }, 201);
      }
    }

    const arbiterMatch = /^\/api\/v1\/cloud\/tournaments\/([^/]+)\/arbiter-access$/.exec(path);
    if (arbiterMatch) {
      if (method === 'GET') return reply({ ok: true, grant: arbiterGrant, sessions: [], pendingResults: 0 });
      if (method === 'POST') {
        arbiterGrant = { id: 'arb-grant:smoke', createdAt: new Date().toISOString(), lastUsedAt: null };
        return reply({ ok: true, grant: arbiterGrant, sessions: [], pendingResults: 0, accessUrl: 'https://web.chess-publisher.org/?arbiter=arb_smoke_code_1234567890' });
      }
      if (method === 'DELETE') {
        arbiterGrant = null;
        return reply({ ok: true, revoked: true, tournamentId: arbiterMatch[1] });
      }
    }

    const revMatch = /^\/api\/v1\/cloud\/tournaments\/([^/]+)\/revisions$/.exec(path);
    if (revMatch && method === 'GET') {
      const row = rows.get(revMatch[1]);
      return reply({ ok: true, tournament: row?.tournament, revisions: row?.revisions || [] });
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
        if (putDelayMs > 0) await new Promise(resolve => setTimeout(resolve, putDelayMs));
        const { baseRevision, snapshot } = request.postDataJSON();
        if (baseRevision !== row.tournament.revision) {
          conflictResponses += 1;
          return reply({ error: 'cloud_revision_conflict' }, 409);
        }
        row.snapshot = snapshot;
        row.tournament = { ...row.tournament, revision: baseRevision + 1, updatedAt: new Date().toISOString() };
        row.revisions.unshift({ revision: row.tournament.revision, createdAt: row.tournament.updatedAt, deviceLabel: 'Browser', reason: 'sync', size: 1024 });
        return reply({ ok: true, tournament: row.tournament, revision: row.tournament.revision });
      }
    }

    if (path === '/api/v1/organizer/tournaments') {
      if (method === 'GET') return reply({ ok: true, organizer: { id: expectedUser.organizerId }, tournaments: [...hubRows.values()] });
      if (method === 'POST') {
        const body = request.postDataJSON();
        const rec = { hubTournamentId: 'hub_smoke1', publicSlug: 'smoke-open', revision: 0, name: body.name, isPublic: true, deleted: false, manageToken: 'mg_smoke_1' };
        hubRows.set(rec.hubTournamentId, rec);
        return reply({ ok: true, tournament: rec }, 201);
      }
    }
    const pubSnap = /^\/api\/v1\/organizer\/tournaments\/([^/]+)\/snapshot$/.exec(path);
    if (pubSnap && method === 'PUT') {
      const rec = hubRows.get(pubSnap[1]);
      if (rec) rec.revision += 1;
      return reply({ ok: true, revision: rec?.revision || 1, checksum: 'sha256-smoke' });
    }
    return reply({ ok: true, settings: null });
  };
  await page.route('https://api.chess-publisher.org/**', handleApiRoute);
  await page.route('https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev/**', handleApiRoute);
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
  // 1. Verify login page has no manual token entry and unauthenticated workspace redirects to ./
  const unauthPage = await browser.newPage();
  await installCloudFixture(unauthPage);
  await unauthPage.goto(new URL('workspace.html', url).href);
  await unauthPage.getByRole('heading', { name: 'Chess-Publisher Web' }).waitFor();
  assert.equal(await unauthPage.locator('#legacy-token-details, #organizer-token').count(), 0);
  await unauthPage.close();

  // 2. Boot Google-authenticated workspace
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await installCloudFixture(page, userA);
  await seedGoogleCookieSession(page, userA);
  await page.goto(new URL('workspace.html', url).href);

  // Confirm Online & Cloud (Beta) tab and manual token controls do not exist
  assert.equal(await page.locator('#tabHub, #hub, #hubOrganizerToken').count(), 0);

  await page.locator('#firstTournamentName').waitFor();
  await page.waitForFunction(() => typeof resortStartingList === 'function' && typeof cpFlushPersistence === 'function');
  await page.locator('#firstTournamentName').fill('Browser workflow test');
  await page.locator('#cpNewTournamentCreateBtn').click();
  await page.locator('#main').waitFor();
  assert.equal(await page.locator('#mainTournamentSelect').inputValue(), 'Browser workflow test');
  console.log('Tournament created in the Google-authenticated web workspace.');

  const timeControl = page.locator('#timeControl');
  assert.equal(await timeControl.locator('option[value="60+30"]').textContent(), '60+30 (Fast Classical)');
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
    void resortStartingList();
  });
  await page.locator('#appMessageOk').click();
  await page.locator('#tabPairings').click();
  await page.locator('#btnGenerateGacrux').click();
  await page.locator('#firstRoundColorModal button').filter({ hasText: 'White' }).click({ timeout: 10000 });
  await page.waitForFunction(() => getCurrentTournament().pairings.liveBoards['1']?.length === 2, undefined, { timeout: 35000 });
  await page.locator('#appMessageOk').click({ timeout: 10000 });

  await page.locator('#pairings aside.result-palette .result-main-action:not([disabled])').first().waitFor({ timeout: 10000 });
  await page.locator('#livePairingsBody tr[data-board-index]').first().click();
  await page.locator('#pairings aside.result-palette .result-main-action').nth(2).click();
  await page.locator('#livePairingsBody tr[data-board-index]').nth(1).click();
  await page.locator('#pairings aside.result-palette .result-main-action').nth(1).click();
  assert.equal(await page.evaluate(() => getCurrentTournament().pairings.liveBoards['1'][0].result), '0 - 1');
  assert.equal(await page.evaluate(() => getCurrentTournament().pairings.liveBoards['1'][1].result), '½ - ½');

  // Keyboard tab navigation check
  await page.locator('#tabMain').focus();
  await page.keyboard.press('ArrowRight');
  await page.locator('#registration.active').waitFor();

  // Responsive matrix across 390, 768, 1024, 1280, and 1440 px on all 7 tabs
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
    ['tabExport', 'exportPage']
  ];
  for (const vp of viewports) {
    await page.setViewportSize(vp);
    for (const [tabId, pageId] of allTabs) {
      await page.locator(`#${tabId}`).click();
      await page.waitForTimeout(40);
      const overflow = await page.evaluate((pid) => {
        const docOverflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const pg = document.getElementById(pid);
        return { docOverflowX, pageOverflowX: pg.scrollWidth - pg.clientWidth };
      }, pageId);
      assert.ok(overflow.docOverflowX <= 2, `${vp.width}px ${pageId} docOverflowX=${overflow.docOverflowX}`);
      assert.ok(overflow.pageOverflowX <= 4, `${vp.width}px ${pageId} pageOverflowX=${overflow.pageOverflowX}`);
    }
  }

  await page.setViewportSize({ width: 1440, height: 920 });
  await page.locator('#tabPairings').click();
  await page.locator('#cpWebCloudSaveStatus').filter({ hasText: 'Saved to private Cloud' }).waitFor({ timeout: 10000 });

  // Concurrent autosave + header Sync button check
  failNextUpload = true;
  await page.evaluate(() => {
    getCurrentTournament().pairings.liveBoards['1'][0].result = '1 - 0';
    saveData();
  });
  await waitForCloudSave();
  assert.equal(failedUploads, 1);

  putDelayMs = 400;
  await page.evaluate(() => {
    getCurrentTournament().pairings.liveBoards['1'][0].result = '½ - ½';
    saveData();
  });
  await page.locator('#cpWebHeaderSyncBtn').click();
  await page.locator('#cpWebCloudSaveStatus').filter({ hasText: 'Saved to private Cloud' }).waitFor({ timeout: 10000 });
  putDelayMs = 0;
  assert.equal(conflictResponses, 0);

  // Public Hub relocated controls in Other / Export + Guest Arbiter Access modal
  await page.locator('#tabExport').click();
  await page.locator('#cpWsHubPublishBtn').click();
  await page.locator('#cpWsHubStatusPill').filter({ hasText: /Published/ }).waitFor({ timeout: 10000 });

  await page.locator('#cpDesktopWebUserBtn').click();
  await page.locator('#cpUserMenuArbiterAccessBtn').click();
  await page.locator('#cpArbiterAccessModal').waitFor({ state: 'visible' });
  await page.locator('#cpArbiterAccessModal button').filter({ hasText: 'Create Guest Link & QR' }).click();
  await page.locator('#cpArbiterQrWrap svg').waitFor({ state: 'visible' });
  assert.match(await page.locator('#cpArbiterGuestUrlInput').inputValue(), /\?arbiter=arb_/);
  await page.locator('#cpArbiterAccessModal button').filter({ hasText: 'Revoke Access' }).click();
  await page.locator('#cpArbiterAccessModal .cp-modal-close').click();

  // Sign out
  await page.locator('#cpDesktopWebUserBtn').click();
  await page.locator('#cpDesktopWebSignOut').click();
  await page.getByRole('heading', { name: 'Chess-Publisher Web' }).waitFor();
  assert.deepEqual(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('cp.desktop-web.'))), []);
  assert.deepEqual(errors, []);

  // Second Google account isolation
  const secondCtx = await browser.newContext();
  const secondPage = await secondCtx.newPage();
  activeAuthUser = userB;
  await installCloudFixture(secondPage, userB);
  await seedGoogleCookieSession(secondPage, userB);
  await secondPage.goto(new URL('workspace.html', url).href);
  await secondPage.locator('#firstTournamentName').waitFor();
  await secondPage.locator('#firstTournamentName').fill('Org B Event');
  await secondPage.locator('#cpNewTournamentCreateBtn').click();
  await secondPage.locator('#main.active').waitFor();
  assert.equal(await secondPage.evaluate(() => Object.keys(data?.tournaments || {}).includes('Browser workflow test')), false);
  await secondCtx.close();

  console.log('Full Google-only Web workspace smoke suite passed.');
} finally {
  await browser.close();
}
