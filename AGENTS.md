# Chess-Publisher Web — AI Development Contract

This repository must remain usable by any competent AI coding agent or human developer without relying on prior chat history.

## Source of truth
- GitHub repository state, committed tests, manifests and documentation are authoritative.
- Never rely on conversational memory as the only source of a rule or architectural decision.
- Never overwrite an existing Stable release or RC.

## Current product direction
Chess-Publisher Web is the modern web/cross-platform development line of Chess-Publisher. Preserve the modern UI while restoring functional parity with Chess-Publisher v1.05.00 Stable.

## Protected tournament core
Do not rewrite, simplify, approximate, silently replace or auto-upgrade these components without a reproducible defect plus explicit approval:
- Gacrux 1.9.57 authoritative Swiss Dutch pairing engine.
- BBP Pairings 6.0.0 independent checker.
- Authoritative pairing adapter/process boundary.
- Pairing acceptance triple gate: Gacrux success + independent checker PASS + explicit arbiter confirmation.
- TRF16/TRF26 semantics.
- Tie-break formulas/checker logic.
- Chess-Results protocol/core once integrated.

Never replace trusted chess logic with AI-generated approximations.

## Prototype code
Prototype/demo pairing code may remain for development only if it is explicitly marked non-authoritative. Authoritative APIs must never silently fall back to prototype logic.

## Change discipline
For every functional task:
1. Inspect current implementation first.
2. Reproduce or identify the defect/gap.
3. State exact files to change.
4. Make the smallest coherent change.
5. Do not refactor unrelated code.
6. Do not rename unrelated files.
7. Do not upgrade dependencies unless required and explicitly documented.
8. Run all applicable regression gates.
9. Report modified files, tests and known limitations.
10. Commit atomically.

## High-risk areas
Treat changes as HIGH RISK if they touch:
- pairing / PAB / colours / floats / pairing numbers;
- TRF16 / TRF26 import, export or validation;
- standings or tie-breaks;
- rating calculations;
- FIDE player synchronization;
- Chess-Results transmission;
- tournament persistence / reset / import / resort;
- database migrations;
- production authentication/security.

High-risk work must include fixtures and regression tests before acceptance.

## Tournament transaction safety
Destructive or structural operations must follow:
PRE-FLIGHT -> VALIDATE -> SNAPSHOT -> PREVIEW/DIFF -> ARBITER CONFIRMATION -> MUTATION -> COMMIT.
On any failure: ROLLBACK TO EXACT PREVIOUS STATE.

## FIDE data policy
- Use authoritative FIDE rating-list sources only.
- Never invent player data.
- Rating-list update and active tournament player synchronization are separate operations.
- Player sync must use diff preview + explicit confirmation + transactional apply.
- Preserve Standard, Rapid and Blitz ratings separately.
- Preserve partial birth information without inventing month/day values.

## Release policy
- Development candidates use explicit RC/beta versions.
- Never call a build Stable because it compiles.
- Stable requires the release checklist and all mandatory gates to PASS.
- Every release must be self-describing: parent version, changelog, modified-files list, regression result, known limitations and SHA256.

## Required pre-task reading
Before a substantial change, read:
- PROJECT-STATE.md
- PROTECTED-COMPONENTS.md
- REGRESSION-GATES.md
- RELEASE-CHECKLIST.md
- AI-HANDOFF.md

If repository reality conflicts with these documents, stop and report the discrepancy rather than guessing.