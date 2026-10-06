-- Protocol census per listing (session 38): what each blyg's manifest declares
-- (§6.1) — the `blyg` version key, `level`, and `generator`. Recorded at
-- submission and refreshed by every successful re-check, so a blyg that
-- upgrades shows it. Informative only (§3.2): nothing is gated on these.
-- NULL on legacy feeds, and on blygs until their next check.
ALTER TABLE submissions ADD COLUMN protocol TEXT;
ALTER TABLE submissions ADD COLUMN level INTEGER;
ALTER TABLE submissions ADD COLUMN generator TEXT;
