# Chess-Publisher Desktop ↔ Cloud ↔ Web directional sync contract

Status: normative implementation contract for Desktop and Web continuation.

## Invariants

- Tournament identity is `internalId` + `cloudTournamentId`, never the tournament name.
- Rename never creates a new Cloud record.
- Local autosave and Cloud transport are separate concepts.
- Pull never uploads local tournament content.
- Push never downloads or silently merges a newer Cloud tournament.
- Resolve Conflict is the only operation allowed to perform a three-way merge.
- Every Cloud write uses `X-Expected-Revision`.
- Installation-local secrets and hardware state never enter the portable snapshot.

## Exact buttons

Desktop:

1. `↓ Pull Cloud → Desktop`
2. `↑ Push Desktop → Cloud`
3. `Check Cloud Status`
4. `Resolve Conflict` — only for a true two-sided conflict
5. `Open in Web`

Web is symmetric: `Pull Cloud → Web` / `Push Web → Cloud`.

## State machine

| Condition | State | Action |
|---|---|---|
| `LOCAL == REMOTE` | `IN_SYNC` | none |
| `LOCAL != BASE && REMOTE == BASE` | `LOCAL_CHANGES` | Push |
| `LOCAL == BASE && REMOTE != BASE` | `REMOTE_CHANGES` | Pull |
| both changed and differ | `CONFLICT` | Resolve Conflict |
| no network | `OFFLINE` | local save only |

Never show a generic `Synced` unless portable fingerprints are equal.

## Pull Cloud → Desktop

```text
save local state
GET latest Cloud snapshot
compute LOCAL / BASE / REMOTE fingerprints

no remote snapshot:
  do not upload; request Push

LOCAL == REMOTE:
  refresh base metadata only

LOCAL == BASE and REMOTE != BASE:
  preserve installation-local fields
  load REMOTE portable tournament locally
  update base revision/fingerprint

LOCAL != BASE and REMOTE == BASE:
  do not upload
  show Desktop changes not pushed

both changed:
  do not overwrite
  status = CONFLICT
```

## Push Desktop → Cloud

```text
saveAll()
GET current Cloud revision/snapshot
compute LOCAL / BASE / REMOTE

LOCAL == REMOTE:
  refresh base metadata only

REMOTE == BASE and LOCAL != BASE:
  PUT complete portable snapshot with X-Expected-Revision
  save returned revision and new base fingerprint

REMOTE != BASE:
  stop
  do not Pull
  do not merge
  request Pull Cloud → Desktop
```

A background Cloud push, if enabled, must use the same Push preflight. It can never behave as Pull.

## Resolve Conflict

Use exact three-way merge: BASE = baseRevision snapshot, LOCAL = Desktop, REMOTE = latest Cloud.

```text
LOCAL == BASE && REMOTE != BASE -> REMOTE
REMOTE == BASE && LOCAL != BASE -> LOCAL
LOCAL == REMOTE                 -> either
otherwise                       -> FIELD CONFLICT
```

Same-field conflicts require explicit `Keep Desktop` / `Keep Cloud`. Save merged result locally; do not auto-Push.

## Portable tournament

Synchronize the complete portable object: name, settings, regulations, schedule, players, portable pairings/round lifecycle, requested byes, attendance, starting numbers, standings/tie-break configuration, special prizes, Chess-Results state, Online Hub identity/public metadata, `internalId`, and `cloudTournamentId`.

Legacy Desktop snapshots that store the visible name only in `data.currentTournament` / tournament-map key must hydrate it into `tournament.name`.

## Never transport installation-local fields

Organizer/auth tokens, Hub manage/admin token, AES key/IV, file paths, executable paths, DGT ports/serial/USB mappings, machine secrets, temporary UI/runtime state.

## Player sorting

Starting #, Rating ↓ and Name A–Z are view sorting only. They never mutate `pairingNumber`, `id`, `localKey`, pairings or official starting ranks. Resort Starting List remains a separate official operation.

## Publish gate

```text
IN_SYNC        -> publish
LOCAL_CHANGES  -> safe Push, verify equality, publish
REMOTE_CHANGES -> stop; Pull required
CONFLICT       -> stop; Resolve Conflict required
```

No hidden direction reversal inside Publish.

## Required parity fixture

`Tournament Ubuntu`, chief arbiter `Kyamran Bilyal`, Sofia, BUL, 90+30, 7 rounds, Test tournament, 83 players. Desktop → Cloud → Web → Cloud → Desktop must preserve every portable field, all 83 players, `internalId`, `cloudTournamentId`, while keeping installation-local fields local.

Protected gates: TypeScript, Cloud roundtrip, Chess-Results, TRF16/TRF26, pairing parity, FIDE, production build.
