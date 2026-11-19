import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const [url, modules, executablePath, fixture] = process.argv.slice(2);
const { chromium } = createRequire(`${modules}/package.json`)('playwright-core');
const browser = await chromium.launch({ executablePath });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 890 } });
    const uploads = [];
    const errors = [];
    page.on('request', request => {
      if (request.method() !== 'GET') uploads.push(request.url());
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.getByRole('button', { name: 'Пробвай с пример' }).click();
    try {
      await page.getByRole('heading', { name: 'Двойки за преглед' }).waitFor({ timeout: 45_000 });
    } catch (error) {
      throw new Error(`Preview failed: ${await page.getByRole('status').textContent()}; ${errors.join('; ')}`, { cause: error });
    }
    assert.deepEqual(await page.locator('tbody tr').allTextContents(), ['115', '262', '337', '484']);
    await page.getByLabel('TRF файл').setInputFiles({
      name: 'test.trf', mimeType: 'text/plain', buffer: await readFile(fixture)
    });
    await page.getByRole('button', { name: 'Изчисли жребий' }).click();
    await page.getByRole('heading', { name: 'Двойки за преглед' }).waitFor();
    assert.match(await page.locator('#details').textContent(), /Gacrux 1\.11\.65/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(uploads, []);
    await page.close();
    console.log(`Browser pairing demo and local file confirmed at ${width}px`);
  }
} finally {
  await browser.close();
}
