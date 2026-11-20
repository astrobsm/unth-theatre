-- =============================================================================
-- A plan whose date has gone past
-- -----------------------------------------------------------------------------
-- A planned case sat on the list with a date in the past and nothing happened.
-- It was not operated, not withdrawn, not moved -- it simply aged, and went on
-- being counted as "planned" by the unit card, by the pharmacy reading ahead,
-- and by anybody asking what is coming.
--
-- That is the worst state for a list to be in, because it is indistinguishable
-- on screen from a plan that is still true. The unit that wrote it knows it
-- slipped; nobody else does.
--
-- So an overdue plan now asks: move it, or take it off the list -- and either
-- way, say why. These columns hold the answer.
--
-- WHY A COUNT AND AN ORIGINAL DATE. A case moved once is an ordinary
-- reschedule. A case moved four times is a different thing entirely, and the
-- only place that showed was in somebody's memory. rescheduleCount and
-- originalTargetDate make slippage visible without reading a history: "moved 4
-- times, first promised 10 November" is a sentence the card can print.
--
-- The REASON is kept here as the latest one, for the card, and written to the
-- audit log on every change for the full trail -- the same arrangement
-- surgeries uses for completion. One row to render, one log to investigate.
--
-- All nullable, all defaulted. Every plan that exists today was written before
-- this was asked for, and a plan with no recorded reason must stay a plan.
--
-- Reversible:
--   ALTER TABLE "surgery_schedule_drafts"
--     DROP COLUMN "originalTargetDate", DROP COLUMN "rescheduleCount",
--     DROP COLUMN "lastChangeKind",     DROP COLUMN "lastChangeReason",
--     DROP COLUMN "lastChangeAt",       DROP COLUMN "lastChangeByName";
-- =============================================================================

ALTER TABLE "surgery_schedule_drafts"
  -- The first date this case was ever promised. Set the first time the date
  -- moves, never overwritten after, so the slippage is measured from where it
  -- started rather than from the last excuse.
  ADD COLUMN IF NOT EXISTS "originalTargetDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rescheduleCount"    INTEGER NOT NULL DEFAULT 0,
  -- 'RESCHEDULED' | 'WITHDRAWN'. Text rather than an enum: this is a label on
  -- a planning row, not a clinical state, and the set will grow the first time
  -- somebody wants a third option.
  ADD COLUMN IF NOT EXISTS "lastChangeKind"     TEXT,
  ADD COLUMN IF NOT EXISTS "lastChangeReason"   TEXT,
  ADD COLUMN IF NOT EXISTS "lastChangeAt"       TIMESTAMP(3),
  -- Denormalised, like every other ...ByName in this schema: a reason that
  -- cannot be read without a working join to users on the other node is not
  -- much of a record.
  ADD COLUMN IF NOT EXISTS "lastChangeByName"   TEXT;

-- "What has slipped?", asked across units. Partial, because the question is
-- only ever asked of plans that are still plans.
CREATE INDEX IF NOT EXISTS "surgery_schedule_drafts_overdue_idx"
  ON "surgery_schedule_drafts" ("targetDate")
  WHERE "status" = 'DRAFT';
