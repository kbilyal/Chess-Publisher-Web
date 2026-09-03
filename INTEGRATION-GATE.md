# Chess-Publisher Web — 100% Integration Gate

The project is considered fully integrated and safe for autonomous continuation only when every applicable gate below is PASS.

## A. Functional parity
Use the 104-feature desktop audit as baseline. Final state must have:
- `MISSING = 0`
- `PARTIAL = 0`
- `DIFFERENT = 0`, except explicitly approved Web-equivalent behaviors
- no unresolved CRITICAL/HIGH gaps

## B. Pairing core
- Gacrux 1.9.57 pinned and authoritative.
- BBP Pairings 6.0.0 independent checker.
- no prototype fallback.
- desktop/web parity fixtures PASS.
- unsupported checker capabilities never become PASS.

## C. Results integrity
PASS as of source commit `cae2f7ebb4ab8c7c2b525a84f302fc69ab5bc6bd`, subject to regression preservation:
- typed normal/admin round entries;
- no fake game results for byes/unpaired;
- explicit finalization lifecycle;
- finalized lock;
- Next Round gate;
- transactional finalize/unlock behavior.

## D. Transaction safety
Resort, Reset, TRF Import, pairing acceptance, finalization and other destructive workflows use preflight/snapshot/commit/rollback barriers.

## E. FIDE rating database
Official source, server-side indexed cache, Standard/Rapid/Blitz, atomic update, offline fallback, metadata/status, no production mock fallback.

## F. FIDE player synchronization
Selected/all-player sync, exact diff preview, duplicate/unmatched detection, explicit arbiter confirmation, transactional apply/rollback, tournament-specific field preservation.

## G. TRF
TRF16, TRF26, Starting List, import, export-through-round, partial birth dates, forfeits/byes/PAB semantics and strict validation all regression-tested.

## H. Tie-breaks / standings
Independent authoritative parity evidence exists; `UNVERIFIED_IMPLEMENTATION` removed only after dedicated gate passes.

## I. Chess-Results
Real backend transmission contract and full validated user workflow; no mock timeout/upload path.

## J. Calendar / Smart Schedule
All desktop operational gaps closed or explicitly approved Web equivalents implemented and tested.

## K. Player / Starting List
Bulk actions, lifecycle states, requested byes, duplicate FIDE IDs, starting-rank lock and transactional resort complete.

## L. Print / Export / Tournament Hub
All required desktop/public outputs available or approved Web equivalents with regression coverage.

## M. DGT
If full desktop capability is required, use an approved Web Serial/local bridge/WebSocket architecture and tested implementation. Do not silently mark user-facing capability N/A because Win32 hooks are unavailable.

## N. Persistence / Production
Durable server-side tournament persistence, backup/recovery, concurrency/locking, secret handling, access-controlled audit data, restart persistence and deployment tests complete.

## O. Repository self-description
`AGENTS.md`, `PROJECT-STATE.md`, `INTEGRATION-GATE.md`, `PROTECTED-COMPONENTS.md`, `REGRESSION-GATES.md`, `NEXT-TASK.md`, `RELEASE-CHECKLIST.md`, `AI-HANDOFF.md`, `INTEGRATION-STATUS.json` remain current.

## P. Clean-checkout regression
At minimum all relevant scripts pass from a clean checkout:
- `npm run lint`
- `npm run build`
- `npm run test:arch`
- `npm run test:parity`
- `npm run test:transactions`
- `npm run test:finalization`
- `npm run test:fide`
- future dedicated sync/TRF/tiebreak/Chess-Results/production suites

Only after A–P PASS may `INTEGRATION-STATUS.json` set `handoffReady` to `true`.