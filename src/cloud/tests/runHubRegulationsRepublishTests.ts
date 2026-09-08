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
  source.includes('await cloud.publishOnline(current)'),
  'A successful regulations upload must immediately publish a new validated public Hub revision.'
);
assert.ok(
  source.includes('uploadRegulations: (tournament: Tournament, file: File) => uploadRegulationsAndRepublish'),
  'The Companion facade must expose the guarded upload-and-republish behavior.'
);

console.log('Hub regulations upload + automatic public republish regression: PASS');
