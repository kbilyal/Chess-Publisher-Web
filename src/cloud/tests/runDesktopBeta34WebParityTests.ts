import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");
const sha256 = (rel: string) => createHash("sha256").update(readFileSync(resolve(root, rel))).digest("hex");
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const html = read("production-web/index.html");
const cloud = read("production-web/webview/CloudWorkspaceAdapter.js");
const cloudApi = read("production-web/cloud/client/cloud-workspace-api.js");

assert(/data-chesspublisher-version="1\.06\.00-beta\.34"/.test(html), "production shell is based on desktop beta.34 branding");
assert(html.includes("CP-BETA19-EXPLICIT-LATE-ENTRY"), "beta.19 late-entry parity is present");
assert(html.includes("CP-BETA25-DELETE-ANYTIME"), "beta.25 delete-anytime safety is present");
assert(html.includes("CP-BETA29-TRF-EXPORT-RELIABILITY"), "beta.29 TRF export reliability is present");
assert(html.includes("CP-BETA12-SMART-SCHEDULE-REPAIR-START"), "Smart Schedule repair remains present");
assert(html.includes("pairing-export-classic-table"), "compact exact Pairings export is present");
assert(html.includes("id=\"peFontFamily\"") && html.includes("id=\"peBold\""), "Pairings export font/bold controls are present");
assert(html.includes("requestIdleCallback(startFideBackground,{timeout:2500})"), "FIDE cache restore is deferred until browser idle");
assert(html.includes("New tournament automatic Cloud sync:"), "new tournaments auto-sync to private Cloud");
assert(html.includes("window.cpCloudSyncCurrent({force:true,quiet:true,allowPull:false})"), "new-tournament auto-sync is upload-only");
assert(html.includes("Tournament-open automatic Cloud sync:"), "opened/switched tournaments auto-sync safely");
assert(html.includes("window.cpCloudSyncCurrent({quiet:true,allowPull:false})"), "open/switch auto-sync never auto-pulls");
assert(!html.includes("window.cpCloudSyncCurrent({quiet:true,allowPull:true})"), "no unsafe automatic cloud pull is introduced");

assert(cloud.includes('localStorage.getItem(AUTO_SYNC_KEY)!=="0"'), "automatic Cloud sync is default-on unless explicitly disabled");
assert(cloud.includes("Local tournament could not be saved. Pull was cancelled."), "Pull Changes saves the local copy before cloud reconciliation");
assert(cloud.includes("Pull Changes will now use the CLOUD copy."), "two-sided Pull conflict requires explicit cloud-authoritative confirmation");
assert(cloud.includes("cloudMetadataRevisions=new Set()"), "Web metadata-loop suppression remains intact");
assert(cloud.includes('const ORGANIZER_SECRET_KEY="organizer-primary"'), "existing Web organizer-token bridge key remains intact");

assert(!/headers\.set\(["']X-Client-Version["']/.test(cloudApi), "optional X-Client-Version request header is absent from Cloud API requests");
assert(cloudApi.includes("X-Expected-Revision"), "Cloud revision guard is preserved");
assert(cloudApi.includes("loopbackDesktop") && cloudApi.includes('fetchImpl("/cloud-proxy"'), "beta.34 desktop proxy compatibility remains available only on loopback hosts");
assert(cloudApi.includes("DEFAULT_BASE_URL"), "public Web continues to use the official Cloud API base URL");

const protectedHashes: Record<string, string> = {
  "production-web/web/chess-results-browser-adapter.js": "6d313e9f6ef3d0fc313f8ca1df3fee5d0b862f51d808ba9fd94bb3605735d3fa",
  "production-web/hub/client/hub-api-client.js": "2311446a69c16a14e041dbf08d4e198280d3a3f1232b739bf8e089d8ffdac9f0",
  "production-web/hub/client/hub-snapshot.js": "d980c520d74a71e66b3a3aa2a54e5ed626ea3618c53159145f9e48b445effac9",
  "production-web/webview/HubAdapter.js": "5477080af2e9dce1dcb25b622bf4aa8e77bc977a2f60759d175e6a8464bf8348",
};
for (const [path, expected] of Object.entries(protectedHashes)) {
  assert(sha256(path) === expected, `${path} is byte-identical to the protected pre-beta34 Web baseline`);
}

console.log("Desktop beta.34 -> Web parity gate: PASS");
