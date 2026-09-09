-- ============================================================
-- Radiology workflow, and infection control with SSI surveillance
-- ------------------------------------------------------------
-- Two modules that have lived on paper.
--
-- Imaging for a theatre case is asked for by walking a card to radiology, and
-- the only record that it was asked for at all is that somebody remembers. The
-- list then runs without knowing whether the film exists.
--
-- Surgical site infection cannot be rated from case notes. A rate needs a
-- denominator — the operations actually done — and a numerator gathered by
-- looking at wounds on a schedule, whether or not anybody suspected anything.
--
-- Every table here carries the sync columns AND the capture trigger. Adding a
-- table without the trigger is how three previous features came to exist on
-- one node only; enabling it at creation is the whole of the fix.
-- ============================================================

-- ---------------------------------------------------------------------------
-- Roles. A radiographer is not a theatre store keeper, and reusing an existing
-- role to avoid a migration is how permissions become meaningless.
-- ---------------------------------------------------------------------------
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'RADIOLOGIST';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'RADIOGRAPHER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'INFECTION_CONTROL_NURSE';

-- ---------------------------------------------------------------------------
-- Radiology
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "ImagingModality" AS ENUM ('XRAY','CT','MRI','ULTRASOUND','FLUOROSCOPY','MAMMOGRAPHY','INTERVENTIONAL','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ImagingUrgency" AS ENUM ('ROUTINE','URGENT','EMERGENCY','INTRA_OPERATIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ImagingStatus" AS ENUM ('REQUESTED','ACCEPTED','SCHEDULED','PERFORMED','REPORTED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "imaging_requests" (
  "id"                TEXT NOT NULL,
  "surgeryId"         TEXT,
  "patientId"         TEXT NOT NULL,
  "modality"          "ImagingModality" NOT NULL,
  "bodyRegion"        TEXT NOT NULL,
  "clinicalQuestion"  TEXT NOT NULL,
  "urgency"           "ImagingUrgency" NOT NULL DEFAULT 'ROUTINE',
  "status"            "ImagingStatus"  NOT NULL DEFAULT 'REQUESTED',

  "contrastRequested" BOOLEAN NOT NULL DEFAULT false,
  "pregnancyExcluded" BOOLEAN,
  "creatinineChecked" BOOLEAN,
  "implantsDeclared"  BOOLEAN,

  "requestedById"     TEXT NOT NULL,
  "requestedByName"   TEXT NOT NULL,
  "requestedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "scheduledFor"      TIMESTAMP(3),
  "performedAt"       TIMESTAMP(3),
  "performedById"     TEXT,
  "performedByName"   TEXT,

  "reportText"        TEXT,
  "reportedAt"        TIMESTAMP(3),
  "reportedById"      TEXT,
  "reportedByName"    TEXT,

  "criticalFinding"   BOOLEAN NOT NULL DEFAULT false,
  "criticalAckAt"     TIMESTAMP(3),
  "criticalAckById"   TEXT,
  "criticalAckByName" TEXT,

  "cancelReason"      TEXT,
  "notes"             TEXT,

  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "sync_version"      INTEGER NOT NULL DEFAULT 0,
  "sync_origin"       TEXT,
  "sync_hlc"          TEXT,

  CONSTRAINT "imaging_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "imaging_requests_status_urgency_requestedAt_idx"
  ON "imaging_requests" ("status", "urgency", "requestedAt");
CREATE INDEX IF NOT EXISTS "imaging_requests_surgeryId_idx" ON "imaging_requests" ("surgeryId");
CREATE INDEX IF NOT EXISTS "imaging_requests_patientId_idx" ON "imaging_requests" ("patientId");
CREATE INDEX IF NOT EXISTS "imaging_requests_scheduledFor_idx" ON "imaging_requests" ("scheduledFor");

-- ---------------------------------------------------------------------------
-- SSI surveillance
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "WoundClass" AS ENUM ('CLEAN','CLEAN_CONTAMINATED','CONTAMINATED','DIRTY_INFECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SsiType" AS ENUM ('SUPERFICIAL_INCISIONAL','DEEP_INCISIONAL','ORGAN_SPACE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProphylaxisTiming" AS ENUM ('WITHIN_60_MIN','TOO_EARLY','TOO_LATE','NOT_GIVEN','UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SurveillanceStatus" AS ENUM ('OPEN','CLOSED_NO_INFECTION','CLOSED_INFECTION','LOST_TO_FOLLOW_UP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ssi_surveillance" (
  "id"                TEXT NOT NULL,
  "surgeryId"         TEXT NOT NULL,
  "patientId"         TEXT NOT NULL,

  "woundClass"        "WoundClass" NOT NULL,
  "asaGrade"          TEXT,
  "durationMinutes"   INTEGER,
  "implantPlaced"     BOOLEAN NOT NULL DEFAULT false,

  "prophylaxisGiven"  BOOLEAN,
  "prophylaxisAgent"  TEXT,
  "prophylaxisTiming" "ProphylaxisTiming" NOT NULL DEFAULT 'UNKNOWN',
  "redosedIfLong"     BOOLEAN,

  "status"            "SurveillanceStatus" NOT NULL DEFAULT 'OPEN',
  "infectionType"     "SsiType",
  "organism"          TEXT,
  "detectedOn"        TIMESTAMP(3),

  "followUpDueOn"     TIMESTAMP(3),
  "closedAt"          TIMESTAMP(3),
  "closedById"        TEXT,
  "notes"             TEXT,

  "openedById"        TEXT NOT NULL,
  "openedByName"      TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "sync_version"      INTEGER NOT NULL DEFAULT 0,
  "sync_origin"       TEXT,
  "sync_hlc"          TEXT,

  CONSTRAINT "ssi_surveillance_pkey" PRIMARY KEY ("id")
);

-- One surveillance record per operation: the denominator IS the operation, and
-- two records for one case would double-count it in every rate.
CREATE UNIQUE INDEX IF NOT EXISTS "ssi_surveillance_surgeryId_key"
  ON "ssi_surveillance" ("surgeryId");
CREATE INDEX IF NOT EXISTS "ssi_surveillance_status_followUpDueOn_idx"
  ON "ssi_surveillance" ("status", "followUpDueOn");
CREATE INDEX IF NOT EXISTS "ssi_surveillance_woundClass_idx" ON "ssi_surveillance" ("woundClass");
CREATE INDEX IF NOT EXISTS "ssi_surveillance_patientId_idx" ON "ssi_surveillance" ("patientId");

CREATE TABLE IF NOT EXISTS "ssi_assessments" (
  "id"               TEXT NOT NULL,
  "surveillanceId"   TEXT NOT NULL,

  "assessedOn"       TIMESTAMP(3) NOT NULL,
  "dayPostOp"        INTEGER NOT NULL,

  "infectionPresent" BOOLEAN NOT NULL DEFAULT false,
  "ssiType"          "SsiType",
  "signs"            TEXT,
  "organism"         TEXT,
  "treatment"        TEXT,
  "woundInspected"   BOOLEAN NOT NULL DEFAULT true,

  "assessedById"     TEXT NOT NULL,
  "assessedByName"   TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "sync_version"     INTEGER NOT NULL DEFAULT 0,
  "sync_origin"      TEXT,
  "sync_hlc"         TEXT,

  CONSTRAINT "ssi_assessments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ssi_assessments_surveillanceId_assessedOn_idx"
  ON "ssi_assessments" ("surveillanceId", "assessedOn");

DO $$ BEGIN
  ALTER TABLE "ssi_assessments"
    ADD CONSTRAINT "ssi_assessments_surveillanceId_fkey"
    FOREIGN KEY ("surveillanceId") REFERENCES "ssi_surveillance"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Infection prevention & control audits
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "IpcAuditType" AS ENUM
    ('HAND_HYGIENE','THEATRE_CLEANING','STERILISATION','WASTE_SEGREGATION',
     'PPE_COMPLIANCE','THEATRE_TRAFFIC','SHARPS_HANDLING','ENVIRONMENTAL_SWAB');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ipc_audits" (
  "id"             TEXT NOT NULL,
  "auditType"      "IpcAuditType" NOT NULL,
  "theatreId"      TEXT,
  "area"           TEXT,
  "auditDate"      TIMESTAMP(3) NOT NULL,

  "observations"   INTEGER NOT NULL,
  "compliant"      INTEGER NOT NULL,

  "findings"       TEXT,
  "actionsAgreed"  TEXT,
  "actionDueOn"    TIMESTAMP(3),
  "actionClosedAt" TIMESTAMP(3),

  "auditorId"      TEXT NOT NULL,
  "auditorName"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "sync_version"   INTEGER NOT NULL DEFAULT 0,
  "sync_origin"    TEXT,
  "sync_hlc"       TEXT,

  CONSTRAINT "ipc_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ipc_audits_auditType_auditDate_idx" ON "ipc_audits" ("auditType", "auditDate");
CREATE INDEX IF NOT EXISTS "ipc_audits_auditDate_idx" ON "ipc_audits" ("auditDate");

-- A count that exceeds what was observed is not a compliance rate, it is a
-- typo, and it produces percentages over 100 in every report downstream.
DO $$ BEGIN
  ALTER TABLE "ipc_audits"
    ADD CONSTRAINT "ipc_audits_compliant_within_observations"
    CHECK ("compliant" >= 0 AND "observations" >= 0 AND "compliant" <= "observations");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Capture, enabled at creation.
--
-- A table that replicates needs the trigger AND a policy entry in
-- lib/sync/syncPolicy.ts. Without the trigger the rows are never journalled and
-- live on one node forever; without the policy the peer answers UNKNOWN_TABLE
-- and the entries queue without ever landing. Both halves are done here and in
-- that file, together, because doing one is worse than doing neither.
-- ---------------------------------------------------------------------------
-- sync_enable_table(), not a hand-written CREATE TRIGGER.
--
-- It adds the sync columns if they are missing, drops both existing triggers
-- and installs the pair: BEFORE INSERT OR UPDATE, which stamps the row by
-- assigning to NEW, and a separate one for DELETE. A single
-- "BEFORE INSERT OR UPDATE OR DELETE" trigger — the obvious thing to write —
-- gets the delete case wrong, and scripts/lib-tests/syncCapture.test.ts reads
-- these calls to prove every classified table is actually captured, so a
-- hand-rolled trigger is invisible to the one check that would catch it.
SELECT sync_enable_table('imaging_requests');
SELECT sync_enable_table('ssi_surveillance');
SELECT sync_enable_table('ssi_assessments');
SELECT sync_enable_table('ipc_audits');
