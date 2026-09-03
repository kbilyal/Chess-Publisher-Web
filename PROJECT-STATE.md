# Chess-Publisher Web — Project State

Updated: 2026-09-03

## Current repository baseline
Verified main source commit: `cae2f7ebb4ab8c7c2b525a84f302fc69ab5bc6bd`.

## Completed / verified areas
- Authoritative Gacrux 1.9.57 integration.
- BBP Pairings 6.0.0 independent checker.
- Desktop/Web pairing parity: 11/11 fixtures reported PASS.
- Architecture/process safety: 34/34 reported PASS.
- Batch A transaction safety: 14/14 reported PASS.
- Batch B FIDE rating database: 25/25 reported PASS.
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
  - Consolidated unified FIDE download control in `FideDatabaseStatus.tsx` merging LEGACY and XML download actions into a space-efficient split dropdown without changing underlying endpoints or logic;
  - Direct FIDE directory browsing in `PlayersTab.tsx` with immediate loading of rated and unrated players (STD, RAP, BLZ, Без рейтинг) and one-click bulk addition to active tournament roster;
  - Bi-directional Cyrillic and Latin transliteration in `FideRatingRepository.ts` for natural name matching (e.g. "Топалов", "Карлсен", "Чепаринов") and automated cloud-block bypass via authoritative mirror channel and streaming large XML parser; populated 59,736 official FIDE records into SQLite; FIDE rating tests updated to 25/25 PASS.

## Important trust classification
Authoritative:
- Gacrux 1.9.57 pairing path.
- BBP 6.0.0 independent Dutch checker.
- FIDE server-side rating-list repository/service.
- FIDE synchronization workflow and transactional boundaries.
- transaction framework and round-finalization state barriers.
- Player registration, starting list invariants, and player parity workflows.

Non-authoritative / not yet promoted:
- `src/engine/dutchEngine.ts` remains prototype only.
- tie-break implementation remains `UNVERIFIED_IMPLEMENTATION` until dedicated independent parity verification.

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
