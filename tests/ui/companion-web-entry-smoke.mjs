import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createInitialEmptyTournament } from '../../src/data/initialData.ts';

const [modules, executablePath] = process.argv.slice(2);
const { chromium } = createRequire(`${modules}/package.json`)('playwright-core');
const browser = await chromium.launch({ executablePath });
const web = 'https://chess-publisher.org';
const companion = 'https://web.chess-publisher.org';
const api = 'https://api.chess-publisher.org';
const token = 'ci-legacy-organizer';
const arbiterCode = 'fixture-arbiter-invitation';
const arbiterToken = 'fixture-arbiter-session';
const arbiterSession = { id: 'arbiter-1', name: 'Guest Arbiter' };
const user = { id: 'user-1', organizerId: 'organizer-1', name: 'Test organizer' };
const tournament = { id: 'cloud.example', name: 'Spring Open', localKey: 'test-local', revision: 1 };
const secondUser = { id: 'user-2', organizerId: 'organizer-2', name: 'Second organizer' };
const secondTournament = { id: 'cloud.second', name: 'Autumn Open', localKey: 'test-local', revision: 1 };
const fidePlayer = {
  fideId: 29998888, name: 'Longlastnamewithmanyletters, Alexandra', federation: 'BUL',
  ratingStandard: 1900, ratingRapid: 1800, ratingBlitz: 1700
};
const portalSource = 'deploy/public-site/desktop-web';
const snapshot = { data: { currentTournament: tournament.name, tournaments: {
  [tournament.name]: createInitialEmptyTournament(tournament.name)
} } };

async function configure(context, googleClientId = Promise.resolve('fixture')) {
  let googleSession;
  let logoutFailure;
  let latestArbiterRound = 0;
  const arbiterResults = new Map();
  const arbiterRoundSizes = new Map();
  const calls = [];
  await context.route('**/*', route => route.abort());
  await context.route(`${web}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body:
      '<header class="site-header"><nav class="nav-shell"></nav></header><script src="/site-auth.js"></script>' });
    if (path === '/site-auth.js') return route.fulfill({ path: 'deploy/public-site/site-auth.js' });
    // This fixture uses the real sign-in page and workspace host. The desktop
    // tournament shell is exercised separately by the public-site browser smoke.
    if (path === '/app/workspace.html') return route.fulfill({ contentType: 'text/html', body:
      '<script src="./host.js"></script><nav id="classicMenuBar"></nav><output id="workspace-status"></output>' +
      '<script>function setStatus(message) { document.querySelector("#workspace-status").textContent = message; }</script>' });
    const files = { '/app/': 'login.html', '/app/login.mjs': 'login.mjs', '/app/login.css': 'login.css', '/app/host.js': 'host.js' };
    return files[path] ? route.fulfill({ path: resolve(portalSource, files[path]) }) : route.abort();
  });
  await context.route(`${companion}/**`, route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/') return route.fulfill({ path: 'dist/index.html' });
    if (path === '/api/fide/status') return route.fulfill({ json: { listVersion: 'fixture', recordCount: 160000 } });
    if (path === '/api/fide/search' && url.searchParams.get('q') === String(fidePlayer.fideId)) {
      return route.fulfill({ json: { players: [fidePlayer] } });
    }
    if (/^\/(assets|icons)\/[\w.-]+$/.test(path) || path === '/hub-useful-links-organizer.js') {
      return route.fulfill({ path: resolve('dist', path.slice(1)) });
    }
    return route.abort();
  });
  await context.route('https://accounts.google.com/gsi/client', route => route.fulfill({
    contentType: 'text/javascript',
    body: `window.google = { accounts: { id: {
      initialize(options) { this.callback = options.callback; },
      renderButton(el) {
        const button = document.createElement('button');
        button.textContent = 'Google fixture sign-in';
        button.onclick = () => this.callback({ credential: 'fixture-google-credential' });
        el.append(button);
        const second = document.createElement('button');
        second.textContent = 'Second Google fixture account';
        second.onclick = () => this.callback({ credential: 'fixture-second-credential' });
        el.append(second);
      }
    } } };`
  }));
  await context.route(`${api}/**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const { origin, authorization: bearer, 'x-expected-organizer': expectedOrganizer } = await request.allHeaders();
    const headers = {
      'access-control-allow-origin': origin || web,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET, OPTIONS, POST',
      'access-control-allow-headers': 'Authorization, Content-Type, X-Expected-Organizer'
    };
    const reply = (json, status = 200) => route.fulfill({ headers, json, status });
    if (request.method() === 'OPTIONS') return route.fulfill({ headers, status: 204 });
    calls.push({ path, origin, bearer, expectedOrganizer, method: request.method(), body: request.postData() });
    if (expectedOrganizer && expectedOrganizer !== googleSession?.organizerId) {
      return reply({ ok: false, error: 'organizer_session_changed' }, 401);
    }
    if (path === '/api/auth/me') return reply({ ok: true, authenticated: Boolean(googleSession), user: googleSession || null });
    if (path === '/api/auth/config') return reply({ googleClientId: await googleClientId });
    if (path === '/api/auth/google' && origin === web) {
      googleSession = request.postDataJSON().credential === 'fixture-second-credential' ? secondUser : user;
      return reply({ ok: true, user: googleSession });
    }
    if (path === '/api/auth/logout') {
      if (logoutFailure) {
        const { json, status } = logoutFailure;
        logoutFailure = undefined;
        return reply(json, status);
      }
      googleSession = undefined;
      return reply({ ok: true });
    }
    if (path === '/api/v1/arbiter/join') {
      const { accessCode, name, deviceId } = request.postDataJSON();
      if (accessCode !== arbiterCode || name !== arbiterSession.name || !deviceId || bearer) {
        return reply({ ok: false, message: 'Invalid fixture invitation.' }, 400);
      }
      return reply({ ok: true, sessionToken: arbiterToken, session: arbiterSession, tournament });
    }
    if (path === '/api/v1/arbiter/tournament' && bearer === `Bearer ${arbiterToken}`) {
      return reply({ ok: true, session: arbiterSession, tournament: {
        ...tournament, revision: latestArbiterRound + 1, round: String(latestArbiterRound), players: [
          { localKey: 'white', pairingNumber: 1, name: 'White Player' },
          { localKey: 'black', pairingNumber: 2, name: 'Black Player' },
          { localKey: 'long', pairingNumber: 3, name: 'Alexandra Longlastnamewithmanyletters' }
        ], pairings: { liveBoards: Object.fromEntries(Array.from({ length: latestArbiterRound }, (_, index) => {
          const round = index + 1;
          const boards = Array.from({ length: arbiterRoundSizes.get(round) }, (_, boardIndex) => {
            const board = boardIndex + 1;
            return {
              board,
              whiteKey: board === 2 ? 'long' : round % 2 ? 'white' : 'black',
              blackKey: round % 2 ? 'black' : 'white',
              result: arbiterResults.get(`${round}:${board}`) || '-'
            };
          });
          return [round, boards];
        })) }
      } });
    }
    if (path === '/api/v1/arbiter/results' && bearer === `Bearer ${arbiterToken}`) {
      const result = request.postDataJSON();
      arbiterResults.set(`${result.round}:${result.board}`, result.result);
      return reply({ ok: true, submission: { id: 'result-1', ...result } });
    }
    if (!googleSession && bearer !== `Bearer ${token}`) return reply({ error: 'unauthorized' }, 401);
    const organizer = googleSession || user;
    const owned = organizer === secondUser ? secondTournament : tournament;
    if (path.endsWith('/workspace')) return reply({ ok: true, organizer: { id: organizer.organizerId, displayName: organizer.name } });
    if (path.endsWith('/archived')) return reply({ ok: true, tournaments: [] });
    if (path.endsWith('/tournaments')) return reply({ ok: true, tournaments: [owned] });
    if (path.startsWith('/api/v1/cloud/tournaments/') && !path.split('/').includes(owned.id)) {
      return reply({ ok: false, error: 'not_found' }, 404);
    }
    if (path.endsWith('/snapshot')) return reply({ ok: true, tournament: owned, snapshot });
    return reply({ ok: true, tournament: owned });
  });
  return {
    calls,
    failNextLogout: (json, status) => { logoutFailure = { json, status }; },
    publishArbiterRound: (boardCount = 1) => {
      latestArbiterRound += 1;
      arbiterRoundSizes.set(latestArbiterRound, boardCount);
    }
  };
}

async function checkTournament(page, calls) {
  try {
    await page.locator('.companion-topbar').getByText(tournament.name).waitFor({ timeout: 10000 });
  } catch (error) {
    const body = await page.locator('body').innerText().catch(() => '');
    throw new Error(`Companion tournament did not open at ${page.url()}
${body}
${calls.map(call => [call.path, call.origin]).join('\n')}`, { cause: error });
  }
}

async function checkWidth(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
}

async function checkTouchOrganizerEditing(page, draftKey) {
  const nav = page.getByRole('navigation', { name: 'Mobile tournament navigation' });
  const jump = page.getByRole('navigation', { name: 'Tournament setup sections' });
  const checkTarget = async locator => {
    const bounds = await locator.boundingBox();
    assert.ok(bounds?.height >= 44 && bounds.width >= 44, `Small touch target: ${await locator.getAttribute('class')} ${JSON.stringify(bounds)}`);
  };
  await page.setViewportSize({ width: 320, height: 480 });
  await checkWidth(page);
  await checkTarget(jump.getByRole('link', { name: 'Place & dates' }));
  await jump.getByRole('link', { name: 'Place & dates' }).tap();
  const location = page.locator('#companion-setup-dates');
  await page.waitForFunction(() => {
    const section = document.querySelector('#companion-setup-dates').getBoundingClientRect();
    return section.top >= document.querySelector('.companion-topbar').getBoundingClientRect().bottom && section.top < 130;
  });
  await checkTarget(location.getByLabel('City'));
  assert.equal(await location.getByLabel('City').evaluate(el => getComputedStyle(el).fontSize), '16px');
  await location.getByLabel('City').fill('Krumovgrad');
  await nav.getByRole('button', { name: 'Setup' }).tap();
  await jump.getByRole('link', { name: 'Officials & contact' }).tap();
  await page.getByLabel('Chief arbiter').fill('Test Arbiter');
  await nav.getByRole('button', { name: 'Setup' }).tap();
  await jump.getByRole('link', { name: 'Public information' }).tap();
  await page.getByRole('button', { name: '+ Add link' }).tap();
  await page.getByLabel('Link name').last().fill('Venue map');
  await page.getByLabel('URL', { exact: true }).last().fill('https://example.com/map');
  await nav.getByRole('button', { name: 'Players' }).tap();
  const search = page.getByRole('textbox', { name: 'Name or FIDE ID' });
  await search.fill(String(fidePlayer.fideId));
  const add = page.getByRole('button', { name: 'Add', exact: true });
  await add.waitFor();
  await checkTarget(add);
  await add.tap();
  await page.getByRole('status').filter({ hasText: `${fidePlayer.name} registered` }).waitFor();
  const manual = page.getByRole('button', { name: 'Manual player' });
  await checkTarget(manual);
  await manual.tap();
  await page.getByLabel('First name').fill('Iva');
  await page.getByLabel('Last name').fill('Test');
  const register = page.getByRole('button', { name: 'Register player' });
  await checkTarget(register);
  await register.tap();
  await page.getByRole('status').filter({ hasText: 'Test, Iva registered' }).waitFor();

  const fideRow = page.locator('.companion-roster-row').filter({ hasText: fidePlayer.name });
  const edit = fideRow.getByRole('button', { name: `Edit ${fidePlayer.name}` });
  const remove = fideRow.getByRole('button', { name: `Remove ${fidePlayer.name}` });
  for (const width of [320, 390, 640, 768, 820]) {
    await page.setViewportSize({ width, height: 480 });
    await checkWidth(page);
    assert.ok(await page.locator('.companion-roster-list').evaluate(el => el.scrollWidth <= el.clientWidth));
    await checkTarget(edit);
    await checkTarget(remove);
  }
  await page.setViewportSize({ width: 320, height: 340 });
  page.once('dialog', confirmation => confirmation.dismiss());
  await remove.tap();
  assert.ok(await edit.isVisible());
  await edit.tap();
  const dialog = page.getByRole('dialog', { name: 'Edit registered player' });
  await dialog.waitFor();
  assert.ok(await dialog.evaluate(el => el.matches(':modal') && el.scrollHeight > el.clientHeight));
  const save = dialog.getByRole('button', { name: 'Save changes' });
  const isInViewport = el => {
    const { top, bottom } = el.getBoundingClientRect();
    return top >= 0 && bottom <= window.innerHeight;
  };
  assert.ok(await save.evaluate(isInViewport));
  assert.equal(await dialog.getByLabel('FIDE ID').inputValue(), String(fidePlayer.fideId));
  await dialog.getByLabel('Federation').fill('B');
  await checkTarget(save);
  await save.tap();
  const validation = dialog.getByRole('alert').filter({ hasText: 'Federation must be a valid 3-letter FIDE code.' });
  await validation.waitFor();
  assert.ok(await validation.evaluate(isInViewport));
  await dialog.getByLabel('Federation').fill('BUL');
  await dialog.getByLabel('Name').fill('Edited FIDE player');
  await save.tap();
  await dialog.waitFor({ state: 'hidden' });
  const edited = page.getByRole('button', { name: 'Edit Edited FIDE player' });
  assert.ok(await edited.evaluate(el => el === document.activeElement));
  await edited.tap();
  await dialog.getByLabel('Name').fill('Canceled edit');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).tap();
  await dialog.waitFor({ state: 'hidden' });
  assert.ok(await edited.isVisible());
  await nav.getByRole('button', { name: 'Setup' }).tap();
  assert.equal(await page.getByLabel('City').inputValue(), 'Krumovgrad');
  assert.equal(await page.getByLabel('Chief arbiter').inputValue(), 'Test Arbiter');
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey);
  assert.equal(saved.settings.city, 'Krumovgrad');
  assert.equal(saved.settings.chiefArbiter, 'Test Arbiter');
  assert.deepEqual(saved.regulations.usefulLinks.at(-1), { label: 'Venue map', url: 'https://example.com/map' });
  assert.equal(saved.players.find(player => player.fideId === String(fidePlayer.fideId))?.name, 'Edited FIDE player');
  assert.equal(saved.players.some(player => player.name === 'Test, Iva'), true);
}

async function checkTouchResultEntry() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block'
  });
  try {
    const { calls, publishArbiterRound } = await configure(context);
    publishArbiterRound(8);
    const page = await context.newPage();
    await page.goto(`${companion}/?arbiter=${arbiterCode}`);
    await page.getByRole('textbox', { name: 'Arbiter name' }).fill(arbiterSession.name);
    await page.getByRole('button', { name: 'Join tournament' }).tap();

    const board = number => page.locator('.arbiter-board-card').filter({
      has: page.getByText(`Board ${number}`, { exact: true })
    });
    const score = (number, result) => board(number).getByRole('button', { name: result, exact: true });
    const firstResult = score(1, '1 - 0');
    const firstBoardNumber = board(1).getByText('Board 1', { exact: true });
    const search = page.getByRole('searchbox');
    const sync = page.getByRole('button', { name: /SYNC/ });
    const filters = page.getByRole('group', { name: 'Filter pairings by result status' });
    const missing = filters.getByRole('button', { name: /^Missing/ });
    const submitted = () => calls.filter(call => call.path === '/api/v1/arbiter/results').map(call => JSON.parse(call.body));
    await firstResult.waitFor();

    for (const [width, height] of [[320, 568], [390, 844], [667, 375], [768, 1024], [1024, 768], [1366, 1024]]) {
      await page.setViewportSize({ width, height });
      await checkWidth(page);
      const boardNumberSize = await firstBoardNumber.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      assert.ok(boardNumberSize >= 18, `${width}px board number must be at least 18px`);
      const targets = await Promise.all([firstResult, board(1).getByRole('button', { name: /Forfeit \/ Clear/ }), search, missing, sync]
        .map(locator => locator.boundingBox()));
      assert.ok(targets.every(target => target && target.width >= 44 && target.height >= 44), `${width}px touch targets`);
      const [resultBox, , , missingBox, syncBox] = targets;
      assert.ok(resultBox.height >= 64, `${width}px score target`);
      assert.ok(missingBox.x + missingBox.width < syncBox.x, `${width}px dock controls overlap`);
      assert.ok(syncBox.y + syncBox.height <= height, `${width}px SYNC goes below the viewport`);
      const [first, second] = await Promise.all([board(1).boundingBox(), board(2).boundingBox()]);
      assert.equal(first.y === second.y, width >= 768, `${width}px board columns`);
      assert.ok(await firstResult.getByText('White wins').isVisible());
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await missing.tap();
    await search.fill('longlastname');
    assert.equal(await page.locator('.arbiter-board-card:visible').count(), 1);
    assert.ok(await board(2).isVisible());
    await page.getByRole('button', { name: 'Clear search' }).tap();
    await search.fill('8');
    await search.press('Enter');
    assert.equal(await page.locator('.arbiter-board-card:visible').count(), 1);
    await score(8, '0 - 1').tap();
    await board(8).getByText('Awaiting SYNC').waitFor();
    assert.equal(await score(8, '0 - 1').getAttribute('aria-pressed'), 'true');
    assert.equal(submitted().length, 0, 'Tapping a score must only stage the result.');
    await page.getByRole('button', { name: 'Clear search' }).tap();
    await firstResult.tap();
    assert.match(await sync.innerText(), /\(2\)/);
    await board(8).scrollIntoViewIfNeeded();
    await sync.tap();
    await page.getByRole('status').getByText(/2 result change\(s\) synchronized/).waitFor();
    await board(8).waitFor({ state: 'hidden' });
    assert.deepEqual(submitted().map(({ board, result }) => [board, result]), [[1, '1 - 0'], [8, '0 - 1']]);

    await filters.getByRole('button', { name: /^All/ }).tap();
    await board(8).getByText('Recorded').waitFor();
    await page.setViewportSize({ width: 667, height: 375 });
    await score(8, '½ - ½').tap();
    const confirmation = page.getByRole('dialog', { name: 'Confirm result change' });
    await confirmation.getByRole('button', { name: 'Cancel' }).tap();
    assert.equal(await score(8, '0 - 1').getAttribute('aria-pressed'), 'true');
    await board(8).getByRole('button', { name: /Forfeit \/ Clear/ }).tap();
    await score(8, '1F - 0F').tap();
    await confirmation.getByRole('button', { name: 'Change result' }).tap();
    await board(8).getByRole('button', { name: /Hide forfeit/ }).tap();
    await score(8, '1F - 0F').waitFor({ state: 'hidden' });
    await sync.tap();
    await page.getByRole('status').getByText(/1 result change\(s\) synchronized/).waitFor();
    assert.equal(submitted().at(-1).result, '1F - 0F');

    await board(8).getByRole('button', { name: /Forfeit \/ Clear/ }).tap();
    await board(8).getByRole('button', { name: 'Clear result' }).tap();
    await confirmation.getByRole('button', { name: 'Change result' }).tap();
    await sync.tap();
    await board(8).getByText('Missing', { exact: true }).waitFor();
    assert.equal(submitted().at(-1).result, '-');
  } finally {
    await context.close();
  }
}

try {
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const { calls: guestCalls, publishArbiterRound } = await configure(guestContext);
  const guestPage = await guestContext.newPage();
  await guestPage.goto(`${web}/?arbiter=${arbiterCode}&next=https://example.invalid`);
  await guestPage.waitForURL(`${companion}/?arbiter=${arbiterCode}`);
  await guestPage.getByRole('textbox', { name: 'Arbiter name' }).fill(arbiterSession.name);
  await guestPage.getByRole('button', { name: 'Join tournament' }).click();
  await guestPage.getByText('No pairings are available for this round yet.').waitFor();
  const guestRound = guestPage.getByRole('combobox', { name: 'Round' });
  const guestSync = guestPage.getByRole('button', { name: /SYNC/ });
  publishArbiterRound();
  await guestSync.click();
  await guestPage.getByText(/SYNC complete · no result changes/).waitFor({ timeout: 3000 });
  await guestPage.waitForFunction(() => document.querySelector('.arbiter-round-actions select').value === '1');
  await guestPage.getByRole('button', { name: '1 - 0', exact: true }).click();
  await guestPage.getByRole('button', { name: /SYNC/ }).click();
  await guestPage.getByText(/1 result change\(s\) synchronized with Cloud/).waitFor();
  assert.ok(guestCalls.some(call => call.path === '/api/v1/arbiter/results'
    && call.bearer === `Bearer ${arbiterToken}` && JSON.parse(call.body).result === '1 - 0'));
  await guestPage.reload();
  await guestPage.locator('.arbiter-result-value').filter({ hasText: '1 - 0' }).waitFor();
  publishArbiterRound();
  await guestPage.waitForFunction(() => document.querySelector('.arbiter-round-actions select').value === '2', null, { timeout: 8000 });
  await guestPage.locator('.arbiter-player.white').getByText('Black Player').waitFor();
  await guestPage.getByRole('button', { name: '1 - 0', exact: true }).click();
  publishArbiterRound();
  await guestPage.getByText('Cloud revision 4', { exact: false }).waitFor({ timeout: 8000 });
  assert.equal(await guestRound.inputValue(), '2', 'Keep the current round while a result draft awaits submission.');
  await guestSync.click();
  await guestPage.waitForFunction(() => document.querySelector('.arbiter-round-actions select').value === '3');
  assert.ok(guestCalls.some(call => call.path === '/api/v1/arbiter/results' && JSON.parse(call.body).round === 2));
  await guestRound.selectOption('1');
  publishArbiterRound();
  await guestPage.getByText('Cloud revision 5', { exact: false }).waitFor({ timeout: 8000 });
  assert.equal(await guestRound.inputValue(), '1', 'Keep a deliberately selected previous round.');
  await guestRound.selectOption('4');
  await guestPage.locator('.arbiter-player.white').getByText('Black Player').waitFor();
  assert.equal(guestCalls.filter(call => call.path === '/api/v1/arbiter/join').length, 1);
  assert.ok(guestCalls.every(call => !call.path.startsWith('/api/auth/')));
  await guestPage.setViewportSize({ width: 1440, height: 900 });
  assert.ok((await guestPage.getByRole('button', { name: '1 - 0', exact: true }).boundingBox()).height < 44);
  assert.ok(await guestPage.getByRole('button', { name: '1F - 0F', exact: true }).isVisible());
  await guestContext.close();

  await checkTouchResultEntry();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const { calls: googleCalls, failNextLogout } = await configure(mobile);
  const page = await mobile.newPage();
  await page.goto(web);
  assert.equal(await page.getByRole('link', { name: 'Sign in' }).getAttribute('href'), '/app/');
  assert.equal(await page.locator('script[src*="accounts.google.com"]').count(), 0);
  await page.goto(`${companion}/?cloudTournamentId=${tournament.id}`);
  const openWeb = page.getByRole('link', { name: 'Open ChessPublisher Web' });
  const entryUrl = new URL(await openWeb.getAttribute('href'));
  assert.equal(entryUrl.origin + entryUrl.pathname, web + '/app/');
  assert.equal(entryUrl.searchParams.get('cloudTournamentId'), tournament.id);
  assert.equal(await page.locator('input[type="password"], script[src*="accounts.google.com"]').count(), 0);
  await checkWidth(page);
  await openWeb.click();
  await page.getByRole('button', { name: 'Google fixture sign-in' }).click();
  const [googleCompanion] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: 'Arbiter Companion' }).click()
  ]);
  await checkTournament(googleCompanion, googleCalls);
  await checkWidth(googleCompanion);
  assert.equal(googleCalls.filter(call => call.path === '/api/auth/google').length, 1);
  assert.ok(googleCalls.some(call => call.path.endsWith('/snapshot') && call.origin === companion && !call.bearer));
  assert.ok(googleCalls.some(call => call.path.endsWith('/snapshot') && call.expectedOrganizer === user.organizerId));
  const draftKey = `cpstudio.organizer:${user.organizerId}:fide_tournament_manager_v2`;
  assert.ok(await googleCompanion.evaluate(key => localStorage.getItem(key), draftKey));
  await checkTouchOrganizerEditing(googleCompanion, draftKey);

  const readSession = () => page.evaluate(() => sessionStorage.getItem('cp.desktop-web.session'));
  const activeWorkspace = `${web}/app/workspace.html?cloudTournamentId=${tournament.id}`;
  const accountUrl = `${web}/app/?account=1`;
  const signedOutUrl = `${web}/app/`;
  const logoutMessage = 'Could not sign out. Please try again.';
  const signOut = page.getByRole('button', { name: 'Sign Out', exact: true });

  await page.waitForURL(activeWorkspace);
  const workspaceSession = await readSession();
  assert.equal(JSON.parse(workspaceSession).authMode, 'cookie');
  failNextLogout({ ok: false, error: 'unavailable' }, 503);
  await page.locator('#cpDesktopWebUserBtn').click();
  await page.locator('#cpDesktopWebSignOut').click();
  try {
    await page.locator('#workspace-status').filter({ hasText: logoutMessage }).waitFor({ timeout: 3000 });
  } catch (error) {
    const workspaceStatus = await page.locator('#workspace-status').textContent({ timeout: 1000 }).catch(() => '');
    throw new Error(`Workspace sign-out failure was not shown at ${page.url()}: ${workspaceStatus}`, { cause: error });
  }
  assert.equal(page.url(), activeWorkspace);
  assert.equal(await readSession(), workspaceSession);
  await signOut.click();
  await page.waitForURL(signedOutUrl);
  assert.equal(await readSession(), null);

  await page.goto(accountUrl);
  await page.getByRole('button', { name: 'Google fixture sign-in' }).click();
  await page.waitForURL(`${web}/app/workspace.html`);
  await page.goto(accountUrl);
  await signOut.waitFor();
  const accountSession = await readSession();
  assert.equal(JSON.parse(accountSession).authMode, 'cookie');
  const otherTab = await mobile.newPage();
  await otherTab.goto(signedOutUrl);
  await otherTab.waitForURL(`${web}/app/workspace.html`);
  await otherTab.evaluate(() => window.cpWebStorage.setItem('test-private-tournament', 'first-account-only'));
  failNextLogout({ ok: false }, 200);
  await signOut.click();
  await page.getByRole('status').filter({ hasText: logoutMessage }).waitFor({ timeout: 3000 });
  assert.equal(page.url(), accountUrl);
  assert.equal(await readSession(), accountSession);
  await signOut.click();
  await Promise.all([page.waitForURL(signedOutUrl), otherTab.waitForURL(signedOutUrl)]);
  assert.equal(await readSession(), null);
  assert.equal(await otherTab.evaluate(() => sessionStorage.getItem('cp.desktop-web.session')), null);
  assert.equal(googleCalls.filter(call => call.path === '/api/auth/logout').length, 4);

  await page.goto(accountUrl);
  await page.getByRole('button', { name: 'Second Google fixture account' }).click();
  await page.waitForURL(`${web}/app/workspace.html`);
  await page.goto(accountUrl);
  await page.getByText(secondUser.name, { exact: true }).waitFor();
  assert.equal(await page.locator('#google-auth-section').isVisible(), false);
  await page.getByRole('link', { name: secondTournament.name }).waitFor();
  assert.equal(await page.getByRole('link', { name: tournament.name }).count(), 0);
  await googleCompanion.bringToFront();
  await googleCompanion.evaluate(() => window.dispatchEvent(new Event('focus')));
  await googleCompanion.getByText(secondTournament.name, { exact: true }).waitFor();
  assert.equal(await googleCompanion.getByText(tournament.name, { exact: true }).count(), 0);
  assert.ok(await googleCompanion.evaluate(key => localStorage.getItem(key), draftKey));
  assert.equal(await googleCompanion.evaluate(() => localStorage.getItem('fide_tournament_manager_v2')), null);
  await page.bringToFront();
  await page.locator('#open-workspace-btn').click();
  await page.waitForURL(`${web}/app/workspace.html`);
  assert.notEqual(JSON.parse(await readSession()).scope, JSON.parse(accountSession).scope);
  assert.equal(await page.evaluate(() => window.cpWebStorage.getItem('test-private-tournament')), null);
  const statusOfFirstTournament = await page.evaluate(async url => (await fetch(url)).status, `${api}/api/v1/cloud/tournaments/${tournament.id}`);
  assert.equal(statusOfFirstTournament, 404);
  await page.evaluate(async url => {
    const request = new Request(url, { method: 'POST', body: 'request-body-fixture' });
    const response = await fetch(request);
    if (!response.ok) throw new Error('Cloud request fixture failed');
  }, `${api}/api/v1/cloud/tournaments`);
  assert.ok(googleCalls.some(call => call.path === '/api/v1/cloud/tournaments' &&
    call.method === 'POST' && call.body === 'request-body-fixture'));
  const rewrittenStatus = await page.evaluate(async () => {
    const request = new Request('https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev/api/v1/cloud/tournaments', {
      method: 'POST',
      body: 'request-body-fixture'
    });
    return (await fetch(request)).status;
  });
  assert.equal(rewrittenStatus, 200);
  assert.equal(googleCalls.filter(call => call.path === '/api/v1/cloud/tournaments' && call.method === 'POST').length, 2);

  await page.goto(web);
  await page.getByRole('button', { name: secondUser.name }).click();
  failNextLogout({ ok: false }, 200);
  await signOut.click();
  await page.getByRole('status').filter({ hasText: logoutMessage }).waitFor();
  await signOut.click();
  await page.getByRole('link', { name: 'Sign in', exact: true }).waitFor();
  await mobile.close();

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
  const { promise: delayedGoogleConfig, resolve: finishGoogleConfig } = Promise.withResolvers();
  const { calls: tokenCalls } = await configure(desktop, delayedGoogleConfig);
  const portal = await desktop.newPage();
  await portal.goto(`${web}/app/?cloudTournamentId=${tournament.id}`);
  await portal.getByRole('heading', { name: 'Chess-Publisher Web' }).waitFor();
  assert.equal(await portal.getByLabel('Organizer Token').count(), 0);
  finishGoogleConfig(null);
  await portal.getByText('Google Sign-In is temporarily unavailable.', { exact: false }).waitFor();
  const legacyOpener = `${web}/legacy-companion-fixture`;
  await portal.route(legacyOpener, route => route.fulfill({
    contentType: 'text/html',
    body: `<a href="${companion}/?webHandoff=1&amp;cloudTournamentId=${tournament.id}" target="_blank" rel="opener">Arbiter Companion</a>
    <script>
      window.addEventListener('message', event => {
        if (event.origin === '${companion}' && event.data?.type === 'cp:companion-ready') {
          event.source.postMessage({ type: 'cp:web-organizer-token', token: '${token}' }, event.origin);
        }
      });
    </script>`
  }));
  await portal.goto(legacyOpener);
  const [tokenCompanion] = await Promise.all([
    portal.waitForEvent('popup'),
    portal.getByRole('link', { name: 'Arbiter Companion' }).click()
  ]);
  await checkTournament(tokenCompanion, tokenCalls);
  assert.equal(tokenCompanion.url(), companion + '/');
  assert.equal(await tokenCompanion.evaluate(() => window.opener), null);
  assert.ok(tokenCalls.some(call => call.path.endsWith('/snapshot') && call.origin === companion && call.bearer === `Bearer ${token}`));
  await checkWidth(tokenCompanion);
  const navigation = tokenCompanion.getByRole('navigation', { name: 'Tournament workspace' });
  await navigation.getByRole('button', { name: /Players/ }).click();
  await tokenCompanion.getByRole('heading', { name: 'Player Registration' }).waitFor();
  await navigation.getByRole('button', { name: /Publish/ }).click();
  await tokenCompanion.getByRole('button', { name: 'Publish to Online Hub' }).waitFor();
  await tokenCompanion.getByRole('button', { name: /My tournaments/ }).first().click();
  await tokenCompanion.getByRole('heading', { name: 'My tournaments' }).waitFor();
  await tokenCompanion.getByRole('textbox', { name: 'Search tournaments' }).fill('missing');
  await tokenCompanion.getByText('No tournaments match your search.').waitFor();
  await tokenCompanion.reload();
  await tokenCompanion.getByRole('heading', { name: 'My tournaments' }).waitFor();
  await tokenCompanion.getByRole('button', { name: 'Sign out' }).click();
  await tokenCompanion.getByRole('link', { name: 'Open ChessPublisher Web' }).waitFor();

  const oldToken = await desktop.newPage();
  await oldToken.addInitScript(secret => localStorage.setItem('cpstudio.organizerToken.remembered', secret), token);
  await oldToken.goto(companion);
  await oldToken.getByRole('link', { name: 'Open ChessPublisher Web' }).waitFor();
  assert.equal(await oldToken.evaluate(() => localStorage.getItem('cpstudio.organizerToken.remembered')), null);
  assert.equal(tokenCalls.some(call => call.origin === companion && call.path === '/api/auth/google'), false);
  await desktop.close();
} finally {
  await browser.close();
}

console.log('PASS guest invitation, touch result entry, batch SYNC and corrections, new-round refresh, Web organizer entry, mobile registration and Setup editing, Google sign-out and retry, account switching and Cloud isolation, legacy Companion handoff and navigation.');
