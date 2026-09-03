import '../types';

declare module '../types' {
  interface Tournament {
    cloud?: {
      schemaVersion?: number;
      internalId?: string;
      localKey?: string;
      cloudTournamentId?: string;
      baseRevision?: number;
      baseFingerprint?: string;
      autoBackup?: boolean;
      lastSyncAt?: string;
      [key: string]: any;
    };
    online?: {
      hubTournamentId?: string;
      publicSlug?: string;
      publicPageUrl?: string;
      revision?: number;
      lastPublishedAt?: string;
      [key: string]: any;
    };
  }
}

export {};
