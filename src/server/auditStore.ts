import crypto from 'crypto';
import { EngineExecutionRecord } from '../engine/adapters/types';

/**
 * EngineAuditStore
 * In-memory diagnostic store for engine execution records and safety auditing.
 */
class EngineAuditStore {
  private records: EngineExecutionRecord[] = [];
  private readonly maxRecords = 200;

  public static hashInput(input: string): string {
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
  }

  public addRecord(record: EngineExecutionRecord): void {
    this.records.unshift(record);
    if (this.records.length > this.maxRecords) {
      this.records.pop();
    }
  }

  public getAll(): EngineExecutionRecord[] {
    return [...this.records];
  }

  public getById(requestId: string): EngineExecutionRecord | undefined {
    return this.records.find(r => r.requestId === requestId);
  }

  public clear(): void {
    this.records = [];
  }

  public count(): number {
    return this.records.length;
  }
}

export const auditStore = new EngineAuditStore();
