## Summary
Describe the exact user-visible or architectural change.

## Parent / scope
- Parent branch/commit:
- Version/RC target:
- Risk: LOW / MEDIUM / HIGH / CRITICAL

## Files changed
List functional files changed and why.

## Protected areas
Check all that apply:
- [ ] Gacrux / authoritative pairing
- [ ] BBP / independent checker
- [ ] Pairing acceptance gate
- [ ] TRF16/TRF26
- [ ] Tie-breaks / standings
- [ ] FIDE database / player sync
- [ ] Transactions / persistence
- [ ] Chess-Results
- [ ] None

If any protected area is checked, explain the reproducible defect/gap and dedicated fixtures.

## Functional parity
- [ ] No existing PASS feature regressed.
- [ ] FEATURE-PARITY-BASELINE.md updated if status changed.
- [ ] Modern UI preserved without removing arbiter workflow capability.

## Tests / gates
Record exact commands and numeric results.
- [ ] Static/type/build
- [ ] Architecture/process safety
- [ ] Pairing parity fixtures
- [ ] Transaction tests
- [ ] FIDE DB tests (if applicable)
- [ ] Player sync tests (if applicable)
- [ ] TRF tests (if applicable)
- [ ] Tie-break tests (if applicable)
- [ ] Chess-Results tests (if applicable)

## Data / rollback safety
- [ ] No destructive operation without snapshot/rollback.
- [ ] No active tournament mutation from background data update.
- [ ] No secret/API key committed.

## Known limitations
List anything not tested, platform-specific, unsupported or intentionally deferred.

## Completion
- [ ] Diff reviewed.
- [ ] PROJECT-STATE.md updated if phase/batch state changed.
- [ ] This PR does not claim Stable unless RELEASE-CHECKLIST.md is fully satisfied.