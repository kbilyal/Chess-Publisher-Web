# Chess-Publisher Web — Autonomous Development Contract

This repository must remain safe to continue by any competent AI coding agent or human developer without relying on chat history.

## Source of truth
- GitHub repository state, tests, and the documents in this repository are authoritative.
- Never rely on remembered chat instructions when repository rules exist.
- Read `PROJECT-STATE.md`, `INTEGRATION-GATE.md`, `PROTECTED-COMPONENTS.md`, `REGRESSION-GATES.md`, and `NEXT-TASK.md` before changing code.

## Protected core
Do not change these unless a reproducible failing test proves the defect is inside that component and the change is explicitly scoped:
- Gacrux 1.9.57 authoritative Swiss Dutch pairing integration.
- BBP Pairings 6.0.0 independent checker integration.
- authoritative pairing acceptance gate.
- validated TRF16/TRF26 semantics.
- validated transaction/rollback framework.
- Chess-Results core protocol once verified.
- tie-break core once independently verified and promoted from UNVERIFIED_IMPLEMENTATION.

Never silently replace authoritative components with AI-generated approximations.
Never silently fall back to `src/engine/dutchEngine.ts` for authoritative pairing.

## Development workflow
1. Read current state and next task.
2. Inspect implementation before editing.
3. Make one scoped change/batch.
4. Run all mandatory regression gates.
5. Stop if a protected-core test regresses.
6. Report exact files changed, tests run, pass/fail counts, and known limitations.
7. Update `PROJECT-STATE.md` and `NEXT-TASK.md` after every accepted batch.

## Definition of done for a batch
A batch is not complete because code compiles. It is complete only when:
- requested behavior exists;
- failure paths are tested;
- no protected regression gate fails;
- no fake/mock production fallback is introduced;
- repository state documents are updated.

## Production data rules
- Never invent FIDE player data.
- Never invent FIDE pairing/checker results.
- Never convert administrative round states (PAB, requested bye, unpaired, absent, withdrawn) into fake played-game results.
- Never mutate active tournament players automatically after a FIDE rating-list update.
- Never overwrite official tournament state without transactional preflight/snapshot/rollback where required.

## Round integrity
A round must distinguish normal games from administrative entries.
`NORMAL_GAME` requires two real players and a valid game result.
Administrative states must not expose normal result editing.
Round progression must follow an explicit lifecycle and Next Round must be blocked until the current round is finalized.

## Release discipline
- No Stable release from an unverified working tree.
- No Stable release with unresolved CRITICAL/HIGH parity gaps.
- Do not claim 100% integration until `INTEGRATION-GATE.md` is fully PASS.
- Preserve exact upstream versions/commits for third-party authoritative components.
