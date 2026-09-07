# Chess-Publisher Web Companion — Hub-first architecture

Status: replacement candidate, not production yet.

## Product scope

The Web product is no longer a browser copy of the desktop tournament manager. It is a focused companion for work that benefits from a phone or any browser:

1. Open an existing organizer tournament synchronized from Chess-Publisher Desktop.
2. Edit Tournament Setup.
3. Register and maintain players.
4. Synchronize the full tournament back to the private Cloud Workspace.
5. Publish the same synchronized tournament to Chess-Publisher Online Hub.
6. Publish the same synchronized tournament to Chess-Results through the protected server-side bridge.

The Web UI does **not** expose pairings, standings, tie-break calculation, TRF tooling, DGT boards, desktop engine controls or local tournament-engine workflows.

## Source of truth

**Private Cloud Workspace is the authoritative Desktop ↔ Web synchronization channel.**

The public Online Hub is a publication projection, not the editor/source of truth. Chess-Results is an external publication target, not a storage layer.

Flow:

```text
Chess-Publisher Desktop
        │
        │ full private tournament snapshot + stable internal identity
        ▼
Private Cloud Workspace  ◄────────►  Web Companion
        │                              │
        │ latest synchronized state    ├──► Online Hub public snapshot
        │                              └──► Chess-Results secure Worker
        ▼
revision history / conflict guard
```

## Tournament identity

The existing `onlineCloudSync.ts` identity contract stays authoritative:

- reuse `cloud.internalId` when present;
- otherwise reuse the logical Hub tournament ID when present;
- never derive identity from editable tournament name or FIDE ID;
- Cloud `localKey` represents the shared logical tournament across Desktop and Web;
- the browser/device gets its own installation ID only for revision metadata.

This is what prevents a Web edit from creating a second logical copy of a Desktop tournament.

## Synchronization rules

Opening a tournament always loads the latest private Cloud snapshot. Browser storage is only a working cache.

Before external publication the Web Companion synchronizes the full private tournament first.

Writes use the existing optimistic-revision contract (`X-Expected-Revision`). The existing three-way classifier remains authoritative:

- `equal` — no content divergence;
- `cloud-only` — pull Desktop/Cloud changes;
- `local-only` — push Web changes;
- `conflict` — stop; never silently overwrite either side.

When the browser regains focus, the Companion checks the latest Cloud revision if there are no pending local edits or unresolved conflicts.

## Data preservation rule

The Web Companion edits only requested paths (primarily `settings`, `regulations`, `players`, `chessResults` and public publication metadata). The complete Tournament object remains in the private Cloud snapshot.

Hidden desktop-owned data such as pairing history, finalized rounds, TRF metadata and other engine state is preserved when Web changes Setup or Players. DGT mapping remains device-local according to the existing private-cloud stripping rules.

## Online Hub

Publication uses the existing Hub organizer API and `buildPublicHubSnapshot()`.

The Hub record is matched by shared logical tournament identity. If no owned Hub record exists, it is created once and linked to the synchronized tournament. Later publishes update the same Hub tournament revision.

## Chess-Results

Browser code never calls the official Chess-Results bridge directly.

The existing `/api/chess-results/*` Worker architecture remains protected:

- Organizer Token authentication;
- ownership checks;
- server-side bridge communication;
- AES key/IV only in Worker environment;
- Source ID 21;
- GETSID / GETKEY / secure XML upload;
- stable TNR reuse and safe retry behavior.

The Web Companion only prepares the already-supported publication payload and invokes the secure Worker.

## Responsive product model

One React application serves both desktop and mobile.

Desktop:
- persistent left navigation;
- tournament switcher;
- large editing canvas;
- explicit sync controls.

Mobile:
- fixed bottom navigation: Setup / Players / Publish / Tournaments;
- single-column editing flow;
- minimum touch target sizes;
- no separate runtime DOM migration or mobile tab emulation.

## Production migration

The current `production-web` monolith is not deleted from `main` before the replacement candidate passes all gates. That prevents an outage and preserves a rollback point.

Migration sequence:

1. Build the new Companion on an isolated branch.
2. Run TypeScript/build, Cloud roundtrip, Desktop-Web parity, Chess-Results, FIDE/TRF preservation and browser viewport tests.
3. Render real desktop and mobile previews.
4. Switch the production deploy workflow from the legacy `production-web` artifact to the clean Vite `dist` Companion.
5. After production acceptance, archive/delete the retired legacy Web platform files in a separate cleanup commit.

This replacement strategy removes the old platform from production without deleting the synchronization and publication infrastructure it depends on.
