-- Changing HOW MANY of an item a case is packed with, after booking.
--
-- A pack is composed from a standard and the standard is an average. Until now
-- the only way to say "eight pairs, not one" was to withdraw the line and add
-- it again, which reads to the pack provider as two separate decisions about
-- two different items rather than one correction to the same one.
--
-- The first value is kept so a provider who picked against the original can
-- see what moved under them. Only the first: a second correction leaves
-- originalQuantity alone.

ALTER TABLE "surgery_consumable_requests"
  ADD COLUMN IF NOT EXISTS "originalQuantity"     INTEGER,
  ADD COLUMN IF NOT EXISTS "originalUnit"         TEXT,
  ADD COLUMN IF NOT EXISTS "quantityChangedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "quantityChangedById"  TEXT,
  ADD COLUMN IF NOT EXISTS "quantityChangeReason" TEXT;

ALTER TABLE "surgery_drug_dressing_requests"
  ADD COLUMN IF NOT EXISTS "originalQuantity"     INTEGER,
  ADD COLUMN IF NOT EXISTS "originalUnit"         TEXT,
  ADD COLUMN IF NOT EXISTS "quantityChangedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "quantityChangedById"  TEXT,
  ADD COLUMN IF NOT EXISTS "quantityChangeReason" TEXT;
