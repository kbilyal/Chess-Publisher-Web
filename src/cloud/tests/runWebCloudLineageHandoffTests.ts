import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preserveNewestCloudLineage } from '../../companion/webCloudLineageHandoff';

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

const appSource = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
assert.ok(appSource.includes('installWebCloudLineageWriteGuard()'), 'App must install the Web lineage write guard before Companion use.');
assert.ok(appSource.includes('protectCompanionCloudFacade(createCompanionCloudFacade(cloud))'), 'Companion Cloud actions must receive refreshed lineage.');

const protectedManifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'SYNC-FREEZE-v1.06.00-beta.96.json'), 'utf8'));
assert.equal(protectedManifest.fingerprintContentSchema, 7, 'SYNC schema 7 must remain unchanged.');

console.log('PASS Web Cloud lineage handoff: stale Web state cannot manufacture a phantom Desktop/Cloud conflict.');
