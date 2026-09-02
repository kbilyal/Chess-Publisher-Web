# Regression Gates

Every accepted batch must run all relevant gates. A change is not complete when only lint/build passes.

## Always-run gates
- `npm run lint`
- `npm run build`
- `npm run test:arch`
- `npm run test:parity`
- `npm run test:transactions`
- `npm run test:fide`

## Pairing gate
Required invariants:
- Gacrux remains authoritative.
- BBP remains independent checker.
- no prototype fallback.
- desktop/web fixtures remain 11/11 semantic parity.
- failure injection remains PASS.

## Results integrity gate
A dedicated suite must cover at least:
- PAB cannot become 1-0 or 0-1.
- requested bye retains configured points.
- unpaired/absent/withdrawn expose no normal result editing.
- missing opponent plus played result is rejected in state/persistence validation.
- last normal result changes round to ALL_RESULTS_ENTERED, not automatically finalized.
- explicit Finalize Round required.
- finalized results locked.
- Next Round blocked until finalized.
- earlier finalized round correction blocked/protected if later rounds exist.
- failed finalization persistence rolls back.

## Transaction gate
At minimum:
- resort success and rollback on failure;
- resort-after-round-one protection;
- reset success/cancel/failure/undo;
- valid/invalid/cancelled TRF import;
- snapshot hash integrity;
- cancelled operations leave pairings/results unchanged.

## FIDE database gate
At minimum:
- authoritative update success;
- exact ID and partial-name search;
- federation filter;
- Standard/Rapid/Blitz parsing;
- partial birth data preservation;
- failed update keeps previous DB;
- invalid archive/data keeps previous DB;
- update concurrency lock;
- offline cached search;
- no arbitrary source URL;
- no production sample-player fallback;
- restart preserves DB;
- database update does not mutate tournament state.

## FIDE sync gate (when implemented)
- selected-player diff preview;
- bulk diff preview;
- duplicate/unmatched handling;
- explicit arbiter confirmation;
- transaction rollback;
- pairings/past results remain unchanged;
- tournament-specific fields preserved.

## TRF gate
- TRF16 export.
- TRF26 export.
- Starting List export.
- export-through-round.
- import conflict handling.
- forfeit/PAB/requested-bye semantics.
- partial birth dates.
- strict validation.

## Tie-break gate
Before removing `UNVERIFIED_IMPLEMENTATION`, compare against authoritative rules/fixtures and record expected values. Any future edit must preserve those fixtures.

## Chess-Results gate
When real backend upload exists, test create/update/status/unlink/reset and failure behavior. Mocked timeouts/successes are forbidden in production paths.

## Clean-checkout rule
Before 100% integration handoff, mandatory suites must pass from a clean checkout with documented setup. Results that pass only in a long-lived AI Studio runtime are insufficient.

## Failure rule
If any protected regression gate fails, stop the current feature batch. Do not continue adding features on top of a red gate.
