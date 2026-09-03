# Protected Components

These areas must not be casually rewritten during feature work.

## Protected authoritative core
- Gacrux 1.9.57 authoritative pairing path and pinned upstream integration.
- BBP Pairings 6.0.0 independent checker and capability guard.
- authoritative pairing draft/check/arbiter-accept flow.
- TRF semantics for played results, forfeits, PAB, requested byes, unpaired entries and partial birth dates.
- transaction manager snapshot/rollback guarantees.
- round finalization and result-integrity invariants.
- FIDE rating-list atomic update/offline-cache safety.

## Protected by validation, not frozen forever
Tie-break and standings code may be changed only through a dedicated parity task because it remains `UNVERIFIED_IMPLEMENTATION`.

Chess-Results production transmission may be implemented, but validated desktop semantics must not be replaced by invented behavior.

## Change rule
A protected component may change only when:
1. a reproducible defect or explicit integration task requires it;
2. expected behavior is documented first;
3. dedicated regression tests are added;
4. all existing relevant suites pass afterward;
5. the change and justification are recorded in `PROJECT-STATE.md`.

Prototype code such as `src/engine/dutchEngine.ts` must never be promoted to authoritative fallback simply because an external engine is unavailable.