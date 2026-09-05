import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "production-web");
const index = readFileSync(join(root, "index.html"), "utf8");
const shell = index.replace(/<!-- cpProductionWeb .*?<\/body>/s, "</body>");
const expectedShell = "70ffb3b26ea89220feb52dbfcbb79335bc87e85702990bcefa979039bd4e2fd3";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(createHash("sha256").update(shell).digest("hex") === expectedShell, "beta.6 desktop shell checksum changed");
for (const marker of ["cpProductionWeb", "cpLinuxWebDev", "Chess-Publisher", "Online & Cloud", "Pull Changes", "Sync Now"]) {
  assert(index.includes(marker), `missing production marker: ${marker}`);
}
for (const file of [
  "CNAME",
  "web/browser-dev-host.js",
  "web/fide-browser-adapter.js",
  "hub/client/hub-snapshot.js",
  "hub/client/hub-api-client.js",
  "webview/HubAdapter.js",
  "cloud/client/cloud-workspace-api.js",
  "webview/CloudWorkspaceAdapter.js",
]) {
  assert(statSync(join(root, file)).isFile(), `missing production file: ${file}`);
}
assert(readFileSync(join(root, "CNAME"), "utf8").trim() === "web.chess-publisher.org", "production CNAME mismatch");
for (const marker of [
  "My Tournaments",
  "Organizer Token",
  "data-cp-open",
  "cloudTournamentId",
  '<option value="active">Active</option>',
  '<option value="registration">Registration</option>',
  '<option value="finished">Finished</option>',
  '<option value="deleted">Deleted</option>',
  '<option value="archived">Archived</option>',
  "Advanced / Diagnostics / Danger zone",
  "cpCloudOpenTournament",
  "Create New Tournament",
  "Back to My Tournaments",
  "Refresh My Tournaments",
  "Technical details",
  "cpTokenOnlyGate",
]) {
  assert(index.includes(marker), `missing beta.7 behavior: ${marker}`);
}
assert(index.includes('dataset.cpProductionWeb==="1"'), "production Web detection missing");
assert(index.includes('desktopCreateScreen.style.display="none"'), "desktop New Tournament startup modal is not suppressed");
assert(index.includes('api().listTournaments(token)'), "My Tournaments does not load the organizer tournament list");
assert(index.includes('tournament.webOrigin={source:offlineMode?"Browser":"Web",status:"registration"}'), "Web/local tournament source/status metadata missing");
assert(index.includes('window.cpCloudSyncCurrent({force:true,quiet:false})'), "new Web tournament does not sync to cloud");
assert(index.includes('if(offlineMode){loadLocalTournaments();return;}'), "browser-only tournament list path missing");
assert(index.includes('data-cp-local='), "browser-only tournaments cannot be opened");
assert(index.includes("document.getElementById('cpBeta7Offline')?.remove()"), "public token-only gate does not remove the browser-only sign-in action");
assert(index.includes("if(!cpAutosaveCaptureSync) cpStateRevision++;"), "autosave UI capture creates a duplicate persistence revision");
assert(index.includes('params.get("cloudTournamentId")||params.get("cloud")||params.get("continue")'), "desktop continuation aliases missing");
assert(index.includes('const owned=hint?tournaments.find('), "empty continuation can auto-open the first tournament");
const cloudAdapter = readFileSync(join(root, "webview/CloudWorkspaceAdapter.js"), "utf8");
assert(cloudAdapter.includes('async function openCloudTournament(id'), "cloud open path missing");
assert(cloudAdapter.includes('api.getCurrentSnapshot(token,id)'), "cloud open does not load the latest snapshot");
assert(cloudAdapter.includes("const cloudMetadataRevisions=new Set();"), "cloud metadata saves are not distinguished from tournament edits");
assert(cloudAdapter.includes("if(cloudMetadataRevisions.delete(revision))return;"), "cloud metadata save can retrigger automatic sync");
assert(!cloudAdapter.includes('meta.lastSyncedContentHash===contentHash){\n            setRuntime(name,tournament,"synced","Synced")'), "sync can report current before checking the remote revision");
assert(cloudAdapter.includes("if(meta.cloudTournamentId&&baseRevision>0){"), "sync does not inspect newer remote revisions");
const browserHost = readFileSync(join(root, "web/browser-dev-host.js"), "utf8");
assert(browserHost.includes('const ORGANIZER_KEY="organizer-primary"'), "browser organizer identity key missing");
assert(browserHost.includes('cpweb.organizerToken.remembered'), "canonical Web organizer token persistence missing");
assert(browserHost.includes('cpstudio.organizerToken.remembered'), "Cloud organizer token alias persistence missing");
assert(browserHost.includes('unifiedOrganizerIdentity:true'), "Hub/Cloud/Chess-Results organizer identity is not unified");
assert(browserHost.includes('organizerCredentialStorage:"localStorage-browser-profile"'), "organizer token does not survive Web reloads on the same browser profile");
assert(browserHost.includes('removeOrganizerToken()'), "sign-out cannot clear the shared organizer credential");
assert(browserHost.includes('const HUB_API_ORIGIN="https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev"'), "production Web Hub direct-origin compatibility shim missing");
assert(browserHost.includes('headers.delete("X-Client-Version")'), "production Web can still trigger Hub CORS preflight with the optional client-version header");
assert(browserHost.includes('hubCorsCompatibility:true'), "production Hub CORS compatibility capability marker missing");
assert(browserHost.includes('function installWebManualSave()'), "explicit Web Save installer missing");
assert(browserHost.includes('cpWebManualSaveButton'), "explicit Web Save control missing");
assert(browserHost.includes('if(typeof window.saveAll==="function")window.saveAll()'), "Web Save does not capture current UI state");
assert(browserHost.includes('manualSave:true'), "Web Save capability marker missing");
const chessResultsAdapter = readFileSync(join(root, "web/chess-results-browser-adapter.js"), "utf8");
assert(chessResultsAdapter.includes('window.cpNativeHubSecretGet(ORGANIZER_SECRET_KEY)'), "Chess-Results does not consume the shared organizer credential");
assert(chessResultsAdapter.includes('cpweb.organizerToken.remembered'), "Chess-Results remembered-token fallback missing");
assert(chessResultsAdapter.includes('https://chess-publisher-chess-results.kyamranbilyal.workers.dev/api/chess-results/'), "Chess-Results browser transport still targets the Fastly/GitHub Pages origin and can return HTTP 405");
assert(chessResultsAdapter.includes('transport:"cors-worker-direct"'), "Chess-Results direct Worker transport marker missing");
assert(chessResultsAdapter.includes('credentials:"omit"'), "cross-origin Chess-Results Worker call must not send unrelated site credentials");
assert(chessResultsAdapter.includes('const CONTINUITY_KEY="cpweb.refresh.continuity.v1"'), "Web refresh continuity state key missing");
assert(chessResultsAdapter.includes('window.cpCloudOpenTournament(text(state.cloudId),{skipLocalPreSync:true})'), "Web refresh does not reopen the active Cloud tournament");
assert(chessResultsAdapter.includes('window.showTab(id,button)'), "Web refresh does not restore the active tab");
assert(chessResultsAdapter.includes('#cpBeta7Back,#cpBeta7CloudRefresh,#cpBeta7SignOut'), "explicit return-to-list/sign-out does not clear refresh continuity");
assert(chessResultsAdapter.includes('refreshContinuity:true'), "refresh continuity capability marker missing");
assert(!chessResultsAdapter.includes('function installAlwaysOnInstantPersistence()'), "unsafe Web instant autosave wrapper reintroduced");
assert(!chessResultsAdapter.includes('window.scheduleAutosave=function()'), "production adapter must not override core autosave scheduling");
assert(!chessResultsAdapter.includes('window.toggleAutosave=function()'), "production adapter must not override core autosave toggle/runtime state");
assert(!/assets\/index-[^" ]+\.(?:js|css)/.test(index), "production shell contains Vite asset entry");
assert(!index.includes("src/main.tsx"), "production shell contains React entry point");
assert(!index.includes("Organizer Token") || !/https?:[^"' ]*Organizer Token/.test(index), "Organizer Token appears in a URL");
console.log("Production Web beta.7 regression: PASS");
