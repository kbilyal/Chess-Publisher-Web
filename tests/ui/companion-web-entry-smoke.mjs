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
const portalSource = 'deploy/public-site/desktop-web';
const snapshot = { data: { currentTournament: tournament.name, tournaments: {
  [tournament.name]: createInitialEmptyTournament(tournament.name)
} } };

async function configure(context) {
  let googleSession = false;
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
      '<script src="./host.js"></script><nav id="classicMenuBar"></nav>' });
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
    calls.push({ path, origin, bearer });
    if (path === '/api/auth/me') return reply({ ok: true, authenticated: googleSession, user: googleSession ? user : null });
    if (path === '/api/auth/config') return reply({ googleClientId: 'fixture' });
    if (path === '/api/auth/google' && origin === web) {
      googleSession = true;
      return reply({ ok: true, user });
    }
    if (path === '/api/auth/logout') {
      googleSession = false;
      return reply({ ok: true });
    }
    if (!googleSession && bearer !== `Bearer ${token}`) return reply({ error: 'unauthorized' }, 401);
    if (path.endsWith('/workspace')) return reply({ ok: true, organizer: user });
    if (path.endsWith('/archived')) return reply({ ok: true, tournaments: [] });
    if (path.endsWith('/tournaments')) return reply({ ok: true, tournaments: [tournament] });
    if (path.endsWith('/snapshot')) return reply({ ok: true, tournament, snapshot });
    return reply({ ok: true, tournament });
  });
  return calls;
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
  const googleCalls = await configure(mobile);
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
  await mobile.close();

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
  const tokenCalls = await configure(desktop);
  const portal = await desktop.newPage();
  await portal.goto(`${web}/app/?cloudTournamentId=${tournament.id}`);
  await portal.locator('#legacy-token-details summary').click();
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

console.log('PASS Web-only organizer entry, Google cookie and token handoff, tournament continuation, Companion navigation and responsive layouts.');
