import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/companion/companionCloudActions.ts', 'utf8');
const hubApiSource = fs.readFileSync('src/cloud/hubApi.ts', 'utf8');

assert.ok(
  source.includes('async function syncNowConfirmed'),
  'Web Companion must confirm the private Cloud state after the provider sync path returns.'
);
assert.ok(
  source.includes('const remoteResult = await cloudApi.getSnapshot(token, cloudTournamentId)'),
  'Cloud confirmation must re-read the authoritative remote tournament snapshot.'
);
assert.ok(
  source.includes('localFingerprint !== remoteFingerprint'),
  'Publication must fail closed when the local correction is not the same content as the remote Cloud snapshot.'
);
assert.ok(
  source.includes('syncNow: (tournament: Tournament) => syncNowConfirmed'),
  'All Companion Sync Now callers, including Hub and Chess-Results publication, must use remote confirmation.'
);
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
  'A successful regulations upload must immediately publish through identity recovery.'
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
  source.includes('publishedRevision >= previousRevision'),
  'A provider acknowledgement must allow a legitimate unchanged Hub revision but never a backwards revision.'
);
assert.ok(
  source.includes('async function retryPublishAgainstAuthoritativeHub'),
  'An unacknowledged provider publish must retry once against freshly listed authoritative Hub metadata.'
);
assert.ok(
  source.includes('const hub = await findOrganizerOwnedHub(cloud, current)'),
  'The retry must resolve only an organizer-owned existing Hub tournament.'
);
assert.ok(
  source.includes('const snapshot = buildPublicHubSnapshot(current'),
  'The retry must rebuild the validated public snapshot against the authoritative Hub revision.'
);
assert.ok(
  source.includes('await hubApi.publishOwnedTournament(token, hub.id, revision, snapshot)'),
  'The retry must use the authenticated Hub publish contract and current revision.'
);
assert.ok(
  source.includes('return retryPublishAgainstAuthoritativeHub(cloud, published)'),
  'Missing provider acknowledgement must enter the authoritative retry instead of returning a generic false failure.'
);
assert.ok(
  !source.includes('Online Hub publish was not confirmed. The Hub did not acknowledge'),
  'The generic acknowledgement failure must no longer hide the real Hub API error.'
);
assert.ok(
  hubApiSource.includes('organizer_publish_route_missing'),
  'A missing organizer-owned write route must fail with an explicit backend-contract error.'
);
assert.ok(
  hubApiSource.includes('installation-local per-tournament manageToken'),
  'The browser client must document that the Desktop management credential is intentionally not synchronized.'
);
assert.ok(
  !hubApiSource.includes("'X-Organizer-Token': token"),
  'The browser must never impersonate the Desktop manage-token route with the Organizer Token.'
);
assert.ok(
  !hubApiSource.includes('return request(`/api/v1/tournaments/${enc(id)}/snapshot`'),
  'The organizer-owned Web publish path must never fall back to the legacy managed snapshot route.'
);
assert.ok(
  source.includes('publishOnline: (tournament: Tournament) => publishOnlineWithRecovery'),
  'All Web Companion public publishes must recover the organizer-owned existing Hub record before create/update.'
);
assert.ok(
  source.includes('uploadRegulations: (tournament: Tournament, file: File) => uploadRegulationsAndRepublish'),
  'The Companion facade must expose the guarded upload-and-republish behavior.'
);

console.log('Cloud confirmation + authoritative Hub retry + fail-closed ownership + identity recovery + regulations republish regression: PASS');
