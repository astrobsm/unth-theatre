-- ============================================================
-- Pack lines stored as "Unknown" when the template was right there
-- ------------------------------------------------------------
-- The booking form sends a display label beside each templateId, resolved
-- against whichever slice of the template catalogue that screen had loaded. If
-- the slice does not contain the template — a subspecialty filter changed after
-- the item was picked, a search narrowed the list — it falls back to "Unknown",
-- and takes category OTHER and the default size and unit with it.
--
-- Twenty lines across two cases were stored that way. Every one carries a
-- templateId that resolves perfectly well: a urine bag, an IV cannula, a Foley
-- catheter, a giving set. The pack provider was asked to find "Unknown x2".
--
-- The label was never the fact. The templateId is, so the rows are repaired
-- from the catalogue they already point at. Nothing is guessed: a row is
-- touched only where its own templateId resolves to a live template.
--
-- The route that created them now resolves the name server-side, so this is a
-- repair of the past rather than a workaround for something still happening.
--
-- Lines already PACKED are repaired too. Somebody had to work out what
-- "Unknown" meant in order to pack it, and leaving the record wrong so it
-- matches what they were shown preserves the confusion rather than the history.
-- What was requested is what the templateId says.
-- ============================================================

UPDATE "surgery_consumable_requests" r
   SET "name"     = t."name",
       "category" = t."category",
       "size"     = t."size",
       "unit"     = t."unit"
  FROM "surgical_consumable_templates" t
 WHERE t."id" = r."templateId"
   AND LOWER(BTRIM(r."name")) = 'unknown';

UPDATE "surgery_drug_dressing_requests" r
   SET "name" = t."name",
       "type" = t."type",
       "unit" = t."unit"
  FROM "surgical_drug_dressing_templates" t
 WHERE t."id" = r."templateId"
   AND LOWER(BTRIM(r."name")) = 'unknown';
