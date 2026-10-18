-- A blyg's feed URL, from its manifest (session 49). Through 0.3 the feed path
-- was fixed at `{origin}feed.xml`, so the OPML and Atom exports derived it. From
-- protocol 0.4 the manifest's `feed` key is authoritative (§6.1), and a blyg on
-- a CMS serves its feed elsewhere (Soapbox for Blygger: under /wp-json/), where
-- the derived URL is a 404. Captured at submission and refreshed by every
-- successful re-check; NULL for feeds and for rows not yet re-checked, which
-- keep the old derivation.
ALTER TABLE submissions ADD COLUMN feed_url TEXT;
