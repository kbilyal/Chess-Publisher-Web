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
- Batch B FIDE rating database: 20/20 reported PASS.
- Results Integrity blocker is now source-verified in main:
  - explicit `entryType` model for normal/admin entries;
  - PAB/requested-bye/unpaired hard invariant validation;
  - `ROUND_ACTIVE -> ALL_RESULTS_ENTERED -> RESULTS_FINALIZED` lifecycle;
  - Finalize/Unlock backend routes;
  - Next Round gate tied to finalized state;
  - dedicated `test:finalization` suite present in `package.json`;
  - 30/30 finalization/invariant tests reported PASS.

## Important trust classification
Authoritative:
- Gacrux 1.9.57 pairing path.
- BBP 6.0.0 independent Dutch checker.
- FIDE server-side rating-list repository/service.
- transaction framework and round-finalization state barriers.

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
Batch C — FIDE Player Synchronization. See `NEXT-TASK.md`.

## Major gates still open after Batch C
- remaining player/starting-list parity;
- TRF closure including export-through-round and full administrative semantics;
- independent tie-break parity gate;
- real Chess-Results backend transmission and workflow parity;
- Smart Calendar / Smart Schedule remaining gaps;
- print/export/Tournament Hub parity closure;
- DGT Web/local-bridge implementation if required for full desktop capability;
- durable production tournament persistence, access control, recovery and deployment hardening;
- final 104-feature re-audit.

## Handoff status
`HANDOFF_READY = false`

Reason: Results Integrity is closed, but the full 100% integration gate is not yet complete.