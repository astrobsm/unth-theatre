-- The procedure catalogue a surgeon picks from when booking.
--
-- (subspecialty, slug) is UNIQUE. That is what stops the catalogue filling up
-- with "Appendicectomy", "appendicectomy" and "APPENDICECTOMY" once surgeons
-- start adding their own entries through the "Other" option.
--
-- Additive only. Nothing existing is altered; Surgery.procedureName stays a
-- free-text column so every case already booked is untouched.

CREATE TYPE "ProcedureSource" AS ENUM ('CATALOGUE', 'USER_ADDED');

CREATE TABLE "surgical_procedures" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subspecialty" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT,
    "source" "ProcedureSource" NOT NULL DEFAULT 'CATALOGUE',
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "surgical_procedures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "surgical_procedures_subspecialty_slug_key" ON "surgical_procedures"("subspecialty", "slug");

CREATE INDEX "surgical_procedures_subspecialty_isActive_idx" ON "surgical_procedures"("subspecialty", "isActive");

CREATE INDEX "surgical_procedures_usageCount_idx" ON "surgical_procedures"("usageCount");
