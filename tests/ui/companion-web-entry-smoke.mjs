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
const user = { id: 'user-1', organizerId: 'organizer-1', name: 'Test organizer' };
const tournament = { id: 'cloud.example', name: 'Spring Open', localKey: 'test-local', revision: 1 };
const secondUser = { id: 'user-2', organizerId: 'organizer-2', name: 'Second organizer' };
const secondTournament = { id: 'cloud.second', name: 'Autumn Open', localKey: 'test-local', revision: 1 };
const portalSource = 'deploy/public-site/desktop-web';
const snapshot = { data: { currentTournament: tournament.name, tournaments: {
  [tournament.name]: createInitialEmptyTournament(tournament.name)
} } };

async function configure(context, googleClientId = Promise.resolve('fixture')) {
  let googleSession;
  let logoutFailure;
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
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ path: 'dist/index.html' });
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
    const { origin, authorization: bearer } = await request.allHeaders();
    const headers = {
      'access-control-allow-origin': origin || web,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET, OPTIONS, POST',
      'access-control-allow-headers': 'Authorization, Content-Type'
    };
    const reply = (json, status = 200) => route.fulfill({ headers, json, status });
    if (request.method() === 'OPTIONS') return route.fulfill({ headers, status: 204 });
    calls.push({ path, origin, bearer, method: request.method(), body: request.postData() });
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
    if (!googleSession && bearer !== `Bearer ${token}`) return reply({ error: 'unauthorized' }, 401);
    const organizer = googleSession || user;
    const owned = organizer === secondUser ? secondTournament : tournament;
    if (path.endsWith('/workspace')) return reply({ ok: true, organizer });
    if (path.endsWith('/archived')) return reply({ ok: true, tournaments: [] });
    if (path.endsWith('/tournaments')) return reply({ ok: true, tournaments: [owned] });
    if (path.startsWith('/api/v1/cloud/tournaments/') && !path.split('/').includes(owned.id)) {
      return reply({ ok: false, error: 'not_found' }, 404);
    }
    if (path.endsWith('/snapshot')) return reply({ ok: true, tournament, snapshot });
    return reply({ ok: true, tournament });
  });
  return { calls, failNextLogout: (json, status) => { logoutFailure = { json, status }; } };
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

try {
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
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

  const readSession = () => page.evaluate(() => sessionStorage.getItem('cp.desktop-web.session'));
  const activeWorkspace = `${web}/app/workspace.html?cloudTournamentId=${tournament.id}`;
  const accountUrl = `${web}/app/?account=1`;
  const signedOutUrl = `${web}/app/`;
  const logoutMessage = 'Could not sign out. Please try again.';
  const signOut = page.getByRole('button', { name: 'Sign Out', exact: true });

  await page.locator('#open-workspace-btn').click();
  await page.waitForURL(activeWorkspace);
  const workspaceSession = await readSession();
  assert.equal(JSON.parse(workspaceSession).authMode, 'cookie');
  failNextLogout({ ok: false, error: 'unavailable' }, 503);
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
  await page.getByText(secondUser.name, { exact: true }).waitFor();
  assert.equal(await page.locator('#google-auth-section').isVisible(), false);
  await page.getByRole('link', { name: secondTournament.name }).waitFor();
  assert.equal(await page.getByRole('link', { name: tournament.name }).count(), 0);
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
  await portal.locator('#legacy-token-details summary').click();
  await portal.getByLabel('Organizer Token').fill('fixture-invalid-token');
  await portal.getByRole('button', { name: 'Open Workspace' }).click();
  const tokenError = portal.getByText('The Organizer Token is invalid or access was revoked.');
  await tokenError.waitFor();
  finishGoogleConfig(null);
  await portal.getByText('Google Sign-In is unavailable.', { exact: false }).waitFor();
  assert.equal(await tokenError.isVisible(), true);
  await portal.getByLabel('Organizer Token').fill(token);
  await portal.getByRole('button', { name: 'Open Workspace' }).click();
  await portal.waitForURL(`${web}/app/workspace.html?cloudTournamentId=${tournament.id}`);
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

console.log('PASS Web organizer entry, Google sign-out and retry, account switching and Cloud isolation, token handoff and Companion navigation.');
