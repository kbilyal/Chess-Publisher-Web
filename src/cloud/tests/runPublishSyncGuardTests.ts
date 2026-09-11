import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { protectPublishSyncFacade } from '../../companion/publishSyncGuard';

const STORAGE_KEY = 'fide_tournament_manager_v2';
let stored = '';
const localStorageMock = {
  getItem(key: string) {
    return key === STORAGE_KEY ? stored || null : null;
  },
  setItem(key: string, value: string) {
    if (key === STORAGE_KEY) stored = value;
  },
  removeItem(key: string) {
    if (key === STORAGE_KEY) stored = '';
  },
  clear() {
    stored = '';
  },
  key() { return null; },
  get length() { return stored ? 1 : 0; }
};
(globalThis as any).window = { localStorage: localStorageMock };

const base: any = {
  name: 'Publish SYNC Guard',
  settings: { tournamentType: 'real' },
  players: [],
  cloud: { cloudTournamentId: 'cloud-1', internalId: 'tournament-1', baseRevision: 10 },
  online: { revision: 0 },
  chessResults: { key: '123456' }
};
stored = JSON.stringify(base);

const calls: string[] = [];
const rawFacade: any = {
  async syncNow(tournament: any) {
    calls.push(`sync:${Number(tournament?.online?.revision || 0)}`);
    stored = JSON.stringify(tournament);
  },
  async publishOnline(tournament: any) {
    calls.push('hub-publish');
    const published = {
      ...tournament,
      online: {
        ...(tournament.online || {}),
        revision: 11,
        publicSlug: 'publish-sync-guard',
        lastPublishedAt: '2026-09-11T16:00:00.000Z'
      }
    };
    stored = JSON.stringify(published);
    return published;
  },
  async uploadRegulations(tournament: any, _file: File) {
    calls.push('regulations-publish');
    const published = {
      ...tournament,
      online: { ...(tournament.online || {}), revision: 12 },
      regulations: { ...(tournament.regulations || {}), attachment: { name: 'regulations.pdf' } }
    };
    stored = JSON.stringify(published);
    return published;
  }
};

const guarded = protectPublishSyncFacade(rawFacade);
await guarded.publishOnline(base);
assert.deepEqual(
  calls,
  ['sync:0', 'hub-publish', 'sync:11'],
  'Hub publish must be exactly confirmed SYNC -> publish -> confirmed SYNC, and post-SYNC must see publish metadata.'
);

calls.length = 0;
stored = JSON.stringify(base);
await guarded.uploadRegulations(base, {} as File);
assert.deepEqual(
  calls,
  ['sync:0', 'regulations-publish', 'sync:12'],
  'Regulations auto-republish must use the same confirmed SYNC -> publish -> confirmed SYNC contract.'
);

let publishCalled = false;
const failClosed = protectPublishSyncFacade({
  async syncNow() { throw new Error('sync failed'); },
  async publishOnline() { publishCalled = true; },
  async uploadRegulations() { publishCalled = true; }
} as any);
await assert.rejects(() => failClosed.publishOnline(base), /sync failed/);
assert.equal(publishCalled, false, 'A failed pre-SYNC must block Hub publication completely.');

const appSource = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
assert.match(
  appSource,
  /protectPublishSyncFacade\([\s\S]*protectCompanionCloudFacade\(createCompanionCloudFacade\(cloud\)\)/,
  'Publish SYNC guard must wrap the already-protected Companion Cloud facade.'
);

const workspaceSource = fs.readFileSync(path.join(process.cwd(), 'src', 'companion', 'CompanionWorkspace.tsx'), 'utf8');
const chessResultsPostSyncs = workspaceSource.match(/persistTournament\(published\);\s*await cloud\.syncNow\(published\);/g) || [];
assert.ok(
  chessResultsPostSyncs.length >= 2,
  'Both Chess-Results publish paths must persist publication metadata and confirm post-publish Cloud SYNC.'
);
assert.match(
  workspaceSource,
  /const publishChessResults = async \(\) =>[\s\S]*await cloud\.syncNow\(tournamentRef\.current\)/,
  'Normal Chess-Results publication must confirm pre-publish Cloud SYNC.'
);
assert.match(
  workspaceSource,
  /const createFreshChessResultsTnr = async \(\) =>[\s\S]*await cloud\.syncNow\(tournamentRef\.current\)/,
  'Fresh-TNR Chess-Results publication must confirm pre-publish Cloud SYNC.'
);

console.log('PASS publish SYNC guard: Hub and Chess-Results publications are coupled to confirmed pre/post Cloud SYNC.');
