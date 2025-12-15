/*
  Warnings:

  - The values [NURSE_ANAESTHETIST,CIRCULATING_NURSE,HOLDING_AREA_NURSE,THEATRE_COORDINATOR] on the enum `UserRole` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "DutyShift" AS ENUM ('MORNING', 'CALL', 'NIGHT');

-- CreateEnum
CREATE TYPE "StaffCategory" AS ENUM ('NURSES', 'ANAESTHETISTS', 'PORTERS', 'CLEANERS', 'ANAESTHETIC_TECHNICIANS');

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('CHECKED_OUT', 'RETURNED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('FUNCTIONAL', 'FAULTY', 'NEEDS_MAINTENANCE', 'DAMAGED');

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'THEATRE_STORE_KEEPER', 'PORTER', 'ANAESTHETIC_TECHNICIAN', 'BIOMEDICAL_ENGINEER', 'CLEANER', 'PROCUREMENT_OFFICER');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TABLE "staff_duty_logs" ALTER COLUMN "staffRole" TYPE "UserRole_new" USING ("staffRole"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "surgeries" DROP CONSTRAINT "surgeries_surgeonId_fkey";

-- DropForeignKey
ALTER TABLE "surgical_team_members" DROP CONSTRAINT "surgical_team_members_userId_fkey";

-- AlterTable
ALTER TABLE "intraoperative_records" ALTER COLUMN "primarySurgeonId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "surgeries" ADD COLUMN     "surgeonName" TEXT,
ALTER COLUMN "surgeonId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "surgical_team_members" ADD COLUMN     "memberName" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "theatre_allocations" ADD COLUMN     "shift" "DutyShift";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isFirstLogin" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "rosters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "staffCategory" "StaffCategory" NOT NULL,
    "date" DATE NOT NULL,
    "theatreId" TEXT,
    "shift" "DutyShift" NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_checkouts" (
    "id" TEXT NOT NULL,
    "storeKeeperId" TEXT NOT NULL,
    "storeKeeperName" TEXT NOT NULL,
    "collectorName" TEXT NOT NULL,
    "collectorHospitalId" TEXT NOT NULL,
    "collectorRole" TEXT NOT NULL,
    "theatreId" TEXT NOT NULL,
    "shift" "DutyShift" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "checkoutTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkoutNotes" TEXT,
    "returnTime" TIMESTAMP(3),
    "returnNotes" TEXT,
    "returnedBy" TEXT,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'CHECKED_OUT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_items" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "itemName" TEXT NOT NULL,
    "itemCategory" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "serialNumber" TEXT,
    "checkoutCondition" "ItemCondition" NOT NULL DEFAULT 'FUNCTIONAL',
    "checkoutRemarks" TEXT,
    "returnCondition" "ItemCondition",
    "returnRemarks" TEXT,
    "returnTime" TIMESTAMP(3),
    "isFaulty" BOOLEAN NOT NULL DEFAULT false,
    "faultDescription" TEXT,
    "faultSeverity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_fault_alerts" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "faultDescription" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "alertTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "theatreId" TEXT NOT NULL,
    "shift" "DutyShift" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "FaultStatus" NOT NULL DEFAULT 'REPORTED',
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "priority" "FaultPriority" NOT NULL DEFAULT 'HIGH',
    "requiresImmediateAction" BOOLEAN NOT NULL DEFAULT true,
    "escalatedToChairman" BOOLEAN NOT NULL DEFAULT false,
    "managerNotified" BOOLEAN NOT NULL DEFAULT false,
    "chairmanNotified" BOOLEAN NOT NULL DEFAULT false,
    "notificationsSent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_fault_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rosters_date_theatreId_shift_idx" ON "rosters"("date", "theatreId", "shift");

-- CreateIndex
CREATE INDEX "rosters_staffCategory_date_idx" ON "rosters"("staffCategory", "date");

-- AddForeignKey
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_theatreId_fkey" FOREIGN KEY ("theatreId") REFERENCES "theatre_suites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surgeries" ADD CONSTRAINT "surgeries_surgeonId_fkey" FOREIGN KEY ("surgeonId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surgical_team_members" ADD CONSTRAINT "surgical_team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_checkouts" ADD CONSTRAINT "equipment_checkouts_storeKeeperId_fkey" FOREIGN KEY ("storeKeeperId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_items" ADD CONSTRAINT "checkout_items_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "equipment_checkouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_items" ADD CONSTRAINT "checkout_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_fault_alerts" ADD CONSTRAINT "equipment_fault_alerts_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "equipment_checkouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_fault_alerts" ADD CONSTRAINT "equipment_fault_alerts_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
