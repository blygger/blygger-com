-- blygger.com directory — submissions and their resolution result.
--
-- One table. A submission is a URL someone offered plus what our own resolver
-- (self-host-plan.md §7) made of it; `status` gates publication and nothing is
-- public until it reads 'approved'.

CREATE TABLE submissions (
  id           TEXT PRIMARY KEY,
  -- Exactly what was typed in, kept verbatim for the audit trail even when
  -- resolution rewrites it to a different origin.
  submitted_url TEXT NOT NULL,
  -- Resolution output. NULL until resolved; kind is 'blyg' | 'rss' | 'failure'.
  kind         TEXT,
  origin       TEXT,
  title        TEXT,
  -- The page a human should land on. This is what the directory links: the
  -- directory lists blygs, not feeds.
  home_url     TEXT,
  -- Resolver diagnostics on failure (the URLs it tried), kept because a failure
  -- against a stranger's real site is the most interesting data here.
  resolve_note TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  submitted_at TEXT NOT NULL,
  reviewed_at  TEXT,
  -- Free-text, admin only, never shown publicly.
  admin_note   TEXT
);

-- The public page's only query.
CREATE INDEX idx_submissions_public ON submissions (status, submitted_at DESC);
-- Cheap dedupe check on submit.
CREATE UNIQUE INDEX idx_submissions_origin ON submissions (origin) WHERE origin IS NOT NULL;
