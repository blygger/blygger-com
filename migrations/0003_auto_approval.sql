-- Automatic approval (session 29). Submissions that resolve cleanly and trip
-- none of src/review.ts's checks are listed immediately; review is reserved for
-- the ones that could deceive or misdirect a reader.
--
-- `review_reason` records WHY a row is waiting, so the admin page can show it
-- and so a later change to the rules leaves an audit trail of what the rules
-- said at the time. NULL on a row that was never flagged — including every row
-- that predates this migration, which is correct: they were queued by the old
-- blanket rule, not by a finding about them.
ALTER TABLE submissions ADD COLUMN review_reason TEXT;

-- Nothing is backfilled and no existing status changes. Rows already approved
-- stay approved; rows still pending stay pending and keep waiting for a human,
-- which is what they were already doing.
