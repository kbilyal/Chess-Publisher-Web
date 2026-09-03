# Chess-Publisher Web beta.5 deployment state

Production browser test candidate activated on `main`.

- Browser local save: immediate and independent of network availability.
- Automatic Cloud Sync: always ON after Organizer Workspace connection.
- Automatic Cloud Sync is push-safe and never silently downloads remote content over the open tournament.
- Pull Changes: explicit, always available, and serialized behind any in-flight Cloud mutation.
- Sync Now: safe local-to-Cloud synchronization only.
- Organizer Token: workspace authorization only; never part of tournament identity or continuation URL.
- `cloud.internalId`: stable logical Desktop/Web tournament identity.
- `cloud.localKey`: installation-local only and excluded from private Cloud snapshots.
- Three-way reconcile: equal / cloud-only / local-only / conflict.
- Optimistic concurrency: Cloud writes use expected revision and fail closed on stale state.
- Continue in Browser: accepts only a non-secret tournament hint and opens it only after Organizer Token ownership validation.
- CI gates: TypeScript, Online & Cloud beta.4, Browser Continuation beta.5, transactions, round finalization, FIDE regression, production build.

Protected chess core is outside the scope of this Web deployment change.
