# Autonomous AI Handoff Procedure

This file is for Google AI Studio, Junie, Codex, Cursor, Claude, or a human developer starting without previous chat context.

## Startup procedure
Read in this order:
1. `AGENTS.md`
2. `PROJECT-STATE.md`
3. `INTEGRATION-GATE.md`
4. `PROTECTED-COMPONENTS.md`
5. `REGRESSION-GATES.md`
6. `NEXT-TASK.md`
7. `RELEASE-CHECKLIST.md`

Then inspect the actual implementation referenced by `NEXT-TASK.md` before editing.

## Working rule
Do one scoped batch at a time.
Do not continue automatically into the next batch after a completion report unless the user explicitly requests it or `NEXT-TASK.md` clearly authorizes autonomous continuation.

## Trust hierarchy
1. Reproducible repository tests and source.
2. Pinned upstream authoritative component documentation/source.
3. Current repository state documents.
4. User instructions for the current task.
5. Historical reports/screenshots.

Never claim a blocker is closed based only on a report or screenshot if pushed source/tests disagree.

## Completion procedure for every batch
- run all relevant regression gates;
- record exact PASS/FAIL counts;
- list files created/modified;
- list protected components touched (normally none);
- record known limitations;
- update `PROJECT-STATE.md`;
- replace `NEXT-TASK.md` with the next approved task;
- keep `HANDOFF_READY = false` until `INTEGRATION-GATE.md` fully passes.

## 100% integration handoff
Only when all gates in `INTEGRATION-GATE.md` pass may `PROJECT-STATE.md` be changed to:

`HANDOFF_READY = true`

At that point future work may proceed without prior-chat context. The repository itself is the memory.
