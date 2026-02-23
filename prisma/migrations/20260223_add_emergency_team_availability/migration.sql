-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "EmergencyTeamRole" AS ENUM ('SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'ANAESTHETIC_TECHNICIAN', 'PORTER', 'RECOVERY_ROOM_NURSE', 'THEATRE_STORE_KEEPER', 'BIOMEDICAL_ENGINEER', 'CLEANER', 'BLOODBANK_STAFF', 'PHARMACIST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'EN_ROUTE', 'ARRIVED', 'UNAVAILABLE', 'ON_ANOTHER_CASE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EmergencyReviewStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'APPROVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EmergencyPrescriptionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PHARMACIST_VIEWED', 'PACKING', 'PACKED', 'DISPENSED', 'OUT_OF_STOCK_FLAGGED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: Emergency Team Availability
CREATE TABLE IF NOT EXISTS "emergency_team_availability" (
    "id" TEXT NOT NULL,
    "emergencyBookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "teamRole" "EmergencyTeamRole" NOT NULL,
    "status" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationTimestamp" TIMESTAMP(3),
    "estimatedArrivalMin" INTEGER,
    "distanceKm" DOUBLE PRECISION,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arrivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_team_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Emergency Pre-Anaesthetic Review
CREATE TABLE IF NOT EXISTS "emergency_pre_anaesthetic_reviews" (
    "id" TEXT NOT NULL,
    "emergencyBookingId" TEXT NOT NULL,
    "surgeryId" TEXT,
    "patientName" TEXT NOT NULL,
    "folderNumber" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "airwayAssessment" TEXT,
    "asaClassification" TEXT,
    "allergies" TEXT,
    "currentMedications" TEXT,
    "pastMedicalHistory" TEXT,
    "lastMealTime" TIMESTAMP(3),
    "bloodPressure" TEXT,
    "heartRate" INTEGER,
    "oxygenSaturation" DOUBLE PRECISION,
    "temperature" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "bmi" DOUBLE PRECISION,
    "estimatedBloodLoss" TEXT,
    "coagulationStatus" TEXT,
    "hemoglobinLevel" DOUBLE PRECISION,
    "crossMatchStatus" TEXT,
    "ivAccess" TEXT,
    "patientNPOStatus" TEXT,
    "anaestheticPlan" TEXT,
    "specialConsiderations" TEXT,
    "riskAssessment" TEXT,
    "consentObtained" BOOLEAN NOT NULL DEFAULT false,
    "consentNotes" TEXT,
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "status" "EmergencyReviewStatus" NOT NULL DEFAULT 'PENDING',
    "isEmergency" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_pre_anaesthetic_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Emergency Prescription
CREATE TABLE IF NOT EXISTS "emergency_prescriptions" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "emergencyBookingId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "folderNumber" TEXT NOT NULL,
    "prescribedByName" TEXT NOT NULL,
    "medications" TEXT NOT NULL,
    "fluids" TEXT,
    "emergencyDrugs" TEXT,
    "allergyAlerts" TEXT,
    "specialInstructions" TEXT,
    "isEmergency" BOOLEAN NOT NULL DEFAULT true,
    "urgencyNote" TEXT DEFAULT 'EMERGENCY - IMMEDIATE DISPENSING REQUIRED',
    "viewedByPharmacist" BOOLEAN NOT NULL DEFAULT false,
    "viewedAt" TIMESTAMP(3),
    "packedById" TEXT,
    "packedByName" TEXT,
    "packedAt" TIMESTAMP(3),
    "packingNotes" TEXT,
    "outOfStockItems" TEXT,
    "hasOutOfStockItems" BOOLEAN NOT NULL DEFAULT false,
    "status" "EmergencyPrescriptionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_team_availability_emergencyBookingId_userId_key" ON "emergency_team_availability"("emergencyBookingId", "userId");
CREATE INDEX IF NOT EXISTS "emergency_team_availability_emergencyBookingId_teamRole_idx" ON "emergency_team_availability"("emergencyBookingId", "teamRole");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "emergency_team_availability" ADD CONSTRAINT "emergency_team_availability_emergencyBookingId_fkey" FOREIGN KEY ("emergencyBookingId") REFERENCES "emergency_surgery_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "emergency_team_availability" ADD CONSTRAINT "emergency_team_availability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "emergency_pre_anaesthetic_reviews" ADD CONSTRAINT "emergency_pre_anaesthetic_reviews_emergencyBookingId_fkey" FOREIGN KEY ("emergencyBookingId") REFERENCES "emergency_surgery_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "emergency_pre_anaesthetic_reviews" ADD CONSTRAINT "emergency_pre_anaesthetic_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "emergency_pre_anaesthetic_reviews" ADD CONSTRAINT "emergency_pre_anaesthetic_reviews_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "emergency_prescriptions" ADD CONSTRAINT "emergency_prescriptions_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "emergency_pre_anaesthetic_reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "emergency_prescriptions" ADD CONSTRAINT "emergency_prescriptions_emergencyBookingId_fkey" FOREIGN KEY ("emergencyBookingId") REFERENCES "emergency_surgery_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "emergency_prescriptions" ADD CONSTRAINT "emergency_prescriptions_packedById_fkey" FOREIGN KEY ("packedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
