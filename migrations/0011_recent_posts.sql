-- Activity level (session 61): the listing's recent post times, newest first, as
-- a JSON array of ISO strings (at most 50). Read by the scheduled re-check from
-- what it fetches anyway: a blyg's archive index (`created`, §6.2) or a plain
-- feed's item dates. Public: the page derives the activity mark and the default
-- order from it (src/activity.ts). NULL until the next re-check, or when no
-- dates could be read.
ALTER TABLE submissions ADD COLUMN recent_posts TEXT;
