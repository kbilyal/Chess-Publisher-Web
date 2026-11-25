# SYNC final verification · 24 November 2026

**FINAL GATE FAIL.** Both working trees contain the local candidate. The active Freeze Guard rejects the protected diff. Real Google sign-in with two accounts, the full Windows Desktop WebView roundtrip, and a verified production Worker source mapping remain open. The candidate also rejects a reproduced sparse snapshot whose content changes during browser normalization. No release commit, push, merge, or deployment was made in this pass.

## Baselines and live comparison

| Reference | Verified state |
| --- | --- |
| Frozen beta.96 r4 | Baseline source `1dac6498`, Freeze Guard commit `0837810`, all 11 protected blobs match. The actual guard exits 0 on the frozen checkout. The parent of SSO commit `e75dfd6` also matches all 11. |
| SSO `e75dfd6` | Introduced exactly two protected blob changes. The Provider added Google resume, cookie auth, bridge activation and a shared-storage purge on organizer change. The API client changed the Hub origin and added cookie credentials and auth routes. Revision headers and the schema-7 projection are outside that diff. |
| GitHub Parity main `d8e8589` and test branch `codex/final-gate-linux-2026-11-24` at `d44680c` | Both contain the same two SSO blobs. The Linux branch is the prior test snapshot. The older `test/sync-full-lifecycle-gate` at `9d784fa` matches all 11 frozen blobs. |
| Live Web and Companion | Companion build metadata reports `779b78b533b8338e1114816e6fb3828bcd35c4d2`. Live `host.js`, `login.mjs`, `login.css`, `workspace.css`, `autosave.js`, and `engine-adapter.js` match that commit byte for byte. The diff from `779b78b` to GitHub main is the public Hub diagnostic report. The production Worker version for the site recorded in the prior audit is `cdc1ee6b-843c-444d-ba76-1c3a22e4abad`. [Live Companion build information](https://web.chess-publisher.org/companion-build-info.json) · [Site deployment run](https://github.com/kbilyal/Chess-Publisher-Web/actions/runs/45389748925) |
| Live Hub API | Health returned HTTP 200 with D1 and B2, anonymous auth status returned HTTP 200, and anonymous private tournament list returned HTTP 401. The prior read-only audit recorded Worker version `e0d3be98-f055-4673-b729-70d0f55dcb72` and two JS modules. An immutable Git mapping to that Worker remains unverified. A fresh OPTIONS request omits `X-Expected-Organizer` from allowed headers. The local cookie-bound clients require the paired Worker contract. [Hub health](https://api.chess-publisher.org/api/v1/health) · [Read-only live Worker audit](https://github.com/kbilyal/Chess-Publisher-Web/actions/runs/45463740186) |
| Web Full | GitHub main `9fdd805`. Remote security/UI test branch `5f40174`. Local HEAD `65ffad8` contains the Hub API source copy and cookie session integration, one commit ahead of main before this pass. The public `/app/` deployment is built from the Parity repository. [Prior Web Full Linux validation](https://github.com/kbilyal/ChessPublisher-Web-Full/actions/runs/45266395510) |

| Protected path | Frozen | SSO, GitHub main, test snapshot and production |
| --- | --- | --- |
| `src/cloud/OnlineCloudProviderV2.tsx` | `c1e2e4a4882fc4c5e48686fdaef0108ddf96d140` | `71aa6dda90567e21e636a81b302d32ffc2d9cb1c` |
| `src/cloud/cloudWorkspaceApi.ts` | `f6adbfb385a61d2daf5702935f912dc89d350975` | `ed081163181082449605e1cef3631b00ad1d1dd1` |

The separate [proposed baseline](sync-freeze-proposal-2026-11-24.json) records the two candidate replacements and a third protected diff in `src/companion/companionCloudActions.ts`, required so its reads and writes follow the same organizer-scoped storage as the Provider. Eight original blobs still match. The proposal also lists the new storage helper for protection. The active manifest, workflow and guard test are unchanged. The LF-controlled candidate run exits 1 at the Provider, and the full blob comparison identifies all three differences. The default Windows CRLF checkout reports an earlier raw-byte mismatch in an unmodified file. [Original SSO commit](https://github.com/kbilyal/Chess-Publisher-Web/commit/e75dfd6882af74ed74db04d3dc8d55dde5048f26) · [GitHub Freeze Guard failure](https://github.com/kbilyal/Chess-Publisher-Web/actions/runs/45389748752)

## Exact local changes

**ChessPublisher-Web-Parity**

- `src/cloud/OnlineCloudProviderV2.tsx` checks that the verified workspace belongs to the Google organizer that opened it, avoids falling back to remembered token access when Google verification fails, checks for account changes across tabs, confirms logout, and recovers a scoped draft when its Cloud ID and internal ID both match.
- `src/cloud/cloudWorkspaceApi.ts`, `src/cloud/hubApi.ts`, and `src/arbiter/arbiterApi.ts` bind cookie-authenticated requests to the expected organizer. The cookie and server-side principal remain authoritative.
- `src/cloud/organizerTournamentStorage.ts` scopes persisted drafts by organizer. The Provider, Companion actions and workspace, lineage handoff, publish guard, tournament repository, Arbiter views, and Chess-Results continuity lookup all use that scope. The old shared record is migrated only when its saved organizer matches. The Chess-Results wire protocol stays intact.
- `deploy/public-site/desktop-web/host.js`, `login.mjs`, and `deploy/public-site/site-auth.js` extend the existing sign-out and cross-tab fixes to pin the organizer on Cloud, account panel and bridge requests. The host preserves HTTP Request method and body and honors the existing configured Hub origin for isolated Organizer Token sessions.
- `deploy/public-site/desktop-web/build-workspace.py` adds a browser pull preflight against the exact schema-7 fingerprint before committing a pull. If browser normalization changes the signed-in organizer's remote content, the local data and common base are preserved and the original post-save check still runs for accepted pulls.
- `tests/ui/companion-web-entry-smoke.mjs` checks organizer-pinned requests and stale Companion tab recovery after an account switch. `tests/ui/local-sync-runtime.mjs` uses Chromium, the shipped Desktop client library and the local Worker with SQLite to exercise both directions and the rejected sparse snapshot.

**ChessPublisher-WEB**

- `workers/hub-api/src/auth.js` resolves the unique-index conflict by atomically replacing the unused generated organizer association with the legacy organizer. The old empty organizer is retired. The verified Desktop token, legacy organizer ID, existing tournament IDs, revisions, credentials and object keys remain in place. Nullable legacy ownership columns are backfilled inside the same transaction.
- Linking refuses pre-existing tournaments, credentials, settings, devices or any organizer already reserved by a Google workspace write. Two concurrent claims produce one winner. A session or bridge tied to the retired organizer is rejected. Already-linked callers with the current binding can safely retry.
- `workers/hub-api/src/worker.js` uses organizer ownership for private Publisher Hub checks and retains the user consistency check. `security.js` admits the expected organizer header in CORS. The Cloud revision and checker code are outside these changes.
- `desktop-web/host.js` and `desktop-web/login.mjs` carry the organizer-bound portal transport and stale-tab invalidation into the Web Full copy. Existing local Express authorization and logout corrections are preserved.
- `test/hub-worker-auth-security.test.mjs`, `test/workspace-auth-security.test.mjs`, and `test/hub-worker-sync-lifecycle.test.mjs` cover the revised authentication and linking contract. `scripts/sync-acceptance-storage.mjs` and `scripts/serve-sync-acceptance.mjs` prepare an isolated runtime backed by real SQLite and a local B2 protocol fixture.

The working trees also retain the previously staged and unstaged parity, sign-out, UI and dependency fixes. No changes were made to Gacrux, BBP, pairing algorithms, tie-break core, Chess-Results protocol, or the FIDE Refresh workflow. No production D1 or B2 writes were made. The local Worker copy should be reconciled with the exact active Worker modules before any release review.

## Verification

| Check | Result |
| --- | --- |
| Actual SYNC Freeze Guard | Frozen checkout **PASS**, GitHub main and the LF local candidate **FAIL**. |
| Checker provenance and phantom conflict | Both dedicated regressions **PASS**, with schema 7 and same-revision content no-op verified separately. |
| Parity npm suites | 20 of 22 pass in the LF checkout. Includes Cloud roundtrip and lifecycle, FIDE, transactions, finalization, Desktop beta.34 contract, TRF, checker and Chess-Results. Architecture and native parity fail in this Windows run with Linux executable or fixture launch errors. The previous Linux branch passed 34/34 and 11/11. [Historical Linux run](https://github.com/kbilyal/Chess-Publisher-Web/actions/runs/45469723648) |
| Parity standalone regressions | 28 of 30 pass. The exceptions are the actual Freeze Guard and `v6-approved-layout.test.mjs` for a missing `data-active-tab` marker. The same V6 check already fails in clean GitHub main. |
| Web Full npm test | 44 of 53 pass. Nine native pairing integration cases require the Linux Gacrux/BBP fixture environment and fail on this Windows host. This is also the failure family recorded for the original candidate. |
| Other repository checks | Chess-Results Worker, Players XML roundtrip, pinned Python Web Engine runtime, pairing preview at 390px and 1440px, and 16 public Tournament Hub calendar assertions pass. Both npm audits report zero High or Critical findings. Parity has one Low advisory and Web Full reports zero advisories. |
| Build and UI preservation | TypeScript, Vite and pinned public workspace builds pass. Generated TRF26 and 16/16 eligibility pass. Chromium workspace smoke, FIDE cache, and TXT/PDF smoke pass. The 8 tabs at 5 widths, pairing, Chess-Results retry/Admin/Upload Data fixtures, print, registration, autosave retry and reload are covered. An authenticated production sweep remains open. |
| SQLite Worker session lifecycle | **PASS** for concurrent legacy claims with the actual unique index, unchanged-content idempotence, simultaneous writes, denied wrong-organizer list/get/put/restore, stale cookie and bridge, and restore creating a new revision. JWT identities and B2 objects are fixtures. |
| Local Desktop client, Web and Cloud | **PASS** with Chromium, the existing Windows Desktop Cloud API client library, actual Hub request handlers, SQLite and local B2 emulation. Web autosave reached r2, Desktop client wrote r3, Web pulled r3 for the same Cloud ID and internal ID, and the second Organizer Token got 404. Sparse r4 was retained remotely while the Browser kept r3. |
| Google sign-in and account switching | The Chromium SSO and account switch fixture passes. The browser locks the stale account view and the two fixture accounts have separate storage. Real Google authentication and two real identities remain pending. |
| Full Windows runtime | The tool runner rejected launch with a PowerShell execution-policy override. A standard invocation confirmed the host blocks unpacked LocalEngine scripts. The Desktop client test exercises the shipped JS client through its supported `baseUrl` option and calls the Worker's normal authorization and revision checks. The signed/approved WebView launch and native persistence need a Windows test environment where the portable release can run under the existing policy. |
| Sparse snapshot | A remote snapshot missing `playerKeySchema`, `pairings.showScheduleOnPrint`, and `pairings.engine.rankCorrectionNeedsResort` repros a readback mismatch when the browser supplies those defaults. The candidate stops before saving or advancing the base. Acceptance or migration rules for this sparse form still need agreement with the frozen Desktop contract. |

## Isolated manual acceptance

Use disposable tournaments, a dedicated test OAuth client and two Google accounts. The local runtime binds to loopback, persists SQLite under the supplied state directory, and replaces Backblaze with local object storage. Its Worker uses live Google public signing keys when a test OAuth client ID is configured. Create a Web application OAuth client with authorized JavaScript origins `http://localhost` and `http://localhost:8789`. If its consent screen is in testing, add both Google accounts as test users. [Google Identity Services client setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)

The portal and Companion builds used here are already available at `%TEMP%\cp-sync-acceptance-portal\app` and `ChessPublisher-Web-Parity\dist`. To rebuild, run `npm run build` in Parity and use its existing `deploy/public-site/desktop-web/build.sh` with the pinned browser engine from `deploy/public-site/pairing-preview/build.sh`. Run from the Web Full root and use a fresh state directory for the real Google accounts.

```powershell
$env:CP_SYNC_ACCEPTANCE_GOOGLE_CLIENT_ID = '<test Web application client ID>'
node scripts/serve-sync-acceptance.mjs "$env:TEMP/cp-sync-acceptance-portal/app" "../ChessPublisher-Web-Parity/dist" "$env:TEMP/cp-sync-google-manual" 8789
```

1. In an isolated Windows profile or VM with the approved Desktop portable package, copy the package to a scratch directory. In that copy only, set `$cloudProxyRemoteBase = 'http://localhost:8789'` in `ChessPublisher-LocalEngine.ps1`. Use the approved launcher under the existing Windows script policy and enter `local-desktop-a` from the acceptance state's `acceptance-tokens.json`. The test profile keeps Desktop tournament files, credentials and WebView storage separate. Open Web manually at the localhost URL and use no production publishing actions.
2. In Desktop, create a synthetic tournament with four players, save and run **SYNC** to create r1. Record the Cloud ID, internal ID and r1 from the test API or local sync trace. In browser profile A, open `http://localhost:8789/app/?account=1` and sign in as real Google account A. Before creating data or issuing a token for the new Google workspace, open the browser console on that same origin and run the snippet below once. It uses the existing legacy-link endpoint. Confirm the Desktop tournament appears on reloading the account page and that its identifiers and r1 are intact.

```js
const organizerToken = prompt('Enter the disposable local-desktop-a Organizer Token');
const response = await fetch('/api/auth/link-organizer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ organizerToken })
});
console.log(response.status, (await response.json()).linkedOrganizerId);
```

3. Open r1 from My Cloud Tournaments. Change Venue in Web and wait for **Saved to private Cloud**. In Desktop use **SYNC** and verify Web's r2 venue and the same IDs. Edit another field in Desktop and SYNC again. In Web use **SYNC** to pull r3 and verify the second edit and stable IDs. Run SYNC again on each side and confirm the revision stays r3. Repeat through Companion at `http://localhost:8789/`.
4. Start from the same revision in Desktop and Web. Make different edits to the same field and synchronize. Record one winning revision and an explicit conflict or revision rejection for the stale edit. Repeat with changes to different fields and record the reconciliation result. Use a browser network interruption after an edit, confirm the draft survives, then reconnect and confirm the retry uses the correct base. Restore a prior revision and confirm the restore creates a new revision with the original identity.
5. In browser profile B sign in as real Google account B. Confirm A's tournament is absent from B's list and A's known Cloud ID returns HTTP 404 for GET, a guarded PUT, and restore when using B's session. Use synthetic data in every request. Try to link the already claimed A token as B and require HTTP 409. Create a B tournament with the same display name and verify A cannot see or edit it and that A's record and revision remain intact.
6. In profile A, leave an A Web workspace and Companion tab open. Sign A out, then sign in as B in the same profile. Return to both old tabs and verify A's data is cleared from the rendered workspace, stale requests are rejected, and B's tournament is the only one listed. Sign back in as A and verify A's earlier scoped draft or Cloud record is available. Temporarily fail logout and confirm the UI shows retry and keeps the current session until the Hub confirms logout.
7. Record the native runtime package hash, Google acceptance result, IDs and revisions, overlap/recovery evidence, and the Worker version tested. Run the candidate on Linux with both native engines and execute the actual guard again after approved baseline adoption. Reconcile the exact live Worker source and complete the authenticated UI sweep before release approval.

For step 5, run this from the local account page in profile B. Enter the organizer IDs recorded by each profile's `/api/auth/me`. The snippet checks its origin and the current B identity before sending any writes. The body uses a synthetic one-tournament snapshot and revision 0.

```js
if (location.origin !== 'http://localhost:8789') throw new Error('Use the isolated loopback site');
const aOrganizer = prompt('A organizer ID');
const bOrganizer = prompt('B organizer ID');
const aCloudId = prompt('A Cloud tournament ID');
const me = await fetch('/api/auth/me').then(response => response.json());
if (!bOrganizer || bOrganizer === aOrganizer || me.user?.organizerId !== bOrganizer ||
    !/^cloud_[a-f0-9]{32}$/i.test(aCloudId)) throw new Error('Check the test identities');
const base = '/api/v1/cloud/tournaments/' + aCloudId;
const headers = {
  'Content-Type': 'application/json',
  'X-Expected-Organizer': bOrganizer,
  'X-Expected-Revision': '0'
};
const name = 'Isolation fixture';
const status = [
  (await fetch(base + '/snapshot', { headers })).status,
  (await fetch(base + '/snapshot', {
    method: 'PUT', headers,
    body: JSON.stringify({ baseRevision: 0, snapshot: {
      data: { currentTournament: name, tournaments: { [name]: { name } } }
    } })
  })).status,
  (await fetch(base + '/restore/1', { method: 'POST', headers })).status
];
console.log(status); // Expected [404, 404, 404]
```
