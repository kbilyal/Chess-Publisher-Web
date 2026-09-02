# Next Task — Results Integrity Blocker

Do not begin Batch C or later feature work until this blocker is closed in the pushed repository source.

## Problem observed
The validated web UI previously showed players with no opponent as `Bye / Unpaired` while allowing normal editable results such as `0 - 1`. The current GitHub main inspected on 2026-09-03 still contains an old `PairingsTab.tsx` workflow that:
- sets game results without a hard two-player invariant;
- treats round completion as all visible boards having `result !== '-'`;
- has no confirmed explicit round finalization lifecycle in source.

A newer AI Studio UI visually shows the intended fix, but source and tests must be pushed and verified.

## Required model
Reuse existing types if possible; do not create a competing status system.

Conceptually distinguish:
- `NORMAL_GAME`
- `PAB`
- `REQUESTED_BYE`
- `ZERO_POINT_BYE`
- `UNPAIRED`
- `ABSENT`
- `WITHDRAWN`

Only `NORMAL_GAME` may use normal game result controls.

## Hard invariants
Reject persistence of any played-game result where two real players are not present.
Administrative entries must never require or synthesize fake opponents/results.

## Round lifecycle
Required state flow:

`ROUND_ACTIVE -> ALL_RESULTS_ENTERED -> RESULTS_FINALIZED`

Entering the last normal result must not automatically finalize the round.
The arbiter must explicitly choose Finalize Round.
Next Round must remain blocked until finalization succeeds.

## Finalization
Finalization must:
- validate normal games;
- validate administrative entries;
- recalculate standings/dependent state;
- snapshot current tournament state;
- persist atomically;
- lock results/pairing structure;
- rollback on failure.

## Corrections
A finalized round is not ordinarily editable.
Explicit Edit Finalized Results requires warning + confirmation + snapshot.
If later rounds exist, ordinary correction is blocked and a dedicated recovery/rollback workflow is required.

## UI
Administrative rows should show locked status badges such as:
- `PAB • 1.0 pt`
- `Requested Bye • 0.5 pt`
- `Unpaired • 0 pt`
- `Withdrawn`

After the last real game result:
- show `All results entered`;
- enable `Finalize Round`;
- do not enable Next Round until finalized.

## Tests
Add a dedicated result-integrity suite covering at least 30 cases from the blocker specification, including:
- no fake results for PAB/unpaired;
- administrative entries do not block completion;
- last real result -> ALL_RESULTS_ENTERED only;
- explicit finalization;
- finalized lock;
- next-round gate;
- earlier-round correction protection;
- rollback on failed persistence;
- standings/tie-break recalculation after confirmed correction;
- TRF admin-status preservation.

## Mandatory regression
Run and report:
- `npm run lint`
- `npm run build`
- `npm run test:arch`
- `npm run test:parity`
- `npm run test:transactions`
- `npm run test:fide`
- new result-integrity test command

## Completion condition
This blocker is closed only when the fixed source is pushed to GitHub and the tests are present in `package.json`/repository, not merely when a preview screenshot looks correct.

After closure update `PROJECT-STATE.md`, then proceed to Batch C FIDE player synchronization.
