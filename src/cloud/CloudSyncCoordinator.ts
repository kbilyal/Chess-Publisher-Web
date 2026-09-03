export class CloudSyncCoordinator {
  private tail: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.catch(() => undefined).then(operation);
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  schedule(operation: () => Promise<unknown>, delayMs = 1000) {
    this.cancelScheduled();
    const generation = ++this.generation;
    this.timer = setTimeout(() => {
      if (generation !== this.generation) return;
      this.timer = null;
      void this.enqueue(operation).catch(() => undefined);
    }, Math.max(0, delayMs));
  }

  cancelScheduled() {
    this.generation += 1;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  hasScheduled() {
    return this.timer !== null;
  }
}
