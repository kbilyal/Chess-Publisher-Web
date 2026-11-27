import { BridgeError, configuredCreatorMap, configuredLegacyRegistrations, getKey } from './worker.js';

export const FIRST_AUTOMATIC_CREATOR_ID = 0x40000000;

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
      if (operation !== '/allocate' && operation !== '/creator-id') return new Response(null, { status: 404 });

      // Serialize registrations in the registry and GETKEY within each organizer.
      return await this.state.blockConcurrencyWhile(async () => {
        try {
          if (operation === '/creator-id') return await this.registerCreator(body, storage);
          return await this.allocate(body, storage);
        } catch (error) {
          return journalError(error);
        }
      });
    } catch (error) {
      return journalError(error);
    }
  }

  async registerCreator({ organizerId, configuredId }, storage) {
    const organizerKey = 'creator:organizer:' + organizerId;
    const registeredId = await storage.get(organizerKey);
    if (registeredId !== undefined && (configuredId === null || registeredId === configuredId)) {
      return Response.json({ creatorId: registeredId });
    }

    if (configuredId !== null) {
      const creatorKey = 'creator:id:' + configuredId;
      const owner = await storage.get(creatorKey);
      if (registeredId !== undefined || (owner !== undefined && owner !== organizerId)) {
        throw new BridgeError(500, 'CREATOR_MAP_INVALID', 'The configured CreatorID conflicts with a registered assignment.');
      }
      await storage.put({ [organizerKey]: configuredId, [creatorKey]: organizerId });
      return Response.json({ creatorId: configuredId });
    }

    const configured = Object.values(configuredCreatorMap(this.env));
    const legacy = Object.values(configuredLegacyRegistrations(this.env) || {})
      .flatMap(registrations => Object.values(registrations || {}).map(entry => entry?.creatorId));
    const reserved = new Set([...configured, ...legacy].map(Number));
    for (let attempt = 0; attempt < 16; attempt++) {
      const randomBits = crypto.getRandomValues(new Uint32Array(1))[0];
      const creatorId = FIRST_AUTOMATIC_CREATOR_ID + (randomBits & (FIRST_AUTOMATIC_CREATOR_ID - 1));
      const creatorKey = 'creator:id:' + creatorId;
      if (reserved.has(creatorId) || await storage.get(creatorKey) !== undefined) continue;
      await storage.put({ [organizerKey]: creatorId, [creatorKey]: organizerId });
      return Response.json({ creatorId });
    }
    throw new BridgeError(503, 'CREATOR_ID_UNAVAILABLE', 'Chess-Results CreatorID allocation is temporarily unavailable. Retry publication.');
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
