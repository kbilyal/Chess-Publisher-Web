import { Tournament } from '../types';
import {
  TransactionType,
  TransactionStatus,
  TransactionRecord
} from './types';
import { computeStateHash } from './hashUtils';

export class TransactionManager<T = Tournament> {
  private transactions: Map<string, TransactionRecord<T>> = new Map();
  private lastResetSnapshot: { timestamp: string; state: T; hash: string } | null = null;
  private activeTransactionId: string | null = null;

  /**
   * Begins a new transaction lifecycle.
   * Takes a full snapshot of the initialState, computes its canonical hash,
   * and registers the transaction in PREPARED state.
   */
  public begin(
    type: TransactionType,
    initialState: T,
    metadata?: Record<string, any>
  ): TransactionRecord<T> {
    const txId = `tx_${type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const beforeStateClone: T = JSON.parse(JSON.stringify(initialState));
    const snapshotHash = computeStateHash(beforeStateClone);

    const record: TransactionRecord<T> = {
      transactionId: txId,
      type,
      startedAt: new Date().toISOString(),
      status: 'PREPARED',
      snapshotHash,
      beforeState: beforeStateClone,
      metadata: metadata ? { ...metadata } : {}
    };

    this.transactions.set(txId, record);
    this.activeTransactionId = txId;
    return record;
  }

  /**
   * Creates an independent snapshot of any state with its canonical SHA-256 hash.
   */
  public snapshot(state: T): { state: T; hash: string; timestamp: string } {
    const cloned: T = JSON.parse(JSON.stringify(state));
    const hash = computeStateHash(cloned);
    return {
      state: cloned,
      hash,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Executes pre-flight validation on the active transaction.
   */
  public validate(
    txId: string,
    validator: (beforeState: T) => { valid: boolean; errors?: string[]; warnings?: string[] }
  ): boolean {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new Error(`Transaction '${txId}' not found.`);
    }

    if (tx.status !== 'PREPARED') {
      throw new Error(`Transaction '${txId}' cannot be validated in status '${tx.status}'.`);
    }

    const result = validator(tx.beforeState);
    if (!result.valid) {
      tx.status = 'FAILED';
      tx.error = (result.errors || ['Validation failed']).join('; ');
      return false;
    }

    tx.status = 'VALIDATED';
    return true;
  }

  /**
   * Sets preview / proposed afterState on the transaction.
   */
  public setPreview(txId: string, afterState: T, metadata?: Record<string, any>): TransactionRecord<T> {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new Error(`Transaction '${txId}' not found.`);
    }

    tx.afterState = JSON.parse(JSON.stringify(afterState));
    tx.status = 'PREVIEW';
    if (metadata) {
      tx.metadata = { ...tx.metadata, ...metadata };
    }
    return tx;
  }

  /**
   * Commits the transaction atomically.
   * If a persistence function is supplied and fails or returns false,
   * the transaction automatically triggers rollback to the exact beforeState.
   */
  public async commit(
    txId: string,
    proposedState?: T,
    persistenceFn?: (state: T) => Promise<boolean> | boolean
  ): Promise<T> {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new Error(`Transaction '${txId}' not found.`);
    }

    if (tx.status !== 'VALIDATED' && tx.status !== 'PREVIEW' && tx.status !== 'PREPARED') {
      throw new Error(`Transaction '${txId}' cannot be committed from status '${tx.status}'.`);
    }

    const stateToCommit = proposedState || tx.afterState;
    if (!stateToCommit) {
      throw new Error(`Transaction '${txId}' has no afterState to commit.`);
    }

    tx.afterState = JSON.parse(JSON.stringify(stateToCommit));

    // If this is a RESET_TOURNAMENT transaction, archive the previous state for Undo Reset
    if (tx.type === 'RESET_TOURNAMENT') {
      this.lastResetSnapshot = {
        timestamp: new Date().toISOString(),
        state: JSON.parse(JSON.stringify(tx.beforeState)),
        hash: tx.snapshotHash
      };
    }

    // Attempt persistence
    if (persistenceFn) {
      try {
        const persisted = await persistenceFn(tx.afterState);
        if (!persisted) {
          throw new Error('Persistence handler returned false.');
        }
      } catch (err: any) {
        // Automatically rollback on persistence error
        await this.rollback(txId);
        tx.status = 'FAILED';
        tx.error = `Persistence failure: ${err.message || String(err)}`;
        throw new Error(`Transaction commit failed: ${tx.error}`);
      }
    }

    tx.status = 'COMMITTED';
    tx.completedAt = new Date().toISOString();
    if (this.activeTransactionId === txId) {
      this.activeTransactionId = null;
    }

    return tx.afterState;
  }

  /**
   * Rolls back the transaction to the exact beforeState.
   * Invokes restoreFn if supplied to restore outer persistence.
   */
  public async rollback(
    txId: string,
    restoreFn?: (state: T) => Promise<void> | void
  ): Promise<T> {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new Error(`Transaction '${txId}' not found.`);
    }

    tx.status = 'ROLLED_BACK';
    tx.afterState = JSON.parse(JSON.stringify(tx.beforeState));
    tx.completedAt = new Date().toISOString();

    const originalState = JSON.parse(JSON.stringify(tx.beforeState));

    if (restoreFn) {
      try {
        await restoreFn(originalState);
      } catch (err: any) {
        console.error(`Error during transaction rollback restoreFn for ${txId}:`, err);
      }
    }

    if (this.activeTransactionId === txId) {
      this.activeTransactionId = null;
    }

    return originalState;
  }

  /**
   * Cancels/Aborts an open transaction and returns the exact beforeState.
   */
  public cancelTransaction(txId: string): T {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new Error(`Transaction '${txId}' not found.`);
    }

    tx.status = 'CANCELLED';
    tx.afterState = JSON.parse(JSON.stringify(tx.beforeState));
    tx.completedAt = new Date().toISOString();

    if (this.activeTransactionId === txId) {
      this.activeTransactionId = null;
    }

    return JSON.parse(JSON.stringify(tx.beforeState));
  }

  /**
   * Returns the latest active or committed state.
   */
  public getCurrentState(): T | null {
    if (this.activeTransactionId) {
      const activeTx = this.transactions.get(this.activeTransactionId);
      if (activeTx) {
        if (activeTx.status === 'ROLLED_BACK' || activeTx.status === 'CANCELLED' || activeTx.status === 'FAILED') {
          return activeTx.beforeState;
        }
        return activeTx.afterState || activeTx.beforeState;
      }
    }
    const all = Array.from(this.transactions.values());
    if (all.length > 0) {
      const last = all[all.length - 1];
      if (last.status === 'ROLLED_BACK' || last.status === 'CANCELLED' || last.status === 'FAILED') {
        return last.beforeState;
      }
      return last.afterState || last.beforeState;
    }
    return null;
  }

  /**
   * Undo Last Reset workflow: returns the archived tournament snapshot if available.
   */
  public getUndoResetSnapshot(): { timestamp: string; state: T; hash: string } | null {
    return this.lastResetSnapshot ? JSON.parse(JSON.stringify(this.lastResetSnapshot)) : null;
  }

  public clearUndoResetSnapshot(): void {
    this.lastResetSnapshot = null;
  }

  /**
   * Returns a transaction record by ID.
   */
  public getTransaction(txId: string): TransactionRecord<T> | undefined {
    const tx = this.transactions.get(txId);
    return tx ? JSON.parse(JSON.stringify(tx)) : undefined;
  }

  /**
   * Returns all transaction records.
   */
  public getAllTransactions(): TransactionRecord<T>[] {
    return Array.from(this.transactions.values()).map(tx => JSON.parse(JSON.stringify(tx)));
  }

  public getActiveTransactionId(): string | null {
    return this.activeTransactionId;
  }

  /**
   * Utility to compute hash of arbitrary object using canonical stringification.
   */
  public computeHash(state: any): string {
    return computeStateHash(state);
  }
}

// Global default transaction manager instance
export const defaultTransactionManager = new TransactionManager<Tournament>();
