import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const [modules, executablePath, desktopClient, credentials, localBase = 'http://localhost:8789'] = process.argv.slice(2);
if (!modules || !executablePath || !desktopClient || !credentials || !/^http:\/\/localhost:\d+$/.test(localBase)) {
  throw new Error('Specify Playwright directory, browser executable, Desktop Cloud API client, local credentials file, and optional localhost origin.');
}
const { chromium } = createRequire(resolve(modules, 'package.json'))('playwright-core');
const { createClient } = createRequire(import.meta.url)(resolve(desktopClient));
const tokens = JSON.parse(readFileSync(credentials, 'utf8'));
const desktopToken = tokens['local-desktop-a'];
const otherToken = tokens['local-desktop-b'];
assert.ok(desktopToken && otherToken && desktopToken !== otherToken);
const desktop = createClient({ baseUrl: localBase });
const browser = await chromium.launch({ executablePath });
const name = `Local SYNC acceptance ${randomUUID()}`;

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await page.route('**/*', route => new URL(route.request().url()).origin === localBase ? route.continue() : route.abort());
  await page.goto(`${localBase}/app/`);
  await page.locator('#legacy-token-details summary').click();
  await page.getByLabel('Organizer Token').fill(desktopToken);
  await page.getByRole('button', { name: 'Open Workspace' }).click();
  await page.locator('#cpArbiterCompanionBtn').waitFor();
  const title = page.getByRole('textbox', { name: 'Tournament name', exact: true });
  await title.fill(name);
  await title.press('Enter');
  await page.locator('#cpWebCloudSaveStatus').filter({ hasText: 'Saved to private Cloud' }).waitFor();

  const upload = page.waitForResponse(response =>
    response.url().endsWith('/snapshot') && response.request().method() === 'PUT' && response.status() === 201);
  await page.locator('#venue').fill('Web edit');
  await page.locator('#venue').press('Tab');
  await upload;
  await page.evaluate(() => window.cpWebWaitAutosaveIdle());
  const row = (await desktop.listTournaments(desktopToken)).tournaments.find(tournament => tournament.name === name);
  assert.ok(row);
  const web = await desktop.getCurrentSnapshot(desktopToken, row.id);
  assert.equal(web.snapshot.data.tournaments[name].settings.venue, 'Web edit');

  const snapshot = structuredClone(web.snapshot);
  const normalized = snapshot.data.tournaments[name];
  normalized.settings.venue = 'Desktop edit';
  normalized.playerKeySchema ??= 2;
  normalized.pairings.showScheduleOnPrint ??= false;
  normalized.pairings.engine.rankCorrectionNeedsResort ??= false;
  const desktopWrite = await desktop.putSnapshot(desktopToken, { tournamentId: row.id, baseRevision: web.tournament.revision, snapshot });
  assert.equal(desktopWrite.revision, web.tournament.revision + 1);
  assert.equal(desktopWrite.cloudTournamentId, row.id);
  assert.equal(desktopWrite.internalId, row.localKey);

  const sync = () => page.evaluate(() => window.cpWebRunCloudExclusive(() => window.cpCloudSyncUnified()));
  const pull = await sync();
  assert.equal(pull.direction, 'pull');
  assert.equal(await page.locator('#venue').inputValue(), 'Desktop edit');
  const savedBrowser = () => page.evaluate(() => {
    const current = getCurrentTournament();
    return { venue: current.settings.venue, base: current.cloud.baseRevision, content: current.cloud.baseFingerprint };
  });
  const accepted = await savedBrowser();
  assert.equal(accepted.base, desktopWrite.revision);
  assert.ok(accepted.content);

  const sparseSnapshot = structuredClone(snapshot);
  const sparse = sparseSnapshot.data.tournaments[name];
  sparse.settings.venue = 'Sparse snapshot edit';
  delete sparse.playerKeySchema;
  delete sparse.pairings.showScheduleOnPrint;
  delete sparse.pairings.engine.rankCorrectionNeedsResort;
  const sparseWrite = await desktop.putSnapshot(desktopToken, { tournamentId: row.id, baseRevision: accepted.base, snapshot: sparseSnapshot });
  assert.equal(sparseWrite.revision, accepted.base + 1);
  await assert.rejects(sync, /Cloud snapshot changes during browser normalization/);
  assert.deepEqual(await savedBrowser(), accepted);
  assert.equal((await desktop.getCurrentSnapshot(desktopToken, row.id)).tournament.revision, sparseWrite.revision);
  await assert.rejects(desktop.getCurrentSnapshot(otherToken, row.id), { status: 404 });
  await assert.rejects(desktop.putSnapshot(otherToken, { tournamentId: row.id, baseRevision: sparseWrite.revision, snapshot }), { status: 404 });
  console.log(`Local runtime PASS. Web r${web.tournament.revision}, Desktop client r${desktopWrite.revision}, sparse r${sparseWrite.revision} retained in Cloud while browser base stayed at r${accepted.base}.`);
} finally {
  await browser.close();
}
