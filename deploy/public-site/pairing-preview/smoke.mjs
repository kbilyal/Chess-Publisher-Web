import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const [url, modules, executablePath, fixture] = process.argv.slice(2);
const { chromium } = createRequire(`${modules}/package.json`)('playwright-core');
const browser = await chromium.launch({ executablePath });
const hub = 'https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev/api/v1/cloud/workspace';
const live = new URL(url).protocol === 'https:';
const allowed = 'ci-synthetic-organizer';
const invalid = 'ci-invalid-public-pairing-token';
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 890 } });
    const uploads = [];
    const errors = [];
    page.on('request', request => {
      if (request.method() === 'GET') return;
      const target = new URL(request.url());
      const cloudflareTiming = target.origin === new URL(url).origin &&
        target.pathname === '/cdn-cgi/rum' && !request.postData()?.includes('ChessPublisher integration test');
      if (!cloudflareTiming) uploads.push(request.url());
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('requestfailed', request => errors.push(`${request.url()} ${request.failure()?.errorText}`));
    page.on('response', response => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.route(hub, async route => {
      const request = route.request();
      const headers = {
        'access-control-allow-origin': new URL(url).origin,
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'Authorization'
      };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const token = (await request.allHeaders()).authorization;
      if (token === `Bearer ${allowed}`) {
        return route.fulfill({ status: 200, headers, json: { ok: true, organizer: { displayName: 'CI' } } });
      }
      if (live) return route.continue();
      return route.fulfill({ status: 401, headers, json: { ok: false } });
    });
    await page.goto(url);
    const login = page.getByRole('button', { name: 'Вход', exact: true });
    const tokenInput = page.getByLabel('Organizer Token');
    const demo = page.getByRole('button', { name: 'Пробвай с пример' });
    assert.equal(await demo.isVisible(), false);
    await tokenInput.fill(invalid);
    await login.click();
    await page.getByText('Organizer Token е невалиден или достъпът е отнет.').waitFor();
    assert.equal(await demo.isVisible(), false);
    await tokenInput.fill(allowed);
    await login.click();
    await demo.waitFor();
    assert.equal(await tokenInput.inputValue(), '');
    assert.equal(await page.evaluate(() =>
      JSON.stringify(localStorage).includes('ci-synthetic-organizer') ||
      JSON.stringify(sessionStorage).includes('ci-synthetic-organizer')
    ), false);
    await demo.click();
    try {
      await page.getByRole('heading', { name: 'Двойки за преглед' }).waitFor({ timeout: 45_000 });
    } catch (error) {
      throw new Error(`Preview failed: ${await page.locator('#status').textContent()}; ${errors.join('; ')}`, { cause: error });
    }
    assert.deepEqual(await page.locator('tbody tr').allTextContents(), ['115', '262', '337', '484']);
    await page.getByLabel('TRF файл').setInputFiles({
      name: 'test.trf', mimeType: 'text/plain', buffer: await readFile(fixture)
    });
    await page.getByLabel('Цвят на първия играч').selectOption('B');
    await page.getByRole('button', { name: 'Изчисли жребий' }).click();
    await page.getByRole('heading', { name: 'Двойки за преглед' }).waitFor();
    assert.deepEqual(await page.locator('tbody tr').allTextContents(), ['151', '226', '373', '448']);
    assert.match(await page.locator('#details').textContent(), /Gacrux 1\.11\.65/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(uploads, []);
    await page.getByRole('button', { name: 'Изход' }).click();
    await login.waitFor();
    assert.equal(await demo.isVisible(), false);
    assert.equal(await page.locator('tbody tr').count(), 0);
    await page.close();
    console.log(`Organizer login, local TRF and logout confirmed at ${width}px`);
  }
} finally {
  await browser.close();
}
