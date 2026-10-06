-- Listing health (session 38): the directory re-resolves its own listings on a
-- schedule, because a listing checked once at submission stays "valid" forever
-- and the OPML export would keep sending agents to dead feeds.
--
-- failing_since is the first failed check of the current run of failures, and
-- is cleared by any success. A listing is dormant once it has been failing for
-- 72 hours straight (health.ts) — confirmed, not one bad night.
ALTER TABLE submissions ADD COLUMN last_checked_at TEXT;
ALTER TABLE submissions ADD COLUMN last_ok_at TEXT;
ALTER TABLE submissions ADD COLUMN failing_since TEXT;
-- Admin-only: what the last check found, when it was not simply "fine".
ALTER TABLE submissions ADD COLUMN health_note TEXT;

-- Feeds seen in listed blygs' blogrolls (§11). Admin-only, and never listed:
-- the directory lists blygs that chose to list themselves. A sighting that
-- resolves as an unlisted blyg is someone to invite, nothing more.
CREATE TABLE sightings (
  feed_url      TEXT PRIMARY KEY,
  title         TEXT,
  html_url      TEXT,
  -- The listed origin whose blogroll it was first seen in.
  seen_on       TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  -- Resolution: NULL until checked; 'blyg' | 'rss' | 'failure'.
  kind          TEXT,
  origin        TEXT,
  checked_at    TEXT
);

CREATE INDEX idx_sightings_unchecked ON sightings (checked_at, first_seen_at);
CREATE INDEX idx_submissions_health ON submissions (status, last_checked_at);
