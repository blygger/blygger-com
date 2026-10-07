-- Duplicate detection by content (session 38). Exact-origin dedupe let the same
-- blyg in twice under two hostnames (a workers.dev address and a custom domain;
-- a host it moved from and the one it moved to). Item ids are minted by the
-- publishing blyg (§5.1), so two origins whose archive indexes (§6.2) share an
-- id are one store. JSON array of the ids, captured at submission and refreshed
-- by every successful re-check; NULL when the index could not be read, or for
-- legacy feeds, which have no ids.
ALTER TABLE submissions ADD COLUMN item_ids TEXT;
