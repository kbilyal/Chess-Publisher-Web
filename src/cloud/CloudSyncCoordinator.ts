import { autoSaveSyncEnabled, watchAutoSaveSync } from './autoSaveSyncPreference';

export class CloudSyncCoordinator {
  private tail: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private stopWatchingPreference?: () => void;

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.catch(() => undefined).then(operation);
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  schedule(operation: () => Promise<unknown>, delayMs = 1000) {
    this.cancelScheduled();
    const generation = ++this.generation;
    const arm = () => {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.enqueue(async () => {
          if (generation !== this.generation) return;
          if (autoSaveSyncEnabled()) await operation();
          else waitForResume();
        }).catch(() => undefined);
      }, Math.max(0, delayMs));
    };
    const waitForResume = () => {
      this.stopWatchingPreference = watchAutoSaveSync(enabled => {
        if (!enabled || generation !== this.generation) return;
        this.stopWatchingPreference?.();
        this.stopWatchingPreference = undefined;
        arm();
      });
    };
    if (autoSaveSyncEnabled()) arm();
    else waitForResume();
  }

  cancelScheduled() {
    this.generation += 1;
    this.stopWatchingPreference?.();
    this.stopWatchingPreference = undefined;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  hasScheduled() {
    return this.timer !== null || this.stopWatchingPreference !== undefined;
  }
}
