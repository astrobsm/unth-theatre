/*
  Warnings:

  - A unique constraint covering the columns `[staffCode]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DutyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DutyType" AS ENUM ('THEATRE_CLEANING', 'PATIENT_TRANSPORT', 'WASHING_MACINTOSH', 'EQUIPMENT_STERILIZATION', 'LINEN_MANAGEMENT', 'WASTE_DISPOSAL', 'EQUIPMENT_SETUP', 'OTHER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "staffCode" TEXT;

-- CreateTable
CREATE TABLE "theatre_cleaning_logs" (
    "id" TEXT NOT NULL,
    "cleanerId" TEXT NOT NULL,
    "cleanerCode" TEXT NOT NULL,
    "cleanerName" TEXT NOT NULL,
    "theatreId" TEXT NOT NULL,
    "theatreName" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "status" "DutyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "cleaningType" TEXT,
    "notes" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "qualityRating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "theatre_cleaning_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_transport_logs" (
    "id" TEXT NOT NULL,
    "porterId" TEXT NOT NULL,
    "porterCode" TEXT NOT NULL,
    "porterName" TEXT NOT NULL,
    "patientId" TEXT,
    "patientName" TEXT NOT NULL,
    "patientFolderNumber" TEXT NOT NULL,
    "surgeryId" TEXT,
    "fromLocation" TEXT NOT NULL,
    "toLocation" TEXT NOT NULL,
    "transportType" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "status" "DutyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "notes" TEXT,
    "complications" TEXT,
    "equipmentUsed" TEXT,
    "receivedBy" TEXT,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_transport_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_duty_logs" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffCode" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "staffRole" "UserRole" NOT NULL,
    "dutyType" "DutyType" NOT NULL,
    "dutyDescription" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "status" "DutyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "location" TEXT,
    "equipmentInvolved" TEXT,
    "quantity" INTEGER,
    "notes" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "qualityRating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_duty_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_staffCode_key" ON "users"("staffCode");

-- AddForeignKey
ALTER TABLE "theatre_cleaning_logs" ADD CONSTRAINT "theatre_cleaning_logs_cleanerId_fkey" FOREIGN KEY ("cleanerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_cleaning_logs" ADD CONSTRAINT "theatre_cleaning_logs_theatreId_fkey" FOREIGN KEY ("theatreId") REFERENCES "theatre_suites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_transport_logs" ADD CONSTRAINT "patient_transport_logs_porterId_fkey" FOREIGN KEY ("porterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_transport_logs" ADD CONSTRAINT "patient_transport_logs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_transport_logs" ADD CONSTRAINT "patient_transport_logs_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_duty_logs" ADD CONSTRAINT "staff_duty_logs_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
