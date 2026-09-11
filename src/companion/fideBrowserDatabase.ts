import initSqlJs, { Database } from 'sql.js';
import { FidePlayerRecord } from '../server/fide/types';
import { generateTransliterationVariants } from '../server/fide/transliteration';

const DATABASE_URL = '/fide/fide_ratings.sqlite';
const MANIFEST_URL = '/fide/fide_latest_manifest.json';
const SQL_WASM_URL = '/vendor/sql-wasm.wasm';
const FIDE_PUBLIC_SEARCH_API = 'https://lichess.org/api/fide/player';
const MIN_TRUSTED_LOCAL_RECORDS = 100000;
const MAX_REMOTE_NAME_VARIANTS = 8;

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
const remoteSearchCache = new Map<string, Promise<FidePlayerRecord[]>>();

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

function isTrustedLocalManifest(manifest: BrowserFideManifest | null) {
  const recordCount = Number(manifest?.recordCount || 0);
  const listVersion = String(manifest?.listVersion || '').trim().toLowerCase();
  const archiveSha256 = String(manifest?.archiveSha256 || '').trim();
  return recordCount >= MIN_TRUSTED_LOCAL_RECORDS && listVersion !== 'bootstrap' && archiveSha256.length === 64;
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

function ratingForTournament(record: FidePlayerRecord, tournamentType: 'Standard' | 'Rapid' | 'Blitz') {
  if (tournamentType === 'Rapid') return Number(record.ratingRapid || 0);
  if (tournamentType === 'Blitz') return Number(record.ratingBlitz || 0);
  return Number(record.ratingStandard || 0);
}

function normalizedNameTokens(value: string) {
  return String(value || '')
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);
}

/**
 * Build equivalent FIDE name queries without requiring the user to know
 * whether the source list stores "Surname, Given" or "Given Surname".
 * Commas are treated as formatting only, never as a search requirement.
 */
export function buildFideNameQueryVariants(query: string): string[] {
  const tokens = normalizedNameTokens(query);
  if (!tokens.length) return [];
  if (tokens.length === 1) return [tokens[0]];

  const variants = new Set<string>();
  const add = (value: string) => {
    const cleaned = value.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
    if (cleaned) variants.add(cleaned);
  };

  add(tokens.join(' '));
  add([...tokens].reverse().join(' '));

  // Treat every token as a possible surname. Keep the remaining given-name
  // tokens in the order typed, and try both comma and no-comma FIDE forms.
  for (let index = 0; index < tokens.length; index += 1) {
    const surname = tokens[index];
    const given = tokens.filter((_, tokenIndex) => tokenIndex !== index).join(' ');
    add(`${surname} ${given}`);
    add(`${surname}, ${given}`);
    if (variants.size >= MAX_REMOTE_NAME_VARIANTS) break;
  }

  return Array.from(variants).slice(0, MAX_REMOTE_NAME_VARIANTS);
}

function normalizePublicFidePlayer(raw: any): FidePlayerRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const fideId = Number(raw.id ?? raw.fideId ?? raw.fide_id ?? 0);
  const name = String(raw.name || '').trim();
  if (!Number.isFinite(fideId) || fideId <= 0 || !name) return null;

  const genderRaw = String(raw.gender || raw.sex || '').trim().toLowerCase();
  const gender = genderRaw === 'm' ? 'm' : (genderRaw === 'f' || genderRaw === 'w' ? 'f' : undefined);
  const year = raw.year ?? raw.birth ?? raw.birthday ?? raw.birth_year;

  return {
    fideId,
    name,
    federation: String(raw.federation ?? raw.country ?? raw.fed ?? '').trim().toUpperCase(),
    title: raw.title ? String(raw.title).trim() : undefined,
    gender,
    birth: year !== undefined && year !== null && String(year).trim() ? String(year).trim() : undefined,
    ratingStandard: Number(raw.standard ?? raw.ratingStandard ?? raw.rating ?? raw.std_rating ?? 0) || 0,
    ratingRapid: Number(raw.rapid ?? raw.ratingRapid ?? raw.rapid_rating ?? 0) || 0,
    ratingBlitz: Number(raw.blitz ?? raw.ratingBlitz ?? raw.blitz_rating ?? 0) || 0
  };
}

async function fetchPublicFideQuery(query: string): Promise<FidePlayerRecord[]> {
  try {
    const numeric = /^\d+$/.test(query);
    const url = numeric
      ? `${FIDE_PUBLIC_SEARCH_API}/${encodeURIComponent(query)}`
      : `${FIDE_PUBLIC_SEARCH_API}?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) return [];
    const payload = await response.json();
    const rawPlayers = Array.isArray(payload) ? payload : [payload];
    return rawPlayers
      .map(normalizePublicFidePlayer)
      .filter((player): player is FidePlayerRecord => Boolean(player));
  } catch {
    return [];
  }
}

async function searchFidePublicMirror(query: string, limit: number): Promise<FidePlayerRecord[]> {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const numeric = /^\d+$/.test(q);
  const nameTokens = numeric ? [] : normalizedNameTokens(q).map(token => token.toLocaleLowerCase());
  const cacheIdentity = numeric
    ? q
    : [...nameTokens].sort((a, b) => a.localeCompare(b)).join(' ');
  const cacheKey = `${cacheIdentity}::${limit}`;
  const cached = remoteSearchCache.get(cacheKey);
  if (cached) return cached;

  const pending = (async () => {
    if (numeric) {
      return (await fetchPublicFideQuery(q)).slice(0, limit);
    }

    const merged = new Map<number, FidePlayerRecord>();
    const variants = buildFideNameQueryVariants(q);

    // Sequential by design. This keeps the public fallback polite while still
    // accepting both Given Surname and Surname Given/Surname, Given input.
    for (const variant of variants) {
      const players = await fetchPublicFideQuery(variant);
      players.forEach(player => merged.set(player.fideId, player));
    }

    return Array.from(merged.values()).slice(0, Math.max(limit, 50));
  })();

  remoteSearchCache.set(cacheKey, pending);
  if (remoteSearchCache.size > 100) {
    const oldestKey = remoteSearchCache.keys().next().value;
    if (oldestKey) remoteSearchCache.delete(oldestKey);
  }
  return pending;
}

function sortAndLimitPlayers(players: FidePlayerRecord[], tournamentType: 'Standard' | 'Rapid' | 'Blitz', limit: number) {
  return players
    .sort((a, b) => {
      const ratingDifference = ratingForTournament(b, tournamentType) - ratingForTournament(a, tournamentType);
      if (ratingDifference !== 0) return ratingDifference;
      if (Number(b.ratingStandard || 0) !== Number(a.ratingStandard || 0)) {
        return Number(b.ratingStandard || 0) - Number(a.ratingStandard || 0);
      }
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    })
    .slice(0, limit);
}

export async function getFideBrowserDatabaseInfo(): Promise<BrowserFideManifest | null> {
  return latestManifest();
}

export async function searchFideBrowserDatabase(query: string, tournamentType: 'Standard' | 'Rapid' | 'Blitz', limit = 20): Promise<FidePlayerRecord[]> {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const manifest = await latestManifest();
  const trustedLocal = isTrustedLocalManifest(manifest);
  const localResults: FidePlayerRecord[] = [];

  try {
    const db = await database();
    const numeric = /^\d+$/.test(q);
    const conditions: string[] = [];
    const bindings: Record<string, string | number> = { ':limit': safeLimit };

    if (numeric) {
      conditions.push('(fide_id = :exact_id OR CAST(fide_id AS TEXT) LIKE :prefix_id)');
      bindings[':exact_id'] = Number(q);
      bindings[':prefix_id'] = `${q}%`;
    } else {
      // Every typed token must occur somewhere in the stored FIDE name.
      // Token order and commas therefore have no semantic meaning locally.
      const tokens = normalizedNameTokens(q);
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

    if (conditions.length) {
      const order = tournamentType === 'Rapid'
        ? 'rating_rapid DESC, rating_standard DESC, name ASC'
        : tournamentType === 'Blitz'
          ? 'rating_blitz DESC, rating_standard DESC, name ASC'
          : 'rating_standard DESC, name ASC';
      const sql = `SELECT fide_id, name, federation, title, gender, birth, rating_standard, rating_rapid, rating_blitz, flag FROM fide_players WHERE ${conditions.join(' AND ')} ORDER BY ${order} LIMIT :limit;`;
      const statement = db.prepare(sql);
      statement.bind(bindings);
      try {
        while (statement.step()) {
          const row = statement.getAsObject();
          localResults.push({
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
    }
  } catch {
    // A missing/corrupt packaged database must not disable player lookup.
  }

  if (trustedLocal && localResults.length > 0) {
    return localResults;
  }

  const remoteResults = await searchFidePublicMirror(q, safeLimit);
  if (!remoteResults.length) return localResults;

  const merged = new Map<number, FidePlayerRecord>();
  if (trustedLocal) {
    localResults.forEach(player => merged.set(player.fideId, player));
    remoteResults.forEach(player => {
      if (!merged.has(player.fideId)) merged.set(player.fideId, player);
    });
  } else {
    localResults.forEach(player => merged.set(player.fideId, player));
    remoteResults.forEach(player => merged.set(player.fideId, player));
  }

  return sortAndLimitPlayers(Array.from(merged.values()), tournamentType, safeLimit);
}

export function resetFideBrowserDatabaseForTests() {
  databasePromise = null;
  manifestPromise = null;
  remoteSearchCache.clear();
}
