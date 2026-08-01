-- Theatre operations: delay records, escalations, unexplained cases.
--
-- The distinction between the three tables is the design. A delay record is
-- somebody EXPLAINING what is holding a case up, and it suppresses the
-- unexplained flag. An escalation is the department being told and expected to
-- close it. An unexplained delay is the ABSENCE of an explanation at the
-- threshold.
--
-- Note what theatre_unexplained_delays does not have: any column naming a
-- responsible person. It records that a CASE ran late with nothing said, and
-- routes to Quality Assurance. Attribution is a human judgement made with the
-- facts in front of you, and the schema gives the software no place to record
-- an accusation it is not entitled to make.
--
-- Additive only; nothing existing is altered.

-- CreateEnum
CREATE TYPE "DelayStageRecorded" AS ENUM ('WARNING', 'UNEXPLAINED');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UnexplainedReviewStatus" AS ENUM ('PENDING_REVIEW', 'REVIEWED_NO_ACTION', 'REVIEWED_SYSTEM_ISSUE', 'REVIEWED_REFERRED');

-- CreateTable
CREATE TABLE "theatre_delay_records" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "categoryGroup" TEXT,
    "narrative" TEXT NOT NULL,
    "minutesLateAtRecord" INTEGER,
    "reportedById" TEXT,
    "reportedByName" TEXT,
    "photoDataUrls" TEXT[],
    "withinGeofence" BOOLEAN,
    "theatreName" TEXT,
    "deviceLabel" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "theatre_delay_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theatre_escalations" (
    "id" TEXT NOT NULL,
    "delayRecordId" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "notifiedRole" TEXT NOT NULL,
    "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
    "acknowledgedById" TEXT,
    "acknowledgedByName" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedByName" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "theatre_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theatre_unexplained_delays" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "stage" "DelayStageRecorded" NOT NULL DEFAULT 'UNEXPLAINED',
    "minutesLate" INTEGER NOT NULL,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "reviewStatus" "UnexplainedReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "judgedAvoidable" BOOLEAN,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "theatre_unexplained_delays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "theatre_delay_records_surgeryId_recordedAt_idx" ON "theatre_delay_records"("surgeryId", "recordedAt");

-- CreateIndex
CREATE INDEX "theatre_delay_records_categoryCode_idx" ON "theatre_delay_records"("categoryCode");

-- CreateIndex
CREATE INDEX "theatre_delay_records_recordedAt_idx" ON "theatre_delay_records"("recordedAt");

-- CreateIndex
CREATE INDEX "theatre_escalations_notifiedRole_status_idx" ON "theatre_escalations"("notifiedRole", "status");

-- CreateIndex
CREATE INDEX "theatre_escalations_surgeryId_idx" ON "theatre_escalations"("surgeryId");

-- CreateIndex
CREATE INDEX "theatre_escalations_status_createdAt_idx" ON "theatre_escalations"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "theatre_unexplained_delays_surgeryId_key" ON "theatre_unexplained_delays"("surgeryId");

-- CreateIndex
CREATE INDEX "theatre_unexplained_delays_reviewStatus_detectedAt_idx" ON "theatre_unexplained_delays"("reviewStatus", "detectedAt");

-- CreateIndex
CREATE INDEX "theatre_unexplained_delays_detectedAt_idx" ON "theatre_unexplained_delays"("detectedAt");

-- AddForeignKey
ALTER TABLE "theatre_delay_records" ADD CONSTRAINT "theatre_delay_records_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_delay_records" ADD CONSTRAINT "theatre_delay_records_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_escalations" ADD CONSTRAINT "theatre_escalations_delayRecordId_fkey" FOREIGN KEY ("delayRecordId") REFERENCES "theatre_delay_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_unexplained_delays" ADD CONSTRAINT "theatre_unexplained_delays_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

