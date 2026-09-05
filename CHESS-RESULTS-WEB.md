# Chess-Results Web transport

The production Web shell is served by GitHub Pages. Its `/chessresults/*`
paths are desktop service paths, not publishing endpoints on the static host.
Posting there produces HTTP 405 before Chess-Results receives anything.

Expected behavior for this repair:
- Desktop/localhost retains the installed service transport.
- Hosted Web reads `production-web/web/chess-results-config.json` and posts
  to the configured server's `/api/chess-results/{operation}` endpoint.
- The server authenticates the Organizer Token and forwards to the existing
  official bridge. Creator credentials and encryption stay on the server.
- Missing configuration, HTML responses, and HTTP 404/405 cannot look like
  successful uploads. No automatic retry may allocate a second TNR.
- Existing XML validation, TNR persistence and confirmation workflows remain
  authoritative.

## Deployment

1. Build the standalone backend image from this repository's `Dockerfile`, or
  run this repository's Node production server (`npm run build`, `npm start`),
  on an HTTPS backend. Set `CHESS_RESULTS_BRIDGE_URL` to the existing official
   bridge base URL and, if required, `CHESS_RESULTS_BRIDGE_TOKEN` on the server.
   The bridge must implement `/chessresults/{test,create,publish,admin-link,delete-authorize,unlink}`.
  The container listens on `PORT` (default `3000`) and expects HTTPS to
  terminate at the hosting provider or its reverse proxy. Use `.env.example`
  as the variable-name template; never commit the populated environment file.
2. Set `apiBaseUrl` in `production-web/web/chess-results-config.json` to that
   Node server's HTTPS origin (no `/api` suffix). This public setting contains
   no credentials. Redeploy the canonical `production-web` Pages artifact.
3. The allowed browser origin defaults to `https://web.chess-publisher.org`.
   Set `CHESS_RESULTS_WEB_ORIGIN` on the Node server for a different Web host.
4. Sign in with an Organizer Token and use **Test connection** before
   publishing. Verify a test tournament separately; test requests do not
   allocate or upload a tournament.

An empty `apiBaseUrl` intentionally reports that the backend is not connected.
The Cloud Workspace API is not a Chess-Results bridge and must not be used as
the destination unless that service implements this authenticated contract.
