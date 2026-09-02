import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { FideRatingRepository } from './FideRatingRepository';
import { FideDatabaseMetadata, FidePlayerRecord, FideSearchParams, FideStatusResponse } from './types';
import { OFFICIAL_FIDE_SEED_RECORDS } from './seedFideData';

export class FideRatingService {
  private repository: FideRatingRepository;
  private isUpdating = false;
  private currentProgressStatus: FideDatabaseMetadata['importStatus'] = 'IDLE';
  private lastError: string | null = null;
  private offlineFallback = false;

  // Authoritative server-side configured FIDE rating list endpoint
  private readonly AUTHORITATIVE_FIDE_URL = 'https://ratings.fide.com/download/players_list_xml.zip';
  private readonly MAX_ARCHIVE_SIZE_BYTES = 150 * 1024 * 1024; // 150 MB safety ceiling
  private readonly DOWNLOAD_TIMEOUT_MS = 15000; // 15s timeout

  constructor(repository?: FideRatingRepository) {
    this.repository = repository || new FideRatingRepository();
  }

  public async initialize(): Promise<void> {
    await this.repository.initialize();
  }

  public getStatus(): FideStatusResponse {
    const meta = this.repository.getMetadata();
    const dbAvailable = this.repository.isAvailable();

    return {
      configured: true,
      databaseAvailable: dbAvailable,
      listVersion: meta ? meta.listVersion : null,
      listDate: meta ? meta.listDate : null,
      downloadedAt: meta ? meta.downloadedAt : null,
      recordCount: meta ? meta.recordCount : 0,
      source: meta ? meta.source : this.AUTHORITATIVE_FIDE_URL,
      sha256: meta ? meta.sha256 : null,
      updateInProgress: this.isUpdating,
      offlineFallback: this.offlineFallback,
      lastError: this.lastError
    };
  }

  public search(params: FideSearchParams): FidePlayerRecord[] {
    if (!this.repository.isAvailable()) {
      return [];
    }
    return this.repository.searchPlayers(params);
  }

  public getPlayer(fideId: number): FidePlayerRecord | null {
    if (!this.repository.isAvailable()) {
      return null;
    }
    return this.repository.getPlayerByFideId(fideId);
  }

  /**
   * Safe, Transactional FIDE Rating-List Update Pipeline.
   */
  public async updateRatingList(options?: {
    customSourceBuffer?: Buffer;
    allowSeedOnNetworkFail?: boolean;
    simulatedVersion?: string;
  }): Promise<{
    success: boolean;
    recordCount: number;
    listVersion: string;
    sha256: string;
    offlineFallback: boolean;
    message?: string;
  }> {
    if (this.isUpdating) {
      throw new Error('UPDATE_ALREADY_IN_PROGRESS: Another FIDE rating database update is currently running.');
    }

    this.isUpdating = true;
    this.currentProgressStatus = 'DOWNLOADING';
    this.lastError = null;

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fide-update-'));

    try {
      let archiveBuffer: Buffer;

      if (options?.customSourceBuffer) {
        archiveBuffer = options.customSourceBuffer;
      } else {
        // Fetch from authoritative FIDE URL
        archiveBuffer = await this.downloadAuthoritativeArchive();
      }

      // Calculate SHA-256 of downloaded archive
      const sha256 = crypto.createHash('sha256').update(archiveBuffer).digest('hex');

      // 2. Parse & Extract in isolated sandbox
      this.currentProgressStatus = 'PARSING';
      const parsedPlayers = await this.extractAndParseArchive(archiveBuffer, tempDir);

      if (parsedPlayers.length === 0) {
        throw new Error('Parsed FIDE rating list contained 0 records. Sanity validation failed.');
      }

      // 3. Metadata calculation
      this.currentProgressStatus = 'INDEXING';
      const now = new Date();
      const yearMonth = options?.simulatedVersion || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const listDate = `${yearMonth}-01`;

      const metadata: FideDatabaseMetadata = {
        listVersion: yearMonth,
        listDate,
        downloadedAt: now.toISOString(),
        source: this.AUTHORITATIVE_FIDE_URL,
        recordCount: parsedPlayers.length,
        sha256,
        importStatus: 'VALIDATING',
        lastError: null
      };

      // 4. Commit to SQLite DB atomically
      this.currentProgressStatus = 'VALIDATING';
      await this.repository.commitNewDatabase(metadata, parsedPlayers);

      this.currentProgressStatus = 'READY';
      this.offlineFallback = false;

      return {
        success: true,
        recordCount: parsedPlayers.length,
        listVersion: yearMonth,
        sha256,
        offlineFallback: false
      };
    } catch (err: any) {
      this.lastError = err.message || String(err);
      this.currentProgressStatus = 'FAILED';

      // If network fails and allowSeedOnNetworkFail is enabled, or if no DB exists,
      // fallback to offline authentic seed data while keeping previous DB if available.
      if (options?.allowSeedOnNetworkFail && !this.repository.isAvailable()) {
        try {
          const now = new Date();
          const yearMonth = options.simulatedVersion || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
          const seedSha = crypto.createHash('sha256').update(JSON.stringify(OFFICIAL_FIDE_SEED_RECORDS)).digest('hex');
          
          await this.repository.commitNewDatabase(
            {
              listVersion: yearMonth,
              listDate: `${yearMonth}-01`,
              downloadedAt: now.toISOString(),
              source: 'FIDE Official Seed Baseline (Offline Fallback)',
              recordCount: OFFICIAL_FIDE_SEED_RECORDS.length,
              sha256: seedSha,
              importStatus: 'READY',
              lastError: null
            },
            OFFICIAL_FIDE_SEED_RECORDS
          );

          this.offlineFallback = true;
          return {
            success: true,
            recordCount: OFFICIAL_FIDE_SEED_RECORDS.length,
            listVersion: yearMonth,
            sha256: seedSha,
            offlineFallback: true,
            message: `Network unavailable; initialized with ${OFFICIAL_FIDE_SEED_RECORDS.length} authentic FIDE master baseline records.`
          };
        } catch (seedErr: any) {
          console.error('[FideRatingService] Offline fallback seed failed:', seedErr);
        }
      }

      if (this.repository.isAvailable()) {
        this.offlineFallback = true;
      }

      throw new Error(`FIDE rating update failed: ${this.lastError}. (Existing database preserved)`);
    } finally {
      this.isUpdating = false;
      // Clean up temporary directory
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (cleanupErr) {
        console.warn('[FideRatingService] Failed to clean tempDir:', cleanupErr);
      }
    }
  }

  private async downloadAuthoritativeArchive(): Promise<Buffer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.DOWNLOAD_TIMEOUT_MS);

    try {
      const response = await fetch(this.AUTHORITATIVE_FIDE_URL, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Chess-Publisher/1.05.01-FideService'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} from FIDE server`);
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > this.MAX_ARCHIVE_SIZE_BYTES) {
        throw new Error(`Archive size exceeds maximum allowed safety threshold of ${this.MAX_ARCHIVE_SIZE_BYTES} bytes.`);
      }

      const arrayBuf = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      if (buffer.length > this.MAX_ARCHIVE_SIZE_BYTES) {
        throw new Error(`Downloaded archive exceeds safety limit: ${buffer.length} bytes.`);
      }

      return buffer;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`FIDE server download timed out after ${this.DOWNLOAD_TIMEOUT_MS}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  public extractAndParseArchive(archiveBuffer: Buffer, tempDir: string): FidePlayerRecord[] {
    const zipPath = path.join(tempDir, 'fide_archive.zip');
    fs.writeFileSync(zipPath, archiveBuffer);

    let zip: AdmZip;
    try {
      zip = new AdmZip(zipPath);
    } catch (err: any) {
      // If not a valid zip, check if buffer is already raw XML
      const text = archiveBuffer.toString('utf-8');
      if (text.includes('<player>') || text.includes('<playerslist>')) {
        return this.parseFideXml(text);
      }
      throw new Error(`Corrupted or invalid ZIP archive: ${err.message}`);
    }

    const zipEntries = zip.getEntries();
    let xmlContent: string | null = null;

    for (const entry of zipEntries) {
      // Prevent path traversal
      if (entry.entryName.includes('..') || path.isAbsolute(entry.entryName)) {
        throw new Error(`Illegal entry name in ZIP archive: ${entry.entryName}`);
      }

      if (entry.entryName.endsWith('.xml') || entry.name.toLowerCase().includes('players')) {
        xmlContent = entry.getData().toString('utf-8');
        break;
      }
    }

    if (!xmlContent) {
      throw new Error('No valid XML player list file found inside FIDE zip archive.');
    }

    return this.parseFideXml(xmlContent);
  }

  public parseFideXml(xmlString: string): FidePlayerRecord[] {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true
    });

    const parsed = parser.parse(xmlString);
    const root = parsed.playerslist || parsed.player_list || parsed.root || parsed;
    let playersRaw = root.player || root.players || [];

    if (!Array.isArray(playersRaw)) {
      playersRaw = [playersRaw];
    }

    const records: FidePlayerRecord[] = [];

    for (const raw of playersRaw) {
      if (!raw || (!raw.fideid && !raw.id && !raw['@_fideid'])) continue;

      const fideIdNum = parseInt(String(raw.fideid || raw.id || raw['@_fideid']), 10);
      if (isNaN(fideIdNum) || fideIdNum <= 0) continue;

      const name = String(raw.name || '').trim();
      if (!name) continue;

      const fed = String(raw.country || raw.federation || raw.fed || '').trim().toUpperCase();
      const title = raw.title || raw.w_title || raw.o_title || undefined;
      const genderRaw = String(raw.sex || raw.gender || '').toLowerCase();
      const gender: 'm' | 'f' | 'w' | undefined = genderRaw === 'm' ? 'm' : genderRaw === 'f' || genderRaw === 'w' ? 'f' : undefined;

      // Preserve exact birth data (e.g. "1990", "1975-03-15", or "1964") without fabricating days/months
      let birth: string | undefined;
      if (raw.birthday !== undefined && raw.birthday !== null && String(raw.birthday).trim() !== '') {
        birth = String(raw.birthday).trim();
      } else if (raw.birth_year !== undefined && raw.birth_year !== null) {
        birth = String(raw.birth_year).trim();
      }

      const ratingStd = parseInt(String(raw.rating || raw.std_rating || '0'), 10) || 0;
      const ratingRapid = parseInt(String(raw.rapid_rating || raw.rapid || '0'), 10) || 0;
      const ratingBlitz = parseInt(String(raw.blitz_rating || raw.blitz || '0'), 10) || 0;
      const flag = raw.flag ? String(raw.flag).trim() : undefined;

      records.push({
        fideId: fideIdNum,
        name,
        federation: fed,
        title: title ? String(title).trim() : undefined,
        gender,
        birth,
        ratingStandard: ratingStd,
        ratingRapid: ratingRapid,
        ratingBlitz: ratingBlitz,
        flag
      });
    }

    return records;
  }
}
