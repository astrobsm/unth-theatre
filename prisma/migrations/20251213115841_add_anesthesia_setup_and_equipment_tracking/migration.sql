-- CreateEnum
CREATE TYPE "SetupStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'READY', 'BLOCKED');

-- CreateEnum
CREATE TYPE "EquipmentCondition" AS ENUM ('OPERATIONAL', 'NEEDS_ATTENTION', 'FAULTY', 'NOT_AVAILABLE');

-- CreateTable
CREATE TABLE "anesthesia_setup_logs" (
    "id" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "technicianName" TEXT NOT NULL,
    "technicianCode" TEXT,
    "theatreId" TEXT NOT NULL,
    "theatreName" TEXT NOT NULL,
    "allocationId" TEXT,
    "setupDate" DATE NOT NULL,
    "setupStartTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setupEndTime" TIMESTAMP(3),
    "readyTime" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "status" "SetupStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "isReady" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "locationName" TEXT NOT NULL,
    "locationAddress" TEXT,
    "gasSupplyChecked" BOOLEAN NOT NULL DEFAULT false,
    "suctionChecked" BOOLEAN NOT NULL DEFAULT false,
    "monitorsChecked" BOOLEAN NOT NULL DEFAULT false,
    "ventilatorChecked" BOOLEAN NOT NULL DEFAULT false,
    "anesthesiaMachineChecked" BOOLEAN NOT NULL DEFAULT false,
    "emergencyDrugsChecked" BOOLEAN NOT NULL DEFAULT false,
    "airwayEquipmentChecked" BOOLEAN NOT NULL DEFAULT false,
    "ivEquipmentChecked" BOOLEAN NOT NULL DEFAULT false,
    "setupNotes" TEXT,
    "blockingIssues" TEXT,
    "endOfDayLogged" BOOLEAN NOT NULL DEFAULT false,
    "endOfDayTime" TIMESTAMP(3),
    "endOfDayNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anesthesia_setup_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_check_logs" (
    "id" TEXT NOT NULL,
    "setupLogId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "equipmentName" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "serialNumber" TEXT,
    "checkTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "condition" "EquipmentCondition" NOT NULL,
    "isFunctional" BOOLEAN NOT NULL,
    "malfunctionDescription" TEXT,
    "malfunctionSeverity" TEXT,
    "requiresImmediateAttention" BOOLEAN NOT NULL DEFAULT false,
    "alertSent" BOOLEAN NOT NULL DEFAULT false,
    "alertSentAt" TIMESTAMP(3),
    "alertRecipients" TEXT,
    "issueResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolutionNotes" TEXT,
    "testParameters" TEXT,
    "calibrationStatus" TEXT,
    "lastMaintenanceDate" TIMESTAMP(3),
    "notes" TEXT,
    "recommendations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_check_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "anesthesia_setup_logs" ADD CONSTRAINT "anesthesia_setup_logs_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anesthesia_setup_logs" ADD CONSTRAINT "anesthesia_setup_logs_theatreId_fkey" FOREIGN KEY ("theatreId") REFERENCES "theatre_suites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anesthesia_setup_logs" ADD CONSTRAINT "anesthesia_setup_logs_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "theatre_allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_check_logs" ADD CONSTRAINT "equipment_check_logs_setupLogId_fkey" FOREIGN KEY ("setupLogId") REFERENCES "anesthesia_setup_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_check_logs" ADD CONSTRAINT "equipment_check_logs_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
