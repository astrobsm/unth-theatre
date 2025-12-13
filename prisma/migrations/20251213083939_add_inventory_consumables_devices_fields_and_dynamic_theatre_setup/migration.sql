-- CreateEnum
CREATE TYPE "SurgicalTeamRole" AS ENUM ('CONSULTANT', 'SENIOR_REGISTRAR', 'REGISTRAR', 'HOUSE_OFFICER');

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "depreciationRate" DOUBLE PRECISION,
ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "halfLife" DOUBLE PRECISION,
ADD COLUMN     "lastMaintenanceDate" TIMESTAMP(3),
ADD COLUMN     "maintenanceIntervalDays" INTEGER,
ADD COLUMN     "manufacturingDate" TIMESTAMP(3),
ADD COLUMN     "nextMaintenanceDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "theatre_setups" ADD COLUMN     "scrubNurseName" TEXT;

-- CreateTable
CREATE TABLE "maintenance_alerts" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "alertDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surgical_team_members" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "SurgicalTeamRole" NOT NULL,
    "specialNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surgical_team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theatre_setup_items" (
    "id" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantityTaken" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "theatre_setup_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "maintenance_alerts" ADD CONSTRAINT "maintenance_alerts_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surgical_team_members" ADD CONSTRAINT "surgical_team_members_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surgical_team_members" ADD CONSTRAINT "surgical_team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_setup_items" ADD CONSTRAINT "theatre_setup_items_setupId_fkey" FOREIGN KEY ("setupId") REFERENCES "theatre_setups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_setup_items" ADD CONSTRAINT "theatre_setup_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
