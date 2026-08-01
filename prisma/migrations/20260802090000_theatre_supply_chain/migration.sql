-- Theatre Supply Chain: batch-level stock, append-only movement, reservation.
--
-- Additive only: four new tables and four new enums. Nothing existing is
-- dropped or altered, so the current inventory screens keep working unchanged.
--
-- The generated diff also proposed dropping the updatedAt default on four
-- unrelated theatre tables (daily_first_case_sending, device_tokens,
-- walkie_talkie_logs, wards). That is pre-existing drift with nothing to do
-- with this work, and dropping those defaults would break inserts made outside
-- Prisma. Deliberately left out.

-- CreateEnum
CREATE TYPE "StockOwner" AS ENUM ('HOSPITAL', 'VENDOR', 'CSSD', 'THEATRE');

-- CreateEnum
CREATE TYPE "StockBatchStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'ISSUED', 'RETURNED', 'QUARANTINED', 'EXPIRED', 'DISPOSED', 'LOST');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIVE', 'RESERVE', 'RELEASE_RESERVATION', 'ISSUE', 'RETURN', 'CONSUME', 'TRANSFER', 'ADJUST', 'QUARANTINE', 'EXPIRE', 'DISPOSE', 'OWNERSHIP_TRANSFER');

-- CreateEnum
CREATE TYPE "StockReservationStatus" AS ENUM ('RESERVED', 'PARTIALLY_ISSUED', 'ISSUED', 'CONSUMED', 'RELEASED', 'CANCELLED');

-- CreateTable
CREATE TABLE "stock_locations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isControlled" BOOLEAN NOT NULL DEFAULT false,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "isConsignment" BOOLEAN NOT NULL DEFAULT false,
    "minTempC" DOUBLE PRECISION,
    "maxTempC" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_batches" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT,
    "batchNumber" TEXT NOT NULL,
    "lotNumber" TEXT,
    "expiryDate" DATE,
    "manufactureDate" DATE,
    "manufacturer" TEXT,
    "brand" TEXT,
    "owner" "StockOwner" NOT NULL DEFAULT 'HOSPITAL',
    "vendorId" UUID,
    "purchasePrice" INTEGER NOT NULL DEFAULT 0,
    "sellingPrice" INTEGER NOT NULL DEFAULT 0,
    "hospitalPrice" INTEGER NOT NULL DEFAULT 0,
    "vendorPrice" INTEGER NOT NULL DEFAULT 0,
    "quantityReceived" INTEGER NOT NULL DEFAULT 0,
    "quantityReserved" INTEGER NOT NULL DEFAULT 0,
    "quantityIssued" INTEGER NOT NULL DEFAULT 0,
    "quantityReturned" INTEGER NOT NULL DEFAULT 0,
    "quantityUsed" INTEGER NOT NULL DEFAULT 0,
    "quantityDamaged" INTEGER NOT NULL DEFAULT 0,
    "quantityExpired" INTEGER NOT NULL DEFAULT 0,
    "quantityDisposed" INTEGER NOT NULL DEFAULT 0,
    "minimumLevel" INTEGER,
    "maximumLevel" INTEGER,
    "reorderLevel" INTEGER,
    "shelfLocation" TEXT,
    "storageTemperature" TEXT,
    "barcode" TEXT,
    "qrPayload" TEXT,
    "status" "StockBatchStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "surgeryId" TEXT,
    "reservationId" TEXT,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "ownerBefore" "StockOwner",
    "ownerAfter" "StockOwner",
    "actorId" TEXT,
    "actorName" TEXT,
    "witnessId" TEXT,
    "witnessName" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "scannedCode" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantityReserved" INTEGER NOT NULL,
    "quantityIssued" INTEGER NOT NULL DEFAULT 0,
    "quantityReturned" INTEGER NOT NULL DEFAULT 0,
    "quantityUsed" INTEGER NOT NULL DEFAULT 0,
    "status" "StockReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "sourceKind" TEXT,
    "sourceId" TEXT,
    "unitPriceAtReservation" INTEGER NOT NULL DEFAULT 0,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_code_key" ON "stock_locations"("code");

-- CreateIndex
CREATE INDEX "stock_locations_isActive_sortOrder_idx" ON "stock_locations"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batches_barcode_key" ON "stock_batches"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batches_qrPayload_key" ON "stock_batches"("qrPayload");

-- CreateIndex
CREATE INDEX "stock_batches_itemId_status_idx" ON "stock_batches"("itemId", "status");

-- CreateIndex
CREATE INDEX "stock_batches_expiryDate_idx" ON "stock_batches"("expiryDate");

-- CreateIndex
CREATE INDEX "stock_batches_owner_vendorId_idx" ON "stock_batches"("owner", "vendorId");

-- CreateIndex
CREATE INDEX "stock_batches_locationId_idx" ON "stock_batches"("locationId");

-- CreateIndex
CREATE INDEX "stock_batches_deletedAt_idx" ON "stock_batches"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batches_itemId_batchNumber_locationId_key" ON "stock_batches"("itemId", "batchNumber", "locationId");

-- CreateIndex
CREATE INDEX "stock_movements_batchId_occurredAt_idx" ON "stock_movements"("batchId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_surgeryId_idx" ON "stock_movements"("surgeryId");

-- CreateIndex
CREATE INDEX "stock_movements_type_occurredAt_idx" ON "stock_movements"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_reservationId_idx" ON "stock_movements"("reservationId");

-- CreateIndex
CREATE INDEX "stock_reservations_surgeryId_status_idx" ON "stock_reservations"("surgeryId", "status");

-- CreateIndex
CREATE INDEX "stock_reservations_batchId_idx" ON "stock_reservations"("batchId");

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "stock_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "imprest_vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "stock_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "stock_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "stock_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

