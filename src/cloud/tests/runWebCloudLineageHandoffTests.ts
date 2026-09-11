import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  preserveNewestCloudLineage,
  preservePrivateIdentityAfterPublicPublish,
  repairPrivateIdentityFromActiveCloud
} from '../../companion/webCloudLineageHandoff';

const base = {
  name: 'Web lineage test',
  internalId: 'tournament-1',
  players: [{ localKey: 'p1', name: 'Player A', rating: 1800 }],
  cloud: {
    cloudTournamentId: 'cloud-1',
    internalId: 'tournament-1',
    baseRevision: 12,
    baseFingerprint: 'fingerprint-r12',
    fingerprintSchema: 7,
    fingerprintContentSchema: 7,
    schemaVersion: 4,
    lastSyncAt: '2026-09-11T10:00:00.000Z'
  }
};

const staleUiEdit = {
  ...base,
  players: [{ localKey: 'p1', name: 'Player A', rating: 1825 }],
  cloud: {
    ...base.cloud,
    baseRevision: 11,
    baseFingerprint: 'fingerprint-r11',
    lastSyncAt: '2026-09-11T09:00:00.000Z'
  }
};

const guarded = preserveNewestCloudLineage(base as any, staleUiEdit as any) as any;
assert.equal(guarded.players[0].rating, 1825, 'Web content edit must be preserved.');
assert.equal(guarded.cloud.baseRevision, 12, 'A stale React write must not regress the accepted Cloud base revision.');
assert.equal(guarded.cloud.baseFingerprint, 'fingerprint-r12', 'A stale React write must not regress the accepted Cloud base fingerprint.');
assert.equal(guarded.cloud.fingerprintContentSchema, 7, 'Accepted fingerprint schema must be preserved.');

const missingFingerprint = {
  ...base,
  cloud: { ...base.cloud, baseFingerprint: '' }
};
const repaired = preserveNewestCloudLineage(base as any, missingFingerprint as any) as any;
assert.equal(repaired.cloud.baseRevision, 12);
assert.equal(repaired.cloud.baseFingerprint, 'fingerprint-r12', 'Same-revision UI state may not erase the accepted fingerprint.');

const newer = {
  ...base,
  cloud: { ...base.cloud, baseRevision: 13, baseFingerprint: 'fingerprint-r13' }
};
assert.equal(
  preserveNewestCloudLineage(base as any, newer as any),
  newer,
  'A genuinely newer accepted lineage must pass through unchanged.'
);

const otherTournament = {
  ...staleUiEdit,
  cloud: { ...staleUiEdit.cloud, cloudTournamentId: 'cloud-2', internalId: 'tournament-2' }
};
assert.equal(
  preserveNewestCloudLineage(base as any, otherTournament as any),
  otherTournament,
  'Lineage must never leak across tournament identities.'
);

const historicallyCorrupted = {
  ...base,
  cloud: {
    ...base.cloud,
    internalId: 'hub-public-99'
  }
};
const repairedIdentity = repairPrivateIdentityFromActiveCloud(
  historicallyCorrupted as any,
  { id: 'cloud-1', localKey: 'tournament-1', revision: 12 }
) as any;
assert.equal(
  repairedIdentity.cloud.internalId,
  'tournament-1',
  'The organizer-owned private Cloud localKey must repair an old public-Hub identity overwrite.'
);
assert.equal(repairedIdentity.cloud.cloudTournamentId, 'cloud-1');
assert.equal(repairedIdentity.cloud.baseRevision, 12, 'Identity repair must not alter accepted revision lineage.');
assert.equal(repairedIdentity.players[0].rating, 1800, 'Identity repair must not alter tournament content.');

const unrelatedActive = repairPrivateIdentityFromActiveCloud(
  historicallyCorrupted as any,
  { id: 'cloud-2', localKey: 'tournament-2', revision: 12 }
);
assert.equal(
  unrelatedActive,
  historicallyCorrupted,
  'A different active Cloud record must never rewrite this tournament identity.'
);

const publicPublishMutation = {
  ...base,
  online: {
    hubTournamentId: 'hub-public-99',
    publicSlug: 'web-lineage-test-99',
    revision: 4,
    lastPublishedAt: '2026-09-11T11:00:00.000Z'
  },
  cloud: {
    ...base.cloud,
    internalId: 'hub-public-99'
  }
};
const afterPublicPublish = preservePrivateIdentityAfterPublicPublish(base as any, publicPublishMutation as any) as any;
assert.equal(
  afterPublicPublish.cloud.internalId,
  'tournament-1',
  'Public Hub publish must never replace the permanent private internalId.'
);
assert.equal(afterPublicPublish.cloud.cloudTournamentId, 'cloud-1');
assert.equal(afterPublicPublish.cloud.baseRevision, 12);
assert.equal(afterPublicPublish.online.hubTournamentId, 'hub-public-99', 'Public Hub identity must remain in online metadata.');
assert.equal(afterPublicPublish.online.revision, 4, 'Public publish acknowledgement must be preserved.');

const differentPrivateRecord = {
  ...publicPublishMutation,
  cloud: {
    ...publicPublishMutation.cloud,
    cloudTournamentId: 'cloud-2'
  }
};
assert.equal(
  preservePrivateIdentityAfterPublicPublish(base as any, differentPrivateRecord as any),
  differentPrivateRecord,
  'Private identity must never be copied across different Cloud records.'
);

const appSource = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
assert.ok(appSource.includes('installWebCloudLineageWriteGuard()'), 'App must install the Web lineage write guard before Companion use.');
assert.ok(appSource.includes('protectCompanionCloudFacade(createCompanionCloudFacade(cloud))'), 'Companion Cloud actions must receive refreshed lineage.');

const handoffSource = fs.readFileSync(path.join(process.cwd(), 'src', 'companion', 'webCloudLineageHandoff.ts'), 'utf8');
assert.ok(handoffSource.includes('repairPrivateIdentityFromActiveCloud'), 'Companion handoff must repair legacy public-Hub identity overwrites from active private Cloud metadata.');
assert.ok(handoffSource.includes('publishWithPrivateIdentityGuard'), 'Publish Online must be wrapped by the private-identity guard.');
assert.ok(handoffSource.includes('preservePrivateIdentityAfterPublicPublish'), 'Public publish completion must restore private identity if an older provider path mutates it.');

const protectedManifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'SYNC-FREEZE-v1.06.00-beta.96.json'), 'utf8'));
assert.equal(protectedManifest.fingerprintContentSchema, 7, 'SYNC schema 7 must remain unchanged.');

console.log('PASS Web Cloud lineage handoff: stale Web state and public Hub publish cannot corrupt private Cloud identity.');
