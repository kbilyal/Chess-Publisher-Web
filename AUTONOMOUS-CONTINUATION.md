# Autonomous Continuation After 100% Integration

This project is intended to continue without dependency on any single AI assistant.

## Before 100% integration
Agents must follow `NEXT-TASK.md` and close integration gaps in roadmap order. Do not skip blockers merely to begin new feature development.

## After 100% integration
When `PROJECT-STATE.md` contains `HANDOFF_READY = true`, an agent may begin a new user-requested feature by:
1. reading repository governance/state documents;
2. creating a scoped branch/PR;
3. preserving protected components;
4. adding regression coverage;
5. updating state/handoff docs when architecture or permanent behavior changes.

## Persistent memory rule
Any rule that future development must remember belongs in the repository, not only in a chat message.
Examples:
- protected algorithms/versions;
- release gates;
- non-obvious TRF semantics;
- operational workflow invariants;
- known limitations;
- architecture decisions;
- test fixtures and expected outcomes.

## Agent replacement test
The integration handoff is successful only if a new agent with zero chat history can clone the repository, read the documented state, run the tests, identify the protected core and next task, and continue safely.
