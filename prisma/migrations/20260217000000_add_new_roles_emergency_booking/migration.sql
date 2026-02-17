-- Migration: Add new roles, emergency booking, enhanced prescriptions
-- Generated for UNTH Theatre ORM

-- 1. Add new roles to UserRole enum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CHIEF_MEDICAL_DIRECTOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CMAC';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DC_MAC';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'LAUNDRY_SUPERVISOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CSSD_SUPERVISOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'OXYGEN_UNIT_SUPERVISOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'WORKS_SUPERVISOR';

-- 2. Add new values to PrescriptionStatus enum
ALTER TYPE "PrescriptionStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_PACKED';
ALTER TYPE "PrescriptionStatus" ADD VALUE IF NOT EXISTS 'LATE_ARRIVAL';

-- 3. Create EmergencyBookingStatus enum
DO $$ BEGIN
  CREATE TYPE "EmergencyBookingStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'THEATRE_ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Add enhanced prescription fields to anesthetic_prescriptions
ALTER TABLE "anesthetic_prescriptions" ADD COLUMN IF NOT EXISTS "isLateArrival" BOOLEAN DEFAULT false;
ALTER TABLE "anesthetic_prescriptions" ADD COLUMN IF NOT EXISTS "lateArrivalFlaggedAt" TIMESTAMP(3);
ALTER TABLE "anesthetic_prescriptions" ADD COLUMN IF NOT EXISTS "approvalDeadline" TIMESTAMP(3);
ALTER TABLE "anesthetic_prescriptions" ADD COLUMN IF NOT EXISTS "outOfStockItems" TEXT;
ALTER TABLE "anesthetic_prescriptions" ADD COLUMN IF NOT EXISTS "hasOutOfStockItems" BOOLEAN DEFAULT false;
ALTER TABLE "anesthetic_prescriptions" ADD COLUMN IF NOT EXISTS "outOfStockNotifiedAt" TIMESTAMP(3);
ALTER TABLE "anesthetic_prescriptions" ADD COLUMN IF NOT EXISTS "medicationPackingStatus" TEXT;

-- 5. Create prescription_medication_items table
CREATE TABLE IF NOT EXISTS "prescription_medication_items" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "drugName" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "frequency" TEXT,
    "timing" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "isPacked" BOOLEAN NOT NULL DEFAULT false,
    "packedAt" TIMESTAMP(3),
    "isOutOfStock" BOOLEAN NOT NULL DEFAULT false,
    "outOfStockFlaggedAt" TIMESTAMP(3),
    "substituteAvailable" BOOLEAN NOT NULL DEFAULT false,
    "substituteDrugName" TEXT,
    "pharmacistNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescription_medication_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "prescription_medication_items" ADD CONSTRAINT "prescription_medication_items_prescriptionId_fkey"
    FOREIGN KEY ("prescriptionId") REFERENCES "anesthetic_prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Create emergency_surgery_bookings table
CREATE TABLE IF NOT EXISTS "emergency_surgery_bookings" (
    "id" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "folderNumber" TEXT NOT NULL,
    "age" INTEGER,
    "gender" TEXT,
    "ward" TEXT,
    "diagnosis" TEXT NOT NULL,
    "procedureName" TEXT NOT NULL,
    "surgicalUnit" TEXT NOT NULL,
    "indication" TEXT NOT NULL,
    "surgeonId" TEXT NOT NULL,
    "surgeonName" TEXT NOT NULL,
    "anesthetistId" TEXT,
    "anesthetistName" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requiredByTime" TIMESTAMP(3),
    "estimatedDuration" INTEGER,
    "theatreId" TEXT,
    "theatreName" TEXT,
    "priority" "EmergencyAlertPriority" NOT NULL DEFAULT 'CRITICAL',
    "classification" TEXT,
    "bloodRequired" BOOLEAN NOT NULL DEFAULT false,
    "bloodType" TEXT,
    "bloodUnits" INTEGER,
    "specialEquipment" TEXT,
    "specialRequirements" TEXT,
    "status" "EmergencyBookingStatus" NOT NULL DEFAULT 'SUBMITTED',
    "surgeryId" TEXT,
    "emergencyAlertId" TEXT,
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "alertsSentAt" TIMESTAMP(3),
    "notifiedRoles" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_surgery_bookings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "emergency_surgery_bookings_surgeryId_key" ON "emergency_surgery_bookings"("surgeryId");

ALTER TABLE "emergency_surgery_bookings" ADD CONSTRAINT "emergency_surgery_bookings_surgeonId_fkey"
    FOREIGN KEY ("surgeonId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "emergency_surgery_bookings" ADD CONSTRAINT "emergency_surgery_bookings_anesthetistId_fkey"
    FOREIGN KEY ("anesthetistId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "emergency_surgery_bookings" ADD CONSTRAINT "emergency_surgery_bookings_surgeryId_fkey"
    FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
