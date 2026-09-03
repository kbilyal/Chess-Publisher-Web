export type FideTitle = 'GM' | 'IM' | 'WGM' | 'FM' | 'WIM' | 'CM' | 'WFM' | 'WCM' | '';
export type Gender = 'm' | 'f' | '';
export type Attendance = 'present' | 'absent' | 'withdrawn';
export type TournamentFormat = 'Individual Swiss' | 'Individual Round Robin';
export type PairingSystem = 'FIDE Dutch System' | 'Round Robin - Berger Tables';
export type RatingType = 'Standard' | 'Rapid' | 'Blitz' | 'Unrated';
export type TabType = 'setup' | 'players' | 'pairings' | 'standings' | 'tiebreaks' | 'schedule' | 'chessresults' | 'export';

export type RoundEntryType = 
  | 'NORMAL_GAME'
  | 'PAB'
  | 'REQUESTED_BYE'
  | 'ZERO_POINT_BYE'
  | 'UNPAIRED'
  | 'ABSENT'
  | 'WITHDRAWN';

export type RoundLifecycleStatus = 
  | 'ROUND_ACTIVE'
  | 'ALL_RESULTS_ENTERED'
  | 'RESULTS_FINALIZED';

export type GameResult = 
  | '-'
  | '1 - 0' 
  | '½ - ½' 
  | '0 - 1' 
  | '1F - 0F' 
  | '0F - 1F' 
  | '0F - 0F' 
  | 'PAB' 
  | '1 BYE' 
  | '½ BYE' 
  | '0 BYE';

export interface Player {
  id: number;
  localKey: string;
  name: string;
  rating: number;
  stdRating?: number;
  rapidRating?: number;
  blitzRating?: number;
  nationalRating?: number;
  fed: string;
  fideId: string;
  birth: string;
  gender: Gender;
  title: FideTitle;
  attendance: Attendance;
  pairingNumber: number;
  joinedFromRound: number;
  fideK?: number;
  nationalId?: string;
  club?: string;
  group?: string;
  group2?: string;
  type?: string;
  ratingSource?: string;
  initialSortOrder?: number;
  isStartingRankLocked?: boolean;
  requestedByes?: Record<string, 'half' | 'zero'>;
}

export interface BoardPairing {
  board: number;
  whiteKey: string;
  blackKey: string;
  result: GameResult;
  entryType?: RoundEntryType;
  pabPoints?: number;
  byePoints?: number;
  fixedWhite?: boolean;
  fixedBlack?: boolean;
  fixedBoardNumber?: number;
  manualLateEntryBye?: boolean;
  manualLateEntryPab?: boolean;
  postPairAdjustment?: string;
  lateEntryByeType?: string;
  trfImportedResult?: string;
  trfOriginalCodes?: {
    white: string;
    black: string;
  };
  trfOriginalCode?: string;
}

export interface RoundHistoryRecord {
  opp: number;
  color: 'w' | 'b' | '-';
  result: string;
  played: boolean;
  kind?: string;
  points?: number;
  lateEntry?: boolean;
}

export interface PlayerRoundState {
  id: number;
  key: string;
  name: string;
  rating: number;
  fed: string;
  fideId: string;
  birth: string;
  gender: string;
  title?: string;
  joinedFromRound: number;
  score: number;
  wins: number;
  gameWins: number;
  blackWins: number;
  blackGames?: number;
  opponents: number[];
  colors: ('w' | 'b')[];
  byeCount: number;
  fullPointUnplayed: number;
  rounds: (RoundHistoryRecord | null)[];
  adjustedScore2026?: number;
  fide2026Elements?: any[];
  fide2026ElementsStandard?: any[];
  fide2026ElementsForfeits?: any[];
  buchholz?: number;
  buchholzCut1?: number;
  buchholzCut2?: number;
  buchholzMedian1?: number;
  buchholzMedian2?: number;
  sonneborn?: number;
  sonnebornCut1?: number;
  sonnebornCut2?: number;
  directEncounter?: number;
  progressive?: number;
  progressiveCut1?: number;
  aro?: number;
  aroCut1?: number;
  tpr?: number;
  ptp?: number;
  apro?: number;
  appo?: number;
  koya?: number;
  matchPoints?: number;
  specialWhiteBlackPoints?: number;
  averageOpponentsBuchholz?: number;
  roundsElectedToPlay?: number;
  opponentRatingSumWithoutOne?: number;
  recursiveRatingPerformance?: number;
  performance?: number;
  armageddon?: number;
  gamesDescending?: number;
  sourcePlayer?: Player;
  reportPoints?: number;
}

export interface TieBreakOptionConfig {
  countForfeits?: boolean;
  validFrom2026?: boolean;
  koyaLimitPercent?: number;
  sgpWhiteWin?: number;
  sgpBlackWin?: number;
  sgpWhiteDraw?: number;
  sgpBlackDraw?: number;
  sgpLoss?: number;
  unratedRating?: number;
  aroDiscardBest?: number;
  aroDiscardWorst?: number;
}

export interface SpecialPrizeRange {
  enabled: boolean;
  name: string;
  from: string;
  to: string;
}

export interface SpecialPrizeConfig {
  ages: string[];
  female: boolean;
  places: number;
  ratingRanges: SpecialPrizeRange[];
}

export interface SpecialPrizeGroupResult {
  name: string;
  kind: string;
  players: PlayerRoundState[];
}

export interface ScheduleRow {
  no: string;
  dateTime: string;
  event: string;
  description: string;
}

export interface TournamentSettings {
  organizer: string;
  chiefArbiter: string;
  arbiter: string;
  director: string;
  tnr: string;
  venue: string;
  city: string;
  country: string;
  timeControl: string;
  timeControlPreset: string;
  customTimeControl: string;
  startDate: string;
  endDate: string;
  generalRegistrationDeadline: string;
  rounds: string;
  lastSwissRounds: string;
  roundRobinCycles: string;
  tournamentFormat: TournamentFormat;
  pairingSystem: PairingSystem;
  fideRated: 'Yes' | 'No';
  tournamentRatingType: RatingType;
  initialRankSorting: 'automatic';
  initialRatingSource: 'fide' | 'fide-national' | 'national-fide' | 'national';
  pairingScoreSystem: string;
  tournamentType: 'real' | 'real-online' | 'test' | 'unknown';
  liveLink: string;
  website: string;
  email: string;
  phone: string;
  fideEventId: string;
  generalNotes: string;
}

export enum TieBreakRuleSet {
  Legacy = 'Legacy',
  FIDE_2026_03 = 'FIDE_2026_03'
}

export interface TournamentRegulations {
  eligibility: string;
  format: string;
  rounds: string;
  timeControl: string;
  pairingSystem: string;
  rating: string;
  defaultTime: string;
  drawRules: string;
  pabPoints: string;
  pointsForDraw?: number;
  tieBreakRuleSet?: TieBreakRuleSet | 'Legacy' | 'FIDE_2026_03' | 'FIDE 2026' | 'Tournament-specific';
  tieBreaks: string[];
  tieBreak1?: string;
  tieBreak2?: string;
  tieBreak3?: string;
  tieBreak4?: string;
  tieBreak5?: string;
  tieBreak6?: string;
  tieBreakOptions: Record<string, TieBreakOptionConfig>;
  entryFee: string;
  registrationDeadline: string;
  maximumPlayers: string;
  fideInfo: string;
  totalPrizeFund: string;
  mainPrizes: string;
  specialPrizes: string;
  categoryPrizes: string;
  additional: string;
  arbiterOverrides?: {
    timestamp: string;
    reason: string;
    previousTieBreaks: string[];
    newTieBreaks: string[];
    previousProfile?: string;
    newProfile?: string;
  }[];
  preserveTieBreakDuplicates?: boolean;
  tunxImportedTieBreakNames?: string[];
  tunxImportedTieBreakRawCodes?: number[];
  tunxImportedTieBreakParameterRecords?: string[];
  tunxSourceTemplateBase64?: string;
  tunxSourceTemplateFileName?: string;
}

export interface PairingEngineConfig {
  mode: string;
  initialTopColor?: 'w' | 'b' | 'auto';
  topColor?: string;
  useWeighted?: boolean;
  excluded: string[];
  lastGeneratedRound: number;
  lastEngineMessage: string;
  excludeRemaining: Record<string, number>;
  excludeRounds: Record<string, number[]>;
  manualByes: Record<string, Record<string, string>>;
  fixedBoards: Record<string, number>;
  roundActivationConfirmed: Record<string, boolean>;
  playerStatusCollapsed: boolean;
  needsResort: boolean;
  registrationsDirty: boolean;
  syncedAbsent: Record<string, boolean>;
  registrationSyncedAt: string;
  registrationSyncedForRound: number;
  registrationSyncedSignature: string;
  firstRoundRegistrationLocked: boolean;
  firstRoundRegistrationSyncedSignature: string;
  firstRoundRegistrationNeedsResort: boolean;
  firstRoundRegistrationSyncedAt: string;
  lastColorCorrection?: any;
  lastCheckerUiState?: string;
  lastCheckerUiMessage?: string;
  lastCheckerUiRound?: number;
  lastIndependentChecker?: any;
  lastTieBreakChecker?: any;
}

export interface ChessResultsState {
  sourceId: number;
  creatorId: number;
  clientId: string;
  key: string;
  mode: string;
  federation: string;
  createdAt: string;
  lastUpload: string;
  uploadStatus: string;
  lastError: string;
  publishCount: number;
  lastConnectionTest: string;
  sidVerified: boolean;
  freshTnrRequired: boolean;
  pinBoardEnabled: boolean;
  pinBoardText: string;
  activityLog: { at: string; type: 'info' | 'ok' | 'warn' | 'error'; message: string }[];
}

export interface Tournament {
  name?: string;
  settings: TournamentSettings;
  telegram: {
    channel: string;
    language: 'bg' | 'en';
    signature: string;
  };
  chessResults: ChessResultsState;
  pairings: {
    server: string;
    round: string;
    results: string;
    showScheduleOnPrint: boolean;
    liveBoards: Record<string, BoardPairing[]>;
    finalStandingsPromptedRound: number;
    standingsLots?: Record<string, number>;
    engine: PairingEngineConfig;
    trfImportMeta?: any;
    finalizedRounds?: Record<string, boolean>;
    roundStatus?: Record<string, RoundLifecycleStatus>;
    finalizedAt?: Record<string, string>;
    finalizedBy?: Record<string, string>;
    finalizedSnapshots?: Record<string, string>;
  };
  schedule: {
    registrationOpens: string;
    registrationCloses: string;
    technicalMeeting: string;
    openingCeremony: string;
    closingCeremony: string;
    awardCeremony: string;
    notes: string;
    rows: ScheduleRow[];
  };
  regulations: TournamentRegulations;
  players: Player[];
  specialPrizeConfig?: SpecialPrizeConfig;
  specialPrizeResult?: {
    year: number;
    places: number;
    groups: SpecialPrizeGroupResult[];
  };
  playerKeySchema?: number;
  dgt?: {
    boardMapping?: {
      tournamentBoard: number;
      physicalId: string;
      serial: string;
      port: string;
      mode: string;
      address: number;
      orientation: string;
      mappedAt: string;
    }[];
  };
}

export interface AppData {
  currentTournament: string;
  tournaments: Record<string, Tournament>;
  preferences: {
    defaultRating: 'std' | 'rapid' | 'blitz';
    sortMode: 'rating' | 'name' | 'birth';
    activeTab: string;
    dgtExpectedBoards?: number;
  };
}

// Test Suite Types
export interface TestCase {
  id: string;
  title: string;
  category: 'fide-dutch' | 'fide-tiebreak' | 'round-robin' | 'trf-compliance' | 'security-recovery' | 'smart-scheduler' | 'architecture';
  description: string;
  fideArticleRef?: string;
  run: () => Promise<{
    passed: boolean;
    message: string;
    details?: string[];
    benchmarkMs?: number;
    actualOutput?: any;
    expectedOutput?: any;
  }>;
}

export interface TestResult {
  id: string;
  passed: boolean;
  message: string;
  details?: string[];
  benchmarkMs?: number;
  timestamp: string;
}
