export interface FidePlayerRecord {
  fideId: number;
  name: string;
  federation: string;
  title?: string;
  gender?: 'm' | 'f' | 'w';
  birth?: string;
  ratingStandard: number;
  ratingRapid: number;
  ratingBlitz: number;
  flag?: string;
}

export interface FideDatabaseMetadata {
  listVersion: string; // e.g. "2026-09"
  listDate: string; // e.g. "2026-09-01"
  downloadedAt: string; // ISO timestamp
  source: string;
  recordCount: number;
  sha256: string;
  importStatus: 'IDLE' | 'DOWNLOADING' | 'PARSING' | 'INDEXING' | 'VALIDATING' | 'READY' | 'FAILED';
  lastError?: string | null;
}

export interface FideStatusResponse {
  configured: boolean;
  databaseAvailable: boolean;
  listVersion: string | null;
  listDate: string | null;
  downloadedAt: string | null;
  recordCount: number;
  source: string | null;
  sha256: string | null;
  updateInProgress: boolean;
  offlineFallback: boolean;
  lastError: string | null;
}

export interface FideSearchParams {
  query: string;
  federation?: string;
  limit?: number;
}
