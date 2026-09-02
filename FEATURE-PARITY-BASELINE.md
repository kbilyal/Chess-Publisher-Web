# Functional Parity Baseline

Reference: Chess-Publisher v1.05.00 Stable desktop functionality vs current Web line.

Last accepted audit summary:
- Total audited: 104
- PASS: 49
- PARTIAL: 21
- MISSING: 22
- DIFFERENT: 7
- NOT_APPLICABLE: 5

This document is a regression baseline, not proof that every status is still current. Re-audit after material feature work and update counts with evidence.

## Critical gaps identified at audit time
- Server-side FIDE rating database ingestion/caching.
- FIDE player synchronization with transactional diff preview.
- Transactional Resort Starting List.
- Transactional Tournament Reset.
- TRF Import conflict detection/snapshot rollback.
- Real backend Chess-Results transmission contract.

Batch A reportedly resolved the three transaction-family gaps (Resort, Reset, TRF Import). Reclassify them only after repository tests and implementation are present on the merged branch.

## High-priority gaps identified at audit time
- FIDE rating-list manual update/status/offline cache.
- Standard/Rapid/Blitz player rating fields.
- Real FIDE name/ID search against server database.
- Selected-player and bulk-player sync.
- Duplicate FIDE-ID detection.
- Player bulk Select All/Clear All/Delete.
- Explicit withdrawn lifecycle state.
- Requested-bye assignment workflow.
- Starting-rank lock/controlled force resort.
- Manual board pairing arbiter tool.
- Tie-break unrated-floor persistence.
- Special-prize Select All/Clear All and rating thresholds.
- TRF export-through-round.
- DGT/live connector functionality.

## Rule
A future agent must not merely report a higher PASS count. For each status transition, record:
- feature name;
- previous status;
- new status;
- implementation file(s);
- test/verification evidence;
- commit SHA.

## Definition of PASS
PASS means the arbiter can complete the real operational workflow with equivalent safety/correctness to the accepted desktop reference, not merely that a similarly named button/tab exists.

## Definition of PARTIAL
A visible feature exists but one or more important options, safeguards, workflows or persistence behaviors are missing.

## Definition of MISSING
No production-capable implementation exists. Mock/demo behavior does not count.

## Definition of DIFFERENT
The web implementation intentionally or accidentally behaves differently and requires explicit review before it can be treated as equivalent.

## Definition of NOT_APPLICABLE
Desktop OS-specific functionality has no meaningful web equivalent; a deliberate cross-platform alternative may be implemented separately without forcing literal parity.