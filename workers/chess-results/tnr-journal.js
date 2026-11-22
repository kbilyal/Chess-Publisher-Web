import { BridgeError, getKey } from './worker.js';

export class ChessResultsTnrJournal {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    try {
      const body = await request.json();
      const operation = new URL(request.url).pathname;
      const storage = this.state.storage;
      if (operation === '/lookup') {
        const record = await storage.get('tnr:' + body.key);
        return Response.json({ record: record || null });
      }
      if (operation !== '/allocate') return new Response(null, { status: 404 });

      // Serialize GETKEY for this organizer across browser sessions. The two
      // indexes are committed together before the assigned key is returned.
      return await this.state.blockConcurrencyWhile(async () => {
        try {
          return await this.allocate(body, storage);
        } catch (error) {
          return journalError(error);
        }
      });
    } catch (error) {
      return journalError(error);
    }
  }

  async allocate(body, storage) {
    const { input, creatorId } = body;
    const clientKey = 'client:' + input.clientId;
    const previous = await storage.get(clientKey);
    if (previous?.pending) throw unconfirmedAllocation();
    if (previous) {
      if (previous.mode !== input.mode || previous.federation !== input.federation || previous.creatorId !== creatorId) {
        throw new BridgeError(409, 'TNR_ALLOCATION_MISMATCH', 'The saved TNR belongs to a different organizer assignment, mode or federation.');
      }
      return Response.json({ key: previous.key, recovered: true });
    }

    let key;
    let requestStarted = false;
    try {
      key = await getKey(this.env, input, creatorId, async () => {
        await storage.put(clientKey, { pending: true, ...input, creatorId });
        requestStarted = true;
      });
    } catch (error) {
      // A definite vendor refusal can be retried. A transport error leaves
      // the reservation pending because Chess-Results may have allocated it.
      if (error.code === 'GETKEY_REJECTED') await storage.delete(clientKey);
      else if (requestStarted) throw unconfirmedAllocation();
      throw error;
    }
    const record = { key, clientId: input.clientId, creatorId, mode: input.mode, federation: input.federation };
    await storage.put({ [clientKey]: record, ['tnr:' + key]: record });
    return Response.json({ key, recovered: false });
  }
}

function unconfirmedAllocation() {
  return new BridgeError(409, 'TNR_ALLOCATION_UNCONFIRMED', 'Chess-Results did not confirm whether it assigned a key. Contact support to recover the outcome before requesting another TNR.');
}

function journalError(error) {
  if (error instanceof BridgeError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
  return Response.json({ code: 'TNR_JOURNAL_UNAVAILABLE', message: 'Chess-Results TNR storage is unavailable.' }, { status: 503 });
}
