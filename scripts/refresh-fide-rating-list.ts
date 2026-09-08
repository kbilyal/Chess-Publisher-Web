import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { FideRatingRepository } from '../src/server/fide/FideRatingRepository';
import { FideRatingService } from '../src/server/fide/FideRatingService';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data', 'fide');
const MANIFEST_PATH = path.join(DATA_DIR, 'fide_latest_manifest.json');
const REPORT_PATH = path.join(DATA_DIR, 'fide_update_report.txt');
const OFFICIAL_DOWNLOAD_PAGE = 'https://ratings.fide.com/download_lists.phtml';
const OFFICIAL_COMBINED_LEGACY = 'https://ratings.fide.com/download/players_list_foa.zip';
const MIN_EXPECTED_RECORDS = Number(process.env.FIDE_MIN_RECORDS || 100000);
const MAX_ARCHIVE_BYTES = 150 * 1024 * 1024;

export interface FideLatestManifest {
  schemaVersion: 1;
  provider: 'FIDE';
  listVersion: string;
  listDate: string;
  versionSource: 'official-download-page' | 'utc-month-fallback';
  downloadedAt: string;
  sourcePage: string;
  sourceArchive: string;
  sourceFormat: 'LEGACY_COMBINED_STD_RPD_BLZ_WITH_UNRATED';
  archiveSha256: string;
  databaseRevision: string;
  recordCount: number;
  standardRatedCount: number;
  rapidRatedCount: number;
  blitzRatedCount: number;
  unratedCount: number;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

export function extractOfficialListVersion(html: string, now = new Date()): {
  listVersion: string;
  listDate: string;
  versionSource: FideLatestManifest['versionSource'];
} {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ');
  const matches = [...text.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/gi)];
  if (matches.length) {
    const latest = matches
      .map(match => ({ month: MONTHS[match[1].toLowerCase()], year: Number(match[2]) }))
      .filter(value => value.month && value.year >= 2020 && value.year <= 2100)
      .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month))[0];
    if (latest) {
      const listVersion = `${latest.year}-${String(latest.month).padStart(2, '0')}`;
      return { listVersion, listDate: `${listVersion}-01`, versionSource: 'official-download-page' };
    }
  }
  const listVersion = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return { listVersion, listDate: `${listVersion}-01`, versionSource: 'utc-month-fallback' };
}

function readManifest(): FideLatestManifest | null {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as FideLatestManifest;
  } catch {
    return null;
  }
}

function curlBuffer(url: string, maxBytes = MAX_ARCHIVE_BYTES): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('curl', [
      '--location', '--fail', '--silent', '--show-error',
      '--connect-timeout', '35', '--max-time', '240',
      '--retry', '2', '--retry-delay', '3', '--retry-all-errors',
      '--user-agent', 'Chess-Publisher-FIDE-List-Updater/1.0',
      url
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    let total = 0;
    let killedForSize = false;

    child.stdout.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        killedForSize = true;
        child.kill('SIGKILL');
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk: Buffer) => errors.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('close', code => {
      if (killedForSize) return reject(new Error(`curl response exceeded ${maxBytes} bytes`));
      if (code !== 0) return reject(new Error(`curl exited ${code}: ${Buffer.concat(errors).toString('utf8').trim() || 'download failed'}`));
      const buffer = Buffer.concat(chunks);
      if (!buffer.length) return reject(new Error('curl returned an empty response'));
      resolve(buffer);
    });
  });
}

async function fetchBuffer(url: string, timeoutMs = 45000): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Chess-Publisher-FIDE-List-Updater/1.0' },
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const length = Number(response.headers.get('content-length') || 0);
      if (length > MAX_ARCHIVE_BYTES) throw new Error(`Archive is too large (${length} bytes)`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > MAX_ARCHIVE_BYTES) throw new Error(`Invalid archive size (${buffer.length} bytes)`);
      return buffer;
    } catch (fetchError: any) {
      console.warn(`[FIDE] Node fetch could not retrieve ${url}: ${fetchError?.message || fetchError}. Retrying with curl transport.`);
      return await curlBuffer(url);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTextWithCurl(url: string): Promise<string> {
  const buffer = await curlBuffer(url, 4 * 1024 * 1024);
  return buffer.toString('utf8');
}

async function fetchVersionInfo(): Promise<ReturnType<typeof extractOfficialListVersion>> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      try {
        const response = await fetch(OFFICIAL_DOWNLOAD_PAGE, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Chess-Publisher-FIDE-List-Updater/1.0' },
          cache: 'no-store'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return extractOfficialListVersion(await response.text());
      } catch (fetchError: any) {
        console.warn(`[FIDE] Node fetch could not read the official list page: ${fetchError?.message || fetchError}. Retrying with curl transport.`);
        return extractOfficialListVersion(await fetchTextWithCurl(OFFICIAL_DOWNLOAD_PAGE));
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: any) {
    console.warn(`[FIDE] Could not read official list heading: ${error?.message || error}. Using UTC month as metadata fallback.`);
    return extractOfficialListVersion('');
  }
}

function writeReport(manifest: FideLatestManifest, changed: boolean) {
  const lines = [
    'Chess-Publisher — FIDE Rating List Update Report',
    '================================================',
    `Status: ${changed ? 'UPDATED' : 'UNCHANGED'}`,
    `Provider: ${manifest.provider}`,
    `List version: ${manifest.listVersion}`,
    `List date: ${manifest.listDate}`,
    `Version source: ${manifest.versionSource}`,
    `Downloaded at: ${manifest.downloadedAt}`,
    `Source: ${manifest.sourceArchive}`,
    `Archive SHA-256: ${manifest.archiveSha256}`,
    `Players: ${manifest.recordCount}`,
    `Standard rated: ${manifest.standardRatedCount}`,
    `Rapid rated: ${manifest.rapidRatedCount}`,
    `Blitz rated: ${manifest.blitzRatedCount}`,
    `Unrated: ${manifest.unratedCount}`,
    '',
    'Tournament data was not modified. Rating-list refresh is an independent data operation.',
    'Existing tournament players are updated only through the explicit FIDE player-sync workflow.',
    ''
  ];
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
}

export async function refreshFideRatingList(): Promise<{ changed: boolean; manifest: FideLatestManifest }> {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log(`[FIDE] Downloading current official combined rating list: ${OFFICIAL_COMBINED_LEGACY}`);
  const [archive, versionInfo] = await Promise.all([
    fetchBuffer(OFFICIAL_COMBINED_LEGACY),
    fetchVersionInfo()
  ]);
  const archiveSha256 = crypto.createHash('sha256').update(archive).digest('hex');
  const previous = readManifest();

  if (previous?.archiveSha256 === archiveSha256 && fs.existsSync(path.join(DATA_DIR, 'fide_ratings.sqlite'))) {
    const unchanged: FideLatestManifest = {
      ...previous,
      listVersion: versionInfo.listVersion,
      listDate: versionInfo.listDate,
      versionSource: versionInfo.versionSource,
      sourcePage: OFFICIAL_DOWNLOAD_PAGE,
      sourceArchive: OFFICIAL_COMBINED_LEGACY
    };
    if (JSON.stringify(unchanged, null, 2) !== JSON.stringify(previous, null, 2)) {
      fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(unchanged, null, 2)}\n`, 'utf8');
    }
    writeReport(unchanged, false);
    console.log(`[FIDE] Official archive unchanged (${archiveSha256.slice(0, 12)}…). Keeping validated SQLite database.`);
    return { changed: false, manifest: unchanged };
  }

  const repository = new FideRatingRepository(DATA_DIR);
  await repository.initialize();
  const service = new FideRatingService(repository);
  const result = await service.updateRatingList({
    customSourceBuffer: archive,
    customSourceName: `${OFFICIAL_COMBINED_LEGACY} (official FIDE combined LEGACY list)`,
    simulatedVersion: versionInfo.listVersion,
    sourceFormat: 'legacy_txt'
  });

  const status = service.getStatus();
  if (!result.success || status.recordCount < MIN_EXPECTED_RECORDS) {
    repository.close();
    throw new Error(`FIDE sanity gate failed: ${status.recordCount} records, expected at least ${MIN_EXPECTED_RECORDS}. Previous database is preserved by the repository transaction.`);
  }
  if (!status.sha256 || status.sha256 !== archiveSha256) {
    repository.close();
    throw new Error('FIDE integrity gate failed: installed database metadata does not match downloaded archive SHA-256.');
  }

  const manifest: FideLatestManifest = {
    schemaVersion: 1,
    provider: 'FIDE',
    listVersion: versionInfo.listVersion,
    listDate: versionInfo.listDate,
    versionSource: versionInfo.versionSource,
    downloadedAt: status.downloadedAt || new Date().toISOString(),
    sourcePage: OFFICIAL_DOWNLOAD_PAGE,
    sourceArchive: OFFICIAL_COMBINED_LEGACY,
    sourceFormat: 'LEGACY_COMBINED_STD_RPD_BLZ_WITH_UNRATED',
    archiveSha256,
    databaseRevision: archiveSha256.slice(0, 20),
    recordCount: status.recordCount,
    standardRatedCount: status.standardRatedCount || 0,
    rapidRatedCount: status.rapidRatedCount || 0,
    blitzRatedCount: status.blitzRatedCount || 0,
    unratedCount: status.unratedCount || 0
  };

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeReport(manifest, true);
  repository.close();

  console.log(`[FIDE] Installed ${manifest.recordCount.toLocaleString('en-US')} players, list ${manifest.listVersion}, SHA ${archiveSha256.slice(0, 12)}…`);
  return { changed: true, manifest };
}

if (import.meta.url === new URL(process.argv[1] || '', 'file:').href) {
  refreshFideRatingList().catch(error => {
    console.error('[FIDE] Latest-list refresh failed:', error);
    process.exitCode = 1;
  });
}
