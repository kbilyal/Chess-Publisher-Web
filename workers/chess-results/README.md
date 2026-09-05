# Chess-Publisher WEB — Chess-Results Worker

This Worker is the production security boundary for the Chess-Publisher WEB Chess-Results integration.

## Architecture

The browser calls only:

- `POST /api/chess-results/test`
- `POST /api/chess-results/create`
- `POST /api/chess-results/publish`
- `POST /api/chess-results/admin-link`
- `POST /api/chess-results/delete-authorize`
- `POST /api/chess-results/unlink`

The browser sends the authenticated user's Organizer Token in the `Authorization: Bearer ...` header. The Worker validates that token against the Chess-Publisher Hub and resolves the organizer identity before any Chess-Results operation.

The Worker then resolves the organizer's Chess-Results CreatorID from a server-side mapping, performs the official bridge operations, and signs a TNR ownership proof returned to that authenticated browser session.

Source ID is fixed to `21`. Test tournaments are forced to federation `XXX`.

No AES key, AES IV, CreatorID assignment, or ownership signing secret belongs in browser code, GitHub Pages, or public repository variables.

## GitHub Actions deployment credentials

Configure these repository Actions secrets before automatic Worker deployment can run:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The API token must be able to deploy Workers and manage the route for `chess-publisher.org`.

## Cloudflare Worker runtime secrets

Configure these as Worker secrets, never as public Wrangler variables:

- `CHESS_RESULTS_AES_KEY`
- `CHESS_RESULTS_AES_IV`
- `CHESS_RESULTS_OWNERSHIP_HMAC_SECRET`
- `CHESS_RESULTS_CREATOR_MAP`

`CHESS_RESULTS_CREATOR_MAP` is JSON keyed by the organizer identity returned by Hub authentication. Example with fake values only:

```json
{
  "organizer-example-id": "12345"
}
```

The real CreatorID values must remain private.

The AES secrets accept `base64:<value>`, `hex:<value>`, a JSON byte array, or a comma-separated byte list. Use the exact official Chess-Results values supplied for the integration.

## Safe public variables

`wrangler.toml` contains only non-secret routing and endpoint values. `WEB_ORIGIN` is restricted to:

`https://web.chess-publisher.org`

## Deployment

From GitHub, once the two Cloudflare Actions secrets exist, run the workflow **Deploy Chess-Results Worker** or push a change under `workers/chess-results/`.

For a local/manual Wrangler deployment:

```bash
cd workers/chess-results
npx wrangler secret put CHESS_RESULTS_AES_KEY
npx wrangler secret put CHESS_RESULTS_AES_IV
npx wrangler secret put CHESS_RESULTS_OWNERSHIP_HMAC_SECRET
npx wrangler secret put CHESS_RESULTS_CREATOR_MAP
npx wrangler deploy
```

Do not put secret values on the command line or commit them to files.

## Smoke checks

A request without an Organizer Token must fail closed:

```bash
curl -i -X POST \
  -H 'Origin: https://web.chess-publisher.org' \
  -H 'Content-Type: application/json' \
  https://web.chess-publisher.org/api/chess-results/test \
  --data '{}'
```

Expected: `401` with `ORGANIZER_TOKEN_REQUIRED`.

With a valid Organizer Token:

```bash
curl -i -X POST \
  -H 'Origin: https://web.chess-publisher.org' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ORGANIZER_TOKEN>' \
  https://web.chess-publisher.org/api/chess-results/test \
  --data '{}'
```

Expected: `200` and `ok: true` after Hub validation and successful GETSID verification.

Test-tournament creation:

```bash
curl -i -X POST \
  -H 'Origin: https://web.chess-publisher.org' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ORGANIZER_TOKEN>' \
  https://web.chess-publisher.org/api/chess-results/create \
  --data '{"mode":"test","federation":"BUL","tournament":"Chess-Publisher Worker Smoke Test","clientId":"manual-smoke"}'
```

Expected: `200`, a numeric `key`, an `ownershipProof`, `sourceId: 21`, and `federation: "XXX"`.

Do not run create/publish smoke tests against production unless a disposable Chess-Results test tournament is intended.
