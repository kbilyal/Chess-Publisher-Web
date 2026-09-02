# Mandatory Regression Gates

A change is not accepted because it compiles. Apply the gates below according to scope.

## Gate 0 — Repository sanity
- clean or intentionally dirty working tree documented;
- no secrets committed;
- no unexpected generated binaries;
- exact parent commit recorded.

## Gate 1 — Static/build
Required for every functional change:
- TypeScript type check / lint;
- production client build;
- production server build;
- no new unresolved warnings that affect correctness.

## Gate 2 — Architecture/process safety
Run the repository architecture suite (currently reported as `npm run test:arch` when available).
Must cover:
- authoritative engine unavailable handling;
- no prototype fallback;
- timeout/process cleanup;
- stderr/stdout and exit-code handling;
- path/input safety;
- transaction invariants.

## Gate 3 — Authoritative pairing parity
Run the desktop/web fixture suite (currently reported as `npm run test:parity` when available).
Minimum invariant:
- all committed real tournament fixtures PASS;
- semantic comparison covers board pairing, colors, PAB/unpaired state, score-group/float decisions and engine metadata;
- no fixture may be removed or weakened merely to make a build pass.

Current reported baseline: 11/11 fixtures PASS. Treat this as a target to verify from repository tests, not as a substitute for running them.

## Gate 4 — Transaction safety
For Resort/Reset/TRF Import and future destructive workflows:
- cancelled operation leaves exact state unchanged;
- validation failure leaves exact state unchanged;
- persistence failure rolls back;
- snapshot hash/identity verified;
- accepted pairing/results remain protected unless explicitly part of an approved operation.

## Gate 5 — FIDE database (once Batch B exists)
Required fixtures:
- no DB installed;
- successful update;
- metadata/version stored;
- Standard/Rapid/Blitz parsed separately;
- exact FIDE ID search;
- partial-name search;
- federation filter;
- partial birth preserved;
- invalid download/archive keeps previous valid DB;
- concurrent update blocked;
- offline search uses cached DB;
- restart preserves DB;
- rating-list update does not mutate active tournament.

## Gate 6 — Player sync (once Batch C exists)
- selected player diff preview;
- bulk sync diff preview;
- no silent apply;
- duplicate FIDE IDs detected;
- unmatched players reported;
- tournament-specific fields preserved;
- past pairings/results unchanged;
- rollback on failed persistence.

## Gate 7 — TRF
For any TRF-related change:
- TRF16 fixture set;
- TRF26 fixture set;
- Starting List TRF;
- export-through-round;
- round-trip parse/export comparison;
- partial birth dates;
- unrated players;
- 1F-0F, 0F-1F, 0F-0F;
- PAB/requested bye/unplayed distinctions;
- imported/resumed tournament fixture.

## Gate 8 — Tie-breaks/standings
For any standings/tie-break change:
- deterministic known-result fixtures;
- Direct Encounter applicability cases;
- Buchholz family;
- Sonneborn-Berger;
- wins/black-wins criteria;
- unrated/rating-floor behavior where applicable;
- unplayed-round adjustments;
- independent comparison/checker when available.

## Gate 9 — Chess-Results
Once real transmission exists:
- create/publish/update status;
- correct tournament lock/binding during async operations;
- unlink/reset behavior;
- error/timeout/retry without cross-tournament mutation;
- no mock success in production routes.

## Gate 10 — Release gate
Before RC/Stable packaging:
- all mandatory scope gates PASS;
- protected component versions/hashes recorded;
- feature regression manifest checked;
- changelog complete;
- known limitations complete;
- final artifact SHA256 recorded;
- real browser/server smoke test complete;
- Stable requires explicit promotion decision.

## Rule for missing tests
If a required test command/fixture is absent from the repository, do not claim PASS. Mark the gate NOT RUN / NOT IMPLEMENTED and create the missing test as part of the task when appropriate.