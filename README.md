# Chess-Publisher Web

Web and cross-platform development branch of Chess-Publisher tournament management software.

## Development workflow
The source of truth is this GitHub repository. Development is intended for a normal local workstation workflow, primarily Linux + VS Code + ChatGPT + GitHub. No Google AI Studio source sync or runtime dependency is required.

Before changing code read:
1. `AGENTS.md`
2. `PROJECT-STATE.md`
3. `INTEGRATION-STATUS.json`
4. `INTEGRATION-GATE.md`
5. `PROTECTED-COMPONENTS.md`
6. `REGRESSION-GATES.md`
7. `NEXT-TASK.md`

## Current status
Authoritative Gacrux 1.9.57 + BBP 6.0.0 pairing/checking, transaction safety, FIDE rating database, Results Integrity lifecycle, and Online & Cloud beta.4 safe synchronization are integrated. Full production acceptance is still gated by live environment tests.

`HANDOFF_READY = false` until every required gate in `INTEGRATION-GATE.md` passes.

## Core regression commands
```bash
npm run lint
npm run test:online-cloud
npm run build
npm run test:arch
npm run test:parity
npm run test:transactions
npm run test:finalization
npm run test:fide
```

Never replace unavailable authoritative engines with prototype logic on production routes.
