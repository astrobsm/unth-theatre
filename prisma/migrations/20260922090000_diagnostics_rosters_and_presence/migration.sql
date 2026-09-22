-- ============================================================
-- The departments a surgical case waits on, and whether their staff are here
-- ------------------------------------------------------------
-- Four things, all of them the same problem seen from different ends: an
-- operation is held up by what must be obtained before it can begin, and the
-- system could not name who was meant to obtain it.
--
-- lab_result_reports    the result as the LABORATORY issues it, by discipline,
--                       for elective and emergency cases alike
-- duty_captures         who was on duty at the moment a request went in
-- facility_geofences    the perimeter presence is measured against
-- staff_presence_checks whether a person on duty is inside it
--
-- Plus six roles, six roster categories, and somewhere for a radiologist to
-- attach the report rather than retype it.
-- ============================================================

-- ------------------------------------------------------------
-- Roles
-- ------------------------------------------------------------
-- The three laboratory disciplines are kept apart rather than under one
-- LABORATORY_STAFF because a haematology result is verified by a haematology
-- scientist, and a worklist showing every discipline to everybody is a
-- worklist nobody owns.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'HAEMATOLOGY_SCIENTIST';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CHEMICAL_PATHOLOGY_SCIENTIST';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MICROBIOLOGY_SCIENTIST';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'LABORATORY_TECHNICIAN';
-- Stationed in the Theatre Complex under the restructuring proposal of
-- 8th September 2026, paragraph 3, and therefore rostered there.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ELECTRICAL_TECHNICIAN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'BIOMEDICAL_TECHNICIAN';

-- ------------------------------------------------------------
-- Roster categories
-- ------------------------------------------------------------
-- Until these existed a request could be raised at 02:00 against a department
-- whose duty staff the system had no way of naming, and the chase fell to
-- whoever was already standing in the theatre.
ALTER TYPE "StaffCategory" ADD VALUE IF NOT EXISTS 'LABORATORY_SCIENTISTS';
ALTER TYPE "StaffCategory" ADD VALUE IF NOT EXISTS 'LABORATORY_TECHNICIANS';
ALTER TYPE "StaffCategory" ADD VALUE IF NOT EXISTS 'RADIOLOGISTS';
ALTER TYPE "StaffCategory" ADD VALUE IF NOT EXISTS 'RADIOGRAPHERS';
ALTER TYPE "StaffCategory" ADD VALUE IF NOT EXISTS 'BIOMEDICAL_ENGINEERS';
ALTER TYPE "StaffCategory" ADD VALUE IF NOT EXISTS 'ELECTRICAL_TECHNICIANS';

-- ------------------------------------------------------------
-- Laboratory results
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LabDiscipline') THEN
    CREATE TYPE "LabDiscipline" AS ENUM (
      'HAEMATOLOGY', 'CHEMICAL_PATHOLOGY', 'MICROBIOLOGY_IMMUNOLOGY',
      'BLOOD_BANK', 'HISTOPATHOLOGY', 'OTHER'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LabResultStatus') THEN
    -- AMENDED rather than deleted: somebody may have operated on the strength
    -- of the result being replaced.
    CREATE TYPE "LabResultStatus" AS ENUM ('PROVISIONAL', 'VERIFIED', 'AMENDED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DutyCaptureKind') THEN
    CREATE TYPE "DutyCaptureKind" AS ENUM (
      'IMAGING_REQUEST', 'LAB_REQUEST', 'LAB_RESULT', 'FAULT_REPORT'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PresenceSource') THEN
    CREATE TYPE "PresenceSource" AS ENUM ('APP_HEARTBEAT', 'MANUAL', 'SUPERVISOR');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "lab_result_reports" (
  "id"                    TEXT NOT NULL,
  -- Soft references. A result may exist for a patient with no booked case, and
  -- must not vanish if a case is later cancelled.
  "patientId"             TEXT NOT NULL,
  "surgeryId"             TEXT,
  "emergencyLabRequestId" TEXT,
  "discipline"            "LabDiscipline" NOT NULL,
  "testName"              TEXT NOT NULL,
  -- Stored, not derived: the urgency the lab was working to at the moment of
  -- issue is the fact, and a case can be rescheduled afterwards.
  "urgent"                BOOLEAN NOT NULL DEFAULT false,
  "resultSummary"         TEXT NOT NULL,
  "resultValues"          TEXT,
  "referenceRange"        TEXT,
  "attachment"            TEXT,
  "attachmentName"        TEXT,
  "attachmentType"        TEXT,
  "abnormal"              BOOLEAN NOT NULL DEFAULT false,
  -- Being in the system is not the same as somebody having read it.
  "critical"              BOOLEAN NOT NULL DEFAULT false,
  "criticalAckAt"         TIMESTAMP(3),
  "criticalAckById"       TEXT,
  "criticalAckByName"     TEXT,
  "status"                "LabResultStatus" NOT NULL DEFAULT 'PROVISIONAL',
  "enteredById"           TEXT NOT NULL,
  "enteredByName"         TEXT NOT NULL,
  "enteredAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedById"          TEXT,
  "verifiedByName"        TEXT,
  "verifiedAt"            TIMESTAMP(3),
  "amendmentReason"       TEXT,
  "notes"                 TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version"          INTEGER NOT NULL DEFAULT 0,
  "sync_origin"           TEXT,
  "sync_hlc"              TEXT,
  CONSTRAINT "lab_result_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "lab_result_reports_patientId_idx" ON "lab_result_reports" ("patientId");
CREATE INDEX IF NOT EXISTS "lab_result_reports_surgeryId_idx" ON "lab_result_reports" ("surgeryId");
CREATE INDEX IF NOT EXISTS "lab_result_reports_discipline_status_enteredAt_idx"
  ON "lab_result_reports" ("discipline", "status", "enteredAt");
-- The one that matters clinically: a critical result nobody has acknowledged.
CREATE INDEX IF NOT EXISTS "lab_result_reports_critical_criticalAckAt_idx"
  ON "lab_result_reports" ("critical", "criticalAckAt");

-- ------------------------------------------------------------
-- The radiologist's own report document
-- ------------------------------------------------------------
-- Text alone was all this carried, and a radiologist reporting a CT has a
-- document to hand over rather than a paragraph to retype.
ALTER TABLE "imaging_requests" ADD COLUMN IF NOT EXISTS "reportAttachment"     TEXT;
ALTER TABLE "imaging_requests" ADD COLUMN IF NOT EXISTS "reportAttachmentName" TEXT;
ALTER TABLE "imaging_requests" ADD COLUMN IF NOT EXISTS "reportAttachmentType" TEXT;

-- ------------------------------------------------------------
-- Who was on duty when the request went in
-- ------------------------------------------------------------
-- The roster is read AT THE MOMENT the request is made and the answer stored
-- with it, so a roster edited afterwards does not rewrite who was on when the
-- theatre called.
CREATE TABLE IF NOT EXISTS "duty_captures" (
  "id"          TEXT NOT NULL,
  "kind"        "DutyCaptureKind" NOT NULL,
  "subjectId"   TEXT NOT NULL,
  "department"  TEXT NOT NULL,
  "shift"       TEXT NOT NULL,
  "rosterDate"  DATE NOT NULL,
  -- Snapshotted as JSON text rather than joined, because the point is what the
  -- roster said THEN.
  "staffOnDuty" TEXT NOT NULL,
  -- Zero is the finding that matters: the request went to a department with
  -- nobody rostered.
  "staffCount"  INTEGER NOT NULL DEFAULT 0,
  "capturedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version" INTEGER NOT NULL DEFAULT 0,
  "sync_origin"  TEXT,
  "sync_hlc"     TEXT,
  CONSTRAINT "duty_captures_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "duty_captures_kind_subjectId_idx" ON "duty_captures" ("kind", "subjectId");
CREATE INDEX IF NOT EXISTS "duty_captures_rosterDate_department_idx"
  ON "duty_captures" ("rosterDate", "department");

-- ------------------------------------------------------------
-- Presence during a duty period
-- ------------------------------------------------------------
-- The availability board records what a person says they are; it cannot tell
-- whether they are in the building. This records whether they are inside the
-- facility perimeter, checked at intervals WHILE ON DUTY.
--
-- It is a presence record and not a movement trail. The question the theatre
-- needs answered is "is the on-call radiographer on site", and that is answered
-- by in or out. Coordinates are kept for the check that produced the answer,
-- because an unexplained absence nobody can check is worse than no record at
-- all, but nothing here maps where anybody went, and nothing is recorded
-- outside a duty period.
CREATE TABLE IF NOT EXISTS "facility_geofences" (
  "id"           TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "latitude"     DOUBLE PRECISION NOT NULL,
  "longitude"    DOUBLE PRECISION NOT NULL,
  -- Generous by default. A perimeter drawn too tightly reports the staff room
  -- as off site, and a presence record that cries wolf is switched off within
  -- a week.
  "radiusMetres" INTEGER NOT NULL DEFAULT 400,
  "active"       BOOLEAN NOT NULL DEFAULT true,
  "createdById"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version" INTEGER NOT NULL DEFAULT 0,
  "sync_origin"  TEXT,
  "sync_hlc"     TEXT,
  CONSTRAINT "facility_geofences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "facility_geofences_active_idx" ON "facility_geofences" ("active");

CREATE TABLE IF NOT EXISTS "staff_presence_checks" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "userName"   TEXT NOT NULL,
  "userRole"   TEXT,
  "rosterDate" DATE NOT NULL,
  "shift"      TEXT,
  "at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- NULL where the device would not give a position at all. That is a
  -- different fact from being away, and must never be displayed as absence.
  "onSite"     BOOLEAN,
  "latitude"   DOUBLE PRECISION,
  "longitude"  DOUBLE PRECISION,
  "distanceM"  INTEGER,
  "accuracyM"  INTEGER,
  "geofenceId" TEXT,
  "source"     "PresenceSource" NOT NULL DEFAULT 'APP_HEARTBEAT',
  -- The availability status at the moment of the check, so an "off site" can
  -- be read beside "Transporting patient", which explains it.
  "status"     TEXT,
  "note"       TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version" INTEGER NOT NULL DEFAULT 0,
  "sync_origin"  TEXT,
  "sync_hlc"     TEXT,
  CONSTRAINT "staff_presence_checks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "staff_presence_checks_userId_at_idx" ON "staff_presence_checks" ("userId", "at");
CREATE INDEX IF NOT EXISTS "staff_presence_checks_rosterDate_onSite_idx"
  ON "staff_presence_checks" ("rosterDate", "onSite");

-- ------------------------------------------------------------
-- Replication
-- ------------------------------------------------------------
-- A result issued on the theatre server during an outage must reach the cloud,
-- and a duty capture is evidence about a request that may be examined months
-- later. Presence checks replicate for the same reason: the board is read from
-- whichever node the supervisor happens to be on.
--
-- facility_geofences is reference data and travels so both nodes measure
-- against the same perimeter; two nodes with different perimeters would
-- disagree about who is on site, which is worse than no perimeter.
SELECT sync_enable_table('lab_result_reports');
SELECT sync_enable_table('duty_captures');
SELECT sync_enable_table('facility_geofences');
SELECT sync_enable_table('staff_presence_checks');
