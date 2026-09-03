# Chess-Publisher Web — Agent Contract

This repository is the source of truth. Chat history is not authoritative.

Before changing code, every AI agent or human contributor must read:
1. `PROJECT-STATE.md`
2. `INTEGRATION-GATE.md`
3. `PROTECTED-COMPONENTS.md`
4. `REGRESSION-GATES.md`
5. `NEXT-TASK.md`

## Mandatory rules
- Work only on the current task/batch unless a reproducible blocker forces otherwise.
- Never silently replace authoritative chess/FIDE components with prototype logic.
- Never claim PASS without executable evidence and repository-visible tests.
- Preserve modern Web UI, but functional parity with Chess-Publisher v1.05.00 Stable is the baseline.
- No fixed feature may disappear in later commits.
- Use explicit draft/preview/confirm/commit/rollback workflows for destructive or authoritative operations.
- Do not auto-mutate active tournament player data when the FIDE rating database updates.
- Do not weaken validation to make a test pass.
- Update `PROJECT-STATE.md`, `INTEGRATION-STATUS.json`, and `NEXT-TASK.md` after every accepted batch.

## Protected areas
See `PROTECTED-COMPONENTS.md`. Any change there requires a reproducible defect, dedicated tests, and full regression execution.

## Definition of done for any batch
- requested scope implemented;
- lint/build pass;
- all relevant existing regression suites pass;
- new regression tests added for the changed behavior;
- no mock fallback introduced into production paths;
- Git diff reviewed for unrelated changes;
- project state and next task updated.

`HANDOFF_READY` may become true only when every gate in `INTEGRATION-GATE.md` is PASS.