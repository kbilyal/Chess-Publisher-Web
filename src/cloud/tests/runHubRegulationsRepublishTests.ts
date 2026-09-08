import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/companion/companionCloudActions.ts', 'utf8');

assert.ok(
  source.includes('async function uploadRegulationsAndRepublish'),
  'Web Companion must wrap regulations upload with public Hub republish.'
);
assert.ok(
  source.includes('await cloud.uploadRegulations(tournament, file)'),
  'The authenticated provider must remain authoritative for the binary regulations upload.'
);
assert.ok(
  source.includes('regulationsFile: clone(attachment)'),
  'Uploaded regulations metadata must be mirrored to the Desktop-compatible hub.regulationsFile path.'
);
assert.ok(
  source.includes('await publishOnlineWithRecovery(cloud, current)'),
  'A successful regulations upload must immediately publish a new validated public Hub revision through identity recovery.'
);
assert.ok(
  source.includes('text(item.id) === internalId'),
  'Hub identity recovery must match a synchronized Hub ID even when cached online.hubTournamentId metadata is missing.'
);
assert.ok(
  source.includes('text(item.localKey) === internalId'),
  'Hub identity recovery must retain the original shared local-key fallback.'
);
assert.ok(
  source.includes('const previousRevision = Number(current?.online?.revision || 0)'),
  'Companion publish must remember the public revision before sending the correction.'
);
assert.ok(
  source.includes('publishedRevision <= previousRevision'),
  'Companion publish must reject a false success when no new Hub revision was persisted.'
);
assert.ok(
  source.includes("publishedAt === previousPublishedAt"),
  'Companion publish must require a fresh lastPublishedAt success marker.'
);
assert.ok(
  source.includes('Online Hub publish was not confirmed.'),
  'A rejected Hub update must surface a real failure instead of a false Published notice.'
);
assert.ok(
  source.includes('publishOnline: (tournament: Tournament) => publishOnlineWithRecovery'),
  'All Web Companion public publishes must recover the organizer-owned existing Hub record before create/update.'
);
assert.ok(
  source.includes('uploadRegulations: (tournament: Tournament, file: File) => uploadRegulationsAndRepublish'),
  'The Companion facade must expose the guarded upload-and-republish behavior.'
);

console.log('Hub identity recovery + confirmed revision + regulations automatic republish regression: PASS');
