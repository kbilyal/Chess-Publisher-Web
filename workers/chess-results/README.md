# Chess-Publisher WEB — Chess-Results Worker

This Worker is the production security boundary for the Chess-Publisher WEB Chess-Results integration.

## Architecture

The browser calls only:

- `POST /api/chess-results/test`
- `POST /api/chess-results/create`
- `POST /api/chess-results/claim`
- `POST /api/chess-results/publish`
- `POST /api/chess-results/admin-link`
- `POST /api/chess-results/delete-authorize`
- `POST /api/chess-results/unlink`

The browser sends the authenticated user's Organizer Token in the `Authorization: Bearer ...` header. The Worker validates that token against the Chess-Publisher Hub only to resolve the authenticated organizer identity.

The full Web workspace at `https://chess-publisher.org/app/` builds from the pinned Windows desktop HTML and uses its tournament validation, snapshot builder and publication UI. Both that workspace and the Web Companion on `web.chess-publisher.org` call the Worker directly with their signed-in Organizer Token.

The official protocol uses Source ID `21` and a stable CreatorID assigned to each organizer. Test tournaments use federation `XXX`. The Worker persists each GETKEY allocation under the organizer and stable `clientId`. A retry returns the same TNR. A transport failure during GETKEY leaves the request pending for operator reconciliation because the provider may already have allocated a key.

The Worker issues signed organizer-scoped ownership proofs. A second browser can recover a Web-created TNR through `claim`. A Desktop TNR or a TNR from the previous Worker can be recovered after explicit server enrollment and verification that it appears in that organizer's synchronized tournament. The Cloud snapshot alone cannot confer Chess-Results ownership.

## Authenticated Upload Data link

For a verified TNR, `POST /api/chess-results/admin-link` with `section: "upload"` returns the official Chess-Results `UploadData.aspx` URL. The URL is generated only by the Worker and follows the official parameter contract:

- `tnr` = database key / TNR
- `sid` = encrypted database key / TNR
- `sid1` = encrypted Worker-side CreatorID
- `source` = `21`
- `lan` = `0`
- `time` = 14-digit `ddMMyyyyHHmmss` request timestamp in the browser time zone, matching the desktop local-time format

The full Web workspace exposes **Upload Section** and **Open Admin**. The Web Companion exposes **Upload data** and **Admin**. AES material never enters the browser, and the browser never constructs `sid` or `sid1` itself.

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
- `CHESS_RESULTS_LEGACY_TNRS` when migrating existing tournaments

The AES secrets accept `base64:<value>`, `hex:<value>`, a JSON byte array, or a comma-separated byte list. Use the official values supplied for this source.

Set `CHESS_RESULTS_CREATOR_MAP` to a JSON object mapping authenticated Hub organizer IDs to unique CreatorIDs assigned for Source ID 21. Keep each assignment stable. Example with fictitious IDs:

```json
{"organizer-example-1": 100, "organizer-example-2": 101}
```

Before releasing, enroll verified Desktop and prior-Web TNRs that their organizers still need to manage. Set `CHESS_RESULTS_LEGACY_TNRS` as a map from organizer ID to TNR records. Verify the original owner, mode, federation and CreatorID independently of the organizer's editable Cloud snapshot. The optional `creatorId` preserves the historical CreatorID if it differs from the organizer's new assignment. Each TNR can have one enrolled owner.

```json
{"organizer-example-2":{"123456":{"mode":"real","federation":"BUL","creatorId":100}}}
```

The public CORS allowlist consists of the exact Web Companion and full Web workspace origins. The deployed Worker exposes the Durable Object through `entry.js` and delegates publication and authentication to the ownership Worker. The first Worker deploy applies the SQLite-backed Durable Object migration in `wrangler.toml`.

## Deployment

From GitHub, once the two Cloudflare Actions secrets exist, run the workflow **Deploy Chess-Results Worker** or push a change under `workers/chess-results/`.

For a local/manual Wrangler deployment:

```bash
cd workers/chess-results
npx wrangler secret put CHESS_RESULTS_AES_KEY
npx wrangler secret put CHESS_RESULTS_AES_IV
npx wrangler secret put CHESS_RESULTS_OWNERSHIP_HMAC_SECRET
npx wrangler secret put CHESS_RESULTS_CREATOR_MAP
# For verified legacy enrollments
npx wrangler secret put CHESS_RESULTS_LEGACY_TNRS
npx wrangler deploy
```

Do not put secret values on the command line or commit them to files.

## Smoke checks

A request without an Organizer Token must fail closed:

```bash
curl -i -X POST \
  -H 'Origin: https://web.chess-publisher.org' \
  -H 'Content-Type: application/json' \
  https://chess-publisher-chess-results.kyamranbilyal.workers.dev/api/chess-results/test \
  --data '{}'
```

Expected: `401` with `ORGANIZER_TOKEN_REQUIRED`.

With a valid Organizer Token:

```bash
curl -i -X POST \
  -H 'Origin: https://web.chess-publisher.org' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ORGANIZER_TOKEN>' \
  https://chess-publisher-chess-results.kyamranbilyal.workers.dev/api/chess-results/test \
  --data '{}'
```

Expected: `200` and `ok: true` after organizer authentication and successful GETSID verification.

Test-tournament creation:

```bash
curl -i -X POST \
  -H 'Origin: https://web.chess-publisher.org' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ORGANIZER_TOKEN>' \
  https://chess-publisher-chess-results.kyamranbilyal.workers.dev/api/chess-results/create \
  --data '{"mode":"test","federation":"BUL","tournament":"Chess-Publisher Worker Smoke Test","clientId":"manual-smoke"}'
```

Expected: `200`, a numeric `key`, an `ownershipProof`, `sourceId: 21`, and `federation: "XXX"`.

Do not run create/publish smoke tests against production unless a disposable Chess-Results test tournament is intended.

For release acceptance, use the same disposable Test tournament to check the official publish endpoint, re-publish its changed results using the same TNR, and open both authenticated pages. The browser regression exercises this sequence against isolated fixtures, including a failed-upload retry.
