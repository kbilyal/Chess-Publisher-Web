import assert from 'node:assert/strict';
import { mergeCompanionTournamentChanges } from '../../companion/companionCloudActions';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function baseTournament() {
  return {
    name: 'Companion Merge Test',
    settings: {
      venue: 'Base venue',
      city: 'Kardzhali',
      rounds: '7',
      chiefArbiter: 'Base Arbiter'
    },
    players: [
      { id: 1, localKey: 'p1', name: 'Player One', rating: 2000, attendance: 'present' }
    ],
    pairings: {
      liveBoards: {},
      engine: { lastGeneratedRound: 0 }
    },
    regulations: { additional: '', tieBreaks: [] },
    schedule: { rows: [] },
    chessResults: { key: '1234567' },
    telegram: { channel: '', language: 'en', signature: '' },
    online: { publicSlug: 'base-slug', publicPageUrl: '' },
    cloud: { baseRevision: 10, baseFingerprint: 'runtime-only' },
    dgt: { boardMapping: [{ tournamentBoard: 1, serial: 'LOCAL-ONLY' }] }
  } as any;
}

function testNonOverlappingDesktopAndWebMerge() {
  const base = baseTournament();
  const web = clone(base);
  const desktop = clone(base);

  web.settings.venue = 'Edited on Web';
  desktop.pairings.liveBoards['1'] = [{ board: 1, whiteKey: 'p1', blackKey: '', result: 'PAB' }];
  desktop.pairings.engine.lastGeneratedRound = 1;
  desktop.online.publicSlug = 'desktop-public-slug';

  const result = mergeCompanionTournamentChanges(base, web, desktop);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.merged.settings.venue, 'Edited on Web');
  assert.equal((result.merged as any).pairings.engine.lastGeneratedRound, 1);
  assert.equal((result.merged as any).pairings.liveBoards['1'][0].board, 1);
  assert.equal((result.merged as any).online.publicSlug, 'desktop-public-slug');
  assert.equal((result.merged as any).cloud, undefined, 'runtime cloud metadata must not enter portable merge content');
  assert.equal((result.merged as any).dgt, undefined, 'device-local DGT mapping must not enter portable merge content');
}

function testSameFieldConflictFailsClosed() {
  const base = baseTournament();
  const web = clone(base);
  const desktop = clone(base);

  web.settings.venue = 'Web venue';
  desktop.settings.venue = 'Desktop venue';

  const result = mergeCompanionTournamentChanges(base, web, desktop);
  assert.ok(result.conflicts.includes('settings.venue'));
  assert.equal(result.merged.settings.venue, 'Web venue', 'unresolved merge keeps local value in memory but must not be uploaded');
}

function testExplicitSameFieldChoiceIsDeterministic() {
  const base = baseTournament();
  const web = clone(base);
  const desktop = clone(base);

  web.settings.venue = 'Web venue';
  desktop.settings.venue = 'Cloud venue';
  web.settings.city = 'Web-only city';
  desktop.settings.chiefArbiter = 'Cloud-only arbiter';

  const keepWeb = mergeCompanionTournamentChanges(base, web, desktop, 'local');
  assert.ok(keepWeb.conflicts.includes('settings.venue'));
  assert.equal(keepWeb.merged.settings.venue, 'Web venue');
  assert.equal(keepWeb.merged.settings.city, 'Web-only city');
  assert.equal(keepWeb.merged.settings.chiefArbiter, 'Cloud-only arbiter');

  const useCloud = mergeCompanionTournamentChanges(base, web, desktop, 'remote');
  assert.ok(useCloud.conflicts.includes('settings.venue'));
  assert.equal(useCloud.merged.settings.venue, 'Cloud venue');
  assert.equal(useCloud.merged.settings.city, 'Web-only city');
  assert.equal(useCloud.merged.settings.chiefArbiter, 'Cloud-only arbiter');
}

function testPlayerRosterConflictIsNotGuessed() {
  const base = baseTournament();
  const web = clone(base);
  const desktop = clone(base);

  web.players.push({ id: 2, localKey: 'p2', name: 'Web Player', rating: 1800, attendance: 'present' } as any);
  desktop.players.push({ id: 3, localKey: 'p3', name: 'Desktop Player', rating: 1700, attendance: 'present' } as any);

  const result = mergeCompanionTournamentChanges(base, web, desktop);
  assert.ok(result.conflicts.includes('players'));
}

function main() {
  testNonOverlappingDesktopAndWebMerge();
  testSameFieldConflictFailsClosed();
  testExplicitSameFieldChoiceIsDeterministic();
  testPlayerRosterConflictIsNotGuessed();
  console.log('Companion smart Desktop/Web conflict merge regression: PASS');
}

main();
