# AI Handoff Procedure

A new AI agent must be able to continue Chess-Publisher Web without prior chat history.

## Startup procedure
Read, in order:
1. `AGENTS.md`
2. `PROJECT-STATE.md`
3. `INTEGRATION-STATUS.json`
4. `INTEGRATION-GATE.md`
5. `PROTECTED-COMPONENTS.md`
6. `REGRESSION-GATES.md`
7. `NEXT-TASK.md`

Then inspect the files referenced by the current task before proposing changes.

## Required first response from a new agent
Summarize:
- current verified baseline commit;
- authoritative vs prototype components;
- current open gate;
- exact next task;
- mandatory regression commands;
- protected areas that must not change.

Do not start coding until that understanding is consistent with repository state.

## During work
- keep changes scoped;
- add tests with the implementation;
- do not rewrite protected core to simplify unrelated work;
- do not use mock/sample fallback in production routes;
- preserve transactional barriers and explicit arbiter confirmation.

## Completion procedure
Before calling a task complete:
1. run relevant regression suites;
2. record counts/results;
3. inspect git diff for unrelated edits;
4. update `PROJECT-STATE.md`;
5. update `INTEGRATION-STATUS.json`;
6. replace `NEXT-TASK.md` with the next accepted integration task;
7. keep `handoffReady=false` until every gate is closed.

If repository documentation and code disagree, code/tests determine what exists, but the documentation mismatch itself is a defect that must be corrected before handoff.