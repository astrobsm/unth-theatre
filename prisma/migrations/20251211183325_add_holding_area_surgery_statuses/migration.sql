-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'SURGEON', 'ANAESTHETIST', 'NURSE_ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'HOLDING_AREA_NURSE', 'RECOVERY_ROOM_NURSE', 'THEATRE_STORE_KEEPER', 'PORTER', 'ANAESTHETIC_TECHNICIAN', 'BIOMEDICAL_ENGINEER', 'CLEANER', 'THEATRE_COORDINATOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('CONSUMABLE', 'MACHINE', 'DEVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "SurgeryStatus" AS ENUM ('SCHEDULED', 'IN_HOLDING_AREA', 'READY_FOR_THEATRE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SurgeryType" AS ENUM ('ELECTIVE', 'URGENT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "SurgeryReadinessStatus" AS ENUM ('PENDING_CHECKS', 'PENDING_DEPOSIT', 'READY', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AnesthesiaType" AS ENUM ('GENERAL', 'SPINAL', 'LOCAL', 'REGIONAL', 'SEDATION');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('OPERATIONAL', 'FAULTY', 'UNDER_MAINTENANCE', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "MaintenanceInterval" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'AS_NEEDED');

-- CreateEnum
CREATE TYPE "FaultStatus" AS ENUM ('REPORTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FaultPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "PatientMovementPhase" AS ENUM ('WARD', 'PORTER_DISPATCHED', 'HOLDING_AREA', 'INSIDE_THEATRE', 'SURGERY_STARTED', 'SURGERY_ENDED', 'RECOVERY_ROOM', 'RETURNED_TO_WARD');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('STOCK_ALERT', 'EQUIPMENT_FAULT', 'MAINTENANCE_DUE', 'SURGERY_SCHEDULED', 'FAULT_REPORTED', 'REQUISITION_APPROVAL', 'SYSTEM_ALERT', 'RED_ALERT', 'HOLDING_AREA_ALERT', 'PACU_ALERT', 'SAFETY_CONCERN');

-- CreateEnum
CREATE TYPE "HoldingAreaStatus" AS ENUM ('ARRIVED', 'VERIFICATION_IN_PROGRESS', 'DISCREPANCY_FOUND', 'RED_ALERT_ACTIVE', 'CLEARED_FOR_THEATRE', 'TRANSFERRED_TO_THEATRE');

-- CreateEnum
CREATE TYPE "PACUDischargeReadiness" AS ENUM ('NOT_READY', 'READY_WITH_CONCERNS', 'READY_FOR_WARD', 'DISCHARGED_TO_WARD');

-- CreateEnum
CREATE TYPE "ConsciousnessLevel" AS ENUM ('FULLY_AWAKE', 'DROWSY_BUT_ROUSABLE', 'SEDATED', 'UNCONSCIOUS', 'UNRESPONSIVE');

-- CreateEnum
CREATE TYPE "AirwayStatus" AS ENUM ('PATENT', 'MAINTAINED', 'COMPROMISED', 'INTUBATED', 'OXYGEN_THERAPY');

-- CreateEnum
CREATE TYPE "RedAlertType" AS ENUM ('MISSING_DOCUMENTATION', 'ABNORMAL_VITALS', 'CONSENT_ISSUE', 'SURGICAL_SITE_DISCREPANCY', 'ALLERGY_CONCERN', 'FASTING_VIOLATION', 'IDENTITY_MISMATCH', 'PACU_COMPLICATION', 'RECOVERY_CONCERN', 'OTHER');

-- CreateEnum
CREATE TYPE "CancellationCategory" AS ENUM ('PATIENT_CONDITION', 'EQUIPMENT_FAILURE', 'STAFF_UNAVAILABILITY', 'EMERGENCY_PRIORITY', 'PATIENT_REQUEST', 'ADMINISTRATIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "MortalityLocation" AS ENUM ('PREOPERATIVE', 'INTRAOPERATIVE', 'POSTOPERATIVE_RECOVERY', 'POSTOPERATIVE_WARD');

-- CreateEnum
CREATE TYPE "PatientLocation" AS ENUM ('WARD', 'HOLDING_AREA', 'THEATRE_SUITE', 'RECOVERY');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "TheatreSuiteStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'RESERVED');

-- CreateEnum
CREATE TYPE "AllocationType" AS ENUM ('SURGERY', 'MAINTENANCE', 'EMERGENCY', 'RESERVED');

-- CreateEnum
CREATE TYPE "TheatreSetupStatus" AS ENUM ('COLLECTED', 'RETURNED', 'IN_USE');

-- CreateEnum
CREATE TYPE "ExtraRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FULFILLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "staffId" TEXT,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "phoneNumber" TEXT,
    "department" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ItemCategory" NOT NULL,
    "description" TEXT,
    "unitCostPrice" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reorderLevel" INTEGER NOT NULL DEFAULT 10,
    "supplier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_records" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "costPrice" DECIMAL(10,2) NOT NULL,
    "totalCost" DECIMAL(10,2) NOT NULL,
    "supplier" TEXT NOT NULL,
    "suppliedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supply_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_logs" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "MaintenanceStatus" NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "completedDate" TIMESTAMP(3),
    "technician" TEXT,
    "cost" DECIMAL(10,2),
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "folderNumber" TEXT NOT NULL,
    "ptNumber" TEXT,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" TEXT NOT NULL,
    "ward" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surgeries" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "surgeonId" TEXT NOT NULL,
    "assistantSurgeonId" TEXT,
    "anesthetistId" TEXT,
    "scrubNurseId" TEXT,
    "subspecialty" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "indication" TEXT NOT NULL,
    "procedureName" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "scheduledTime" TEXT NOT NULL,
    "status" "SurgeryStatus" NOT NULL DEFAULT 'SCHEDULED',
    "surgeryType" "SurgeryType" NOT NULL DEFAULT 'ELECTIVE',
    "readinessStatus" "SurgeryReadinessStatus" NOT NULL DEFAULT 'PENDING_CHECKS',
    "anesthesiaType" "AnesthesiaType",
    "needICU" BOOLEAN NOT NULL DEFAULT false,
    "needBloodTransfusion" BOOLEAN NOT NULL DEFAULT false,
    "needDiathermy" BOOLEAN NOT NULL DEFAULT false,
    "needStereo" BOOLEAN NOT NULL DEFAULT false,
    "needMontrellMattress" BOOLEAN NOT NULL DEFAULT false,
    "needStirups" BOOLEAN NOT NULL DEFAULT false,
    "needPneumaticTourniquet" BOOLEAN NOT NULL DEFAULT false,
    "needCArm" BOOLEAN NOT NULL DEFAULT false,
    "needMicroscope" BOOLEAN NOT NULL DEFAULT false,
    "needSuction" BOOLEAN NOT NULL DEFAULT false,
    "otherSpecialNeeds" TEXT,
    "remarks" TEXT,
    "totalItemsCost" DECIMAL(10,2),
    "patientCharge" DECIMAL(10,2),
    "depositAmount" DECIMAL(10,2),
    "depositConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "knifeOnSkinTime" TIMESTAMP(3),
    "surgeryEndTime" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "actualStartTime" TIMESTAMP(3),
    "actualEndTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "surgeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surgery_items" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "totalCost" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surgery_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "who_checklists" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "patientConfirmed" BOOLEAN,
    "siteMarked" BOOLEAN,
    "anesthesiaChecked" BOOLEAN,
    "pulseOximeterOn" BOOLEAN,
    "allergyChecked" BOOLEAN,
    "signInNotes" TEXT,
    "teamIntroduced" BOOLEAN,
    "procedureConfirmed" BOOLEAN,
    "criticalStepsReviewed" BOOLEAN,
    "equipmentConcerns" BOOLEAN,
    "antibioticGiven" BOOLEAN,
    "imagingDisplayed" BOOLEAN,
    "timeOutNotes" TEXT,
    "procedureRecorded" BOOLEAN,
    "instrumentCountCorrect" BOOLEAN,
    "specimenLabeled" BOOLEAN,
    "equipmentProblems" BOOLEAN,
    "recoveryPlan" BOOLEAN,
    "signOutNotes" TEXT,
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "who_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preoperative_fitness_assessments" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "assessmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diabetes" BOOLEAN NOT NULL DEFAULT false,
    "hypertension" BOOLEAN NOT NULL DEFAULT false,
    "heartDisease" BOOLEAN NOT NULL DEFAULT false,
    "asthma" BOOLEAN NOT NULL DEFAULT false,
    "kidneyDisease" BOOLEAN NOT NULL DEFAULT false,
    "liverDisease" BOOLEAN NOT NULL DEFAULT false,
    "otherComorbidities" TEXT,
    "currentMedications" TEXT,
    "allergies" TEXT,
    "asaScore" INTEGER,
    "fitnessLevel" TEXT,
    "recommendations" TEXT,
    "assessedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preoperative_fitness_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_transfers" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "fromLocation" "PatientLocation" NOT NULL,
    "toLocation" "PatientLocation" NOT NULL,
    "transferTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transferredBy" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "patient_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_cancellations" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "category" "CancellationCategory" NOT NULL,
    "detailedNotes" TEXT NOT NULL,
    "cancelledBy" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT,
    "changes" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theatre_suites" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "equipment" TEXT,
    "status" "TheatreSuiteStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "theatre_suites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theatre_allocations" (
    "id" TEXT NOT NULL,
    "theatreId" TEXT NOT NULL,
    "surgeryId" TEXT,
    "allocationType" "AllocationType" NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "allocatedBy" TEXT NOT NULL,
    "notes" TEXT,
    "equipment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "theatre_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mortalities" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "timeOfDeath" TIMESTAMP(3) NOT NULL,
    "location" "MortalityLocation" NOT NULL,
    "causeOfDeath" TEXT NOT NULL,
    "contributingFactors" TEXT,
    "resuscitationAttempted" BOOLEAN NOT NULL DEFAULT false,
    "resuscitationDetails" TEXT,
    "reportedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mortalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mortality_audits" (
    "id" TEXT NOT NULL,
    "mortalityId" TEXT NOT NULL,
    "auditDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedBy" TEXT NOT NULL,
    "findings" TEXT NOT NULL,
    "preventability" TEXT,
    "recommendations" TEXT,
    "actionsTaken" TEXT,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mortality_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theatre_setups" (
    "id" TEXT NOT NULL,
    "theatreId" TEXT NOT NULL,
    "collectedBy" TEXT NOT NULL,
    "setupDate" TIMESTAMP(3) NOT NULL,
    "collectionTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TheatreSetupStatus" NOT NULL DEFAULT 'COLLECTED',
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "location" TEXT,
    "spiritQuantity" INTEGER NOT NULL DEFAULT 0,
    "savlonQuantity" INTEGER NOT NULL DEFAULT 0,
    "povidoneQuantity" INTEGER NOT NULL DEFAULT 0,
    "faceMaskQuantity" INTEGER NOT NULL DEFAULT 0,
    "nursesCapQuantity" INTEGER NOT NULL DEFAULT 0,
    "cssdGauzeQuantity" INTEGER NOT NULL DEFAULT 0,
    "cssdCottonQuantity" INTEGER NOT NULL DEFAULT 0,
    "surgicalBladesQuantity" INTEGER NOT NULL DEFAULT 0,
    "suctionTubbingsQuantity" INTEGER NOT NULL DEFAULT 0,
    "disposablesQuantity" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "theatre_setups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theatre_setup_returns" (
    "id" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "returnedBy" TEXT NOT NULL,
    "returnTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spiritReturned" INTEGER NOT NULL DEFAULT 0,
    "savlonReturned" INTEGER NOT NULL DEFAULT 0,
    "povidoneReturned" INTEGER NOT NULL DEFAULT 0,
    "faceMaskReturned" INTEGER NOT NULL DEFAULT 0,
    "nursesCapReturned" INTEGER NOT NULL DEFAULT 0,
    "cssdGauzeReturned" INTEGER NOT NULL DEFAULT 0,
    "cssdCottonReturned" INTEGER NOT NULL DEFAULT 0,
    "surgicalBladesReturned" INTEGER NOT NULL DEFAULT 0,
    "suctionTubbingsReturned" INTEGER NOT NULL DEFAULT 0,
    "disposablesReturned" INTEGER NOT NULL DEFAULT 0,
    "returnReason" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "theatre_setup_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theatre_extra_requests" (
    "id" TEXT NOT NULL,
    "theatreId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ExtraRequestStatus" NOT NULL DEFAULT 'PENDING',
    "itemName" TEXT NOT NULL,
    "quantityRequested" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "urgency" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "quantityApproved" INTEGER,
    "rejectionReason" TEXT,
    "fulfilledBy" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "quantityFulfilled" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "theatre_extra_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_consumables" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "stockLevel" INTEGER NOT NULL,
    "reorderLevel" INTEGER NOT NULL DEFAULT 10,
    "expiryDate" TIMESTAMP(3),
    "vendor" TEXT,
    "unitPrice" DECIMAL(10,2),
    "batchNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_consumables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumable_consumptions" (
    "id" TEXT NOT NULL,
    "consumableId" TEXT NOT NULL,
    "surgeryId" TEXT,
    "scrubNurseId" TEXT NOT NULL,
    "quantityIssued" INTEGER NOT NULL,
    "quantityReturned" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "consumable_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "serialNumber" TEXT,
    "manufacturer" TEXT,
    "vendor" TEXT,
    "assignedTheatreId" TEXT,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "maintenanceInterval" "MaintenanceInterval" NOT NULL DEFAULT 'AS_NEEDED',
    "lastServiceDate" TIMESTAMP(3),
    "nextServiceDue" TIMESTAMP(3),
    "warrantyExpiry" TIMESTAMP(3),
    "installationDate" TIMESTAMP(3),
    "responsibleStaff" TEXT,
    "contactNumber" TEXT,
    "contactEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_maintenance" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "completedDate" TIMESTAMP(3),
    "performedBy" TEXT,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "maintenanceType" TEXT NOT NULL,
    "findings" TEXT,
    "actionsTaken" TEXT,
    "nextServiceDate" TIMESTAMP(3),
    "cost" DECIMAL(10,2),
    "letterGenerated" BOOLEAN NOT NULL DEFAULT false,
    "letterSentDate" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_equipment_status" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "logDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "EquipmentStatus" NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "comments" TEXT,
    "faultReported" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "daily_equipment_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fault_reports" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT,
    "reportedBy" TEXT NOT NULL,
    "faultType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "FaultPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "FaultStatus" NOT NULL DEFAULT 'REPORTED',
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "alertsSent" INTEGER NOT NULL DEFAULT 0,
    "lastAlertSent" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fault_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_movements" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "phase" "PatientMovementPhase" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT,
    "notes" TEXT,

    CONSTRAINT "patient_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_reports" (
    "id" TEXT NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "priority" TEXT,
    "assignedTo" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "actionUrl" TEXT,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "system_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preoperative_safety_checks" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "whoChecklistComplete" BOOLEAN NOT NULL DEFAULT false,
    "dvtRiskAssessed" BOOLEAN NOT NULL DEFAULT false,
    "bleedingRiskAssessed" BOOLEAN NOT NULL DEFAULT false,
    "medicationCleared" BOOLEAN NOT NULL DEFAULT false,
    "depositConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "allChecksComplete" BOOLEAN NOT NULL DEFAULT false,
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preoperative_safety_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holding_area_assessments" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "arrivalTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedBy" TEXT NOT NULL,
    "status" "HoldingAreaStatus" NOT NULL DEFAULT 'ARRIVED',
    "patientIdentityConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "identityVerificationMethod" TEXT,
    "identityNotes" TEXT,
    "surgicalSiteMarked" BOOLEAN NOT NULL DEFAULT false,
    "surgicalSiteConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "procedureConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "lateralityConfirmed" BOOLEAN,
    "siteVerificationNotes" TEXT,
    "consentFormPresent" BOOLEAN NOT NULL DEFAULT false,
    "consentFormSigned" BOOLEAN NOT NULL DEFAULT false,
    "consentUnderstandingConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "consentNotes" TEXT,
    "allergyStatusChecked" BOOLEAN NOT NULL DEFAULT false,
    "hasAllergies" BOOLEAN NOT NULL DEFAULT false,
    "allergyDetails" TEXT,
    "allergyBandPresent" BOOLEAN,
    "fastingStatusChecked" BOOLEAN NOT NULL DEFAULT false,
    "fastingCompliant" BOOLEAN NOT NULL DEFAULT false,
    "lastOralIntakeTime" TIMESTAMP(3),
    "lastOralIntakeType" TEXT,
    "fastingNotes" TEXT,
    "temperature" DECIMAL(4,1),
    "heartRate" INTEGER,
    "bloodPressureSystolic" INTEGER,
    "bloodPressureDiastolic" INTEGER,
    "respiratoryRate" INTEGER,
    "oxygenSaturation" INTEGER,
    "bloodGlucose" DECIMAL(5,2),
    "vitalSignsNormal" BOOLEAN NOT NULL DEFAULT true,
    "vitalSignsConcerns" TEXT,
    "preOpAssessmentPresent" BOOLEAN NOT NULL DEFAULT false,
    "labResultsPresent" BOOLEAN NOT NULL DEFAULT false,
    "imagingPresent" BOOLEAN,
    "ecgPresent" BOOLEAN,
    "crossMatchPresent" BOOLEAN,
    "anesthesiaAssessmentPresent" BOOLEAN NOT NULL DEFAULT false,
    "medicationChartPresent" BOOLEAN NOT NULL DEFAULT false,
    "allDocumentationComplete" BOOLEAN NOT NULL DEFAULT false,
    "missingDocumentation" TEXT,
    "preMedicationGiven" BOOLEAN NOT NULL DEFAULT false,
    "preMedicationDetails" TEXT,
    "ivAccessEstablished" BOOLEAN NOT NULL DEFAULT false,
    "ivSiteLocation" TEXT,
    "discrepancyDetected" BOOLEAN NOT NULL DEFAULT false,
    "redAlertTriggered" BOOLEAN NOT NULL DEFAULT false,
    "redAlertType" "RedAlertType",
    "redAlertDescription" TEXT,
    "redAlertTime" TIMESTAMP(3),
    "redAlertResolvedBy" TEXT,
    "redAlertResolvedAt" TIMESTAMP(3),
    "redAlertResolution" TEXT,
    "clearedForTheatre" BOOLEAN NOT NULL DEFAULT false,
    "clearanceTime" TIMESTAMP(3),
    "clearanceNotes" TEXT,
    "transferredToTheatre" BOOLEAN NOT NULL DEFAULT false,
    "transferTime" TIMESTAMP(3),
    "handoverNurse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holding_area_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holding_area_red_alerts" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "alertType" "RedAlertType" NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "description" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "surgeonNotified" BOOLEAN NOT NULL DEFAULT false,
    "anesthetistNotified" BOOLEAN NOT NULL DEFAULT false,
    "coordinatorNotified" BOOLEAN NOT NULL DEFAULT false,
    "notificationsSentAt" TIMESTAMP(3),
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionAction" TEXT,
    "resolutionNotes" TEXT,

    CONSTRAINT "holding_area_red_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intraoperative_records" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "theatreEntryTime" TIMESTAMP(3),
    "patientPositioning" TEXT,
    "timeOut" TIMESTAMP(3),
    "timeOutConfirmedBy" TEXT,
    "anesthesiaStart" TIMESTAMP(3),
    "anesthesiaType" "AnesthesiaType",
    "anesthetistId" TEXT,
    "nurseAnesthetistId" TEXT,
    "anesthesiaNotes" TEXT,
    "primarySurgeonId" TEXT NOT NULL,
    "assistantSurgeonIds" TEXT,
    "scrubNurseId" TEXT,
    "circulatingNurseId" TEXT,
    "knifeToSkinTime" TIMESTAMP(3),
    "procedureStartTime" TIMESTAMP(3),
    "procedureEndTime" TIMESTAMP(3),
    "closureStartTime" TIMESTAMP(3),
    "closureEndTime" TIMESTAMP(3),
    "eventsLog" TEXT,
    "complicationsOccurred" BOOLEAN NOT NULL DEFAULT false,
    "complicationDetails" TEXT,
    "specimensSent" BOOLEAN NOT NULL DEFAULT false,
    "specimenDetails" TEXT,
    "medicationsAdministered" TEXT,
    "fluidsAdministered" TEXT,
    "bloodProductsGiven" BOOLEAN NOT NULL DEFAULT false,
    "bloodProductDetails" TEXT,
    "instrumentCountCorrect" BOOLEAN,
    "swabCountCorrect" BOOLEAN,
    "needleCountCorrect" BOOLEAN,
    "countDiscrepancy" TEXT,
    "drainsInserted" BOOLEAN NOT NULL DEFAULT false,
    "drainDetails" TEXT,
    "catheterInserted" BOOLEAN NOT NULL DEFAULT false,
    "catheterType" TEXT,
    "estimatedBloodLoss" INTEGER,
    "urineOutput" INTEGER,
    "transferToPACUTime" TIMESTAMP(3),
    "handoverToRecoveryNurse" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intraoperative_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pacu_assessments" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "admissionTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedBy" TEXT NOT NULL,
    "handoverFrom" TEXT,
    "consciousnessLevel" "ConsciousnessLevel" NOT NULL,
    "airwayStatus" "AirwayStatus" NOT NULL,
    "breathingPattern" TEXT,
    "oxygenTherapy" BOOLEAN NOT NULL DEFAULT false,
    "oxygenFlowRate" DECIMAL(4,1),
    "heartRateOnAdmission" INTEGER,
    "bloodPressureOnAdmission" TEXT,
    "peripheralPerfusion" TEXT,
    "capillaryRefillTime" TEXT,
    "painScoreOnAdmission" INTEGER,
    "painLocation" TEXT,
    "painManagedAdequately" BOOLEAN NOT NULL DEFAULT false,
    "surgicalSiteCondition" TEXT,
    "dressingIntact" BOOLEAN NOT NULL DEFAULT true,
    "drainsPresent" BOOLEAN NOT NULL DEFAULT false,
    "drainType" TEXT,
    "drainOutput" TEXT,
    "ivFluidsRunning" BOOLEAN NOT NULL DEFAULT false,
    "fluidType" TEXT,
    "fluidRate" TEXT,
    "urineOutput" INTEGER,
    "catheterInSitu" BOOLEAN NOT NULL DEFAULT false,
    "temperatureOnAdmission" DECIMAL(4,1),
    "normothermic" BOOLEAN NOT NULL DEFAULT true,
    "warmingMeasures" TEXT,
    "nauseaPresent" BOOLEAN NOT NULL DEFAULT false,
    "vomitingOccurred" BOOLEAN NOT NULL DEFAULT false,
    "antiemeticsGiven" BOOLEAN NOT NULL DEFAULT false,
    "complicationsDetected" BOOLEAN NOT NULL DEFAULT false,
    "complicationDetails" TEXT,
    "redAlertTriggered" BOOLEAN NOT NULL DEFAULT false,
    "redAlertType" "RedAlertType",
    "redAlertDescription" TEXT,
    "redAlertTime" TIMESTAMP(3),
    "redAlertResolvedBy" TEXT,
    "redAlertResolvedAt" TIMESTAMP(3),
    "dischargeReadiness" "PACUDischargeReadiness" NOT NULL DEFAULT 'NOT_READY',
    "dischargeTime" TIMESTAMP(3),
    "dischargedTo" TEXT,
    "dischargeVitalsStable" BOOLEAN NOT NULL DEFAULT false,
    "dischargePainControlled" BOOLEAN NOT NULL DEFAULT false,
    "dischargeFullyConscious" BOOLEAN NOT NULL DEFAULT false,
    "dischargeNauseaFree" BOOLEAN NOT NULL DEFAULT false,
    "medicationsGivenInPACU" TEXT,
    "totalTimeInPACU" INTEGER,
    "dischargeNotes" TEXT,
    "warningSignsExplained" BOOLEAN NOT NULL DEFAULT false,
    "wardNurseHandover" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pacu_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pacu_vital_signs" (
    "id" TEXT NOT NULL,
    "pacuAssessmentId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT NOT NULL,
    "consciousnessLevel" "ConsciousnessLevel",
    "heartRate" INTEGER,
    "bloodPressure" TEXT,
    "respiratoryRate" INTEGER,
    "oxygenSaturation" INTEGER,
    "temperature" DECIMAL(4,1),
    "painScore" INTEGER,
    "notes" TEXT,
    "interventionRequired" BOOLEAN NOT NULL DEFAULT false,
    "interventionDetails" TEXT,

    CONSTRAINT "pacu_vital_signs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pacu_red_alerts" (
    "id" TEXT NOT NULL,
    "pacuAssessmentId" TEXT NOT NULL,
    "alertType" "RedAlertType" NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "description" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "surgeonNotified" BOOLEAN NOT NULL DEFAULT false,
    "anesthetistNotified" BOOLEAN NOT NULL DEFAULT false,
    "wardNotified" BOOLEAN NOT NULL DEFAULT false,
    "notificationsSentAt" TIMESTAMP(3),
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionAction" TEXT,

    CONSTRAINT "pacu_red_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_staffId_key" ON "users"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "patients_folderNumber_key" ON "patients"("folderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "patients_ptNumber_key" ON "patients"("ptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "case_cancellations_surgeryId_key" ON "case_cancellations"("surgeryId");

-- CreateIndex
CREATE UNIQUE INDEX "theatre_suites_name_key" ON "theatre_suites"("name");

-- CreateIndex
CREATE UNIQUE INDEX "mortalities_surgeryId_key" ON "mortalities"("surgeryId");

-- CreateIndex
CREATE UNIQUE INDEX "mortality_audits_mortalityId_key" ON "mortality_audits"("mortalityId");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_serialNumber_key" ON "equipment"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "preoperative_safety_checks_surgeryId_key" ON "preoperative_safety_checks"("surgeryId");

-- CreateIndex
CREATE UNIQUE INDEX "holding_area_assessments_surgeryId_key" ON "holding_area_assessments"("surgeryId");

-- CreateIndex
CREATE UNIQUE INDEX "intraoperative_records_surgeryId_key" ON "intraoperative_records"("surgeryId");

-- CreateIndex
CREATE UNIQUE INDEX "pacu_assessments_surgeryId_key" ON "pacu_assessments"("surgeryId");

-- AddForeignKey
ALTER TABLE "supply_records" ADD CONSTRAINT "supply_records_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surgeries" ADD CONSTRAINT "surgeries_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surgeries" ADD CONSTRAINT "surgeries_surgeonId_fkey" FOREIGN KEY ("surgeonId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surgeries" ADD CONSTRAINT "surgeries_assistantSurgeonId_fkey" FOREIGN KEY ("assistantSurgeonId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surgeries" ADD CONSTRAINT "surgeries_anesthetistId_fkey" FOREIGN KEY ("anesthetistId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surgery_items" ADD CONSTRAINT "surgery_items_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surgery_items" ADD CONSTRAINT "surgery_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "who_checklists" ADD CONSTRAINT "who_checklists_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "who_checklists" ADD CONSTRAINT "who_checklists_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preoperative_fitness_assessments" ADD CONSTRAINT "preoperative_fitness_assessments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_transfers" ADD CONSTRAINT "patient_transfers_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_transfers" ADD CONSTRAINT "patient_transfers_transferredBy_fkey" FOREIGN KEY ("transferredBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_cancellations" ADD CONSTRAINT "case_cancellations_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_cancellations" ADD CONSTRAINT "case_cancellations_cancelledBy_fkey" FOREIGN KEY ("cancelledBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_allocations" ADD CONSTRAINT "theatre_allocations_theatreId_fkey" FOREIGN KEY ("theatreId") REFERENCES "theatre_suites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mortalities" ADD CONSTRAINT "mortalities_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mortalities" ADD CONSTRAINT "mortalities_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mortality_audits" ADD CONSTRAINT "mortality_audits_mortalityId_fkey" FOREIGN KEY ("mortalityId") REFERENCES "mortalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_setups" ADD CONSTRAINT "theatre_setups_theatreId_fkey" FOREIGN KEY ("theatreId") REFERENCES "theatre_suites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_setups" ADD CONSTRAINT "theatre_setups_collectedBy_fkey" FOREIGN KEY ("collectedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_setup_returns" ADD CONSTRAINT "theatre_setup_returns_setupId_fkey" FOREIGN KEY ("setupId") REFERENCES "theatre_setups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_setup_returns" ADD CONSTRAINT "theatre_setup_returns_returnedBy_fkey" FOREIGN KEY ("returnedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_extra_requests" ADD CONSTRAINT "theatre_extra_requests_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_consumptions" ADD CONSTRAINT "consumable_consumptions_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "store_consumables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_consumptions" ADD CONSTRAINT "consumable_consumptions_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_assignedTheatreId_fkey" FOREIGN KEY ("assignedTheatreId") REFERENCES "theatre_suites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_maintenance" ADD CONSTRAINT "equipment_maintenance_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_equipment_status" ADD CONSTRAINT "daily_equipment_status_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fault_reports" ADD CONSTRAINT "fault_reports_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_movements" ADD CONSTRAINT "patient_movements_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preoperative_safety_checks" ADD CONSTRAINT "preoperative_safety_checks_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holding_area_assessments" ADD CONSTRAINT "holding_area_assessments_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holding_area_assessments" ADD CONSTRAINT "holding_area_assessments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holding_area_red_alerts" ADD CONSTRAINT "holding_area_red_alerts_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "holding_area_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intraoperative_records" ADD CONSTRAINT "intraoperative_records_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacu_assessments" ADD CONSTRAINT "pacu_assessments_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacu_assessments" ADD CONSTRAINT "pacu_assessments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacu_vital_signs" ADD CONSTRAINT "pacu_vital_signs_pacuAssessmentId_fkey" FOREIGN KEY ("pacuAssessmentId") REFERENCES "pacu_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacu_red_alerts" ADD CONSTRAINT "pacu_red_alerts_pacuAssessmentId_fkey" FOREIGN KEY ("pacuAssessmentId") REFERENCES "pacu_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
