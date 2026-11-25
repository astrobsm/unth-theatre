-- The NHIA Medicines Price List, April 2025, against the catalogue.
--
-- Until now every catalogue item was flagged not-covered, because nobody had
-- told this application what the scheme actually pays for and a wrong `true`
-- sends an item to a counter that will refuse it with the patient already on
-- the list. The Authority's published list is that document.
--
-- These columns record WHICH ROW of it an item was matched to, so a coverage
-- flag can be traced to a source rather than to somebody's memory of a
-- circular, and so the next revision of the list can be applied by matching
-- codes rather than by starting again.
--
-- THE FLAGS THEMSELVES ARE NOT SET HERE. scripts/maintenance/apply-nhia-coverage.js
-- does that, reports what it matched and what it could not, and changes
-- nothing without --apply. A migration that silently marked several hundred
-- items covered would be the same wrong `true` at a larger scale.

ALTER TABLE "surgical_consumable_templates"
  ADD COLUMN IF NOT EXISTS "nhiaCode"    TEXT,
  ADD COLUMN IF NOT EXISTS "nhiaPrice"   DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "nhiaPartial" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "surgical_drug_dressing_templates"
  ADD COLUMN IF NOT EXISTS "nhiaCode"    TEXT,
  ADD COLUMN IF NOT EXISTS "nhiaPrice"   DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "nhiaPartial" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "surgical_consumable_templates_nhiaCode_idx"
  ON "surgical_consumable_templates" ("nhiaCode");
CREATE INDEX IF NOT EXISTS "surgical_drug_dressing_templates_nhiaCode_idx"
  ON "surgical_drug_dressing_templates" ("nhiaCode");
