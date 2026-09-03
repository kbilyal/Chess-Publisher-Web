# Chess-Publisher Web — Release / Handoff Checklist

No RC, Stable, or autonomous-handoff claim is valid unless all applicable items are checked.

## Source state
- working tree clean;
- exact commit recorded;
- no unreviewed generated/mock data in production paths;
- protected-component changes explicitly documented.

## Build and tests
Run from clean checkout:
- `npm install` or locked equivalent;
- `npm run lint`;
- `npm run build`;
- every test command listed in `REGRESSION-GATES.md`.

## Functional gates
- all applicable gates in `INTEGRATION-GATE.md` PASS;
- final 104-feature parity re-audit complete;
- no unresolved CRITICAL/HIGH regression;
- no hidden prototype fallback;
- production persistence/recovery verified.

## Artifacts / deployment
- environment variables documented without secrets;
- deployment target and runtime versions recorded;
- authoritative engine/checker versions recorded;
- database migration/recovery procedure tested;
- public/private data access reviewed.

## Documentation
Update:
- `PROJECT-STATE.md`
- `INTEGRATION-STATUS.json`
- `NEXT-TASK.md`
- changelog/release notes when applicable.

## Autonomous handoff
Only when all integration gates PASS:
- set `handoffReady: true`;
- replace `NEXT-TASK.md` with the next normal development task, not an integration blocker;
- verify a fresh AI agent can identify architecture, protected core, tests, current state and next task using repository files only.