import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const screen = read('src/companion/CompanionCloudScreens.tsx');
const provider = read('src/cloud/OnlineCloudProviderV2.tsx');
const api = read('src/cloud/cloudWorkspaceApi.ts');
const workspace = read('src/companion/CompanionWorkspace.tsx');
const css = read('src/mobile-native.css');
const main = read('src/main.tsx');
const hardDeletePatch = read('scripts/patch-private-cloud-hard-delete-worker.py');

assert.ok(screen.includes('Search tournaments'), 'Tournament search is missing.');
assert.ok(screen.includes('meta.name, meta.localKey, meta.id'), 'Tournament search must cover name, local key and Cloud tournament ID.');
assert.ok(screen.includes('filtered.length === source.length'), 'Tournament search result count is missing.');
assert.ok(screen.includes('No tournaments match your search.'), 'Tournament search zero-result state must use the production copy.');
assert.ok(screen.includes('Delete from Cloud?'), 'Permanent Cloud delete confirmation is missing.');
assert.ok(screen.includes('including its stored private revisions and snapshots'), 'Permanent delete scope must be explicit.');
assert.ok(screen.includes('The Public Hub page and Chess-Results tournament are not deleted.'), 'Publication targets must remain independent from private Cloud deletion.');
assert.ok(screen.includes('window.location.reload()'), 'Main-list delete must clear legacy archive-state bookkeeping after server confirmation.');
assert.ok(screen.includes('Recently removed'), 'Legacy Trash recovery view is missing.');
assert.ok(!screen.includes('Moved to Trash</strong>'), 'Permanent delete must not expose a reversible Undo toast.');
assert.ok(!screen.includes('THIS BROWSER'), 'Obsolete This Browser continuation card must not be visible.');
assert.ok(!screen.includes('companion-local-continuation'), 'Obsolete local continuation card must be removed from My Tournaments.');

assert.ok(api.includes("method: 'DELETE'"), 'Cloud delete request must use the protected DELETE route.');
assert.ok(api.includes("'X-Expected-Revision'"), 'Cloud delete must carry expected revision protection.');
assert.ok(api.includes('restoreArchivedTournament'), 'Legacy archived-tournament restore API must remain available.');
assert.ok(provider.includes('archivePrivateCloudTournament'), 'Legacy provider callback used by the main-list delete surface is missing.');
assert.ok(provider.includes('restorePrivateCloudTournament'), 'Provider restore orchestration is missing.');
assert.ok(hardDeletePatch.includes('private_cloud_hard_delete_v1'), 'Permanent Cloud delete Worker marker is missing.');
assert.ok(hardDeletePatch.includes('deleteCloudTournamentPermanently'), 'Permanent Cloud delete Worker handler is missing.');
assert.ok(hardDeletePatch.includes('DELETE FROM cloud_tournaments'), 'Permanent Cloud delete must remove the private Cloud tournament record.');
assert.ok(hardDeletePatch.includes('objectKeys'), 'Permanent Cloud delete must clean stored snapshot objects best-effort.');

assert.ok(workspace.includes('companion-native-tabbar'), 'Native mobile tab bar marker is missing.');
assert.ok(workspace.includes("aria-current={active ? 'page' : undefined}"), 'Active mobile tab semantics are missing.');
assert.ok(css.includes('grid-template-columns: repeat(4'), 'Four-destination mobile tab bar layout is missing.');
assert.ok(css.includes('min-height: 56px'), 'Thumb-friendly tab targets are missing.');
assert.ok(css.includes('env(safe-area-inset-bottom)'), 'iOS safe-area handling is missing.');
assert.ok(css.includes('prefers-reduced-motion'), 'Reduced-motion accessibility is missing.');
assert.ok(css.includes('backdrop-filter'), 'Native material surface treatment is missing.');
assert.ok(main.includes("import './mobile-native.css';"), 'Native mobile refinement stylesheet is not loaded.');

console.log('Mobile native experience contract: search + permanent private Cloud delete + legacy Trash recovery + HUB-like iOS tab bar PASS');
