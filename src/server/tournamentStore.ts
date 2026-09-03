import fs from 'fs';
import path from 'path';
import { Tournament, BoardPairing } from '../types';
import { createInitialEmptyTournament } from '../data/initialData';
import { 
  validateTournamentHardInvariants, 
  sanitizeTournamentHardInvariants, 
  determineBoardEntryType,
  validateRoundForFinalization
} from '../engine/roundEntryValidator';
import { calculateTournamentStandings } from '../engine/tiebreaks';

export interface PendingDraftPairing {
  round: number;
  tournamentId: string;
  boards: BoardPairing[];
  unpairedKeys: string[];
  pabKey?: string;
  gacruxSuccess: boolean;
  bbpStatus: string;
  bbpPassed: boolean;
  engineMetadata: {
    id: string;
    name: string;
    version: string;
    authoritative: boolean;
  };
  ruleLog: string[];
  createdAt: string;
}

export class TournamentStore {
  private storageFilePath: string;
  private currentTournament: Tournament;
  private pendingDrafts: Map<number, PendingDraftPairing> = new Map();
  private simulateWriteFailure: boolean = false;

  constructor(customStoragePath?: string) {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch {}
    }
    this.storageFilePath = customStoragePath || path.join(dataDir, 'official_tournament_state.json');
    this.currentTournament = this.loadFromDisk();
  }

  public setSimulateWriteFailure(fail: boolean) {
    this.simulateWriteFailure = fail;
  }

  private loadFromDisk(): Tournament {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('[TournamentStore] Error loading tournament from disk:', e);
    }
    const init = createInitialEmptyTournament('Official FIDE Dutch Championship');
    return init;
  }

  private saveToDisk(): void {
    if (this.simulateWriteFailure) {
      throw new Error('SIMULATED_DISK_WRITE_FAILURE: Storage write failed on disk.');
    }
    try {
      const dataDir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(this.storageFilePath, JSON.stringify(this.currentTournament, null, 2), 'utf8');
    } catch (e) {
      console.error('[TournamentStore] Error saving tournament to disk:', e);
      throw e;
    }
  }

  public getOfficialTournament(): Tournament {
    // Return deep clone to prevent mutation
    return JSON.parse(JSON.stringify(this.currentTournament));
  }

  public setOfficialTournament(tourn: Tournament): void {
    const invariantCheck = validateTournamentHardInvariants(tourn);
    if (!invariantCheck.valid) {
      throw new Error(`Cannot persist tournament with invalid board states: ${invariantCheck.violations.join('; ')}`);
    }
    const { tournament: sanitized } = sanitizeTournamentHardInvariants(tourn);
    this.currentTournament = JSON.parse(JSON.stringify(sanitized));
    this.saveToDisk();
  }

  public getPendingDraft(round: number): PendingDraftPairing | null {
    const draft = this.pendingDrafts.get(round);
    return draft ? JSON.parse(JSON.stringify(draft)) : null;
  }

  public setPendingDraft(round: number, draft: PendingDraftPairing): void {
    this.pendingDrafts.set(round, JSON.parse(JSON.stringify(draft)));
  }

  public clearPendingDraft(round: number): void {
    this.pendingDrafts.delete(round);
  }

  /**
   * Finalizes round results authoritatively
   */
  public finalizeRound(
    round: number,
    options?: { arbiterName?: string; notes?: string }
  ): { success: boolean; round: number; tournament: Tournament } {
    const roundKey = String(round);
    const validation = validateRoundForFinalization(this.currentTournament, round);
    if (!validation.valid) {
      throw {
        code: 'FINALIZATION_VALIDATION_FAILED',
        message: `Round ${round} cannot be finalized: ${validation.errors.join('; ')}`
      };
    }

    const backupTournament = JSON.parse(JSON.stringify(this.currentTournament));

    try {
      if (!this.currentTournament.pairings.finalizedRounds) {
        this.currentTournament.pairings.finalizedRounds = {};
      }
      if (!this.currentTournament.pairings.roundStatus) {
        this.currentTournament.pairings.roundStatus = {};
      }
      if (!this.currentTournament.pairings.finalizedAt) {
        this.currentTournament.pairings.finalizedAt = {};
      }
      if (!this.currentTournament.pairings.finalizedBy) {
        this.currentTournament.pairings.finalizedBy = {};
      }

      this.currentTournament.pairings.finalizedRounds[roundKey] = true;
      this.currentTournament.pairings.roundStatus[roundKey] = 'RESULTS_FINALIZED';
      this.currentTournament.pairings.finalizedAt[roundKey] = new Date().toISOString();
      this.currentTournament.pairings.finalizedBy[roundKey] = options?.arbiterName || 'Arbiter';

      // Update completed flag in rounds array
      const tournPairings = this.currentTournament.pairings as any;
      if (Array.isArray(tournPairings.rounds)) {
        const rnd = tournPairings.rounds.find((r: any) => r.round === round);
        if (rnd) rnd.completed = true;
      }

      this.saveToDisk();

      return {
        success: true,
        round,
        tournament: this.getOfficialTournament()
      };
    } catch (err: any) {
      this.currentTournament = backupTournament;
      throw err;
    }
  }

  /**
   * Unlocks finalized round for result editing with dependency protection
   */
  public unlockRound(
    round: number,
    options?: { arbiterConfirmed: boolean; arbiterName?: string }
  ): { success: boolean; round: number; tournament: Tournament } {
    const roundKey = String(round);
    const liveBoards = this.currentTournament.pairings?.liveBoards || {};
    const generatedRounds = Object.keys(liveBoards).map(Number).filter(n => n > 0).sort((a, b) => a - b);
    const laterRounds = generatedRounds.filter(r => r > round);

    if (laterRounds.length > 0) {
      throw {
        code: 'EARLIER_ROUND_DEPENDENCY',
        message: `Round ${round} is an earlier finalized round. Subsequent rounds (Round ${laterRounds.join(', ')}) already exist and depend on its results. Modifying earlier round results requires a dedicated recovery/rollback workflow.`
      };
    }

    if (options?.arbiterConfirmed !== true) {
      throw {
        code: 'ARBITER_CONFIRMATION_REQUIRED',
        message: 'Explicit arbiter confirmation is required to unlock a finalized round for result editing.'
      };
    }

    const backupTournament = JSON.parse(JSON.stringify(this.currentTournament));

    try {
      if (!this.currentTournament.pairings.finalizedRounds) {
        this.currentTournament.pairings.finalizedRounds = {};
      }
      if (!this.currentTournament.pairings.roundStatus) {
        this.currentTournament.pairings.roundStatus = {};
      }

      this.currentTournament.pairings.finalizedRounds[roundKey] = false;
      this.currentTournament.pairings.roundStatus[roundKey] = 'ROUND_ACTIVE';

      this.saveToDisk();

      return {
        success: true,
        round,
        tournament: this.getOfficialTournament()
      };
    } catch (err: any) {
      this.currentTournament = backupTournament;
      throw err;
    }
  }

  /**
   * Strict 3-condition Acceptance Gate:
   * 1. Gacrux execution success
   * 2. BBP independent checker PASS
   * 3. Explicit arbiter ACCEPT
   *
   * If any condition fails, state remains completely unchanged.
   */
  public acceptPairing(
    round: number,
    options: {
      arbiterConfirmed: boolean;
      arbiterName?: string;
      notes?: string;
      customDraft?: PendingDraftPairing; // Optional explicit draft
    }
  ): { success: boolean; round: number; boards: BoardPairing[]; tournament: Tournament; arbiter?: string } {
    const draft = options.customDraft || this.pendingDrafts.get(round);

    // Gate Condition 1: Gacrux execution success
    if (!draft || !draft.gacruxSuccess) {
      throw {
        code: 'ACCEPTANCE_PRECONDITION_FAILED',
        reason: 'GACRUX_EXECUTION_MISSING',
        message: `Round ${round} pairing has not been successfully generated by authoritative Gacrux engine.`
      };
    }

    // Gate Condition 2: BBP independent checker PASS
    if (!draft.bbpPassed || draft.bbpStatus !== 'PASS') {
      throw {
        code: 'ACCEPTANCE_PRECONDITION_FAILED',
        reason: 'BBP_CHECKER_NOT_PASSED',
        message: `Round ${round} pairing cannot be accepted because BBP independent checker status is '${draft.bbpStatus}' (must be PASS).`
      };
    }

    // Gate Condition 3: Explicit arbiter ACCEPT
    if (options.arbiterConfirmed !== true) {
      throw {
        code: 'ACCEPTANCE_PRECONDITION_FAILED',
        reason: 'ARBITER_CONFIRMATION_REQUIRED',
        message: 'Explicit arbiter confirmation (arbiterConfirmed === true) is required to commit pairings to official tournament state.'
      };
    }

    // Preserve snapshot in case write fails
    const backupTournament = JSON.parse(JSON.stringify(this.currentTournament));

    try {
      // All 3 conditions satisfied: atomically commit to official tournament state
      const roundKey = String(round);
      if (!this.currentTournament.pairings) {
        this.currentTournament.pairings = {
          server: '',
          round: '1',
          results: '0',
          showScheduleOnPrint: false,
          liveBoards: {},
          finalStandingsPromptedRound: 0,
          engine: {
            mode: 'dutch',
            excluded: [],
            manualByes: {},
            fixedBoards: {},
            initialTopColor: 'w',
            needsResort: false,
            lastGeneratedRound: 0,
            lastEngineMessage: '',
            excludeRemaining: {},
            excludeRounds: {},
            roundActivationConfirmed: {},
            playerStatusCollapsed: false,
            registrationsDirty: false,
            syncedAbsent: {},
            registrationSyncedAt: '',
            registrationSyncedForRound: 0,
            registrationSyncedSignature: '',
            firstRoundRegistrationLocked: false,
            firstRoundRegistrationSyncedSignature: '',
            firstRoundRegistrationNeedsResort: false,
            firstRoundRegistrationSyncedAt: ''
          }
        };
      }

      if (!this.currentTournament.pairings.liveBoards) {
        this.currentTournament.pairings.liveBoards = {};
      }

      const committedBoards: BoardPairing[] = draft.boards.map(b => {
        const entryType = b.entryType || determineBoardEntryType(b, this.currentTournament, round);
        let safeResult = b.result || '-';
        if (entryType !== 'NORMAL_GAME' && (safeResult === '1 - 0' || safeResult === '0 - 1' || safeResult === '½ - ½' || safeResult === '1F - 0F' || safeResult === '0F - 1F' || safeResult === '0F - 0F')) {
          safeResult = entryType === 'PAB' ? 'PAB' : (entryType === 'REQUESTED_BYE' ? '½ BYE' : (entryType === 'ZERO_POINT_BYE' ? '0 BYE' : '-'));
        }
        return {
          board: b.board || (b as any).boardNumber || 1,
          whiteKey: b.whiteKey,
          blackKey: b.blackKey,
          result: safeResult,
          entryType,
          pabPoints: b.pabPoints !== undefined ? b.pabPoints : (entryType === 'PAB' ? 1.0 : undefined),
          byePoints: b.byePoints !== undefined ? b.byePoints : (entryType === 'REQUESTED_BYE' ? 0.5 : undefined)
        };
      });

      this.currentTournament.pairings.liveBoards[roundKey] = committedBoards;

      if (!this.currentTournament.pairings.finalizedRounds) {
        this.currentTournament.pairings.finalizedRounds = {};
      }
      if (!this.currentTournament.pairings.roundStatus) {
        this.currentTournament.pairings.roundStatus = {};
      }
      this.currentTournament.pairings.finalizedRounds[roundKey] = false;
      this.currentTournament.pairings.roundStatus[roundKey] = 'ROUND_ACTIVE';

      // Also maintain rounds array for clients/checkers expecting rounds
      const tournPairings = this.currentTournament.pairings as any;
      if (!Array.isArray(tournPairings.rounds)) {
        tournPairings.rounds = [];
      }
      const existingRndIdx = tournPairings.rounds.findIndex((r: any) => r.round === round);
      if (existingRndIdx >= 0) {
        tournPairings.rounds[existingRndIdx] = {
          round,
          boards: committedBoards,
          completed: false
        };
      } else {
        tournPairings.rounds.push({
          round,
          boards: committedBoards,
          completed: false
        });
      }

      (this.currentTournament as any).currentRound = round;
      this.currentTournament.pairings.round = roundKey;
      this.currentTournament.pairings.engine.lastGeneratedRound = round;
      this.currentTournament.pairings.engine.lastEngineMessage = `Authoritative FIDE Dutch Round ${round} accepted by Arbiter ${options.arbiterName || 'Arbiter'}`;

      // Persist to disk atomically
      this.saveToDisk();

      // Clear pending draft upon successful commit
      this.pendingDrafts.delete(round);

      return {
        success: true,
        round,
        boards: this.currentTournament.pairings.liveBoards[roundKey],
        tournament: this.getOfficialTournament(),
        arbiter: options.arbiterName || 'Arbiter'
      };
    } catch (err: any) {
      // Rollback memory state on storage failure
      this.currentTournament = backupTournament;
      throw {
        code: 'STORAGE_COMMIT_FAILED',
        message: `Failed to persist committed tournament state: ${err.message}`
      };
    }
  }

  public resetTournament(newTourn?: Tournament): void {
    this.currentTournament = newTourn
      ? JSON.parse(JSON.stringify(newTourn))
      : createInitialEmptyTournament('Official FIDE Dutch Championship');
    this.pendingDrafts.clear();
    this.saveToDisk();
  }
}

export const tournamentStore = new TournamentStore();
