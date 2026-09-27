-- ============================================================
-- Which supplier does this provider account belong to?
-- ------------------------------------------------------------
-- ORM has CONSUMABLE_PACK_PROVIDER accounts and it has Vendor records, and
-- nothing joins them. Until now that did not matter, because a provider only
-- ever saw pack templates — general information with no commercial content.
--
-- It matters the moment a provider can see what was consumed for a patient.
-- Those lines carry the item, the quantity and the price agreed with the
-- supplier who supplied it. Shown unscoped, every provider would see every
-- other provider's supply and pricing, which is commercially sensitive
-- information the hospital has no right to disclose and no reason to.
--
-- So the link exists before the view does, and the view is scoped by it.
--
-- NULLABLE, DELIBERATELY. Most staff are not suppliers and never will be, and
-- a NOT NULL column would need a fictional vendor for all of them. Null means
-- "not a supplier account", and the consumption view refuses rather than
-- guesses: an account claiming to be a provider with no vendor attached sees
-- nothing at all, which is the safe direction to fail.
--
-- @db.Uuid because Vendor.id is a uuid, unlike the TEXT ids used for User and
-- most of this schema. Getting that wrong produces a foreign key that cannot
-- be created, which is how it was noticed.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "vendorId" uuid;

COMMENT ON COLUMN users."vendorId" IS
  'The supplier this account belongs to, for CONSUMABLE_PACK_PROVIDER and similar roles. Null for ordinary staff. Scopes what supply and pricing the account may see.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_vendorId_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT "users_vendorId_fkey"
      FOREIGN KEY ("vendorId") REFERENCES imprest_vendors(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- The consumption view filters by it on every request a provider makes.
CREATE INDEX IF NOT EXISTS users_vendor_idx ON users ("vendorId") WHERE "vendorId" IS NOT NULL;
