# Next Task — Batch B: FIDE Rating Database & Backend Repository

Do not begin Batch C or later work in the same change.

## Objective
Restore authoritative FIDE rating-list capabilities from the desktop reference while keeping active tournament state unchanged during database updates.

## Preflight
Before editing:
1. Read AGENTS.md and all governance files.
2. Inspect the actual current repo implementation after Google AI Studio code is pushed.
3. Locate desktop-reference FIDE rating-list behavior/specification if present in repository material.
4. Identify the official FIDE downloadable rating-list source and exact file/archive format. Do not scrape HTML.
5. Report files to change and current gaps.

## Required architecture
React client -> Express API -> FideRatingService -> FideRatingRepository -> persistent server-side cache/database -> official FIDE source.

Prefer SQLite or another justified embedded indexed DB for current Linux/Cloud Run development. Do not parse the full rating directory in the browser.

## Required player fields
- fideId
- name
- federation
- title
- birth information at the precision actually supplied
- ratingStandard
- ratingRapid
- ratingBlitz
- any other authoritative source field needed by validated desktop workflows

Never collapse Standard/Rapid/Blitz into one stored value.

## Required rating-list metadata
- listVersion
- listDate
- downloadedAt
- source
- recordCount
- sha256
- importStatus
- lastError

## Safe update transaction
Download -> hash -> parse into TEMP DB -> validate format/record count -> build indexes -> sanity tests -> atomically promote -> retain previous valid DB fallback.

On any failure, keep using the previous valid DB.

Only one update may run at a time. Search must remain available against the old DB while the replacement is prepared.

## Required APIs
- GET /api/fide/status
- POST /api/fide/update-rating-list
- GET /api/fide/search?q=...&fed=...
- GET /api/fide/player/:fideId

Do not implement sync-player or sync-all in Batch B.

## Production search rules
- exact FIDE ID;
- case-insensitive name prefix/partial search;
- optional federation filter;
- indexed/server-side;
- production path must never return SAMPLE_FIDE_PLAYERS or other mocks.

## UI requirements
Add a compact FIDE database status/update area showing:
- list version/month;
- record count;
- last update;
- status;
- update/retry action;
- download/parsing/indexing/validation progress states.

Connect player registration search to real server FIDE endpoints. Adding a player selects the tournament rating value according to tournament type while preserving all three ratings in the player model.

## Birth-data rule
Never invent dates. If the source provides only a year, keep year-only/partial representation compatible with the project's validated partial-date policy. Never transform YYYY into YYYY/01/01.

## Security
- source URL configured server-side only;
- no client-provided arbitrary fetch URL;
- SSRF/path-traversal protection;
- download timeout;
- archive-size/decompression limits;
- isolated temp directory and guaranteed cleanup;
- atomic DB replacement.

## Mandatory Batch B tests
1. No DB installed.
2. Successful authoritative update.
3. Metadata stored.
4. Standard parsed.
5. Rapid parsed.
6. Blitz parsed.
7. Exact FIDE ID search.
8. Partial-name search.
9. Federation filter.
10. Partial birth preserved.
11. Failed download keeps previous DB.
12. Invalid archive keeps previous DB.
13. Invalid parsed data keeps previous DB.
14. Concurrent update blocked.
15. Offline search uses cached DB.
16. Client cannot choose arbitrary source URL.
17. Mock/sample players absent from production search.
18. Database SHA256 metadata correct.
19. Restart preserves DB.
20. Rating-list update does not mutate active tournament.

## Existing gates that must remain PASS
Run all commands that actually exist in the merged repository. Expected names from accepted work include:
- npm run lint
- npm run build
- npm run test:arch
- npm run test:parity
- add/run npm run test:fide if appropriate

If a named command is absent, do not fake it. Report the discrepancy and add the appropriate test wiring when it belongs to this task.

## Completion report
Return:
- authoritative FIDE source and format;
- files created/modified;
- DB schema;
- imported record count and list version/date from test/runtime evidence;
- API behavior;
- search performance evidence;
- offline/failure behavior;
- security controls;
- exact tests and numeric results;
- regression results;
- known limitations;
- Git diff summary and commit SHA.

STOP after Batch B. Do not automatically start Batch C.