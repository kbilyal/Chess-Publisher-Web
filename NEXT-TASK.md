# Next Task — Batch C: FIDE Player Synchronization

Results Integrity is closed in pushed source. The next implementation batch is FIDE player synchronization.

Do not start later parity batches until this batch is complete and regression-clean.

## Objective
Allow an arbiter to compare already registered tournament players against the current authoritative cached FIDE rating database and safely apply selected changes.

Updating the FIDE rating database and synchronizing tournament players are separate operations.

A rating-list update must never mutate active tournament players by itself.

## Required capabilities
### Single player
- `Sync with FIDE` action from player row/edit UI.
- exact FIDE-ID lookup when available.
- unmatched state if no authoritative record exists.
- duplicate FIDE-ID warning if tournament data is ambiguous.

### Bulk sync
- `Sync All Players` action.
- compare every eligible registered player against current FIDE cache.
- return matched, unchanged, changed, duplicate and unmatched counts.

## Diff preview
Before any mutation show old vs new values field by field.

At minimum compare:
- Name
- FIDE ID
- Federation
- Title
- Standard rating
- Rapid rating
- Blitz rating
- birth data/year when the authoritative source provides it

Each changed field must be individually visible. The arbiter must be able to skip a player or deselect individual updates when appropriate.

## Preservation rules
Do not overwrite tournament-specific data unless explicitly part of the approved sync:
- pairing number / starting rank
- attendance state
- withdrawn/absent/late-entry state
- requested byes
- manual tournament notes
- results
- pairings
- published metadata

Updating ratings must not automatically resort the starting list. If a rating change implies a possible starting-list change, show `Starting list may be outdated` and require the existing explicit transactional Resort workflow.

## Transaction model
`COMPARE -> PREVIEW -> ARBITER CONFIRM -> SNAPSHOT -> APPLY -> VALIDATE -> COMMIT`

On any failure: rollback exact previous tournament state.

Reuse the existing transaction framework; do not invent a second transaction system.

## Backend/API
Implement or complete authoritative routes/services for:
- `POST /api/fide/sync-player`
- `POST /api/fide/sync-all-players`

The API should produce a diff first. A separate confirmed apply request or explicit apply flag must be required for mutation.

Do not let the client submit arbitrary authoritative player values as if they came from FIDE. Server-side cache is the source of truth.

## Rating type behavior
Preserve all three ratings in player data:
- `ratingStandard`
- `ratingRapid`
- `ratingBlitz`

The tournament's active rating value must map deterministically from its rating type without deleting the other ratings.

## Birth data
Preserve partial dates according to the existing Chess-Publisher policy. Never invent missing month/day values.

## UI
Add a professional `FideSyncModal` or equivalent with:
- summary counts;
- changed players first;
- field-level diffs;
- unmatched/duplicate warnings;
- Select All / Clear All for applicable changes;
- explicit `Apply Selected Updates` confirmation;
- progress and error state;
- rollback error reporting.

## Hard invariants
- Database refresh alone never changes tournament players.
- Sync never changes past pairings/results.
- Sync never changes requested byes or player lifecycle state.
- Sync never silently resorts the starting list.
- Unmatched player is never overwritten with guessed data.
- Duplicate FIDE IDs are never auto-resolved.
- Failed apply leaves tournament state byte/semantically equivalent to before the transaction.

## Tests
Add `npm run test:fide-sync` with at least these cases:
1. selected player unchanged;
2. selected player rating change preview;
3. title change preview;
4. federation change preview;
5. all three rating types preserved;
6. partial birth data preserved;
7. unmatched player reported;
8. duplicate tournament FIDE ID reported;
9. bulk sync mixed changed/unchanged/unmatched;
10. no mutation before confirmation;
11. confirmed selected fields apply;
12. deselected field remains unchanged;
13. tournament-specific fields preserved;
14. pairings/results unchanged;
15. requested byes unchanged;
16. no automatic starting-list resort;
17. failed persistence rolls back;
18. stale/missing FIDE database handled safely;
19. client cannot inject arbitrary authoritative values;
20. restart/persistence behavior remains valid.

## Mandatory regression
Run and report:
- `npm run lint`
- `npm run build`
- `npm run test:arch`
- `npm run test:parity`
- `npm run test:transactions`
- `npm run test:finalization`
- `npm run test:fide`
- `npm run test:fide-sync`

## Completion report
Return exact files changed/created, endpoint contracts, transaction behavior, diff model, tests and counts, regression results, known limitations and git diff summary.

Do not begin the next batch automatically. After acceptance update `PROJECT-STATE.md`, `INTEGRATION-STATUS.json`, and `NEXT-TASK.md`.