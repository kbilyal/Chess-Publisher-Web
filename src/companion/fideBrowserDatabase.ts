import initSqlJs, { Database } from 'sql.js';
import { FidePlayerRecord } from '../server/fide/types';
import { generateTransliterationVariants } from '../server/fide/transliteration';

const DATABASE_URL = '/fide/fide_ratings.sqlite';
const MANIFEST_URL = '/fide/fide_latest_manifest.json';
const SQL_WASM_URL = '/vendor/sql-wasm.wasm';

export interface BrowserFideManifest {
  schemaVersion?: number;
  provider?: string;
  listVersion?: string;
  listDate?: string;
  downloadedAt?: string;
  sourceArchive?: string;
  archiveSha256?: string;
  databaseRevision?: string;
  recordCount?: number;
  standardRatedCount?: number;
  rapidRatedCount?: number;
  blitzRatedCount?: number;
  unratedCount?: number;
}

let databasePromise: Promise<Database> | null = null;
let manifestPromise: Promise<BrowserFideManifest | null> | null = null;

async function latestManifest(): Promise<BrowserFideManifest | null> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
        if (!response.ok) return null;
        const value = await response.json();
        return value && typeof value === 'object' ? value as BrowserFideManifest : null;
      } catch {
        return null;
      }
    })();
  }
  return manifestPromise;
}

function revisionedDatabaseUrl(manifest: BrowserFideManifest | null) {
  const revision = String(manifest?.databaseRevision || manifest?.archiveSha256 || '').trim();
  return revision ? `${DATABASE_URL}?v=${encodeURIComponent(revision.slice(0, 64))}` : DATABASE_URL;
}

async function database() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const manifest = await latestManifest();
      const databaseUrl = revisionedDatabaseUrl(manifest);
      const [SQL, response] = await Promise.all([
        initSqlJs({ locateFile: () => SQL_WASM_URL }),
        fetch(databaseUrl, { cache: 'force-cache' })
      ]);
      if (!response.ok) throw new Error(`FIDE database HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return new SQL.Database(bytes);
    })();
  }
  return databasePromise;
}

export async function getFideBrowserDatabaseInfo(): Promise<BrowserFideManifest | null> {
  return latestManifest();
}

export async function searchFideBrowserDatabase(query: string, tournamentType: 'Standard' | 'Rapid' | 'Blitz', limit = 20): Promise<FidePlayerRecord[]> {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const db = await database();
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const numeric = /^\d+$/.test(q);
  const conditions: string[] = [];
  const bindings: Record<string, string | number> = { ':limit': safeLimit };

  if (numeric) {
    conditions.push('(fide_id = :exact_id OR CAST(fide_id AS TEXT) LIKE :prefix_id)');
    bindings[':exact_id'] = Number(q);
    bindings[':prefix_id'] = `${q}%`;
  } else {
    const tokens = q.split(/[\s,]+/).map(token => token.trim()).filter(Boolean);
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
      const variants = [...new Set(generateTransliterationVariants(tokens[tokenIndex]).map(value => value.trim()).filter(Boolean))].slice(0, 8);
      if (!variants.length) continue;
      const variantConditions: string[] = [];
      variants.forEach((variant, variantIndex) => {
        const key = `:token_${tokenIndex}_${variantIndex}`;
        variantConditions.push(`name LIKE ${key}`);
        bindings[key] = `%${variant}%`;
      });
      conditions.push(`(${variantConditions.join(' OR ')})`);
    }
  }

  if (!conditions.length) return [];
  const order = tournamentType === 'Rapid'
    ? 'rating_rapid DESC, rating_standard DESC, name ASC'
    : tournamentType === 'Blitz'
      ? 'rating_blitz DESC, rating_standard DESC, name ASC'
      : 'rating_standard DESC, name ASC';
  const sql = `SELECT fide_id, name, federation, title, gender, birth, rating_standard, rating_rapid, rating_blitz, flag FROM fide_players WHERE ${conditions.join(' AND ')} ORDER BY ${order} LIMIT :limit;`;
  const statement = db.prepare(sql);
  statement.bind(bindings);
  const results: FidePlayerRecord[] = [];
  try {
    while (statement.step()) {
      const row = statement.getAsObject();
      results.push({
        fideId: Number(row.fide_id),
        name: String(row.name || ''),
        federation: String(row.federation || ''),
        title: row.title ? String(row.title) : undefined,
        gender: row.gender ? (String(row.gender).toLowerCase() as 'm' | 'f' | 'w') : undefined,
        birth: row.birth ? String(row.birth) : undefined,
        ratingStandard: Number(row.rating_standard || 0),
        ratingRapid: Number(row.rating_rapid || 0),
        ratingBlitz: Number(row.rating_blitz || 0),
        flag: row.flag ? String(row.flag) : undefined
      });
    }
  } finally {
    statement.free();
  }
  return results;
}

export function resetFideBrowserDatabaseForTests() {
  databasePromise = null;
  manifestPromise = null;
}
