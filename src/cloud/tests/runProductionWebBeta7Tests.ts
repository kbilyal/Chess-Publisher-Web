import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "production-web");
const index = readFileSync(join(root, "index.html"), "utf8");
const shell = index.replace(/<!-- cpProductionWeb .*?<\/body>/s, "</body>");
const expectedShell = "f6427a3c2ade30ec2799bdbcbf69688a3247e969c6f03e82daf11901386f791a";

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
assert(index.includes('params.get("cloudTournamentId")||params.get("cloud")||params.get("continue")'), "desktop continuation aliases missing");
assert(index.includes('const owned=hint?tournaments.find('), "empty continuation can auto-open the first tournament");
const cloudAdapter = readFileSync(join(root, "webview/CloudWorkspaceAdapter.js"), "utf8");
assert(cloudAdapter.includes('async function openCloudTournament(id'), "cloud open path missing");
assert(cloudAdapter.includes('api.getCurrentSnapshot(token,id)'), "cloud open does not load the latest snapshot");
assert(!/assets\/index-[^" ]+\.(?:js|css)/.test(index), "production shell contains Vite asset entry");
assert(!index.includes("src/main.tsx"), "production shell contains React entry point");
assert(!index.includes("Organizer Token") || !/https?:[^"' ]*Organizer Token/.test(index), "Organizer Token appears in a URL");
console.log("Production Web beta.7 regression: PASS");
