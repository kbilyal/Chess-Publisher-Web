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
  "hub/client/hub-snapshot.js",
  "hub/client/hub-api-client.js",
  "webview/HubAdapter.js",
  "cloud/client/cloud-workspace-api.js",
  "webview/CloudWorkspaceAdapter.js",
]) {
  assert(statSync(join(root, file)).isFile(), `missing production file: ${file}`);
}
assert(readFileSync(join(root, "CNAME"), "utf8").trim() === "web.chess-publisher.org", "production CNAME mismatch");
for (const marker of ["My Tournaments", "Organizer Token", "data-cp-open", "cloudTournamentId", "Deleted / Archived", "Advanced / Diagnostics / Danger zone", "cpCloudOpenTournament"]) {
  assert(index.includes(marker), `missing beta.7 behavior: ${marker}`);
}
assert(!/assets\/index-[^" ]+\.(?:js|css)/.test(index), "production shell contains Vite asset entry");
assert(!index.includes("src/main.tsx"), "production shell contains React entry point");
assert(!index.includes("Organizer Token") || !/https?:[^"' ]*Organizer Token/.test(index), "Organizer Token appears in a URL");
console.log("Production Web beta.7 regression: PASS");
