import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const screen = read('src/companion/CompanionCloudScreens.tsx');
const provider = read('src/cloud/OnlineCloudProviderV2.tsx');
const api = read('src/cloud/cloudWorkspaceApi.ts');
const workspace = read('src/companion/CompanionWorkspace.tsx');
const css = read('src/mobile-native.css');
const main = read('src/main.tsx');

assert.ok(screen.includes('Search tournaments'), 'Tournament search is missing.');
assert.ok(screen.includes('meta.name, meta.localKey, meta.id'), 'Tournament search must cover name, local key and Cloud tournament ID.');
assert.ok(screen.includes('filtered.length === source.length'), 'Tournament search result count is missing.');
assert.ok(screen.includes('No matching tournaments.'), 'Tournament search zero-result state is missing.');
assert.ok(screen.includes('Move to Trash'), 'Safe Trash confirmation is missing.');
assert.ok(screen.includes('Recently removed'), 'Trash recovery view is missing.');
assert.ok(screen.includes('Undo'), 'Reversible delete feedback is missing.');
assert.ok(!screen.includes('THIS BROWSER'), 'Obsolete This Browser continuation card must not be visible.');
assert.ok(!screen.includes('companion-local-continuation'), 'Obsolete local continuation card must be removed from My Tournaments.');

assert.ok(api.includes("listArchivedTournaments"), 'Archived tournament API client is missing.');
assert.ok(api.includes("method: 'DELETE'"), 'Archive request must use the protected DELETE route.');
assert.ok(api.includes("'X-Expected-Revision'"), 'Safe archive must carry expected revision.');
assert.ok(api.includes('restoreArchivedTournament'), 'Restore API client is missing.');
assert.ok(provider.includes('archivePrivateCloudTournament'), 'Provider archive orchestration is missing.');
assert.ok(provider.includes('restorePrivateCloudTournament'), 'Provider restore orchestration is missing.');
assert.ok(provider.includes('private revisions preserved'), 'Safe-delete preservation contract is missing.');

assert.ok(workspace.includes('companion-native-tabbar'), 'Native mobile tab bar marker is missing.');
assert.ok(workspace.includes("aria-current={active ? 'page' : undefined}"), 'Active mobile tab semantics are missing.');
assert.ok(css.includes('grid-template-columns: repeat(4'), 'Four-destination mobile tab bar layout is missing.');
assert.ok(css.includes('min-height: 56px'), 'Thumb-friendly tab targets are missing.');
assert.ok(css.includes('env(safe-area-inset-bottom)'), 'iOS safe-area handling is missing.');
assert.ok(css.includes('prefers-reduced-motion'), 'Reduced-motion accessibility is missing.');
assert.ok(css.includes('backdrop-filter'), 'Native material surface treatment is missing.');
assert.ok(main.includes("import './mobile-native.css';"), 'Native mobile refinement stylesheet is not loaded.');

console.log('Mobile native experience contract: search + reversible Trash + HUB-like iOS tab bar PASS');
