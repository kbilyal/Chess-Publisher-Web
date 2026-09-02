# Chess-Publisher Web — 100% Integration Gate

The project may be considered fully integrated and safe for autonomous continuation only when every gate below is PASS.

## Gate A — Functional parity baseline
Use the 104-feature desktop parity audit as the baseline.

Required final status:
- `MISSING = 0`
- `PARTIAL = 0`
- `DIFFERENT = 0` unless the difference is explicitly documented as an approved Web-equivalent behavior.
- `NOT_APPLICABLE` items must be explicitly justified as OS-specific, with a Web equivalent documented where user-facing capability is still required.

No CRITICAL or HIGH gap may remain unresolved.

## Gate B — Pairing core
- Gacrux 1.9.57 remains pinned and authoritative.
- BBP Pairings 6.0.0 remains independent checker.
- no prototype fallback on authoritative routes.
- 11/11 desktop/web parity fixtures PASS.
- checker capability guard never converts unsupported behavior to PASS.

## Gate C — Results integrity
Must be fully implemented and tested:
- typed distinction between normal games and administrative round entries;
- PAB/requested bye/unpaired/absent/withdrawn cannot become fake game results;
- `ROUND_ACTIVE -> ALL_RESULTS_ENTERED -> RESULTS_FINALIZED` lifecycle;
- explicit arbiter Finalize Round action;
- Next Round blocked until finalized;
- finalized results locked from ordinary editing;
- earlier-round correction protected when later rounds exist;
- rollback on failed finalization/correction persistence.

## Gate D — Tournament transaction safety
- Resort Starting List transactional.
- Reset Tournament transactional with snapshot/undo policy.
- TRF import transactional with conflict preview and rollback.
- pairing acceptance transactional.
- no destructive direct-state replacement remains in protected workflows.

## Gate E — FIDE rating database
- official FIDE rating list source only;
- server-side cached/indexed database;
- Standard/Rapid/Blitz preserved separately;
- safe atomic update and offline fallback;
- no production sample-player fallback;
- status/version/date/hash available;
- FIDE search by name/ID works from authoritative cache.

## Gate F — FIDE player synchronization
- sync selected player;
- sync all players;
- exact field-by-field diff preview;
- duplicate/unmatched detection;
- explicit arbiter confirmation;
- transactional apply/rollback;
- tournament-specific data preserved;
- rating database update alone never mutates tournament players.

## Gate G — TRF
- TRF16 export regression PASS.
- TRF26 export regression PASS.
- Starting List TRF PASS.
- import PASS.
- export-through-round PASS.
- partial birth dates preserved.
- forfeit/byes/PAB administrative semantics preserved.
- strict validation report available.

## Gate H — Tie-breaks / standings
- tie-break implementation independently verified against authoritative specification/fixtures.
- `UNVERIFIED_IMPLEMENTATION` removed only after dedicated parity evidence.
- FIDE 2026 behavior regression-tested.
- standings/tie-break recalculation after confirmed result correction verified.

## Gate I — Chess-Results
- real backend transmission contract implemented and tested.
- no mocked timeout/upload path in production.
- TNR/create/update/status/unlink/reset user workflows matched to validated desktop behavior.
- protected Chess-Results semantics regression-tested.

## Gate J — Calendar / Smart Schedule
All desktop operational functions audited as PARTIAL/MISSING must be closed, including schedule conflict/constraint rules and public schedule output parity.

## Gate K — Player / starting-list workflow parity
- bulk select/clear/delete/status actions;
- explicit withdrawn/absent/late-entry states;
- requested byes from player workflow;
- duplicate FIDE ID handling;
- starting-rank lock after pairing begins;
- transactional resort.

## Gate L — Print / export / Tournament Hub
All validated desktop/public outputs required by the parity baseline must be available or have an approved Web equivalent and regression coverage.

## Gate M — DGT
If full desktop functional parity is the release objective, DGT capability must have an approved Web architecture and tested implementation (Web Serial/local bridge/WebSocket as appropriate). It may not be silently marked N/A merely because the browser cannot use Win32 hooks.

## Gate N — Persistence / production hardening
Before autonomous production development:
- durable server-side tournament persistence chosen and documented;
- backups/recovery strategy documented and tested;
- secrets excluded from repo;
- production paths do not use mock data;
- concurrency/locking documented;
- audit endpoints containing personal tournament data are access-controlled in production;
- deployment/restart persistence verified.

## Gate O — Repository self-description
Repository contains and keeps current:
- `AGENTS.md`
- `PROJECT-STATE.md`
- `INTEGRATION-GATE.md`
- `PROTECTED-COMPONENTS.md`
- `REGRESSION-GATES.md`
- `NEXT-TASK.md`
- `RELEASE-CHECKLIST.md`
- pull request template

Every accepted batch updates Project State and Next Task.

## Gate P — Mandatory test status
At handoff, all relevant commands must PASS from a clean checkout. At minimum:
- `npm run lint`
- `npm run build`
- `npm run test:arch`
- `npm run test:parity`
- `npm run test:transactions`
- `npm run test:fide`
- dedicated result-integrity tests
- dedicated tie-break parity tests when introduced
- dedicated Chess-Results tests when introduced

## Final autonomous handoff condition
Only after Gates A–P PASS:

`HANDOFF_READY = true`

At that point a new AI agent should be able to continue with only repository contents and the user's new task, without this conversation.
