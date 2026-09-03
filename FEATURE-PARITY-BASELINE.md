# Functional Parity Baseline

Authoritative reference: Chess-Publisher v1.05.00 Stable desktop application.

Initial Web audit covered 104 granular functions across lifecycle, setup, FIDE database/search/sync, registration, starting list, pairings, results, standings, tie-breaks, prizes, calendar/schedule, TRF, Chess-Results, Hub, print/export, DGT, ergonomics and transactional barriers.

Initial counts:
- PASS: 49
- PARTIAL: 21
- MISSING: 22
- DIFFERENT: 7
- NOT_APPLICABLE: 5

These counts are a historical baseline, not the current score. Completed batches must be reflected in a future re-audit rather than manually adjusting counts without evidence.

## Final parity rule
At 100% integration:
- every applicable desktop capability is PASS or an explicitly approved Web-equivalent;
- `MISSING=0`;
- `PARTIAL=0`;
- unresolved `DIFFERENT=0`;
- OS-specific items may be N/A only when no user-facing capability is lost, or an approved Web/local-bridge equivalent is documented.

The full original 104-feature audit should be retained as project evidence and used for the final re-audit.