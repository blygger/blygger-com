-- Public health marks (session 38, second half). The re-check now publishes
-- what it finds, and withdraws a listing from the machine surfaces (blygs.opml,
-- listings.xml) when a defect persists. Tiers and thresholds: review.ts and
-- health.ts.
--
-- flags: JSON array of FindingCode from the last successful re-check. NULL
-- until the first one — nothing is marked publicly on submission-time findings.
ALTER TABLE submissions ADD COLUMN flags TEXT;
-- Start of the current unbroken run of re-checks finding a defect; cleared by a
-- clean one.
ALTER TABLE submissions ADD COLUMN defect_since TEXT;
