# Chess-Publisher Desktop v1.06.00-beta.79 ↔ Cloud ↔ Web unified SYNC contract

Status: normative compatibility contract. Desktop beta.79 owns the unified SYNC algorithm; Web Companion must provide compatible state and must not reconstruct, bypass or replace the Desktop algorithm.

## Core invariant: one tournament = one private Cloud object

- Tournament identity is stable `internalId` linked to one organizer-owned `cloudTournamentId`.
- The server `local_key` stores the stable logical internal identity for that organizer.
- Tournament name, filename and revision are never identity.
- Rename never creates a new Cloud record.
- A stale `cloudTournamentId` may be repaired only by exactly one organizer-owned stable-internalId match.
- More than one valid identity match is an ambiguity: stop/fail closed; never pick the first row.
- Before CREATE, Web refreshes the authenticated organizer-owned list. The server additionally enforces `UNIQUE (organizer_id, local_key)` and returns the existing row for an idempotent CREATE.
- UI state such as the currently open/active tournament is never an identity fallback.

## Desktop beta.79 unified `↕ SYNC`

Desktop exposes one normal synchronization action. The Desktop algorithm determines the direction:

| State | Desktop beta.79 action |
|---|---|
| Desktop only changed | Desktop → Cloud |
| Cloud/Web only changed | Cloud → Desktop |
| Portable content equal | no-op / refresh base metadata |
| Compatible changes | safe merge through the protected Desktop algorithm |
| True conflict | fail closed / conflict resolution; never silent overwrite |

Web must not add a second Desktop-facing Pull/Push algorithm. Web must supply correct revision, complete portable snapshot, stable identity and current state so this existing Desktop logic can decide correctly.

## Cloud revision contract

Every changed private snapshot is stored through the existing private Cloud revision transaction:

1. validate complete Cloud snapshot;
2. serialize and checksum;
3. compare expected revision to current revision;
4. upload the new revision object to private B2;
5. insert `cloud_revisions` history;
6. optimistic-update the same `cloud_tournaments` row;
7. if the row changed concurrently, fail closed with `cloud_revision_conflict`.

An unchanged checksum is a no-op and does not increase revision. Revision is version state only; it is never tournament identity.

## Web and Arbiter results

A Web/Arbiter result is part of the same private tournament snapshot that Desktop beta.79 downloads.

A result submission must identify and validate:

- Cloud tournament/organizer ownership;
- round;
- board;
- white player identity (`whiteKey`);
- black player identity (`blackKey`);
- explicit allowed result.

After those checks, only `board.result` may change. The submission must not change pairings, player identity, round structure, starting numbers, or generate a next round/pairing.

The Arbiter compatibility/audit queue (`cloud_arbiter_results`) may remain pending so Desktop Pairings `↕ SYNC` can perform its own protected validation and guarded acknowledgement. The queue is not the authoritative tournament state; the private tournament snapshot is authoritative.

Web Organizer UI must never be required to be open for an Arbiter result to reach Cloud state and must never ACK a result before Desktop beta.79 validation.

## Result safety

- A blank Web value has no result-write path and cannot erase a non-empty Desktop result.
- If Desktop and Cloud contain different non-empty changes from a common base, the Desktop unified algorithm treats this as conflict; Web must not silently choose one.
- Board mismatch -> reject.
- White/black player identity mismatch -> reject.
- Finalized/administrative pairing -> reject result write when protected rules require it.
- Result synchronization never creates a pairing or round.

## New, Web-created and imported tournaments

### Desktop-created

Desktop creates → `↕ SYNC` → if no owned row matches stable identity, one private counterpart is created. Every later SYNC targets that same object.

### Web-created

Web generates a fresh stable private identity, creates/reuses the matching organizer-owned row, stores the complete tournament snapshot, and Desktop later relinks to that same Cloud object.

### Imported TRF16 / TRF26 / TUNX

If the imported tournament already contains a stable private identity, preserve it. Discard installation-local `cloud.localKey` and never use filename/name as permanent identity. If the authenticated organizer already has exactly one matching Cloud row, relink to it. Otherwise create one counterpart. Public Hub linkage is not private identity.

## Public Hub separation

Private Cloud is the working copy. Public Hub is a separate explicit publication workflow.

- `↕ SYNC` never publishes to Hub.
- Private Cloud creation/update never makes a tournament public.
- `Publish Online` / `Publish to Hub` is explicit.
- Hub tournament id/public slug are publication metadata only and must never rewrite `cloud.internalId`.
- Deleting or updating private Cloud does not implicitly delete/update the public Hub except through an explicit public action.

## Organizer isolation

All My tournaments and private Cloud operations are scoped by the authenticated Organizer Token. Browser-supplied tournament id alone is never authorization. Server routes validate organizer ownership before read/write.

## Portable tournament payload

Synchronize the complete portable tournament object, including settings, regulations metadata, schedule, players, portable pairings/round lifecycle, requested byes, attendance, starting numbers, standings/tie-break configuration, special prizes, relevant publication metadata, stable `internalId` and `cloudTournamentId`.

Never transport installation-local secrets/hardware state: Organizer/auth tokens, Hub manage/admin tokens, AES key/IV, file paths, executable paths, DGT/serial/USB mappings, machine secrets, temporary UI/runtime state.

## My tournaments UX

Keep the Web Companion simple: My tournaments, New tournament, Import tournament, Search, Refresh, Trash and tournament cards/list. Do not expose normal users to raw internal IDs, local keys, base fingerprints, Cloud record IDs or revision-base internals. `PUBLIC LIST` is not part of My tournaments.

## Protected areas

This Web compatibility layer does not modify Gacrux 1.9.57, Swiss Dutch pairing core, TRF16/TRF26 core, BBP checker, Tie-Break core, Chess-Results protocol/core, pairing identity semantics, or protected Desktop tournament algorithms.

## Required beta.79 compatibility matrix

1. Desktop creates → SYNC → Web sees exactly one tournament.
2. Desktop modifies → SYNC → same Cloud object revision increases.
3. Web modifies → Desktop SYNC receives changes.
4. Web/Arbiter enters result → Pairings SYNC → Desktop gets result.
5. Desktop enters result → SYNC → Web gets result.
6. Blank Web result does not erase Desktop result.
7. Different non-empty results → conflict.
8. Board identity mismatch → reject.
9. Player identity mismatch → reject.
10. Repeated SYNC → no duplicate tournaments; ambiguous duplicate identity → stop.
11. Web-created tournament → Desktop open → SYNC → same object.
12. Imported tournament → first SYNC → exactly one Cloud object.
13. Rename tournament → same identity.
14. `PUBLIC LIST` absent from My tournaments.
15. Private Cloud SYNC does not publish to Public Hub.
16. Organizer ownership isolation.

Protected release gates remain TypeScript, Cloud roundtrip, tournament import, Arbiter security/results, FIDE, TRF16/TRF26, Chess-Results, pairing parity and production build.