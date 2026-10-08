-- Inbox for in-raid player reports (contracts/report.schema.json).
-- The whole validated document is kept as JSON in `doc`; the other columns
-- exist only for querying: the engine pulls by submitted_at, the intake
-- counts recent reports per rate_key. No IP address or account is stored.
CREATE TABLE reports (
  id           TEXT PRIMARY KEY,
  submitted_at TEXT NOT NULL,
  season       INTEGER NOT NULL,
  server       TEXT NOT NULL,
  rate_key     TEXT NOT NULL,
  doc          TEXT NOT NULL
);
CREATE INDEX reports_by_time ON reports (submitted_at);
CREATE INDEX reports_by_rate_key ON reports (rate_key, submitted_at);
