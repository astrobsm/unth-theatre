-- CreateEnum
CREATE TYPE "SurgicalPhase" AS ENUM ('PATIENT_IN_ROOM', 'ANESTHESIA_START', 'ANESTHESIA_READY', 'TIMEOUT_COMPLETED', 'INCISION', 'PROCEDURE_START', 'PROCEDURE_END', 'CLOSURE_START', 'CLOSURE_END', 'DRESSING_APPLIED', 'PATIENT_EXTUBATED', 'PATIENT_OUT_OF_ROOM');

-- CreateTable
CREATE TABLE "surgical_timings" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "patientEnteredRoomTime" TIMESTAMP(3),
    "anesthesiaStartTime" TIMESTAMP(3),
    "anesthesiaReadyTime" TIMESTAMP(3),
    "timeoutStartTime" TIMESTAMP(3),
    "timeoutCompletedTime" TIMESTAMP(3),
    "timeoutPerformedBy" TEXT,
    "timeoutTeamPresent" TEXT,
    "incisionTime" TIMESTAMP(3),
    "procedureStartTime" TIMESTAMP(3),
    "procedureEndTime" TIMESTAMP(3),
    "closureStartTime" TIMESTAMP(3),
    "closureEndTime" TIMESTAMP(3),
    "dressingAppliedTime" TIMESTAMP(3),
    "patientExtubatedTime" TIMESTAMP(3),
    "patientLeftRoomTime" TIMESTAMP(3),
    "signOutTime" TIMESTAMP(3),
    "signOutPerformedBy" TEXT,
    "anesthesiaDuration" INTEGER,
    "surgicalDuration" INTEGER,
    "totalORTime" INTEGER,
    "closureDuration" INTEGER,
    "turnoverTime" INTEGER,
    "delayOccurred" BOOLEAN NOT NULL DEFAULT false,
    "delayReason" TEXT,
    "delayDuration" INTEGER,
    "interruptionOccurred" BOOLEAN NOT NULL DEFAULT false,
    "interruptionReason" TEXT,
    "interruptionDuration" INTEGER,
    "surgeonPresent" TEXT,
    "anesthetistPresent" TEXT,
    "scrubNursePresent" TEXT,
    "circulatingNursePresent" TEXT,
    "otherTeamMembers" TEXT,
    "timingNotes" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "surgical_timings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surgical_events" (
    "id" TEXT NOT NULL,
    "surgicalTimingId" TEXT NOT NULL,
    "eventType" "SurgicalPhase" NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "notes" TEXT,
    "minutesFromStart" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surgical_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "surgical_timings_surgeryId_key" ON "surgical_timings"("surgeryId");

-- AddForeignKey
ALTER TABLE "surgical_timings" ADD CONSTRAINT "surgical_timings_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surgical_events" ADD CONSTRAINT "surgical_events_surgicalTimingId_fkey" FOREIGN KEY ("surgicalTimingId") REFERENCES "surgical_timings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
