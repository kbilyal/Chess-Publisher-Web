# Chess-Publisher Web — Release / Handoff Checklist

## Before every RC
- working tree committed;
- exact commit SHA recorded;
- no unresolved CRITICAL/HIGH parity gap;
- protected upstream versions/commits unchanged or explicitly reviewed;
- no production mock/sample fallback;
- all mandatory tests PASS;
- build succeeds from clean checkout;
- project-state documents updated.

## Before Stable
- `INTEGRATION-GATE.md` fully PASS for the intended Stable scope;
- `HANDOFF_READY = true` in `PROJECT-STATE.md` only after evidence exists;
- no known result-integrity defect;
- no pairing/checker regression;
- no TRF regression;
- FIDE data source/cache verified;
- Chess-Results production path verified if included in release scope;
- tie-break core independently verified if presented as authoritative;
- production persistence/restart/recovery verified;
- deployment secrets and sensitive logs reviewed;
- exact release artifacts/hashes recorded.

## Before autonomous continuation without prior chat context
A fresh agent must be able to answer from repository contents alone:
1. What is authoritative?
2. What is prototype/non-authoritative?
3. What is currently broken or incomplete?
4. What is the next task?
5. Which files/core components must not be changed casually?
6. Which test commands must pass?
7. What constitutes 100% integration?

If any answer requires old chat history, the handoff is incomplete.

## Evidence rule
Reports are useful but repository evidence wins:
- source must be pushed;
- tests must exist in repository;
- commands must be reproducible;
- screenshots alone do not close a blocker.
