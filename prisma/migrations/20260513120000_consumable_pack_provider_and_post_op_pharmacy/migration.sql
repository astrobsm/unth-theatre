-- ============================================================================
-- Migration: Consumable Pack Provider role + booking-time consumable/drug
--            templates and per-surgery requests + post-op pharmacy hand-off
--            + informed-consent file upload on Surgery
-- Author    : Theatre Manager team
-- Date      : 2026-05-13
-- ============================================================================

-- 1) Extend UserRole enum --------------------------------------------------
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CONSUMABLE_PACK_PROVIDER';

-- 2) New enums -------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "SurgicalConsumableCategory" AS ENUM (
    'GLOVES','GOWNS_DRAPES','SUTURES','SYRINGES_NEEDLES','CATHETERS_TUBING',
    'DRESSING_PACKS','SKIN_PREP','CLEANING_SOLUTION','STERILE_DRESSINGS',
    'IRRIGATION','DIATHERMY','SUCTION','ANAESTHESIA_AIRWAY','PPE','OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SurgicalDrugDressingType" AS ENUM (
    'ANTIBIOTIC','ANALGESIC','ANAESTHETIC_ADJUNCT','IV_FLUID',
    'WOUND_DRESSING_AGENT','ANTISEPTIC','HAEMOSTATIC','OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SurgeryPackStatus" AS ENUM (
    'REQUESTED','PACKING','PACKED','DELIVERED','CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PostOpPrescriptionStatus" AS ENUM (
    'DRAFT','SENT_TO_PHARMACY','PACKING','PACKED','AWAITING_PAYMENT',
    'PAID','COLLECTED','CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Catalog tables --------------------------------------------------------
CREATE TABLE IF NOT EXISTS "surgical_consumable_templates" (
  "id"              TEXT PRIMARY KEY,
  "name"            TEXT NOT NULL,
  "category"        "SurgicalConsumableCategory" NOT NULL DEFAULT 'OTHER',
  "size"            TEXT,
  "unit"            TEXT NOT NULL DEFAULT 'piece',
  "specialty"       TEXT,
  "defaultQuantity" INTEGER NOT NULL DEFAULT 1,
  "isActive"        BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder"       INTEGER NOT NULL DEFAULT 0,
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "surgical_consumable_templates_category_idx"  ON "surgical_consumable_templates"("category");
CREATE INDEX IF NOT EXISTS "surgical_consumable_templates_specialty_idx" ON "surgical_consumable_templates"("specialty");

CREATE TABLE IF NOT EXISTS "surgical_drug_dressing_templates" (
  "id"              TEXT PRIMARY KEY,
  "name"            TEXT NOT NULL,
  "type"            "SurgicalDrugDressingType" NOT NULL DEFAULT 'OTHER',
  "defaultDosage"   TEXT,
  "defaultRoute"    TEXT,
  "defaultQuantity" INTEGER NOT NULL DEFAULT 1,
  "unit"            TEXT NOT NULL DEFAULT 'vial',
  "specialty"       TEXT,
  "isControlled"    BOOLEAN NOT NULL DEFAULT FALSE,
  "isActive"        BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder"       INTEGER NOT NULL DEFAULT 0,
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "surgical_drug_dressing_templates_type_idx"      ON "surgical_drug_dressing_templates"("type");
CREATE INDEX IF NOT EXISTS "surgical_drug_dressing_templates_specialty_idx" ON "surgical_drug_dressing_templates"("specialty");

-- 4) Per-surgery request tables -------------------------------------------
CREATE TABLE IF NOT EXISTS "surgery_consumable_requests" (
  "id"           TEXT PRIMARY KEY,
  "surgeryId"    TEXT NOT NULL,
  "templateId"   TEXT,
  "name"         TEXT NOT NULL,
  "category"     "SurgicalConsumableCategory" NOT NULL DEFAULT 'OTHER',
  "size"         TEXT,
  "unit"         TEXT NOT NULL DEFAULT 'piece',
  "quantity"     INTEGER NOT NULL DEFAULT 1,
  "notes"        TEXT,
  "status"       "SurgeryPackStatus" NOT NULL DEFAULT 'REQUESTED',
  "packedById"   TEXT,
  "packedByName" TEXT,
  "packedAt"     TIMESTAMP(3),
  "packNotes"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "surgery_consumable_requests_surgery_fkey"
    FOREIGN KEY ("surgeryId")  REFERENCES "surgeries"("id")                         ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "surgery_consumable_requests_template_fkey"
    FOREIGN KEY ("templateId") REFERENCES "surgical_consumable_templates"("id")     ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "surgery_consumable_requests_packedby_fkey"
    FOREIGN KEY ("packedById") REFERENCES "users"("id")                             ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "surgery_consumable_requests_surgeryId_idx" ON "surgery_consumable_requests"("surgeryId");
CREATE INDEX IF NOT EXISTS "surgery_consumable_requests_status_idx"    ON "surgery_consumable_requests"("status");

CREATE TABLE IF NOT EXISTS "surgery_drug_dressing_requests" (
  "id"           TEXT PRIMARY KEY,
  "surgeryId"    TEXT NOT NULL,
  "templateId"   TEXT,
  "name"         TEXT NOT NULL,
  "type"         "SurgicalDrugDressingType" NOT NULL DEFAULT 'OTHER',
  "dosage"       TEXT,
  "route"        TEXT,
  "quantity"     INTEGER NOT NULL DEFAULT 1,
  "unit"         TEXT NOT NULL DEFAULT 'vial',
  "notes"        TEXT,
  "status"       "SurgeryPackStatus" NOT NULL DEFAULT 'REQUESTED',
  "packedById"   TEXT,
  "packedByName" TEXT,
  "packedAt"     TIMESTAMP(3),
  "packNotes"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "surgery_drug_dressing_requests_surgery_fkey"
    FOREIGN KEY ("surgeryId")  REFERENCES "surgeries"("id")                                  ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "surgery_drug_dressing_requests_template_fkey"
    FOREIGN KEY ("templateId") REFERENCES "surgical_drug_dressing_templates"("id")           ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "surgery_drug_dressing_requests_packedby_fkey"
    FOREIGN KEY ("packedById") REFERENCES "users"("id")                                      ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "surgery_drug_dressing_requests_surgeryId_idx" ON "surgery_drug_dressing_requests"("surgeryId");
CREATE INDEX IF NOT EXISTS "surgery_drug_dressing_requests_status_idx"    ON "surgery_drug_dressing_requests"("status");

-- 5) Post-op prescriptions -------------------------------------------------
CREATE TABLE IF NOT EXISTS "postop_prescriptions" (
  "id"                    TEXT PRIMARY KEY,
  "surgeryId"             TEXT NOT NULL,
  "patientId"             TEXT NOT NULL,
  "patientName"           TEXT NOT NULL,
  "folderNumber"          TEXT,
  "prescribedById"        TEXT NOT NULL,
  "prescribedByName"      TEXT NOT NULL,
  "prescribedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "medications"           TEXT NOT NULL,
  "notes"                 TEXT,
  "status"                "PostOpPrescriptionStatus" NOT NULL DEFAULT 'DRAFT',
  "receivedAt"            TIMESTAMP(3),
  "packedById"            TEXT,
  "packedByName"          TEXT,
  "packedAt"              TIMESTAMP(3),
  "packNotes"             TEXT,
  "totalCost"             DECIMAL(10,2),
  "billAnnouncedAt"       TIMESTAMP(3),
  "billPaidAt"            TIMESTAMP(3),
  "billPaidConfirmedById" TEXT,
  "pickupAnnouncedAt"     TIMESTAMP(3),
  "collectedAt"           TIMESTAMP(3),
  "collectedByName"       TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "postop_prescriptions_surgery_fkey"
    FOREIGN KEY ("surgeryId")      REFERENCES "surgeries"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "postop_prescriptions_patient_fkey"
    FOREIGN KEY ("patientId")      REFERENCES "patients"("id")  ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "postop_prescriptions_prescribedby_fkey"
    FOREIGN KEY ("prescribedById") REFERENCES "users"("id")     ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "postop_prescriptions_packedby_fkey"
    FOREIGN KEY ("packedById")     REFERENCES "users"("id")     ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "postop_prescriptions_surgeryId_idx" ON "postop_prescriptions"("surgeryId");
CREATE INDEX IF NOT EXISTS "postop_prescriptions_status_idx"    ON "postop_prescriptions"("status");

-- 6) Surgery: informed-consent upload columns -----------------------------
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "consentFileName"     TEXT;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "consentFileMimeType" TEXT;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "consentFileData"     TEXT;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "consentUploadedAt"   TIMESTAMP(3);
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "consentUploadedById" TEXT;
