-- Post-raid final results (contracts/final-report.schema.json), kept apart from
-- the in-raid reports: those tune the running season's forecast, these are the
-- record of where each server's lines ended and feed later seasons' models.
-- season_key (address + season) and browser_key (a random id the page keeps)
-- are salted SHA-256 hashes; the engine counts reports sharing either one as
-- one player. No IP address, account or the browser id itself is stored.
CREATE TABLE final_reports (
  id           TEXT PRIMARY KEY,
  submitted_at TEXT NOT NULL,
  season       INTEGER NOT NULL,
  server       TEXT NOT NULL,
  season_key   TEXT NOT NULL,
  browser_key  TEXT NOT NULL,
  doc          TEXT NOT NULL
);
CREATE INDEX final_reports_by_season ON final_reports (season, submitted_at);
CREATE INDEX final_reports_by_season_key ON final_reports (season_key, submitted_at);
