-- =============================================================================
-- How much blood, not merely whether
-- -----------------------------------------------------------------------------
-- "Blood transfusion" has been a tick box since the first booking form. A tick
-- is enough to put a line on the theatre list and enough to raise a cross-match
-- request, and it is NOT enough to decide what goes in the pack: one unit needs
-- a giving set, and two or more need the cover for what two or more units do to
-- a patient -- calcium gluconate for citrate toxicity, tranexamic acid for the
-- bleeding that was the reason for asking.
--
-- Nullable, and null is not zero. A case booked before today was booked on a
-- form that never asked, and reading its silence as "nought units" would be
-- inventing an answer nobody gave. Null means not asked; the pack rules treat
-- it as "transfusion requested, amount unstated" and add the single-unit cover
-- only.
--
-- Both tables, because a planned case publishes into a booked one and an answer
-- that does not survive the publish is an answer the unit has to give twice.
--
-- Reversible:
--   ALTER TABLE "surgeries" DROP COLUMN "bloodUnits";
--   ALTER TABLE "surgery_schedule_drafts" DROP COLUMN "bloodUnits";
-- =============================================================================

ALTER TABLE "surgeries"
  ADD COLUMN IF NOT EXISTS "bloodUnits" INTEGER;

ALTER TABLE "surgery_schedule_drafts"
  ADD COLUMN IF NOT EXISTS "bloodUnits" INTEGER;
