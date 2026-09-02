# Functional Parity Baseline

Authoritative comparison target for the Web integration: Chess-Publisher v1.05.00 Stable desktop capability set.

Last complete audit:
- Total functions: 104
- PASS: 49
- PARTIAL: 21
- MISSING: 22
- DIFFERENT: 7
- NOT_APPLICABLE: 5

This baseline proves the Web application was not yet at 100% integration at audit time.

## Critical gaps identified by the audit
- server-side FIDE rating database ingestion/caching;
- transactional FIDE player synchronization with diff preview;
- transactional Resort Starting List;
- transactional Tournament Reset;
- TRF import conflict detection + rollback;
- real Chess-Results backend transmission contract.

## High-priority gaps identified by the audit
Included bulk player operations, explicit player lifecycle states, requested-bye workflow, Standard/Rapid/Blitz rating fields, starting-rank protection, tie-break settings persistence, special-prize controls, export-through-round, and DGT live/broadcast parity work.

## Progress since audit
- Batch A transaction safety reported complete.
- Batch B FIDE rating database/search infrastructure is present in repository.
- Results Integrity blocker discovered after audit and must be closed before parity can be recalculated.

## Re-audit rule
After all planned integration batches are complete, re-run the full 104-feature audit against the actual repository.

100% parity requires:
- PASS or approved Web-equivalent for every applicable function;
- zero unresolved MISSING/PARTIAL/DIFFERENT functions;
- explicit justification for each truly OS-specific NOT_APPLICABLE item;
- zero unresolved CRITICAL/HIGH gaps.

Do not change this baseline by simply deleting difficult functions from the list.
