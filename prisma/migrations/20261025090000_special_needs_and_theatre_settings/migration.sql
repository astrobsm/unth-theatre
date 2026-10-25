-- Guarded throughout. A migration that fails half-way leaves the chain at
-- P3009, which blocks EVERY later deploy until somebody clears it by hand —
-- the build runs `migrate deploy` before `next build`, so nothing ships at
-- all. That has happened on this project once.
--
-- CREATE TYPE has no IF NOT EXISTS, hence the DO block.
DO $$
BEGIN
  CREATE TYPE "SpecialNeedCategory" AS ENUM ('SUTURE', 'URETHRAL_CATHETER', 'DRAIN', 'HAEMOSTATIC_AGENT', 'TRACHEOSTOMY_TUBE', 'MESH', 'CHEST_TUBE', 'CHEST_DRAIN_BOTTLE', 'ANTIBIOTIC', 'SYRINGE', 'IV_CANNULA', 'GIVING_SET', 'PLASTER', 'GLOVES', 'WATER_FOR_INJECTION', 'BANDAGE', 'CASTING', 'LOCAL_ANAESTHETIC', 'TRANSFUSION_ADJUNCT', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "special_need_items" (
    "id" TEXT NOT NULL,
    "category" "SpecialNeedCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "size" TEXT,
    "material" TEXT,
    "needleType" TEXT,
    "needleSize" TEXT,
    "absorbable" BOOLEAN,
    "brand" TEXT,
    "specification" TEXT,
    "isLocallyAdded" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dispensedByPharmacy" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "special_need_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "surgery_special_needs" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "note" TEXT,
    "fromBundle" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" TEXT,
    "requestedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surgery_special_needs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "theatre_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "depositNoticeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "depositNoticeText" TEXT NOT NULL DEFAULT 'PATIENT NOW PAYS DRUG AND CONSUMABLE DEPOSIT. THESE CONSUMABLES AND DRUGS WILL BE PROVIDED BY THE HOSPITAL — DO NOT GIVE PATIENT ANY PAPER PRESCRIPTIONS.',
    "minorConsumableFee" DECIMAL(12,2),
    "intermediateConsumableFee" DECIMAL(12,2),
    "majorConsumableFee" DECIMAL(12,2),
    "minorPharmacyFee" DECIMAL(12,2),
    "intermediatePharmacyFee" DECIMAL(12,2),
    "majorPharmacyFee" DECIMAL(12,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "updatedByName" TEXT,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "theatre_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "special_need_items_category_isActive_idx" ON "special_need_items"("category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "special_need_items_category_name_size_brand_key" ON "special_need_items"("category", "name", "size", "brand");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "surgery_special_needs_surgeryId_idx" ON "surgery_special_needs"("surgeryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "surgery_special_needs_itemId_idx" ON "surgery_special_needs"("itemId");

-- AddForeignKey
-- ADD CONSTRAINT has no IF NOT EXISTS in Postgres, so a retry would fail
-- with "constraint already exists" and wedge the chain at P3009.
DO $$
BEGIN
  ALTER TABLE "surgery_special_needs" ADD CONSTRAINT "surgery_special_needs_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
-- ADD CONSTRAINT has no IF NOT EXISTS in Postgres, so a retry would fail
-- with "constraint already exists" and wedge the chain at P3009.
DO $$
BEGIN
  ALTER TABLE "surgery_special_needs" ADD CONSTRAINT "surgery_special_needs_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "special_need_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- The singleton row, so the booking form never has to cope with its absence.
INSERT INTO "theatre_settings" ("id", "updatedAt") VALUES ('singleton', now())
ON CONFLICT ("id") DO NOTHING;

-- Replicate all three between the cloud and the theatre server.
--
-- The catalogue and the settings are read by every booking, and a case's
-- special needs are read by the store and by pharmacy — who work on the
-- theatre server while the surgeon may have booked from outside. A table
-- that does not cross is a feature that silently does not work on one side,
-- which is what happened to the radio volume.
SELECT sync_enable_table('special_need_items');
SELECT sync_enable_table('surgery_special_needs');
SELECT sync_enable_table('theatre_settings');

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "DepositStatus" AS ENUM ('UNPAID', 'PAID', 'WAIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "case_deposit_status" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "magnitude" TEXT,
    "consumableAmount" DECIMAL(12,2),
    "consumableStatus" "DepositStatus" NOT NULL DEFAULT 'UNPAID',
    "consumablePaidAt" TIMESTAMP(3),
    "consumablePaidByName" TEXT,
    "consumablePackedAt" TIMESTAMP(3),
    "consumablePackedByName" TEXT,
    "pharmacyAmount" DECIMAL(12,2),
    "pharmacyStatus" "DepositStatus" NOT NULL DEFAULT 'UNPAID',
    "pharmacyPaidAt" TIMESTAMP(3),
    "pharmacyPaidByName" TEXT,
    "pharmacyPackedAt" TIMESTAMP(3),
    "pharmacyPackedByName" TEXT,
    "waiverReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_deposit_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "case_deposit_status_surgeryId_key" ON "case_deposit_status"("surgeryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "case_deposit_status_consumableStatus_idx" ON "case_deposit_status"("consumableStatus");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "case_deposit_status_pharmacyStatus_idx" ON "case_deposit_status"("pharmacyStatus");

-- AddForeignKey
-- ADD CONSTRAINT has no IF NOT EXISTS in Postgres, so a retry would fail
-- with "constraint already exists" and wedge the chain at P3009.
DO $$
BEGIN
  ALTER TABLE "case_deposit_status" ADD CONSTRAINT "case_deposit_status_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Replicated: pharmacy and the store work on the theatre server while the
-- surgeon may be looking from outside, and "has my patient paid" has to be
-- the same answer on both.
SELECT sync_enable_table('case_deposit_status');

-- AlterTable
ALTER TABLE "surgery_special_needs" ADD COLUMN IF NOT EXISTS     "outOfStock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS     "outOfStockAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "outOfStockByName" TEXT;
