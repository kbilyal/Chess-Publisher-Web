from pathlib import Path
import re

p = Path('tests/ui/hub-companion-v1.test.mjs')
s = p.read_text()
s = s.replace(
    "has(workspace, \"window.addEventListener('focus'\", 'Returning to the browser must trigger a desktop/cloud revision check.');",
    "lacks(workspace, \"window.addEventListener('focus'\", 'Returning to the browser must not silently Pull Cloud data over the open tournament.');\nhas(workspace, 'Pull Cloud → Web', 'Web must expose an explicit Cloud-to-Web Pull action.');\nhas(workspace, 'Push Web → Cloud', 'Web must expose an explicit Web-to-Cloud Push action.');"
)
s = s.replace(
    "has(workspace, 'Resolve safely', 'Conflict action wording must explain the safe merge behavior.');",
    "has(workspace, 'Resolve conflict', 'Conflict resolution must be an explicit separate action.');"
)
s = s.replace(
    "has(workspace, 'Non-overlapping changes were merged safely when possible.', 'Conflict resolution result must be explained to the user.');",
    "has(workspace, 'Safe conflict resolution completed where fields did not overlap.', 'Conflict resolution result must be explained to the user.');"
)
p.write_text(s)

p = Path('src/cloud/tests/runOnlineCloudBeta5BrowserTests.ts')
s = p.read_text().replace(
    "assert.equal(snapshot.cloudWorkspace.clientVersion, 'chess-publisher-web-online-cloud-beta5');",
    "assert.equal(snapshot.cloudWorkspace.clientVersion, 'chess-publisher-web-online-cloud-directional-v1');"
)
p.write_text(s)

p = Path('src/cloud/onlineCloudSync.ts')
s = p.read_text()
marker = "  delete next.runtimeState;\n"
addition = "  delete next.runtimeState;\n  if (next.online && typeof next.online === 'object') {\n    delete next.online.revision;\n    delete next.online.lastPublishedAt;\n  }\n"
if addition not in s:
    if marker not in s:
        raise SystemExit('fingerprint marker missing')
    s = s.replace(marker, addition, 1)
p.write_text(s)

p = Path('src/cloud/OnlineCloudProviderV2.tsx')
s = p.read_text()
start = s.index('  async function pullChanges(tournamentInput: Tournament) {')
end = s.index('  async function syncNow(tournamentInput: Tournament) {', start)
pull = s[start:end]
pull, n = re.subn(
    r"        if \(cloud\.revision === 0 \|\| !cloud\.tournament\) \{.*?          return;\n        \}\n\n        let baseFingerprint",
    "        if (cloud.revision === 0 || !cloud.tournament) {\n          setConflict(false);\n          conflictRef.current = false;\n          setRemoteChangesAvailable(false);\n          setCloudDirty(true);\n          setStatus('Cloud has no snapshot yet. Pull did not upload Desktop data — use Push Desktop → Cloud.');\n          setStatusKind('warn');\n          log('Pull Cloud → Desktop found no remote snapshot; no upload occurred.');\n          return;\n        }\n\n        let baseFingerprint",
    pull,
    count=1,
    flags=re.S
)
if n != 1:
    raise SystemExit(f'pull empty-cloud branch replacement count={n}')
pull, n = re.subn(
    r"        if \(decision === 'local-only'\) \{.*?          return;\n        \}",
    "        if (decision === 'local-only') {\n          setConflict(false);\n          conflictRef.current = false;\n          setRemoteChangesAvailable(false);\n          setCloudDirty(true);\n          setStatus(`Desktop has local changes not in Cloud · r${cloud.revision} — use Push Desktop → Cloud`);\n          setStatusKind('warn');\n          log('Pull Cloud → Desktop detected local-only changes and did not upload them.');\n          return;\n        }",
    pull,
    count=1,
    flags=re.S
)
if n != 1:
    raise SystemExit(f'pull local-only branch replacement count={n}')
s = s[:start] + pull + s[end:]
p.write_text(s)

p = Path('src/cloud/OnlineCloudTabV2.tsx')
s = p.read_text()
s = s.replace(
    'Local save is immediate. Automatic Cloud Sync is always ON and push-safe. Remote changes are never pulled silently; use Pull Changes at any moment.',
    'Local save is immediate. Cloud background sync is push-only. Manual directions are explicit: Pull Cloud → Desktop never uploads; Push Desktop → Cloud never downloads a newer Cloud revision.'
)
s = s.replace('<CloudDownload className="w-5 h-5" /> Pull Changes', '<CloudDownload className="w-5 h-5" /> Pull Cloud → Desktop')
s = s.replace('Always available. Saves local first, then safely reconciles local ↔ common base ↔ cloud.', 'Downloads the current Cloud revision only. It never uploads Desktop edits.')
s = s.replace('<CloudUpload className="w-5 h-5" /> Sync Now', '<CloudUpload className="w-5 h-5" /> Push Desktop → Cloud')
s = s.replace('Attempts safe local → Cloud sync now. Never pulls remote changes over the open tournament.', 'Uploads Desktop changes only after the revision guard passes. It never pulls newer Cloud data.')
s = s.replace('use Pull Changes afterwards.', 'use Pull Cloud → Desktop afterwards.')
p.write_text(s)

doc = Path('docs/DESKTOP-CLOUD-SYNC-CONTRACT.md')
doc.write_text('''# Chess-Publisher Desktop ↔ Cloud ↔ Web directional sync contract

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
''')
