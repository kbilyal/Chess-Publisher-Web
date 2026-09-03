import { Tournament, Player, BoardPairing } from '../types';

export type TransactionType =
  | 'RESORT_STARTING_LIST'
  | 'RESET_TOURNAMENT'
  | 'IMPORT_TRF'
  | 'TRF_IMPORT'
  | 'ACCEPT_PAIRINGS'
  | 'FINALIZE_ROUND'
  | 'UNLOCK_ROUND'
  | 'FIDE_PLAYER_SYNC'
  | 'PLAYER_BULK_OPERATION'
  | 'PLAYER_MUTATION'
  | 'CUSTOM';

export type TransactionStatus =
  | 'PREPARED'
  | 'VALIDATED'
  | 'PREVIEW'
  | 'COMMITTED'
  | 'ROLLED_BACK'
  | 'CANCELLED'
  | 'FAILED';

export interface TransactionRecord<T = Tournament> {
  transactionId: string;
  type: TransactionType;
  startedAt: string;
  completedAt?: string;
  status: TransactionStatus;
  snapshotHash: string;
  beforeState: T;
  afterState?: T;
  error?: string;
  metadata?: Record<string, any>;
}

export interface RankChange {
  playerId: number;
  playerName: string;
  fideId?: string;
  title?: string;
  rating: number;
  oldRank: number;
  newRank: number;
  changed: boolean;
}

export interface ResortDiffReport {
  totalPlayers: number;
  affectedCount: number;
  rankChanges: RankChange[];
  hasRoundsStarted: boolean;
  roundCount: number;
  canCommitDirectly: boolean;
  requiresForceResort: boolean;
  blockReason?: string;
}

export type ResetMode = 'FULL_RESET' | 'CLEAR_PAIRINGS_ONLY' | 'LOAD_SAMPLE';

export interface ResetDiffReport {
  mode: ResetMode;
  targetName: string;
  playersToDeleteCount: number;
  pairingsToDeleteRounds: number;
  liveBoardsToDeleteCount: number;
  settingsPreserved: boolean;
  playersPreserved: boolean;
}

export interface MetadataChange {
  field: string;
  oldValue: string;
  newValue: string;
}

export interface PlayerAttributeChange {
  playerName: string;
  fideId?: string;
  field: 'rating' | 'title' | 'fed' | 'birth' | 'fideId';
  oldValue: string | number;
  newValue: string | number;
}

export interface TrfConflictReport {
  valid: boolean;
  validationErrors: string[];
  validationWarnings: string[];
  metadataChanges: MetadataChange[];
  addedPlayers: { name: string; rating: number; title?: string; fideId?: string }[];
  removedPlayers: { name: string; rating: number; title?: string; fideId?: string }[];
  changedPlayerAttributes: PlayerAttributeChange[];
  roundsDifference: {
    currentRounds: number;
    importedRounds: number;
  };
  byesDifference: {
    currentByesCount: number;
    importedByesCount: number;
  };
}

export type FideSyncField =
  | 'name'
  | 'fideId'
  | 'fed'
  | 'title'
  | 'ratingStandard'
  | 'ratingRapid'
  | 'ratingBlitz'
  | 'birth';

export interface FidePlayerFieldDiff {
  field: FideSyncField;
  label: string;
  oldValue: string | number;
  newValue: string | number;
  selected: boolean;
}

export type FidePlayerSyncStatus = 'UNCHANGED' | 'CHANGED' | 'UNMATCHED' | 'DUPLICATE_FIDE_ID';

export interface FideAuthoritativeSnapshot {
  fideId: number;
  name: string;
  federation: string;
  title?: string;
  ratingStandard: number;
  ratingRapid: number;
  ratingBlitz: number;
  birth?: string;
}

export interface FidePlayerDiffItem {
  playerId: number;
  playerKey: string;
  currentName: string;
  currentFideId: string;
  fideMatchedId?: number;
  status: FidePlayerSyncStatus;
  warning?: string;
  diffs: FidePlayerFieldDiff[];
  selected: boolean;
  authoritativeRecord?: FideAuthoritativeSnapshot;
}

export interface FideSyncDiffReport {
  totalPlayers: number;
  matchedCount: number;
  unchangedCount: number;
  changedCount: number;
  unmatchedCount: number;
  duplicateCount: number;
  startingListOutdated: boolean;
  tournamentRatingType: 'Standard' | 'Rapid' | 'Blitz' | 'Unrated';
  players: FidePlayerDiffItem[];
  databaseMetadata?: {
    listVersion: string | null;
    listDate: string | null;
    recordCount: number;
    databaseAvailable: boolean;
  };
}

export interface FidePlayerSyncSelection {
  playerKey: string;
  selectedFields: FideSyncField[];
}

export interface PlayerBulkOperationReport {
  operation: 'STATUS_CHANGE' | 'FEDERATION_CHANGE' | 'DELETE';
  totalSelected: number;
  affectedCount: number;
  blockedCount: number;
  blockedDetails?: { playerKey: string; playerName: string; reason: string }[];
  snapshotHash?: string;
}

export interface PlayerHistoryCheckResult {
  hasHistory: boolean;
  playedGamesCount: number;
  byesCount: number;
  roundsWithPairings: number[];
  reasons: string[];
}

