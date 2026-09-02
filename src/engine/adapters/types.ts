import { Player, BoardPairing, PlayerRoundState, Tournament } from '../../types';

export interface PairingEngineResult {
  round: number;
  boards: BoardPairing[];
  unpairedKeys: string[];
  pabKey?: string;
  ruleLog: string[];
  engine: {
    id: string;
    name: string;
    version: string;
    authoritative: boolean;
    engineType: 'authoritative_gacrux' | 'prototype';
  };
  auditRecordId?: string;
  executionDurationMs?: number;
}

export interface PairingEngineAdapter {
  id: string;
  name: string;
  version: string;
  authoritative: boolean;
  isAvailable(): Promise<boolean>;
  generatePairing(
    tournament: Tournament,
    round: number,
    options?: {
      manualByes?: Record<string, string>;
      excludedKeys?: string[];
      fixedBoards?: Record<string, number>;
      initialTopColor?: 'w' | 'b';
      pabPoints?: number;
    }
  ): Promise<PairingEngineResult>;
}

export type CheckerStatus = 'PASS' | 'FAIL' | 'CHECKER_NOT_CONFIGURED' | 'CHECKER_UNSUPPORTED_FEATURE' | 'BYPASSED_DEV';

export interface PairingViolation {
  code: string;
  severity: 'CRITICAL_FAIL' | 'WARNING' | 'INFO';
  fideArticle?: string;
  board?: number;
  players?: string[];
  message: string;
}

export interface PairingCheckResult {
  status: CheckerStatus;
  passed: boolean;
  checker: {
    id: string;
    name: string;
    version: string;
    authoritative: boolean;
  };
  round: number;
  timestamp: string;
  violations: PairingViolation[];
  warnings: PairingViolation[];
  diagnostics: {
    totalBoards: number;
    totalPlayers: number;
    colorAllocationIssues: number;
    repeatOpponentIssues: number;
    scoreGroupIssues: number;
    floatIssues: number;
    byeIssues: number;
  };
}

export interface PairingCheckerAdapter {
  id: string;
  name: string;
  version: string;
  authoritative: boolean;
  isAvailable(): Promise<boolean>;
  check(
    tournament: Tournament,
    proposedBoards: BoardPairing[],
    round: number
  ): Promise<PairingCheckResult>;
}

export interface TieBreakCheckResult {
  status: 'PASS' | 'FAIL' | 'TIEBREAK_CHECKER_NOT_CONFIGURED';
  passed: boolean;
  checker: {
    id: string;
    name: string;
    version: string;
  };
  timestamp: string;
  details: string;
}

export interface TieBreakCheckerAdapter {
  id: string;
  name: string;
  version: string;
  authoritative: boolean;
  isAvailable(): Promise<boolean>;
  verifyStandings(tournament: Tournament): Promise<TieBreakCheckResult>;
}

export interface TrfValidationResult {
  status: 'VALID' | 'INVALID' | 'TRF_VALIDATOR_NOT_CONFIGURED';
  valid: boolean;
  validator: {
    id: string;
    name: string;
    version: string;
  };
  timestamp: string;
  issues: { line?: number; code: string; message: string; severity: 'ERROR' | 'WARNING' }[];
}

export interface TrfValidatorAdapter {
  id: string;
  name: string;
  version: string;
  authoritative: boolean;
  isAvailable(): Promise<boolean>;
  validateTrf(trfContent: string): Promise<TrfValidationResult>;
}

export interface EngineExecutionRecord {
  requestId: string;
  tournamentId: string;
  round: number;
  timestamp: string;
  engineId: string;
  engineName: string;
  engineVersion: string | null;
  authoritative: boolean;
  upstreamRepository?: string;
  upstreamCommit?: string;
  invokedCommandLine?: string;
  platform: string;
  inputFormat: string;
  inputHash: string;
  inputDigest?: string;
  outputDigest?: string;
  input: string;
  startedAt: string;
  finishedAt: string;
  executionDurationMs: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  parsedResult: any | null;
  checkerResult?: PairingCheckResult | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface EngineAuditRecord {
  id: string;
  tournamentId: string;
  round: number;
  timestamp: string;
  engine: {
    id: string;
    name: string;
    version: string;
    authoritative: boolean;
  };
  engineInput: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  parsedPairingResult: BoardPairing[] | null;
  checkerResult?: PairingCheckResult | null;
  acceptanceStatus: 'pending' | 'accepted' | 'rejected';
}

export interface RoundEngineMetadata {
  engine: {
    id: string;
    name: string;
    version: string;
    authoritative: boolean;
    engineType: 'authoritative_gacrux' | 'prototype';
  };
  checker: {
    id: string;
    name: string;
    version: string;
    status: CheckerStatus;
  };
  generatedAt: string;
  acceptedAt?: string;
  auditRecordId?: string;
}
