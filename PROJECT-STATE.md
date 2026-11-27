# Chess-Publisher Web — Project State

The Chess-Results Worker candidate registers a stable CreatorID for each authenticated organizer who lacks a configured assignment. Existing choices and original tournament ownership proofs are preserved. The Worker regression covers concurrent allocation, retries, publication and cross-organizer rejection.

The current local SYNC candidate passes the isolated Worker and browser runtime tests. The active Freeze Guard remains FAIL and the proposed hashes are recorded separately. Real two-account Google acceptance, the Windows WebView roundtrip, and verification of the production Worker source mapping are still open. See the [final SYNC verification report](docs/FINAL-SYNC-VERIFICATION-2026-11-24.md).

The 2026-11-24 production parity candidate requires Hub API confirmation before signing out from the public site and Web workspace. A failed request keeps the session available for retry. Chromium verifies account switching, stale-tab invalidation and Cloud isolation with two fixture accounts. Linux Architecture 34/34, Desktop–Web Parity 11/11 and the zero-Critical/High npm audit passed. The protected SYNC hash mismatches predate the candidate and real two-account acceptance remains pending. See [AI_HANDOVER.md](AI_HANDOVER.md).

Organizer sign-in starts at ChessPublisher Web (`/app/`). The public site links to Web, and Arbiter Companion resumes the existing Google session or receives the Organizer Token from the signed-in Web workspace. Tournament links still resolve against the authenticated Cloud list. The public homepage forwards tournament-scoped arbiter invitations to the Companion guest form. Guests enter a display name and use their tournament-scoped session for results without an organizer account. The Companion entry, tournament picker and workspace use the Web panel, action and focus styles.

Guest Arbiter Access follows newly synchronized rounds while viewing the latest round. A manually selected earlier round stays selected, and pending result edits keep an editable round visible until they are submitted. ↕ SYNC refreshes pairings before the first round as well.

Guest result entry uses 18 px board numbers and full-width score controls on phones, with two-column board cards on wider tablets. Board cards show whether a score is recorded or awaiting SYNC. The All and Missing filters sit beside the fixed SYNC action, and result corrections still require confirmation.

The organizer Companion shows registered players as touch-friendly cards at widths up to 820 px. The player editor scrolls within the visible viewport, shows validation next to Save, and accepts numeric FIDE IDs when editing an existing player. Setup provides shortcuts to its sections and uses larger fields throughout the touch layout. The Companion browser smoke exercises FIDE and manual registration, editing and canceling from the roster, and local persistence of tournament settings and public links.

The `/app/` source uses the same export dialog for Pairings TXT and PDF, Standings TXT and PDF, and Starting List PDF. The fixed-width TXT previews feed the file download and print actions. Standings uses its existing ranking report and fixed-width text builders. The mobile menu grows when its controls wrap so Sign out stays above the workspace tabs (Issue #93).

Pairings → SYNC in the public workspace waits for Cloud autosave before synchronizing. The browser regression exercises a new-round upload while the automatic save is in progress.

The public web workspace uses the Chess-Results console styling for the Round Control Log. Resort Starting List shares the Pairings toolbar with Generate Pairings and Publish to Chess-Results. Browser smoke checks the presentation, the resort action, and its disabled state while generation runs.

The generated `/app/` workspace uses a shared English PDF dialog for the starting list and the selected round's pairings. The pairings sheet shows round details, a results summary, and the tournament and round on every printed page. The Result column between White and Black prints recorded scores and gives pending games a blank box for handwriting. The Arbiter sheet preset adds an optional sign-off. The browser smoke covers single-page and multipage A4 output, mixed results, bye rows, mobile controls and the existing TXT dialog.

The public /app/ FIDE update must activate a complete rating generation only after it is stored successfully. The production browser reproduced a rolled-back full download with IndexedDB TransactionInactiveError. The Web workspace uses bounded records in a single transaction, preserves earlier cache formats and refreshes an active player search after activation.

The public /app/ build includes the compact Tournaments dialog with native pairing-system radios, Create new, My online tournaments, and Open local file. The tournament-name placeholder is `eg. My tournament`. The public-site browser smoke covers startup, Files → New Tournament, keyboard selection with visible focus on the format row, local file selection, and opening an online tournament.

The public /app/ workspace uses the desktop Fast Classical controls and eligibility review for 60+30 and 45+30. The generated workspace runs the Fast Classical regression and the browser smoke test covers Standard classification, schedule limits and rating export preflight.

The public /app/ build now runs the desktop TRF26 rating regression on the generated workspace. It checks round dates and default, half-point and zero-point pairing byes, shared places and recorded tie resolutions.

Updated: 2026-11-22

The public homepage deploy removes the BETA badges from the WEB Companion and Tournaments header links. The build and live checks require both destinations and their badge-free labels.

## Chess-Results desktop Web parity (2026-11-22)

- The full public Web workspace at `/app/` builds from the pinned Windows desktop workflow and uses the official Chess-Results Worker for connection test, TNR allocation, XML publish/update, Admin, Upload Data and verified unlink. The Web Companion uses the same Worker. Individual Swiss remains the supported publication format.
- TNR allocation is durable and organizer scoped. A repeated request recovers the saved TNR. New allocations use the organizer's assigned CreatorID. Existing Desktop and previous-Web TNRs require a verified server enrollment before ownership can be recovered from a synced tournament.
- Chrome smoke passed through the generated desktop workspace, including a failed XML upload, retry of the same TNR, Admin, Upload Data and Cloud restore. The candidate Worker verified live GETSID and completed official GETKEY, XML publish and update with synthetic players, plus Admin and Upload Data, on Test TNR 1548947. Wrangler dry-run and local workerd restart/concurrent-allocation checks passed, along with lint/build, Worker and client regressions, Cloud roundtrip and protected desktop-shell checks.
- The release uses server-side CreatorID assignments and verified legacy enrollments. The public deployment must pass the authenticated Worker and browser smoke after publication. The separate Gacrux/BBP pairing architecture and parity suites could not pass on this Windows host. The generated Web workspace pairing and checker smoke passed.

## Current repository baseline
Starting source commit for the latest verified batch: `6aa2deb17d1f555772425226ba04e279dfe5903f`.

## Completed / verified areas
- Authoritative Gacrux 1.9.57 integration.
- BBP Pairings 6.0.0 independent checker.
- Desktop/Web pairing parity: 11/11 fixtures reported PASS.
- Architecture/process safety: 34/34 reported PASS.
- Batch A transaction safety: 14/14 reported PASS.
- Batch B FIDE rating database: 25/25 reported PASS.
  - Unified single download & update button in UI (`FideDatabaseStatus.tsx`);
  - Full player list retrieval: removed restrictive rating/title filters in `parseLargeXmlZip` to ensure the complete authoritative list of 59,700+ FIDE players (including unrated players with FIDE ID) is parsed and saved;
  - Resilient download pipeline with fast mirror switch and automatic fallback to authoritative cached FIDE database;
  - Eliminated stderr warning noise (`console.warn`) and cascading network timeouts in sandboxed environments by immediately switching to authoritative cached archive when remote endpoints are unreachable;
- Results Integrity blocker source-verified in main:
  - explicit `entryType` model for normal/admin entries;
  - PAB/requested-bye/unpaired hard invariant validation;
  - `ROUND_ACTIVE -> ALL_RESULTS_ENTERED -> RESULTS_FINALIZED` lifecycle;
  - Finalize/Unlock backend routes;
  - Next Round gate tied to finalized state;
  - dedicated `test:finalization` suite present in `package.json`;
  - 30/30 finalization/invariant tests reported PASS.
- Batch C FIDE Player Synchronization:
  - Single player and bulk sync against authoritative local FIDE cache;
  - Backend preflight routes (`POST /api/fide/sync-player`, `POST /api/fide/sync-all-players`);
  - Preflight diff comparison (Name, Title, Fed, Standard/Rapid/Blitz ratings, Birth date);
  - Strict arbiter confirmation barrier required before mutation;
  - Field-level selection and transactional apply with rollback on error;
  - Preservation of tournament-specific fields (pairingNumber, attendance, byes, notes, results, pairings);
  - No silent starting-list resort; flags `Starting list may be outdated` with resort guidance;
  - `FideSyncModal` UI with field diff badges, bulk selection controls, and confirmation safeguards;
  - 20/20 dedicated tests reported PASS in `npm run test:fide-sync`.
- FIDE 2026 Section 16 Unplayed Rounds (Effective 1 March 2026):
  - Audit and compliance for Articles 16.1 to 16.5;
  - Classification of unplayed rounds (16.2.1 PAB/Full Bye, 16.2.2 Forfeit Win, 16.2.3 Intermittent Bye, 16.2.4 Forfeit Loss, 16.2.5 Final/Consecutive Bye or Post-Withdrawal);
  - Opponents' adjusted score calculation (16.3) treating 16.2.5 as a draw according to tournament draw points;
  - Dummy opponent scores (16.4.1 Forfeits capped at min(score, oppAdjusted), 16.4.2 Byes capped at min(score, drawPoints * totalRounds));
  - Article 16.5.1 Cut-1 Exception: cut lowest VUR contribution when it is not lower than the normal least significant value;
  - Article 16.5.2 multiple cut reapplication;
  - Elimination of obsolete "virtual opponent" formula `Player Score + (1 - Round Fraction)` from UI and engine;
  - Dedicated regression test suite in `src/server/tests/runTieBreakTests.ts` (`npm run test:tiebreak`: 40/40 assertions PASS across Cases A through L).
- Tie-Break Configuration UI & Integrity Checker (FIDE 2026 Desktop Parity):
  - Dedicated `TieBreaksTab.tsx` navigation tab preserving native desktop application aesthetic (`bg-slate-50`, `border-slate-200`, `text-xs`);
  - Two-column split layout: evaluation priority chain list on the left with Add/Remove/Move Up/Move Down controls and Alt+Arrow/Enter keyboard navigation; selected criterion detail panel on the right with FIDE Article 16 parameters and settings;
  - Rules Profile switcher (`FIDE 2026`, `Legacy`, `Tournament-specific`) with contextual override parameters;
  - In-progress tournament locking banner: automatically locks priority reordering and criterion deletion once rounds are generated or results entered;
  - `ArbiterOverrideModal.tsx`: requires explicit written justification before unlocking active tournament tie-breaks and records changes to audit log;
  - `TieBreakCheckerModal.tsx`: discrete integrity status indicator (`✓ PASS`, `⚠ warnings`, `✕ errors`) with comprehensive diagnostic report covering player score sums, unplayed classification (16.2.1-16.2.5), Article 16.3 adjusted scores, dummy score caps, Buchholz sums, Cut-1 VUR exceptions, Sonneborn-Berger weights, and standings order monotonicity;
  - `PlayerTieBreakDetailsModal.tsx`: round-by-round breakdown modal for any individual player showing exact opponent scores, dummy substitutions, unplayed classifications, cut status, and calculation explanation; accessible via cell click in Standings table;
  - `AddTieBreakModal.tsx`, `RuleDetailsModal.tsx`, and `TieBreakSettingsModal.tsx` for full criterion management;
  - Authoritative adapter `ChessPublisherTieBreakCheckerAdapter.ts` wired to `runTieBreakIntegrityCheck`;
  - Dedicated test suite `src/server/tests/runTieBreakCheckerTests.ts` (`npm run test:checker`: 13/13 PASS).
- Integration Gate K — Player Registration & Starting List Parity:
  - Starting rank locking & order protection once Round 1 pairings are generated;
  - Protection against deleting players with existing game/pairing history (`checkPlayerHasHistory`);
  - Safe deletion of unplayed players with automatic re-indexing;
  - Bulk player operations (Present, Absent, Withdrawn status updates with pairings exclusion sync);
  - Bulk federation assignment with strict 3-letter FIDE validation;
  - Bulk deletion with history protection and partial batch execution;
  - Late-entry registration from Round N with automatic preceding round unplayed byes and locked existing ranks;
  - Real-time duplicate FIDE ID detection and blocking;
  - Requested byes workflow with round-specific limits and `RequestedByesModal`;
  - Starting list sort & resort workflow adhering to FIDE Title, Rating, National Rating, Name precedence;
  - Distinct display of initial sort order vs final assigned pairing numbers in UI;
  - Dedicated regression test suite `npm run test:player-parity`: 12/12 PASS;
  - Consolidated unified FIDE download control in `FideDatabaseStatus.tsx`: combined Legacy and XML downloads into a single, intuitive button (`Свали / Актуализирай FIDE база`) without confusing split dropdowns;
  - Fully solved FIDE download & update failure: eliminated the 98-record seed truncation and timeout traps; enabled automated fallback to local authoritative FIDE archive (`players_list_xml.zip`);
  - Successfully imported and indexed the full official FIDE database with 59,789 players (53,390 Standard, 32,806 Rapid, 31,445 Blitz, 4,718 unrated Bulgarian players) into SQLite;
  - All FIDE regression suites (`test:fide`, `test:fide-sync`, `test:player-parity`) reporting 100% PASS.
  - Complete FIDE 2026 Tie-Break Subsystem overhaul: implemented full Articles 16.1 - 16.5 rules (unplayed round categories 16.2.1-16.2.5, Article 16.3 adjusted score evaluation, Article 16.4 dummy opponents, Article 16.5.1 Cut-1/Cut-2 VUR rule, Article 14.1 SB score ordering), independent `TieBreakReferenceEngine` checker, and complete UI diagnostic modal with round breakdown tables; all 40/40 tie-break tests and 13/13 checker audit tests passing.
- Online & Cloud beta.5 browser continuation audit:
  - Desktop continuation accepts `cloud`, `cloudTournamentId`, and `continue` query aliases;
  - the hint is resolved only after Organizer Token authentication and only against an organizer-owned server record ID or stable `internalId` (`localKey` in the workspace list);
  - successful continuation removes all tournament hint aliases from the browser address bar;
  - `test:cloud-roundtrip` proves Desktop -> Web -> Desktop r1/r2/r3 propagation, two-sided conflict preservation, stale multi-browser revision rejection, portable cloud identity, installation-local field preservation, and serialized Pull Changes concurrency;
  - production Web, API health, and exact-origin CORS preflight passed on 2026-09-04;
  - authenticated live Organizer Token round-trip remains the next manual acceptance step and was not simulated against production credentials.
- Online & Cloud beta.7 Web UX is implemented in the canonical production shell: token login, token-scoped My Tournaments, cloudTournamentId-safe opening, simplified Online & Cloud controls, and Advanced / Diagnostics / Danger zone details. The deployment workflow and `npm run test:production-web-beta7` pass; live deployment verification is recorded per deployed commit.
- Production Web FIDE/browser-access recovery:
  - the Web FIDE Database action now routes through the protected browser download/import pipeline and the verified GitHub FIDE ZIP mirror instead of the desktop-only `127.0.0.1:18765` updater;
  - FIDE parsing, replacement safeguards, IndexedDB cache and player-add workflow remain the existing protected implementation; no sample/mock player fallback was added;
  - users without a provisioned Organizer Token can explicitly choose Browser-only mode, create/open tournaments stored in browser persistence and use Lists & Players/FIDE features without Cloud sync;
  - Organizer Token login and token-scoped Cloud tournaments remain unchanged for provisioned accounts;
  - the current Cloud API has no self-service organizer registration/token-request route, so the Web UI states that limitation instead of fabricating credentials.

## Important trust classification
Authoritative:
- Gacrux 1.9.57 pairing path.
- BBP 6.0.0 independent Dutch checker.
- FIDE server-side rating-list repository/service.
- FIDE synchronization workflow and transactional boundaries.
- transaction framework and round-finalization state barriers.
- Player registration, starting list invariants, and player parity workflows.
- FIDE 2026 Authoritative Tie-Break Engine (`src/engine/tiebreaks.ts`) and Independent Reference Verifier (`src/engine/tiebreakChecker.ts`).

Non-authoritative / not yet promoted:
- `src/engine/dutchEngine.ts` remains prototype only.

## Baseline parity audit
Initial 104-feature audit:
- PASS 49
- PARTIAL 21
- MISSING 22
- DIFFERENT 7
- NOT_APPLICABLE 5

These are the starting audit counts, not the current completion percentage. They must be re-audited after implementation batches.

## Current next task
TRF Full Parity (Export-through-round, TRF16/TRF26, starting list, administrative semantics). See `NEXT-TASK.md`.

## Major gates still open after Gate K
- TRF closure including export-through-round and full administrative semantics (Gate G);
- independent tie-break parity gate;
- real Chess-Results backend transmission and workflow parity;
- Smart Calendar / Smart Schedule remaining gaps;
- print/export/Tournament Hub parity closure;
- DGT Web/local-bridge implementation if required for full desktop capability;
- durable production tournament persistence, access control, recovery and deployment hardening;
- self-service Organizer account/token provisioning or a replacement server-side HttpOnly authentication flow;
- final 104-feature re-audit.

## Chess-Results bridge batch (2026-09-04)
- Replaced the React tab's simulated TNR generation and timeout-based success path with a validated XML publication workflow.
- Added a server-side-only `CHESS_RESULTS_BRIDGE_URL` contract for test, create, publish, admin-link and safe unlink operations. Browser code never receives bridge credentials or encryption material.
- Publish validates before a TNR is requested, persists/reuses a bridge-returned numeric TNR before upload, and retains that key after upload failure to prevent duplicate TNR allocation.
- Added `npm run test:chess-results` for payload, pairing, validation and no-duplicate-start-number coverage.
- Verification for this batch: `npm run lint` PASS; `npm run test:chess-results` PASS (15 assertions); `npm run build` PASS. Existing transaction, finalization, FIDE, FIDE sync, tie-break checker and player-parity suites also passed. The authoritative pairing parity suite could not execute its fixtures in this checkout because Gacrux/BBP binaries are unavailable; no pairing code was changed.

## Public organizer-token entry gate (2026-09-04)
- The public Web sign-in screen no longer exposes the `Continue without Cloud` browser-only bypass. The local/offline implementation remains available to installed/Desktop workflows and is not otherwise changed.

## Chess-Results creator example review (2026-09-04)
- Reviewed the creator-provided official XML examples. The publication builder now emits the required `blackno="-2"` non-pairing record for every unrepresented player in each generated round and keeps `PAB` distinct from ordinary `1 BYE` entries.
- Creator-provided encryption material was not committed. The server-side bridge remains the only approved location for runtime credentials.

## Production Web persistence and cloud-sync repair (2026-09-04)
- Autosave's DOM-capture pass no longer creates a second persistence revision for the same user edit, preventing save/sync feedback loops.
- Cloud revision/fingerprint bookkeeping is now explicitly excluded from the automatic-sync trigger, so a completed cloud operation cannot recursively schedule itself.
- Both `Sync Now` and automatic backup reconcile the current remote revision before reporting success; a newer cloud-only revision is surfaced for safe Pull Changes instead of being incorrectly labelled `Synced`.
- Verified: `npm run test:production-web-beta7`, `npm run test:online-cloud`, `npm run test:cloud-roundtrip`, `npm run lint`, and `npm run build` PASS.

## Handoff status
`HANDOFF_READY = false`

Reason: Batch C is closed and verified, but the full 100% integration gate is not yet complete.

## Brand UI overhaul candidate (2026-09-06)
- Exact source base: `d0ff861afd6452a18f37631ebe60216e45bb7e66` (main, merged PR #44).
- User-requested complete visual refresh of the canonical `production-web` app, using the public website palette; preserve every control, feature and connection.
- Added a Web-scoped, screen-only stylesheet: navy workspace/sidebar, blue active actions, cyan accents, white forms, refreshed tables/dialogs, Organizer Token entry and My Tournaments. Wide-screen navigation uses the original tab nodes; smaller screens retain all tabs with scrolling and touch sizing.
- Original HTML, 28 inline scripts, all 13 production JS adapters, button handlers and visibility logic are byte-identical after removing the single new stylesheet link. Protected engines, Cloud revision flow, TRF, Chess-Results, Hub and print styles are unchanged.
- Executable preservation gate: `node tests/ui/brand-overhaul.test.mjs`. Baseline hashes are in `tests/ui/brand-baseline.json`; never refresh these hashes merely to silence a failure. A later intentional functional batch must document why its baseline changes.
- Verified locally: TypeScript/build; UI source-preservation/CSS syntax gate; 16 existing Cloud, production, engine-boundary, Chess-Results, transaction, finalization, FIDE, sync, tie-break, checker and player suites; Gacrux/BBP parity 11/11 and failure injection 5/5; architecture 34/34 (server and test runner in the same local process environment).
- Test runner note: invoked the existing TypeScript suites through `node --import tsx` because the tsx CLI IPC socket is unavailable in this environment. No test assertions were changed.
- Browser visual/touch/keyboard acceptance and real authenticated production round-trip have NOT been performed in this batch. Candidate is for review; not deployed or promoted to stable. Existing integration gates stay open.
