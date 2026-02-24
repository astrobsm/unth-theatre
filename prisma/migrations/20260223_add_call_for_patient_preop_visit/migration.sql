-- Call for Patient + Pre-Operative Visit Module Migration

-- CreateEnum: CallUpStatus
DO $$ BEGIN
  CREATE TYPE "CallUpStatus" AS ENUM ('INVITED', 'REJECTED', 'PATIENT_EN_ROUTE', 'PATIENT_ARRIVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: PreOpVisitStatus
DO $$ BEGIN
  CREATE TYPE "PreOpVisitStatus" AS ENUM ('PENDING', 'VISITED', 'CLEARED', 'NOT_CLEARED', 'DEFERRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: PaymentStatus
DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('NOT_PAID', 'PARTIALLY_PAID', 'FULLY_PAID', 'WAIVED', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: ConsentStatus
DO $$ BEGIN
  CREATE TYPE "ConsentStatus" AS ENUM ('NOT_OBTAINED', 'OBTAINED', 'REFUSED', 'PENDING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: NPOStatus
DO $$ BEGIN
  CREATE TYPE "NPOStatus" AS ENUM ('NPO_COMPLIANT', 'NOT_FASTING', 'UNKNOWN', 'PARTIALLY_COMPLIANT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: EmotionalReadiness
DO $$ BEGIN
  CREATE TYPE "EmotionalReadiness" AS ENUM ('READY', 'ANXIOUS', 'VERY_ANXIOUS', 'REFUSED', 'NEEDS_COUNSELLING', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: patient_call_ups
CREATE TABLE IF NOT EXISTS "patient_call_ups" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "folderNumber" TEXT NOT NULL,
    "ward" TEXT,
    "age" INTEGER,
    "gender" TEXT,
    "diagnosis" TEXT,
    "procedureName" TEXT NOT NULL,
    "surgicalUnit" TEXT NOT NULL,
    "theatreName" TEXT NOT NULL,
    "theatreId" TEXT,
    "assignedNurseName" TEXT,
    "assignedNurseId" TEXT,
    "assignedPorterName" TEXT,
    "assignedPorterId" TEXT,
    "surgeonName" TEXT NOT NULL,
    "status" "CallUpStatus" NOT NULL DEFAULT 'INVITED',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedById" TEXT NOT NULL,
    "invitedByName" TEXT NOT NULL,
    "rejectedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedByName" TEXT,
    "rejectionReason" TEXT,
    "patientEnRouteAt" TIMESTAMP(3),
    "patientArrivedAt" TIMESTAMP(3),
    "callUpNoteNumber" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "patient_call_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "patient_call_ups_callUpNoteNumber_key" ON "patient_call_ups"("callUpNoteNumber");
CREATE INDEX IF NOT EXISTS "patient_call_ups_surgeryId_idx" ON "patient_call_ups"("surgeryId");
CREATE INDEX IF NOT EXISTS "patient_call_ups_status_idx" ON "patient_call_ups"("status");
CREATE INDEX IF NOT EXISTS "patient_call_ups_invitedAt_idx" ON "patient_call_ups"("invitedAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "patient_call_ups" ADD CONSTRAINT "patient_call_ups_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "patient_call_ups" ADD CONSTRAINT "patient_call_ups_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "patient_call_ups" ADD CONSTRAINT "patient_call_ups_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: pre_operative_visits
CREATE TABLE IF NOT EXISTS "pre_operative_visits" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "folderNumber" TEXT NOT NULL,
    "ward" TEXT,
    "age" INTEGER,
    "gender" TEXT,
    "procedureName" TEXT NOT NULL,
    "surgicalUnit" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "scheduledTime" TEXT NOT NULL,
    "surgeonName" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitedById" TEXT NOT NULL,
    "visitedByName" TEXT NOT NULL,
    "patientAvailableInWard" BOOLEAN NOT NULL DEFAULT false,
    "patientLocationNotes" TEXT,
    "surgicalFeePaymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "paymentNotes" TEXT,
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'PENDING',
    "consentNotes" TEXT,
    "surgicalItemsAvailable" BOOLEAN NOT NULL DEFAULT false,
    "itemsAvailabilityNotes" TEXT,
    "preAnaestheticReviewDone" BOOLEAN NOT NULL DEFAULT false,
    "preAnaestheticNotes" TEXT,
    "npoStatus" "NPOStatus" NOT NULL DEFAULT 'UNKNOWN',
    "npoNotes" TEXT,
    "lastMealTime" TEXT,
    "investigationsComplete" BOOLEAN NOT NULL DEFAULT false,
    "investigationNotes" TEXT,
    "pendingInvestigations" TEXT,
    "patientEmotionalReadiness" "EmotionalReadiness" NOT NULL DEFAULT 'UNKNOWN',
    "emotionalReadinessNotes" TEXT,
    "bloodReady" BOOLEAN NOT NULL DEFAULT false,
    "bloodNotes" TEXT,
    "ivLineSecured" BOOLEAN NOT NULL DEFAULT false,
    "ivLineNotes" TEXT,
    "skinPrepDone" BOOLEAN NOT NULL DEFAULT false,
    "skinPrepNotes" TEXT,
    "overallStatus" "PreOpVisitStatus" NOT NULL DEFAULT 'PENDING',
    "overallNotes" TEXT,
    "nurseSignature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pre_operative_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pre_operative_visits_surgeryId_idx" ON "pre_operative_visits"("surgeryId");
CREATE INDEX IF NOT EXISTS "pre_operative_visits_visitDate_idx" ON "pre_operative_visits"("visitDate");
CREATE INDEX IF NOT EXISTS "pre_operative_visits_overallStatus_idx" ON "pre_operative_visits"("overallStatus");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "pre_operative_visits" ADD CONSTRAINT "pre_operative_visits_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pre_operative_visits" ADD CONSTRAINT "pre_operative_visits_visitedById_fkey" FOREIGN KEY ("visitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
