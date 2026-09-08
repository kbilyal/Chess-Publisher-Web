import assert from 'node:assert/strict';
import { buildPublicHubSnapshot, validatePublicHubSnapshot } from '../publicHubSnapshot';

function tournamentFixture() {
  return {
    name: 'Golden Rhodopes Web Correction Test',
    settings: {
      rounds: '1',
      tournamentFormat: 'Individual Swiss',
      pairingSystem: 'FIDE Dutch System',
      timeControl: '60+30',
      tournamentRatingType: 'Standard',
      fideRated: 'Yes',
      country: 'BUL',
      venue: 'Aqua SPA Hotel',
      city: 'Zlatograd',
      organizer: 'Organizer',
      chiefArbiter: 'Chief Arbiter',
      startDate: '2026-10-02',
      endDate: '2026-10-04',
      generalRegistrationDeadline: '2026-10-01T18:00:00+03:00'
    },
    players: [
      { id: 1, pairingNumber: 1, localKey: 'p1', name: 'Player One', fideId: '1001', fed: 'BUL', rating: 2100, attendance: 'present' },
      { id: 2, pairingNumber: 2, localKey: 'p2', name: 'Player Two', fideId: '1002', fed: 'TUR', rating: 2000, attendance: 'present' }
    ],
    pairings: {
      liveBoards: {
        '1': [{ board: 1, whiteKey: 'p1', blackKey: 'p2', result: '1-0' }]
      },
      finalizedRounds: { '1': true }
    },
    regulations: {
      tieBreaks: ['Buchholz Tie-Break'],
      additional: 'Updated on Web',
      attachment: {
        name: 'regulations-bg.pdf',
        size: 2048,
        contentType: 'application/pdf',
        uploadedAt: '2026-09-08T06:00:00Z',
        objectKey: 'regulations/test.pdf'
      }
    },
    schedule: {
      rows: [{ no: '1', dateTime: '2026-10-02T18:00:00+03:00', event: 'Round 1', description: 'Opening round' }]
    },
    online: {},
    cloud: { internalId: 'cp:test-golden-rhodopes' }
  } as any;
}

function testDesktopCompatibleSchemaAfterWebEdit() {
  const snapshot: any = buildPublicHubSnapshot(tournamentFixture(), {
    hubTournamentId: 'hub_test123',
    publicSlug: 'golden-rhodopes-test',
    revision: 5
  });

  assert.equal(validatePublicHubSnapshot(snapshot), true);
  assert.equal(snapshot.schemaVersion, '1.0');
  assert.equal(snapshot.client.product, 'Chess-Publisher');

  // The publish payload must describe the revision being created, while the
  // optimistic request header still uses the current server revision (r5).
  assert.equal(snapshot.publication.revision, 6);
  assert.equal(snapshot.publication.previousRevision, 5);
  assert.ok(snapshot.publication.generatedAt);

  // Desktop and Web must publish the same public shape. Regulations are a
  // top-level Hub section, never embedded inside tournament metadata.
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.tournament, 'regulations'), false);
  assert.equal(snapshot.regulations.additional, 'Updated on Web');
  assert.equal(snapshot.regulations.file.name, 'regulations-bg.pdf');
  assert.equal(snapshot.regulations.file.size, 2048);

  assert.equal(snapshot.rounds[0].round, 1);
  assert.equal(snapshot.rounds[0].complete, true);
  assert.equal(snapshot.standings.final, true);
  assert.equal(snapshot.players[0].key, 'p1');
  assert.equal(snapshot.players[1].key, 'p2');
  assert.equal(snapshot.tournament.location.federation, 'BUL');
  assert.match(snapshot.schedule[0].dateTime, /^2026-10-02T15:00:00\.000Z$/);
}

function testMalformedWebCorrectionFailsBeforeHubOverwrite() {
  const tournament = tournamentFixture();
  tournament.pairings.liveBoards['1'][0].blackKey = 'missing-player';
  assert.throws(
    () => buildPublicHubSnapshot(tournament, { hubTournamentId: 'hub_test123', revision: 5 }),
    /Unknown player key missing-player/,
    'A malformed Web correction must fail locally instead of overwriting the last valid public Hub revision.'
  );
}

function main() {
  testDesktopCompatibleSchemaAfterWebEdit();
  testMalformedWebCorrectionFailsBeforeHubOverwrite();
  console.log('Public Hub snapshot Desktop/Web parity regression: PASS');
}

main();
