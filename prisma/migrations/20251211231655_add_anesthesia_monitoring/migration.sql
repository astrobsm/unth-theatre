-- CreateTable
CREATE TABLE "anesthesia_monitoring_records" (
    "id" TEXT NOT NULL,
    "intraOperativeRecordId" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "preOpDiagnosis" TEXT,
    "proposedProcedure" TEXT,
    "asaClassification" TEXT,
    "weightKg" DECIMAL(5,2),
    "heightCm" DECIMAL(5,2),
    "bmi" DECIMAL(4,1),
    "anesthesiaType" "AnesthesiaType" NOT NULL,
    "anesthesiaTechnique" TEXT,
    "spinalLevel" TEXT,
    "spinalNeedleSize" TEXT,
    "localAnestheticUsed" TEXT,
    "localAnestheticDose" TEXT,
    "additives" TEXT,
    "spinalAttempts" INTEGER,
    "spinalSuccessful" BOOLEAN,
    "highestSensoryLevel" TEXT,
    "motorBlock" TEXT,
    "inductionAgents" TEXT,
    "inductionTime" TIMESTAMP(3),
    "intubationMethod" TEXT,
    "ettSize" TEXT,
    "ettCuffPressure" INTEGER,
    "intubationAttempts" INTEGER,
    "intubationDifficulty" TEXT,
    "airwayGrade" TEXT,
    "maintenanceAgents" TEXT,
    "ventilationMode" TEXT,
    "tidalVolume" INTEGER,
    "respiratoryRate" INTEGER,
    "peep" INTEGER,
    "fio2" INTEGER,
    "ecgMonitored" BOOLEAN NOT NULL DEFAULT true,
    "nibpMonitored" BOOLEAN NOT NULL DEFAULT true,
    "spo2Monitored" BOOLEAN NOT NULL DEFAULT true,
    "etco2Monitored" BOOLEAN NOT NULL DEFAULT false,
    "temperatureMonitored" BOOLEAN NOT NULL DEFAULT false,
    "cvpMonitored" BOOLEAN NOT NULL DEFAULT false,
    "arterialLineInserted" BOOLEAN NOT NULL DEFAULT false,
    "arterialLineSite" TEXT,
    "centralLineInserted" BOOLEAN NOT NULL DEFAULT false,
    "centralLineSite" TEXT,
    "urinaryCatheterInserted" BOOLEAN NOT NULL DEFAULT false,
    "nasogastricTubeInserted" BOOLEAN NOT NULL DEFAULT false,
    "baselineHR" INTEGER,
    "baselineBP" TEXT,
    "baselineSpo2" INTEGER,
    "baselineTemp" DECIMAL(4,1),
    "baselineRR" INTEGER,
    "ivAccessSites" TEXT,
    "crystalloidsGiven" INTEGER,
    "colloidsGiven" INTEGER,
    "bloodProductsGiven" TEXT,
    "totalFluidInput" INTEGER,
    "urineOutput" INTEGER,
    "estimatedBloodLoss" INTEGER,
    "fluidBalance" INTEGER,
    "antibioticProphylaxis" TEXT,
    "muscleRelaxants" TEXT,
    "analgesics" TEXT,
    "vasoactiveDrugs" TEXT,
    "otherMedications" TEXT,
    "hypotensionOccurred" BOOLEAN NOT NULL DEFAULT false,
    "hypotensionManagement" TEXT,
    "hypertensionOccurred" BOOLEAN NOT NULL DEFAULT false,
    "hypertensionManagement" TEXT,
    "bradycardiaOccurred" BOOLEAN NOT NULL DEFAULT false,
    "bradycardiaManagement" TEXT,
    "tachycardiaOccurred" BOOLEAN NOT NULL DEFAULT false,
    "tachycardiaManagement" TEXT,
    "desaturationOccurred" BOOLEAN NOT NULL DEFAULT false,
    "desaturationManagement" TEXT,
    "difficultAirway" BOOLEAN NOT NULL DEFAULT false,
    "difficultAirwayDetails" TEXT,
    "anaphylaxis" BOOLEAN NOT NULL DEFAULT false,
    "anaphylaxisManagement" TEXT,
    "otherComplications" TEXT,
    "anesthesiaEndTime" TIMESTAMP(3),
    "emergenceAgents" TEXT,
    "extubationTime" TIMESTAMP(3),
    "extubationCondition" TEXT,
    "postOpVentilation" BOOLEAN NOT NULL DEFAULT false,
    "transferToPACU" BOOLEAN NOT NULL DEFAULT true,
    "transferToICU" BOOLEAN NOT NULL DEFAULT false,
    "anesthesiaDuration" INTEGER,
    "surgicalDuration" INTEGER,
    "anesthetistNotes" TEXT,
    "complications" TEXT,
    "postOpOrders" TEXT,
    "anesthetistName" TEXT,
    "anesthetistSignature" TEXT,
    "nurseAnesthetistName" TEXT,
    "recordCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anesthesia_monitoring_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anesthesia_vital_signs" (
    "id" TEXT NOT NULL,
    "anesthesiaRecordId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "minutesFromStart" INTEGER,
    "eventPhase" TEXT,
    "heartRate" INTEGER,
    "systolicBP" INTEGER,
    "diastolicBP" INTEGER,
    "meanArterialPressure" INTEGER,
    "respiratoryRate" INTEGER,
    "spo2" INTEGER,
    "etco2" INTEGER,
    "peakAirwayPressure" INTEGER,
    "tidalVolume" INTEGER,
    "minuteVolume" DECIMAL(5,2),
    "temperature" DECIMAL(4,1),
    "bisValue" INTEGER,
    "macValue" DECIMAL(3,1),
    "cvp" INTEGER,
    "urineOutput" INTEGER,
    "interventions" TEXT,
    "notes" TEXT,
    "alertTriggered" BOOLEAN NOT NULL DEFAULT false,
    "alertType" TEXT,

    CONSTRAINT "anesthesia_vital_signs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "anesthesia_monitoring_records_intraOperativeRecordId_key" ON "anesthesia_monitoring_records"("intraOperativeRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "anesthesia_monitoring_records_surgeryId_key" ON "anesthesia_monitoring_records"("surgeryId");

-- CreateIndex
CREATE INDEX "anesthesia_vital_signs_anesthesiaRecordId_recordedAt_idx" ON "anesthesia_vital_signs"("anesthesiaRecordId", "recordedAt");

-- AddForeignKey
ALTER TABLE "anesthesia_monitoring_records" ADD CONSTRAINT "anesthesia_monitoring_records_intraOperativeRecordId_fkey" FOREIGN KEY ("intraOperativeRecordId") REFERENCES "intraoperative_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anesthesia_monitoring_records" ADD CONSTRAINT "anesthesia_monitoring_records_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anesthesia_monitoring_records" ADD CONSTRAINT "anesthesia_monitoring_records_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anesthesia_vital_signs" ADD CONSTRAINT "anesthesia_vital_signs_anesthesiaRecordId_fkey" FOREIGN KEY ("anesthesiaRecordId") REFERENCES "anesthesia_monitoring_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
