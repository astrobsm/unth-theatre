-- Reusable surgical packs (consumable / pharmacy) applied at booking.
-- Additive only — new tables and enum, no changes to existing data.

CREATE TYPE "SurgicalPackKind" AS ENUM ('CONSUMABLE', 'PHARMACY');

CREATE TABLE "surgical_packs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subspecialty" TEXT NOT NULL,
    "kind" "SurgicalPackKind" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "surgical_packs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "surgical_pack_items" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "category" TEXT,
    "size" TEXT,
    "drugType" TEXT,
    "dosage" TEXT,
    "route" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "surgical_pack_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "surgical_packs_subspecialty_kind_isActive_idx" ON "surgical_packs"("subspecialty", "kind", "isActive");
CREATE INDEX "surgical_pack_items_packId_idx" ON "surgical_pack_items"("packId");

ALTER TABLE "surgical_pack_items" ADD CONSTRAINT "surgical_pack_items_packId_fkey" FOREIGN KEY ("packId") REFERENCES "surgical_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
