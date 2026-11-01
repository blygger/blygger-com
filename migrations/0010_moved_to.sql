-- Origin succession (decision #88, session 56). When a listed blyg's old origin
-- permanently redirects its manifest to a new origin that is listed too, the old
-- row records where it went and leaves the page and the machine surfaces: one
-- blyg, one listing. Set and cleared only by the hourly re-check; NULL otherwise.
ALTER TABLE submissions ADD COLUMN moved_to TEXT;
