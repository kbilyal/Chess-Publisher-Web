import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const [url, modules, executablePath] = process.argv.slice(2);
const { chromium } = createRequire(`${modules}/package.json`)('playwright-core');
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
const origin = new URL(url).origin;
const search = '#fideSearch';
const results = '#fideResults';

try {
  const user = { id: 'usr_fide_ci', email: 'fide-ci@example.com', name: 'FIDE CI', organizerId: 'ci-fide-organizer' };
  await page.addInitScript(({ user: u, scope }) => {
    if (!sessionStorage.getItem('cp.desktop-web.session')) {
      sessionStorage.setItem('cp.desktop-web.session', JSON.stringify({ authMode: 'cookie', scope, user: u }));
    }
  }, { user, scope: 'f'.repeat(64) });
  await page.route('https://accounts.google.com/**', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
  );
  const handleApiRoute = route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type, X-Client-Version, X-Expected-Revision, X-Expected-Organizer'
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/auth/me') {
      return route.fulfill({ json: { ok: true, authenticated: true, user }, headers });
    }
    return route.fulfill({
      json: { ok: true, organizer: { id: 'ci-fide-organizer', displayName: 'FIDE CI' }, tournaments: [] },
      headers
    });
  };
  await page.route('https://api.chess-publisher.org/**', handleApiRoute);
  await page.route('https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev/**', handleApiRoute);
  const directoryRequests = [];
  await page.route('https://lichess.org/api/fide/player/*', route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1);
    directoryRequests.push(id);
    return route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: { id: 1503014, name: 'Carlsen, Magnus', federation: 'NOR', gender: 'M', year: 1990, title: 'GM', standard: 2819, rapid: 2801, blitz: 2860 },
    });
  });
  await page.goto(new URL('workspace.html', url).href);
  const name = page.getByRole('textbox', { name: 'Tournament name', exact: true });
  await name.fill('FIDE lookup test');
  await name.press('Enter');
  await page.locator('#createScreen').waitFor({ state: 'hidden' });
  await page.locator('#tabRegistration').click();
  assert.equal(await page.evaluate(() => {
    cpBeta98.installSearchIntegration();
    return window.queueFideSearch === cpBeta98R7.queueUnifiedSearch;
  }), true, 'The startup retry must leave the unified renderer in charge.');

  async function type(query) {
    await page.locator(search).fill(query);
  }

  await type('Carlsen');
  await page.locator(results).filter({ hasText: 'No player found' }).waitFor({ state: 'attached' });

  assert.deepEqual(await page.evaluate(async () => {
    const config = cpBeta98R7.readConfig();
    cpBeta98R7.saveConfig({ ...config, directory: false });
    try { return await cpBeta98R7.unifiedSearch('1503014'); }
    finally { cpBeta98R7.saveConfig(config); }
  }), [], 'Respect the setting that excludes the online directory.');
  assert.deepEqual(directoryRequests, []);

  await type('1503014');
  await page.locator(results).filter({ hasText: 'FIDE Standard: 2819' }).waitFor({ state: 'attached' });
  assert.deepEqual(directoryRequests, ['1503014']);
  assert.deepEqual(await page.evaluate(() => cpBeta98R7.unifiedSearch('123456789')), [], 'The directory must return the requested ID.');
  await type('Carlsen');
  await page.locator(results).filter({ hasText: 'No player found' }).waitFor({ state: 'attached' });

  const updated = await page.evaluate(async () => {
    const row = (id, name, rating) =>
      String(id).padEnd(15) + name.padEnd(61) + `NOR M GM ${rating} 0 10 1990`;
    const fillers = Array.from({ length: 5100 }, (_, i) => row(3000000 + i, `Test player ${i}`, 1600));
    const list = rating => ['ID Name', ...fillers, row(1503014, 'Carlsen, Magnus', rating)].join('\n');
    return cpBeta72RatingLists.updateRatingLists({
      manual: false,
      stagedTexts: { std: list(2823), rapid: list(2801), blitz: list(2860) },
    });
  });
  assert.equal(updated, true);
  await page.locator(results).filter({ hasText: 'Carlsen, Magnus' }).waitFor({ state: 'attached' });
  await type('1503014');
  await page.locator(results).filter({ hasText: 'FIDE Standard: 2823' }).waitFor({ state: 'attached' });
  assert.deepEqual(directoryRequests, ['1503014', '123456789'], 'Use the active monthly list when it has the exact ID.');

  const saved = await page.evaluate(async () => {
    const db = await openFideCacheDb();
    const activeKey = 'rating-lists:active-generation:v3';
    const cache = window.cpWebFideCache;
    const read = key => cache.read(db, FIDE_CACHE_STORE, key);
    const active = await read(activeKey);
    // Deliberately fail in the second chunk of a new write after the first was queued.
    const rows = Array.from({ length: 5001 }, () => ({ fideId: '1503014' }));
    rows.at(-1).invalid = () => {};
    let rejected;
    try {
      await cache.write(db, FIDE_CACHE_STORE, 'failed-update', { rows }, {
        key: activeKey,
        pointer: { generationKey: 'failed-update' },
      });
    } catch (error) {
      rejected = error.name;
    }
    const previousFormat = { generationId: 'legacy-test', rows: [{ fideId: '1503014' }] };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(FIDE_CACHE_STORE, 'readwrite');
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      tx.objectStore(FIDE_CACHE_STORE).put(previousFormat, 'legacy-test');
    });
    return {
      rejected,
      abortedGeneration: await read('failed-update'),
      activeAfterFailure: (await read(activeKey)).generationKey,
      activeBeforeFailure: active.generationKey,
      rows: (await read(active.generationKey)).rows.length,
      legacy: await read('legacy-test'),
    };
  });
  assert.equal(saved.rejected, 'DataCloneError');
  assert.equal(saved.abortedGeneration, null);
  assert.equal(saved.activeAfterFailure, saved.activeBeforeFailure);
  assert.equal(saved.rows, 5101);
  assert.deepEqual(saved.legacy, { generationId: 'legacy-test', rows: [{ fideId: '1503014' }] });

  await page.reload();
  await page.locator('#tabRegistration').click();
  await type('Magnus Carlsen');
  await page.locator(results).filter({ hasText: 'Carlsen, Magnus' }).waitFor({ state: 'attached' });
  console.log('Web FIDE search, complete activation, rollback and browser cache restore passed.');
} finally {
  await browser.close();
}
