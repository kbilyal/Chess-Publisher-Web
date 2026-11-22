import { DurableObject } from 'cloudflare:workers';
import { ChessResultsTnrJournal as Journal } from './tnr-journal.js';

export { default } from './smoke-worker.js';

export class ChessResultsTnrJournal extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.journal = new Journal(state, env);
  }

  fetch(request) {
    return this.journal.fetch(request);
  }
}
