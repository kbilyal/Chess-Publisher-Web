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
  await page.addInitScript(() => {
    sessionStorage.setItem('cp.desktop-web.session', JSON.stringify({
      scope: 'f'.repeat(64),
      token: 'ci-fide-organizer',
    }));
  });
  const handleApiRoute = route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') {
      return route.fulfill({
        json: { ok: false, authenticated: false },
        headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' }
      });
    }
    return route.fulfill({
      json: { ok: true, organizer: { id: 'ci-fide-organizer' }, tournaments: [] },
      headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' }
    });
  };
  await page.route('https://api.chess-publisher.org/**', handleApiRoute);
  await page.route('https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev/**', handleApiRoute);
  await page.goto(new URL('workspace.html', url).href);
  await page.waitForFunction(() => Boolean(window.cpBeta98R7 && window.cpWebFideCache));

  async function type(query) {
    await page.locator(search).evaluate((input, value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, query);
  }

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
  await type('Magnus Carlsen');
  await page.locator(results).filter({ hasText: 'Carlsen, Magnus' }).waitFor({ state: 'attached' });
  console.log('Web FIDE search, complete activation, rollback and browser cache restore passed.');
} finally {
  await browser.close();
}
