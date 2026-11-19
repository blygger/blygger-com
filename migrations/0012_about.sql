-- The "about" line under each listing (session 75): who writes it and which
-- client publishes it. Read from what the check fetches anyway, so no new
-- request: a blyg's manifest `author` (§5.5 shape: `name`, `url`, else the
-- first of `links`) and `generator_url` (§6.1); a plain feed's channel author.
-- Public, shown collapsed on the page. Informative only, like `generator`
-- (§3.2). NULL until the next re-check, or when the source names nobody.
ALTER TABLE submissions ADD COLUMN author_name TEXT;
ALTER TABLE submissions ADD COLUMN author_url TEXT;
ALTER TABLE submissions ADD COLUMN generator_url TEXT;
