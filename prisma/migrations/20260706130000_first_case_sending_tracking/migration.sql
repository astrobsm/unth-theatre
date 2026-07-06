-- Migration: First-case sending punctuality + daily holding-area/sending nurses.

ALTER TABLE "patient_call_ups" ADD COLUMN IF NOT EXISTS "isFirstCaseOfDay" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "patient_call_ups" ADD COLUMN IF NOT EXISTS "sendingMinutesLate" INTEGER;
ALTER TABLE "patient_call_ups" ADD COLUMN IF NOT EXISTS "lateSendingReason" TEXT;

CREATE TABLE IF NOT EXISTS "daily_first_case_sending" (
    "id" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "nurses" TEXT NOT NULL,
    "notes" TEXT,
    "recordedById" TEXT,
    "recordedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_first_case_sending_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_first_case_sending_dateKey_key" ON "daily_first_case_sending"("dateKey");
