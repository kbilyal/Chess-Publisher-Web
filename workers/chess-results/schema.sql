CREATE TABLE IF NOT EXISTS creators (
  creator_id INTEGER PRIMARY KEY AUTOINCREMENT,
  organizer_id TEXT NOT NULL UNIQUE
);
-- Preserve the supplied desktop creator identity for its verified organizer.
INSERT OR IGNORE INTO creators (creator_id, organizer_id)
VALUES (100, 'org_03ee7cc9f4b84afaaa809e165a0cc08d');
UPDATE sqlite_sequence SET seq = MAX(seq, 100000) WHERE name = 'creators';
CREATE TABLE IF NOT EXISTS tournament_keys (
  organizer_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  creator_id INTEGER NOT NULL,
  tournament TEXT NOT NULL,
  federation TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('real', 'test')),
  state TEXT NOT NULL DEFAULT 'pending',
  tnr TEXT UNIQUE,
  rejection TEXT,
  PRIMARY KEY (organizer_id, client_id)
);
