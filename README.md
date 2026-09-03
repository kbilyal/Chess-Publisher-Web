# Chess-Publisher Web

Web and cross-platform development branch of Chess-Publisher tournament management software.

## Start here for development
This repository is designed to be continued by Google AI Studio, Junie, Codex, Cursor, Claude or a human developer without prior chat history.

Before changing code read:
1. `AGENTS.md`
2. `PROJECT-STATE.md`
3. `INTEGRATION-STATUS.json`
4. `INTEGRATION-GATE.md`
5. `PROTECTED-COMPONENTS.md`
6. `REGRESSION-GATES.md`
7. `NEXT-TASK.md`

## Current status
Authoritative Gacrux 1.9.57 + BBP 6.0.0 pairing/checking, transaction safety, FIDE rating database and Results Integrity lifecycle are integrated. Full 100% functional integration is still in progress.

Current next task: **Batch C — FIDE Player Synchronization**.

`HANDOFF_READY = false` until every gate in `INTEGRATION-GATE.md` passes.

## Core regression commands
```bash
npm run lint
npm run build
npm run test:arch
npm run test:parity
npm run test:transactions
npm run test:finalization
npm run test:fide
```

Never replace unavailable authoritative engines with prototype logic on production routes.