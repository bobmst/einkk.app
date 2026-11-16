-- Damages players looked up in the page's checker during a live raid
-- (contracts/check.schema.json, #100). Low-trust: no Turnstile, no rank. The
-- intake stores one row per season_key, server and damage within a few hours.
-- season_key is the same salted hash the network's reports and final results
-- carry; no IP address or account is stored.
CREATE TABLE checks (
  id          TEXT PRIMARY KEY,
  checked_at  TEXT NOT NULL,
  season      INTEGER NOT NULL,
  server      TEXT NOT NULL,
  season_key  TEXT NOT NULL,
  damage      REAL NOT NULL,
  doc         TEXT NOT NULL
);
CREATE INDEX checks_by_time ON checks (checked_at);
CREATE INDEX checks_by_key ON checks (season_key, server, damage, checked_at);
