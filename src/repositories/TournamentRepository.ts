import { Tournament, BoardPairing } from '../types';
import { RoundEngineMetadata } from '../engine/adapters/types';

export interface TransactionSession {
  id: string;
  round: number;
  beforeSnapshot: Tournament;
  proposedTournament: Tournament;
  status: 'prepared' | 'committed' | 'rolled_back';
  commit(): Promise<Tournament>;
  rollback(): Promise<Tournament>;
}

export interface TournamentRepository {
  getTournament(id?: string): Promise<Tournament | null>;
  saveTournament(tournament: Tournament): Promise<boolean>;
  createRoundTransaction(
    round: number,
    currentTournament: Tournament,
    proposedBoards: BoardPairing[],
    roundMetadata: RoundEngineMetadata
  ): Promise<TransactionSession>;
}

const STORAGE_KEY = 'fide_tournament_manager_v2';
const BACKUP_PREFIX = 'fide_backup_';

/**
 * LocalStorageTournamentRepository
 * 
 * Production-compatible client-side persistence repository with rollback snapshots.
 */
export class LocalStorageTournamentRepository implements TournamentRepository {
  public async getTournament(id?: string): Promise<Tournament | null> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as Tournament;
    } catch (err) {
      console.error('[Repository] Failed to read tournament from localStorage:', err);
      return null;
    }
  }

  public async saveTournament(tournament: Tournament): Promise<boolean> {
    try {
      // Store backup before write
      const previousRaw = localStorage.getItem(STORAGE_KEY);
      if (previousRaw) {
        localStorage.setItem(`${BACKUP_PREFIX}last_good`, previousRaw);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tournament));
      return true;
    } catch (err) {
      console.error('[Repository] Failed to save tournament to localStorage:', err);
      return false;
    }
  }

  public async createRoundTransaction(
    round: number,
    currentTournament: Tournament,
    proposedBoards: BoardPairing[],
    roundMetadata: RoundEngineMetadata
  ): Promise<TransactionSession> {
    // Deep clone snapshot before mutation
    const beforeSnapshot: Tournament = JSON.parse(JSON.stringify(currentTournament));
    
    // Prepare updated state
    const proposedTournament: Tournament = JSON.parse(JSON.stringify(currentTournament));
    const roundKey = String(round);

    if (!proposedTournament.pairings.liveBoards) {
      proposedTournament.pairings.liveBoards = {};
    }
    proposedTournament.pairings.liveBoards[roundKey] = proposedBoards;
    proposedTournament.pairings.round = roundKey;
    proposedTournament.pairings.engine.lastGeneratedRound = round;

    // Attach permanent engine & checker metadata to tournament pairings
    if (!(proposedTournament.pairings as any).roundMetadata) {
      (proposedTournament.pairings as any).roundMetadata = {};
    }
    (proposedTournament.pairings as any).roundMetadata[roundKey] = roundMetadata;

    const txId = `tx_r${round}_${Date.now()}`;
    let txStatus: 'prepared' | 'committed' | 'rolled_back' = 'prepared';

    const session: TransactionSession = {
      id: txId,
      round,
      beforeSnapshot,
      proposedTournament,
      get status() {
        return txStatus;
      },
      commit: async () => {
        if (txStatus !== 'prepared') {
          throw new Error(`Transaction ${txId} cannot commit because status is ${txStatus}`);
        }
        try {
          const success = await this.saveTournament(proposedTournament);
          if (!success) {
            throw new Error('Storage write failed during transaction commit.');
          }
          txStatus = 'committed';
          return proposedTournament;
        } catch (err) {
          // Automatic rollback on storage error
          await session.rollback();
          throw err;
        }
      },
      rollback: async () => {
        try {
          await this.saveTournament(beforeSnapshot);
          txStatus = 'rolled_back';
          return beforeSnapshot;
        } catch (rollbackErr) {
          console.error(`CRITICAL: Transaction rollback failed for ${txId}:`, rollbackErr);
          throw rollbackErr;
        }
      }
    };

    return session;
  }
}

/**
 * ServerTournamentRepository
 * 
 * Proxies tournament state to backend API (when cloud persistence is active).
 * Falls back to LocalStorage repository if backend is unavailable.
 */
export class ServerTournamentRepository implements TournamentRepository {
  private fallback = new LocalStorageTournamentRepository();

  public async getTournament(id?: string): Promise<Tournament | null> {
    try {
      const res = await fetch(`/api/tournaments/${id || 'current'}`);
      if (res.ok) {
        const data = await res.json();
        return data.tournament;
      }
    } catch {
      // Fallback
    }
    return this.fallback.getTournament(id);
  }

  public async saveTournament(tournament: Tournament): Promise<boolean> {
    try {
      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament })
      });
      if (res.ok) {
        // Also keep local mirror
        await this.fallback.saveTournament(tournament);
        return true;
      }
    } catch {
      // Fallback
    }
    return this.fallback.saveTournament(tournament);
  }

  public async createRoundTransaction(
    round: number,
    currentTournament: Tournament,
    proposedBoards: BoardPairing[],
    roundMetadata: RoundEngineMetadata
  ): Promise<TransactionSession> {
    return this.fallback.createRoundTransaction(round, currentTournament, proposedBoards, roundMetadata);
  }
}

export const defaultTournamentRepository: TournamentRepository = new LocalStorageTournamentRepository();
