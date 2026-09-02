# Autonomous AI Handoff Protocol

Purpose: allow a new AI agent or human developer to continue Chess-Publisher Web reliably without access to previous conversations.

## Start-of-session procedure
A new agent must:
1. Read AGENTS.md.
2. Read PROJECT-STATE.md.
3. Read PROTECTED-COMPONENTS.md.
4. Read REGRESSION-GATES.md.
5. Read RELEASE-CHECKLIST.md.
6. Inspect package scripts and current tests.
7. Inspect Git branch/status and latest commits.
8. Verify repository reality matches PROJECT-STATE.md.
9. If there is a discrepancy, report it and update PROJECT-STATE.md only after evidence is established.

## Before editing
Return a short task preflight containing:
- goal;
- current behavior/evidence;
- risk level (LOW/MEDIUM/HIGH/CRITICAL);
- exact files expected to change;
- protected areas potentially affected;
- tests/gates that will be run.

Do not begin broad implementation until the task boundary is clear.

## During implementation
- Prefer one coherent task per commit.
- Keep modern UI direction unless task explicitly changes design.
- Preserve desktop functional parity; do not remove capabilities for visual simplicity.
- Never invent authoritative chess/FIDE behavior.
- Never convert NOT_CONFIGURED/UNSUPPORTED/UNKNOWN into PASS.
- Keep development-only mocks/fixtures isolated from production routes.

## End-of-task report
Every task must report:
- summary;
- files created;
- files modified;
- exact behavior change;
- tests run and numeric results;
- regression gates not run and why;
- known limitations;
- commit SHA when committed;
- recommended next task.

## State update rule
Update PROJECT-STATE.md whenever a phase/batch is accepted or the next priority changes. Do not rewrite history; record the new state concisely.

## Feature parity rule
Maintain a machine/human-readable parity baseline. A feature previously marked PASS must not silently regress. If a deliberate behavior difference is introduced, mark it DIFFERENT with justification and tests.

## Protected upstream rule
For Gacrux/BBP or other trusted upstream components:
- pin version and commit/checksum;
- do not edit vendored upstream algorithmic files casually;
- record upstream source/license;
- verify runtime version;
- upgrades require separate task and parity suite.

## Decision hierarchy
When instructions conflict, use this order:
1. Current explicit user instruction.
2. Safety/correctness constraints in AGENTS.md and PROTECTED-COMPONENTS.md.
3. Repository tests and validated fixtures.
4. PROJECT-STATE.md.
5. Existing implementation conventions.
6. Agent preference.

Never override a higher-level constraint merely to simplify implementation.

## Stop conditions
Stop and ask/report instead of guessing when:
- authoritative data source is unknown;
- upstream engine/checker version cannot be verified;
- required fixture is missing for a high-risk change;
- current repo conflicts with documented project state;
- a change would weaken a regression gate;
- production behavior would depend on mock/synthetic data;
- a destructive migration has no rollback path.

## Recommended autonomous loop
AUDIT -> PLAN -> PATCH -> BUILD -> TEST -> DIFF REVIEW -> COMMIT -> UPDATE PROJECT STATE.

Do not automatically proceed into the next batch unless the user explicitly enabled multi-batch autonomous work. Default is STOP after the requested batch and report results.