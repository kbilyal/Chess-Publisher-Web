import fs from 'fs';
import path from 'path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { FideDatabaseMetadata, FidePlayerRecord, FideSearchParams } from './types';
import { generateTransliterationVariants } from './transliteration';

let SQL: SqlJsStatic | null = null;

async function getSql(): Promise<SqlJsStatic> {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

export class FideRatingRepository {
  private dbPath: string;
  private prevDbPath: string;
  private db: Database | null = null;
  private metadata: FideDatabaseMetadata | null = null;
  private isLoaded = false;

  constructor(storageDir?: string) {
    const baseDir = storageDir || path.join(process.cwd(), 'data', 'fide');
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.dbPath = path.join(baseDir, 'fide_ratings.sqlite');
    this.prevDbPath = path.join(baseDir, 'fide_ratings_prev.sqlite');
  }

  public async initialize(): Promise<void> {
    if (this.isLoaded) return;
    const SQLInstance = await getSql();

    if (fs.existsSync(this.dbPath)) {
      try {
        const fileBuffer = fs.readFileSync(this.dbPath);
        this.db = new SQLInstance.Database(fileBuffer);
        this.loadMetadataFromDb();
        this.isLoaded = true;
      } catch (err) {
        console.error('[FideRatingRepository] Failed to open existing sqlite file:', err);
        this.db = null;
        this.metadata = null;
      }
    }
  }

  private loadMetadataFromDb(): void {
    if (!this.db) return;
    try {
      const res = this.db.exec("SELECT key, value FROM fide_metadata;");
      if (res.length > 0 && res[0].values) {
        const metaObj: Record<string, string> = {};
        for (const row of res[0].values) {
          metaObj[String(row[0])] = String(row[1]);
        }

        this.metadata = {
          listVersion: metaObj.listVersion || 'UNKNOWN',
          listDate: metaObj.listDate || 'UNKNOWN',
          downloadedAt: metaObj.downloadedAt || new Date().toISOString(),
          source: metaObj.source || 'FIDE Official',
          recordCount: parseInt(metaObj.recordCount || '0', 10),
          sha256: metaObj.sha256 || '',
          importStatus: 'READY',
          lastError: null
        };
      }
    } catch {
      this.metadata = null;
    }
  }

  public isAvailable(): boolean {
    return this.db !== null && this.metadata !== null && this.metadata.recordCount > 0;
  }

  public getMetadata(): FideDatabaseMetadata | null {
    return this.metadata ? { ...this.metadata } : null;
  }

  public getPlayerByFideId(fideId: number): FidePlayerRecord | null {
    if (!this.db) return null;

    try {
      const stmt = this.db.prepare(
        "SELECT fide_id, name, federation, title, gender, birth, rating_standard, rating_rapid, rating_blitz, flag FROM fide_players WHERE fide_id = :id LIMIT 1;"
      );
      stmt.bind({ ':id': fideId });

      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return {
          fideId: Number(row.fide_id),
          name: String(row.name),
          federation: String(row.federation || ''),
          title: row.title ? String(row.title) : undefined,
          gender: row.gender ? (String(row.gender).toLowerCase() as 'm' | 'f' | 'w') : undefined,
          birth: row.birth ? String(row.birth) : undefined,
          ratingStandard: Number(row.rating_standard || 0),
          ratingRapid: Number(row.rating_rapid || 0),
          ratingBlitz: Number(row.rating_blitz || 0),
          flag: row.flag ? String(row.flag) : undefined
        };
      }
      stmt.free();
    } catch (err) {
      console.error('[FideRatingRepository] getPlayerByFideId error:', err);
    }
    return null;
  }

  public getRatingCounts(): {
    standard: number;
    rapid: number;
    blitz: number;
    unrated: number;
    unratedStandard: number;
    unratedRapid: number;
    unratedBlitz: number;
  } {
    if (!this.db) return { standard: 0, rapid: 0, blitz: 0, unrated: 0, unratedStandard: 0, unratedRapid: 0, unratedBlitz: 0 };
    try {
      const stmt = this.db.prepare(
        "SELECT " +
        "SUM(CASE WHEN rating_standard > 0 THEN 1 ELSE 0 END) as std_count, " +
        "SUM(CASE WHEN rating_rapid > 0 THEN 1 ELSE 0 END) as rap_count, " +
        "SUM(CASE WHEN rating_blitz > 0 THEN 1 ELSE 0 END) as blz_count, " +
        "SUM(CASE WHEN (rating_standard = 0 OR rating_standard IS NULL) AND (rating_rapid = 0 OR rating_rapid IS NULL) AND (rating_blitz = 0 OR rating_blitz IS NULL) THEN 1 ELSE 0 END) as unrated_count, " +
        "SUM(CASE WHEN rating_standard = 0 OR rating_standard IS NULL THEN 1 ELSE 0 END) as unrated_std, " +
        "SUM(CASE WHEN rating_rapid = 0 OR rating_rapid IS NULL THEN 1 ELSE 0 END) as unrated_rap, " +
        "SUM(CASE WHEN rating_blitz = 0 OR rating_blitz IS NULL THEN 1 ELSE 0 END) as unrated_blz " +
        "FROM fide_players;"
      );
      let standard = 0;
      let rapid = 0;
      let blitz = 0;
      let unrated = 0;
      let unratedStandard = 0;
      let unratedRapid = 0;
      let unratedBlitz = 0;
      if (stmt.step()) {
        const row = stmt.getAsObject();
        standard = Number(row.std_count || 0);
        rapid = Number(row.rap_count || 0);
        blitz = Number(row.blz_count || 0);
        unrated = Number(row.unrated_count || 0);
        unratedStandard = Number(row.unrated_std || 0);
        unratedRapid = Number(row.unrated_rap || 0);
        unratedBlitz = Number(row.unrated_blz || 0);
      }
      stmt.free();
      return { standard, rapid, blitz, unrated, unratedStandard, unratedRapid, unratedBlitz };
    } catch {
      return { standard: 0, rapid: 0, blitz: 0, unrated: 0, unratedStandard: 0, unratedRapid: 0, unratedBlitz: 0 };
    }
  }

  public searchPlayers(params: FideSearchParams): FidePlayerRecord[] {
    if (!this.db) return [];

    const limit = Math.min(params.limit || 50, 100);
    const q = params.query ? params.query.trim() : '';
    const fed = params.federation ? params.federation.trim().toUpperCase() : null;

    if (!q && !fed && !params.filterRating) return [];

    const results: FidePlayerRecord[] = [];

    try {
      // Check if query is a numeric FIDE ID
      const isNumeric = /^\d+$/.test(q);

      let sql = "SELECT fide_id, name, federation, title, gender, birth, rating_standard, rating_rapid, rating_blitz, flag FROM fide_players WHERE ";
      const conditions: string[] = [];
      const bindParams: Record<string, any> = {};

      if (isNumeric) {
        conditions.push("(fide_id = :exactId OR fide_id LIKE :likeId)");
        bindParams[':exactId'] = parseInt(q, 10);
        bindParams[':likeId'] = `${q}%`;
      } else if (q.length > 0) {
        // Multi-token order-independent search: matches both "First Last" and "Last, First"
        const tokens = q.split(/[\s,]+/).map(t => t.trim()).filter(t => t.length > 0);
        if (tokens.length === 1 && /^\d+$/.test(tokens[0])) {
          conditions.push("(fide_id = :exactId OR fide_id LIKE :likeId)");
          bindParams[':exactId'] = parseInt(tokens[0], 10);
          bindParams[':likeId'] = `${tokens[0]}%`;
        } else if (tokens.length > 0) {
          const tokenConditions: string[] = [];
          tokens.forEach((tok, idx) => {
            const variants = generateTransliterationVariants(tok);
            const variantSubConditions: string[] = [];
            variants.forEach((variant, vIdx) => {
              const paramKey = `:token_${idx}_${vIdx}`;
              if (/^\d+$/.test(variant)) {
                variantSubConditions.push(`(name LIKE ${paramKey} OR fide_id LIKE ${paramKey})`);
              } else {
                variantSubConditions.push(`name LIKE ${paramKey}`);
              }
              bindParams[paramKey] = `%${variant}%`;
            });
            tokenConditions.push(`(${variantSubConditions.join(' OR ')})`);
          });
          conditions.push(`(${tokenConditions.join(' AND ')})`);
        }
      }

      if (fed) {
        conditions.push("federation = :fed");
        bindParams[':fed'] = fed;
      }

      // Rating filter support (All / Rated / Unrated)
      if (params.filterRating === 'unrated') {
        conditions.push("((rating_standard = 0 OR rating_standard IS NULL) AND (rating_rapid = 0 OR rating_rapid IS NULL) AND (rating_blitz = 0 OR rating_blitz IS NULL))");
      } else if (params.filterRating === 'rated') {
        if (params.tournamentType === 'Rapid') {
          conditions.push("rating_rapid > 0");
        } else if (params.tournamentType === 'Blitz') {
          conditions.push("rating_blitz > 0");
        } else if (params.tournamentType === 'Standard') {
          conditions.push("rating_standard > 0");
        } else {
          conditions.push("(rating_standard > 0 OR rating_rapid > 0 OR rating_blitz > 0)");
        }
      }

      if (conditions.length === 0) {
        conditions.push("1 = 1");
      }

      sql += conditions.join(' AND ');

      // Order based on tournament type if provided, prioritizing highest rated in that format
      if (params.tournamentType === 'Rapid') {
        sql += " ORDER BY rating_rapid DESC, rating_standard DESC, name ASC LIMIT :limit;";
      } else if (params.tournamentType === 'Blitz') {
        sql += " ORDER BY rating_blitz DESC, rating_standard DESC, name ASC LIMIT :limit;";
      } else {
        sql += " ORDER BY rating_standard DESC, name ASC LIMIT :limit;";
      }
      bindParams[':limit'] = limit;

      const stmt = this.db.prepare(sql);
      stmt.bind(bindParams);

      while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push({
          fideId: Number(row.fide_id),
          name: String(row.name),
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
      stmt.free();
    } catch (err) {
      console.error('[FideRatingRepository] searchPlayers error:', err);
    }

    return results;
  }

  /**
   * Transactional atomic promotion of parsed FIDE database.
   */
  public async commitNewDatabase(
    metadata: FideDatabaseMetadata,
    players: FidePlayerRecord[]
  ): Promise<void> {
    const SQLInstance = await getSql();
    const tempDb = new SQLInstance.Database();

    // 1. Create Schema
    tempDb.run(`
      CREATE TABLE fide_metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE fide_players (
        fide_id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        federation TEXT,
        title TEXT,
        gender TEXT,
        birth TEXT,
        rating_standard INTEGER,
        rating_rapid INTEGER,
        rating_blitz INTEGER,
        flag TEXT
      );
    `);

    // 2. Insert Metadata
    const insertMeta = tempDb.prepare("INSERT INTO fide_metadata (key, value) VALUES (:key, :value);");
    const metaEntries = [
      ['listVersion', metadata.listVersion],
      ['listDate', metadata.listDate],
      ['downloadedAt', metadata.downloadedAt],
      ['source', metadata.source],
      ['recordCount', String(players.length)],
      ['sha256', metadata.sha256],
      ['importStatus', 'READY']
    ];

    for (const [k, v] of metaEntries) {
      insertMeta.run({ ':key': k, ':value': v });
    }
    insertMeta.free();

    // 3. Batch Insert Players inside SQLite transaction
    tempDb.run("BEGIN TRANSACTION;");
    const insertPlayer = tempDb.prepare(`
      INSERT INTO fide_players (
        fide_id, name, federation, title, gender, birth,
        rating_standard, rating_rapid, rating_blitz, flag
      ) VALUES (
        :fide_id, :name, :federation, :title, :gender, :birth,
        :rating_standard, :rating_rapid, :rating_blitz, :flag
      );
    `);

    for (const p of players) {
      insertPlayer.run({
        ':fide_id': p.fideId,
        ':name': p.name,
        ':federation': p.federation || '',
        ':title': p.title || null,
        ':gender': p.gender || null,
        ':birth': p.birth || null,
        ':rating_standard': p.ratingStandard || 0,
        ':rating_rapid': p.ratingRapid || 0,
        ':rating_blitz': p.ratingBlitz || 0,
        ':flag': p.flag || null
      });
    }
    insertPlayer.free();
    tempDb.run("COMMIT;");

    // 4. Build Indexes for performance
    tempDb.run(`
      CREATE INDEX idx_fide_players_name ON fide_players(name COLLATE NOCASE);
      CREATE INDEX idx_fide_players_fed ON fide_players(federation);
      CREATE INDEX idx_fide_players_std ON fide_players(rating_standard);
    `);

    // 5. Sanity Check
    const countCheck = tempDb.exec("SELECT count(*) as c FROM fide_players;");
    const insertedCount = Number(countCheck[0].values[0][0]);
    if (insertedCount !== players.length) {
      tempDb.close();
      throw new Error(`Sanity check failed: inserted count ${insertedCount} !== expected ${players.length}`);
    }

    // 6. Export Binary and Atomically Swap on Disk
    const data = tempDb.export();
    const buffer = Buffer.from(data);

    // Keep previous valid DB as fallback
    if (fs.existsSync(this.dbPath)) {
      try {
        fs.copyFileSync(this.dbPath, this.prevDbPath);
      } catch (e) {
        console.warn('[FideRatingRepository] Failed to backup previous DB:', e);
      }
    }

    // Write to temp file then rename (atomic in POSIX)
    const tempFilePath = `${this.dbPath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFilePath, buffer);
    fs.renameSync(tempFilePath, this.dbPath);

    // Swap in-memory database reference
    if (this.db) {
      try {
        this.db.close();
      } catch {}
    }

    this.db = tempDb;
    this.metadata = {
      ...metadata,
      recordCount: players.length,
      importStatus: 'READY'
    };
    this.isLoaded = true;
  }

  /**
   * Closes open database descriptors.
   */
  public close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {}
      this.db = null;
    }
    this.isLoaded = false;
  }
}
