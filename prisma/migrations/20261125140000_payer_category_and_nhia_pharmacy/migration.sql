-- Who pays for a case, and which counter picks each line of its pack.
--
-- NOTHING EXISTING CHANGES BEHAVIOUR. Every surgery already on the books gets
-- payerCategory = UNSPECIFIED, every consumable line keeps going to the pack
-- providers and every pharmacy line keeps going to the Theatre Pharmacy --
-- which is exactly where they go today. The backfill below is written to
-- reproduce the current routing, not to guess at a better one.
--
-- COVERAGE DEFAULTS TO FALSE on every catalogue row. Nobody has told this
-- application what the NHIA actually covers. A default of true would send
-- items to a counter that will refuse them; false sends them where they
-- already go, and the NHIA pharmacist ticks items as coverage is confirmed.

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PayerCategory') THEN
    CREATE TYPE "PayerCategory" AS ENUM (
      'NHIA',
      'NHIS',
      'CEmONC',
      'PRIVATE',
      'UNSPECIFIED'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FulfilmentUnit') THEN
    CREATE TYPE "FulfilmentUnit" AS ENUM (
      'NHIA_PHARMACY',
      'THEATRE_PHARMACY',
      'CONSUMABLE_PACK'
    );
  END IF;
END
$$;

-- The NHIA desk is a role of its own, not a permission on the pharmacist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'NHIA_PHARMACY'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'NHIA_PHARMACY';
  END IF;
END
$$;

-- ── Who pays ────────────────────────────────────────────────────────────────
ALTER TABLE "surgeries"
  ADD COLUMN IF NOT EXISTS "payerCategory"    "PayerCategory" NOT NULL DEFAULT 'UNSPECIFIED',
  ADD COLUMN IF NOT EXISTS "payerSchemeId"    TEXT,
  ADD COLUMN IF NOT EXISTS "payerIsNyscCorps" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "payerSetAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "payerSetById"     TEXT,
  ADD COLUMN IF NOT EXISTS "payerSetByName"   TEXT;

CREATE INDEX IF NOT EXISTS "surgeries_payerCategory_idx"
  ON "surgeries" ("payerCategory");

-- ── What the scheme covers ──────────────────────────────────────────────────
ALTER TABLE "surgical_consumable_templates"
  ADD COLUMN IF NOT EXISTS "coveredByNHIA"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "coveredByCEmONC" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "surgical_drug_dressing_templates"
  ADD COLUMN IF NOT EXISTS "coveredByNHIA"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "coveredByCEmONC" BOOLEAN NOT NULL DEFAULT false;

-- ── Which counter picks each line ───────────────────────────────────────────
ALTER TABLE "surgery_consumable_requests"
  ADD COLUMN IF NOT EXISTS "routedTo"         "FulfilmentUnit" NOT NULL DEFAULT 'CONSUMABLE_PACK',
  ADD COLUMN IF NOT EXISTS "routedAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "coverageNote"     TEXT,
  ADD COLUMN IF NOT EXISTS "reassignedFrom"   "FulfilmentUnit",
  ADD COLUMN IF NOT EXISTS "reassignReason"   TEXT,
  ADD COLUMN IF NOT EXISTS "reassignedById"   TEXT,
  ADD COLUMN IF NOT EXISTS "reassignedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "reassignedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "splitFromId"      TEXT;

ALTER TABLE "surgery_drug_dressing_requests"
  ADD COLUMN IF NOT EXISTS "routedTo"         "FulfilmentUnit" NOT NULL DEFAULT 'CONSUMABLE_PACK',
  ADD COLUMN IF NOT EXISTS "routedAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "coverageNote"     TEXT,
  ADD COLUMN IF NOT EXISTS "reassignedFrom"   "FulfilmentUnit",
  ADD COLUMN IF NOT EXISTS "reassignReason"   TEXT,
  ADD COLUMN IF NOT EXISTS "reassignedById"   TEXT,
  ADD COLUMN IF NOT EXISTS "reassignedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "reassignedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "splitFromId"      TEXT;

-- The backfill. A pharmacy line has always gone to the pharmacy; the column
-- default above is right for consumables and wrong for drugs, so only the
-- drugs are moved. UPDATE rather than a different DEFAULT because the default
-- also has to be right for rows inserted by a node that has not yet deployed
-- the application code.
UPDATE "surgery_drug_dressing_requests"
   SET "routedTo" = 'THEATRE_PHARMACY'
 WHERE "routedTo" = 'CONSUMABLE_PACK';

CREATE INDEX IF NOT EXISTS "surgery_consumable_requests_routedTo_idx"
  ON "surgery_consumable_requests" ("routedTo");
CREATE INDEX IF NOT EXISTS "surgery_drug_dressing_requests_routedTo_idx"
  ON "surgery_drug_dressing_requests" ("routedTo");
