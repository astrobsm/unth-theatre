-- ============================================================
-- A second cursor, so a theatre list does not queue behind three weeks of chatter
-- ------------------------------------------------------------
-- On 13 October the theatre server returned after three weeks on a stale build
-- with 4,787 entries to pull. Ten of them were that morning's cases. A surgeon
-- watched "No cases booked for this date" while the queue delivered, ahead of
-- them, 2,319 consumable requests, 547 radio messages, 431 audit logs and 363
-- drafts.
--
-- Nothing was broken. The journal is ordered strictly by hybrid logical clock,
-- so the newest entries — today's bookings — sat at the very back, behind
-- every older row. The design knows about time and nothing else.
--
-- THE FIX IS A SECOND WATERMARK over the same log. The priority lane carries
-- the handful of tables a theatre needs to run the list in front of it, and is
-- drained first each cycle. Bulk follows with its own cursor, exactly as
-- before.
--
-- Two independent cursors over one append-only journal: nothing is dropped,
-- nothing is reordered within a lane, and nothing is delivered twice. It is
-- the mechanism that already works, applied twice.
--
-- STARTS WHERE THE EXISTING CURSOR IS, not at the beginning. A fresh cursor
-- at '' would re-pull every priority row ever written — tens of thousands of
-- entries that are already applied. They would all be recognised as duplicates
-- by sync_applied and discarded, so nothing would corrupt, but the node would
-- spend hours doing it and the first thing the priority lane ever did would be
-- to block the thing it exists to accelerate.
-- ============================================================

ALTER TABLE sync_state
  ADD COLUMN IF NOT EXISTS priority_cursor text;

COMMENT ON COLUMN sync_state.priority_cursor IS
  'Watermark for the priority lane — the few tables a theatre needs to run the current list. Drained before the bulk cursor each cycle. See src/lib/sync/lanes.ts.';

-- Catch the new cursor up to the old one, so the lane begins from the present
-- rather than replaying history it has already applied.
UPDATE sync_state
   SET priority_cursor = pull_cursor
 WHERE priority_cursor IS NULL;
