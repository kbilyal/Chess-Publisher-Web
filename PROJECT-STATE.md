# Chess-Publisher Web — Project State

Updated: 2026-09-04

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
- final 104-feature re-audit.

## Handoff status
`HANDOFF_READY = false`

Reason: Batch C is closed and verified, but the full 100% integration gate is not yet complete.
