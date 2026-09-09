import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const api = read('src/cloud/cloudWorkspaceApi.ts');
const sync = read('src/cloud/onlineCloudSync.ts');
const panel = read('src/arbiter/OrganizerArbiterPanel.tsx');
const desktopResults = read('production-web/webview/ArbiterResultsDownloadAdapter.js');
const provider = read('src/cloud/OnlineCloudProviderV2.tsx');
const contract = read('docs/DESKTOP-CLOUD-SYNC-CONTRACT.md');

const has = (source, needle, message) => assert.ok(source.includes(needle), message || `Missing: ${needle}`);
const lacks = (source, needle, message) => assert.ok(!source.includes(needle), message || `Forbidden: ${needle}`);

// Stable tournament identity. Name/revision are never identity.
has(sync, 'internalId: string;', 'Portable Cloud identity must contain internalId.');
has(sync, 'cloudTournamentId?: string;', 'Portable Cloud identity must retain cloudTournamentId.');
has(contract, 'Tournament identity is `internalId` + `cloudTournamentId`, never the tournament name.', 'Normative identity contract must remain explicit.');
has(api, 'const internalId = clean(input?.localKey);', 'Cloud CREATE must use the stable internal identity supplied as localKey.');
has(api, "code: 'cloud_identity_missing'", 'CREATE without stable identity must fail closed.');
has(api, "code: 'cloud_identity_ambiguous'", 'Multiple stable identity matches must fail closed.');
has(api, 'if (matches.length === 1) return { ok: true, tournament: matches[0], reused: true };', 'Repeated CREATE must reuse the one existing Cloud object.');
lacks(api, 'item?.name ===', 'Tournament name must not be used to resolve identity.');

// Wrong-active-object overwrite protection.
has(api, 'snapshot?.cloudWorkspace?.internalId', 'Snapshot writes must carry/check stable identity.');
has(api, 'snapshot?.cloudWorkspace?.cloudTournamentId', 'Snapshot writes must check Cloud object identity.');
has(api, 'internalId !== remoteInternalId', 'Mismatched stable identity must stop before PUT.');
has(api, "code: 'cloud_identity_mismatch'", 'Wrong Cloud target must fail closed.');
has(api, "headers: { 'X-Expected-Revision': String(baseRevision) }", 'Revision guard must remain on every snapshot write.');

// Arbiter results belong to Desktop beta79 unified SYNC consumption.
has(panel, 'waiting for Desktop ↕ SYNC', 'Organizer UI must expose pending results without consuming them.');
lacks(panel, 'acknowledgeResults(', 'Organizer Web must not ACK Desktop-bound pending results.');
lacks(panel, 'cloud.syncNow(', 'Organizer Web must not pre-consume result queue via a hidden sync.');
has(desktopResults, '/arbiter-results', 'Desktop result step must read the pending Cloud queue.');
has(desktopResults, 'submission?.whiteKey', 'Desktop must validate white-player identity.');
has(desktopResults, 'submission?.blackKey', 'Desktop must validate black-player identity.');
has(desktopResults, 'pairing changed', 'Pairing identity mismatch must fail closed.');
has(desktopResults, 'await saveLocalTournament();', 'Results must save locally before acknowledgement.');
has(desktopResults, 'await window.cpCloudSyncCurrent', 'Results must continue through the existing unified SYNC path.');
has(desktopResults, 'await verifyCloudSnapshot', 'Cloud state must be verified before acknowledgement.');
has(desktopResults, '/arbiter-results/ack', 'Only the validated Desktop path may ACK exact result versions.');
has(desktopResults, 'updatedAt', 'ACK must remain version-guarded.');

// Private Cloud and public publishing stay independent.
has(provider, 'publishOnline:', 'Public Hub publish remains a separate explicit action.');
lacks(api, '/api/v1/hub', 'Private Cloud API must not implicitly publish to the public Hub.');

console.log('BETA79_UNIFIED_SYNC_COMPAT=PASS');