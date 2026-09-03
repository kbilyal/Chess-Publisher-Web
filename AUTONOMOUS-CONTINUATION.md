# Autonomous Continuation After 100% Integration

This file describes how Chess-Publisher Web should be developed after `handoffReady=true`.

## Source of truth
GitHub repository contents, tests and release metadata are authoritative. No AI agent should require an earlier chat transcript to understand the project.

## Normal task workflow
1. Read repository handoff files.
2. Create/choose a scoped branch.
3. State expected behavior and protected areas.
4. Implement smallest coherent change.
5. Add/extend regression tests.
6. Run mandatory relevant suites.
7. Review diff for unrelated changes.
8. Update project state/changelog.
9. Open PR with regression evidence.
10. Merge only after gates pass.

## High-risk changes
Pairing, TRF, tie-breaks, Chess-Results, FIDE synchronization, persistence migrations and security changes require independent review and dedicated regression/failure-injection evidence.

## Multi-agent rule
Do not allow multiple agents to edit the same working tree concurrently without commits/branches. Use Git as the synchronization boundary.

## Failure rule
If a future agent cannot determine whether a component is authoritative, protected, or validated, it must stop and classify it before modifying it. Guessing is not permitted.