# Chess-Publisher Web — Development Roadmap

This roadmap is intentionally tool-agnostic. Google AI Studio, Junie, Codex, Cursor or a human developer may continue it.

## Completed/accepted direction
- Phase 1: prototype audit.
- Phase 2: client/server and authoritative/prototype separation.
- Phase 3: engine process-safety/readiness.
- Phase 4: Gacrux 1.9.57 + BBP 6.0.0 integration.
- Phase 5: desktop/web pairing parity gate.
- Phase 5A: full functional parity audit.
- Batch A: transaction safety for Resort/Reset/TRF Import (reported complete; repository evidence must be present after merge/push).

## Immediate next milestone — Batch B
FIDE Rating Database & Backend Repository.
Acceptance goals:
- official FIDE rating-list source only;
- server-side persistent indexed cache/database;
- Standard/Rapid/Blitz stored independently;
- list version/date/source/hash/record-count metadata;
- safe transactional update into a temporary DB then atomic promotion;
- previous valid DB preserved on any failure;
- offline fallback search;
- indexed name/FIDE-ID/federation search;
- no sample/mock players in production search;
- rating-list update does not mutate active tournament players;
- dedicated tests and all pre-existing regression gates PASS.

## Batch C
FIDE player search and safe synchronization.
- sync selected player;
- sync all players;
- exact field-by-field diff;
- duplicate FIDE ID handling;
- unmatched player reporting;
- preserve tournament-specific fields;
- explicit arbiter confirmation;
- transactional apply/rollback;
- no mutation of accepted pairings/results.

## Batch D
Player registration & starting-list ergonomics.
- bulk Select All/Clear All/Delete;
- explicit withdrawn state;
- requested-bye workflow;
- starting-rank lock/force-resort safety;
- manual board pairing tool only with clear arbiter override semantics.

## Batch E
Results/Standings/Tie-break/Prizes parity.
- unresolved persistence/options from parity matrix;
- keep trusted formulas protected;
- add independent/known-result fixtures for any formula-adjacent work.

## Batch F
TRF limits, real Chess-Results transport and secondary workflows.
- export through selected round;
- real server-side Chess-Results contract, no mock success;
- recent tournaments;
- keyboard/context-menu ergonomics.

## Batch G
DGT/live integration specification and later implementation.
- do not couple hardware handling to tournament core;
- use explicit bridge/WebSocket/Web Serial architecture as appropriate;
- preserve PGN and broadcast auditability.

## Production phases after parity restoration
1. Persistent production database and migration/backup strategy.
2. Authentication and roles (Organizer/Arbiter/Assistant/Read-only).
3. Tournament Hub/public publishing integration.
4. Production TRF/rating/tie-break gate.
5. Chess-Results production gate.
6. DGT/live gate.
7. Cloud deployment/security/rate limits/monitoring/recovery.
8. Release Candidate.
9. Stable only after RELEASE-CHECKLIST.md passes.

## Priority rule
Critical correctness/data-safety gaps outrank cosmetic/UI work. Do not spend a release cycle on polish while authoritative data/persistence/transaction gaps remain unresolved.
