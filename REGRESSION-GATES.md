# Regression Gates

Every accepted change must preserve all previously validated behavior.

## Current mandatory suites
- `npm run lint`
- `npm run build`
- `npm run test:arch` — architecture/process safety
- `npm run test:parity` — desktop/web Gacrux parity fixtures
- `npm run test:transactions` — transaction rollback invariants
- `npm run test:finalization` — 30-case Results Integrity / Bye / round lifecycle suite
- `npm run test:fide` — FIDE rating database/cache tests

## Rules
- A new feature family gets its own dedicated regression suite when practical.
- A failing old test is a regression until proven otherwise.
- Do not delete or weaken tests to make a new implementation pass.
- If a test expectation genuinely changes, document the approved behavior change in `PROJECT-STATE.md` and the PR.
- Production routes may not silently fall back to mock/sample/prototype implementations.
- High-risk changes require failure-injection tests, not only happy-path tests.

## Future required suites
Add dedicated commands for:
- FIDE player synchronization;
- TRF full parity;
- tie-break authoritative parity;
- Chess-Results transmission;
- production persistence/recovery/security.

At final handoff all suites must pass from a clean checkout.