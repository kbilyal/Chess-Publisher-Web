import { Tournament, Player, BoardPairing } from '../types';

export type TransactionType =
  | 'RESORT_STARTING_LIST'
  | 'RESET_TOURNAMENT'
  | 'IMPORT_TRF'
  | 'TRF_IMPORT'
  | 'ACCEPT_PAIRINGS'
  | 'FINALIZE_ROUND'
  | 'UNLOCK_ROUND'
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
