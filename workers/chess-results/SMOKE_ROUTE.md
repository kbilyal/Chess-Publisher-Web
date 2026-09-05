# Chess-Results upload smoke route

`POST /api/chess-results/upload-smoke` is a test-only helper for signed Chess-Results test tournaments. It accepts only `key` and `ownershipProof`, requires the signed proof payload to be `mode=test` and `federation=XXX`, generates the minimal smoke XML server-side, and delegates to the normal authenticated ownership + upload diagnostic pipeline. It does not create a TNR and never exposes Worker secrets.
