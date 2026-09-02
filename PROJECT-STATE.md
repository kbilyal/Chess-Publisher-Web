# Chess-Publisher Web — Project State

Last governance update: 2026-09-03

## Stable reference
- Desktop functional reference: Chess-Publisher v1.05.00 Stable.
- Web line is not yet Stable.

## Current web architecture
- Modern React + TypeScript + Vite client.
- Node/Express server boundary.
- Server-side engine adapters.
- Transactional tournament safety layer.
- Current persistence remains transitional; production database work is still pending.

## Completed phases (reported and accepted)
### Phase 1 — Prototype audit
- Existing web UI accepted as visual direction.
- Original AI-generated TypeScript Swiss Dutch implementation identified as non-authoritative approximation.

### Phase 2 — Architecture separation
- Backend/service boundaries introduced.
- Prototype pairing separated from authoritative path.
- Pairing preview/check/accept workflow introduced.

### Phase 3 — Engine readiness and process safety
- Server-side Gacrux adapter boundary.
- Process isolation, timeout, stdout/stderr capture, cleanup and diagnostics.
- Authoritative routes do not silently fall back to prototype pairing.

### Phase 4 — Trusted engine integration
Current intended pins:
- Gacrux 1.9.57, upstream OttoMilvang/TieBreakServer, commit reported as 14a34a2c2f36509b110e4f25d6247f31fc4bf2f5.
- BBP Pairings 6.0.0, upstream BieremaBoyzProgramming/bbpPairings, commit reported as 16a000f9811de322b0e835d5643198226165b5a9.

Before any future release, CI/repository fixtures must independently verify these pins rather than relying on this document alone.

### Phase 5 — Desktop/Web pairing parity gate
Reported result:
- 11/11 real tournament fixtures semantically identical.
- Gacrux + BBP validation remained PASS.
- Failure-injection gates prevented partial commits.

### Phase 5A — Functional parity audit
104 desktop functions audited against web:
- PASS: 49
- PARTIAL: 21
- MISSING: 22
- DIFFERENT: 7
- NOT_APPLICABLE: 5

Important missing/partial families include FIDE rating-list management, player synchronization, some starting-list/lifecycle transactions, parts of TRF workflow, Chess-Results transmission, DGT/live integration and secondary arbiter ergonomics.

### Batch A — Transaction safety
Reported complete:
- TransactionManager.
- Resort Starting List preflight/diff/snapshot/commit/rollback.
- Reset Tournament preflight/snapshot/undo.
- TRF import conflict inspector and rollback protection.
- Regression result reported as 34/34 architecture tests and 11/11 parity fixtures.

## Next planned implementation batch
### Batch B — FIDE Rating Database & Backend Repository
Goals:
- authoritative FIDE rating-list download/update;
- persistent server-side cache/database;
- Standard/Rapid/Blitz rating fields;
- indexed FIDE search;
- status/version/last-update metadata;
- offline fallback to last valid database;
- no mutation of active tournament players during rating-list update.

Batch C follows only after Batch B passes:
- Sync selected player;
- Sync all players;
- field-by-field diff preview;
- arbiter confirmation;
- transactional apply.

## Current priority order
1. Batch B — FIDE rating database.
2. Batch C — FIDE search + safe player sync.
3. Restore remaining critical/High functional parity gaps.
4. TRF/Chess-Results parity and production contracts.
5. Smart Calendar/Schedule parity.
6. Tournament Hub/public publishing integration.
7. DGT future integration.
8. Production persistence/auth/security/hardening.
9. Release Candidate gates.
10. Stable Web release only after all mandatory gates PASS.

## Critical rule
Do not advance the project by inventing missing chess rules. Integrate or preserve trusted implementations, then test them independently.