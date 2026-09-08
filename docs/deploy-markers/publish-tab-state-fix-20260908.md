# Publish workspace state fix — 2026-09-08

Production deploy marker for commit `ac01540bb0082809b5660f75dbc5a252c9edd43b`.

Regression protected behavior: a successful Online Hub publication persists Hub metadata without remounting the Web Companion, so the active Publish workspace remains selected instead of returning to Setup.
