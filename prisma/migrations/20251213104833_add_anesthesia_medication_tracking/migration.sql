-- CreateTable
CREATE TABLE "anesthesia_medication_records" (
    "id" TEXT NOT NULL,
    "anesthesiaRecordId" TEXT NOT NULL,
    "administeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "minutesFromStart" INTEGER,
    "eventPhase" TEXT,
    "medicationType" TEXT NOT NULL,
    "medicationName" TEXT NOT NULL,
    "dosage" TEXT,
    "concentration" TEXT,
    "route" TEXT NOT NULL,
    "site" TEXT,
    "fluidType" TEXT,
    "volumeML" INTEGER,
    "rateMLPerHour" INTEGER,
    "bloodProductType" TEXT,
    "bloodUnits" DECIMAL(3,1),
    "bloodBatchNumber" TEXT,
    "bloodGroupRh" TEXT,
    "transfusionStartTime" TIMESTAMP(3),
    "transfusionEndTime" TIMESTAMP(3),
    "transfusionRateMLPerHour" INTEGER,
    "crossMatchDone" BOOLEAN,
    "transfusionReaction" BOOLEAN NOT NULL DEFAULT false,
    "transfusionReactionType" TEXT,
    "isContinuousInfusion" BOOLEAN NOT NULL DEFAULT false,
    "infusionStartTime" TIMESTAMP(3),
    "infusionEndTime" TIMESTAMP(3),
    "totalVolumeInfused" INTEGER,
    "indication" TEXT,
    "response" TEXT,
    "adverseEffect" BOOLEAN NOT NULL DEFAULT false,
    "adverseEffectDescription" TEXT,
    "administeredBy" TEXT,
    "verifiedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anesthesia_medication_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "anesthesia_medication_records_anesthesiaRecordId_administer_idx" ON "anesthesia_medication_records"("anesthesiaRecordId", "administeredAt");

-- AddForeignKey
ALTER TABLE "anesthesia_medication_records" ADD CONSTRAINT "anesthesia_medication_records_anesthesiaRecordId_fkey" FOREIGN KEY ("anesthesiaRecordId") REFERENCES "anesthesia_monitoring_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
