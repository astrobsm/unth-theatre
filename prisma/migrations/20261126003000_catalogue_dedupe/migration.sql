-- The same item, entered more than once.
--
-- Matching the catalogue to the NHIA price list did not only say what the
-- scheme covers; it showed how often one thing is in the catalogue under
-- several names. Three rows reading "10% Dextrose/ water (1l)", "10% Dextrous
-- water (1000mls)" and "Dextrose 10% (1 L)" are one fluid, and a surgeon
-- choosing between them at booking is choosing between spellings.
--
-- NOTHING IS DELETED. A template id is written onto every pack line raised
-- from it, so deleting one would orphan rows on cases already booked.
-- Retiring sets isActive = false and records which row superseded it, which
-- keeps the history readable and the decision reversible.
--
-- No row is retired by this migration. The administrator decides, on
-- /dashboard/admin/catalogue-duplicates.

ALTER TABLE "surgical_consumable_templates"
  ADD COLUMN IF NOT EXISTS "supersededById"    TEXT,
  ADD COLUMN IF NOT EXISTS "dedupeConfirmedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dedupeConfirmedBy" TEXT;

ALTER TABLE "surgical_drug_dressing_templates"
  ADD COLUMN IF NOT EXISTS "supersededById"    TEXT,
  ADD COLUMN IF NOT EXISTS "dedupeConfirmedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dedupeConfirmedBy" TEXT;
