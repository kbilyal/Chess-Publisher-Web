import initSqlJs, { Database } from 'sql.js';
import { FidePlayerRecord } from '../server/fide/types';
import { generateTransliterationVariants } from '../server/fide/transliteration';

const DATABASE_URL = '/fide/fide_ratings.sqlite';
const SQL_WASM_URL = '/vendor/sql-wasm.wasm';
let databasePromise: Promise<Database> | null = null;

async function database() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const [SQL, response] = await Promise.all([
        initSqlJs({ locateFile: () => SQL_WASM_URL }),
        fetch(DATABASE_URL, { cache: 'force-cache' })
      ]);
      if (!response.ok) throw new Error(`FIDE database HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return new SQL.Database(bytes);
    })();
  }
  return databasePromise;
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
}
