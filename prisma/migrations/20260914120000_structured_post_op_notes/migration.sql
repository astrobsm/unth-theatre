-- ============================================================
-- The post-operative note becomes a record you can ask questions of
-- ------------------------------------------------------------
-- Until now an operation note was one free-text field. It was written into
-- audit_logs as action = 'POST_OP_NOTE' and appended to surgeries.remarks, and
-- that was all. Three consequences followed, and this migration exists for
-- them:
--
--   A nurse could not find an instruction. Position, feeding, mobilisation and
--   when to call the surgeon were somewhere inside a paragraph, or were not
--   there at all and nobody could tell which.
--
--   The hospital could not count anything. Not which preparation solutions are
--   used, not how many drains go in without a removal instruction, not whether
--   VTE prophylaxis was considered. Every one of those questions has been asked
--   here and answered by hand from case notes, or not answered.
--
--   Nothing could be compared. Practice variation between surgeons, between
--   units, between this year and last, is invisible when the record is prose.
--
-- NOTHING IS TAKEN AWAY. The audit_logs rows are still written by the same
-- endpoint and still read by the PACU discharge PDF; every note recorded before
-- today exists only as one of them and stays readable. The narrative field
-- survives intact and is still the operative record — the structured fields sit
-- around it, they do not replace it. See lib/postop/noteFeed.ts, the single
-- place that knows a note can have either shape.
--
-- WHAT IS NOT AN ENUM, AND WHY. Almost every coded value here is TEXT, with the
-- catalogue in lib/postop/vocabulary.ts. Making them Postgres enums would mean
-- a migration on two databases every time a theatre starts using a different
-- solution, which is precisely what the requirement to extend templates freely
-- rules out. The API validates against the catalogue, so the protection against
-- typos is kept; what is given up is the database refusing a value written by
-- something that bypasses the API, and the sync layer is the only such writer.
-- ============================================================

-- ---------------------------------------------------------------------------
-- Enums. Only the two that are genuinely structural: whether a note is signed,
-- and whether it is the note or an addendum to it. Neither will ever want a
-- value added by a theatre.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "PostOpNoteStatus" AS ENUM ('DRAFT','SIGNED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PostOpNoteType" AS ENUM ('OPERATION_NOTE','ADDENDUM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "post_op_notes" (
  "id"                            TEXT NOT NULL,
  "surgeryId"                     TEXT NOT NULL,
  "patientId"                     TEXT NOT NULL,
  "noteType"                      "PostOpNoteType" NOT NULL DEFAULT 'OPERATION_NOTE',
  "status"                        "PostOpNoteStatus" NOT NULL DEFAULT 'DRAFT',
  "templateKey"                   TEXT NOT NULL DEFAULT 'CORE',
  "templateVersion"               INTEGER NOT NULL DEFAULT 1,
  "procedureName"                 TEXT,
  "procedurePerformed"            TEXT,
  "operativeDiagnosis"            TEXT,
  "postOpDiagnosis"               TEXT,
  "positions"                     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "positionOther"                 TEXT,
  "positionAtInduction"           TEXT,
  "positionAtClosure"             TEXT,
  "positioningNotes"              TEXT,
  "hairRemoval"                   TEXT NOT NULL DEFAULT 'NOT_RECORDED',
  "hairRemovalMethod"             TEXT,
  "hairRemovalOther"              TEXT,
  "hairRemovalArea"               TEXT,
  "hairRemovalAt"                 TIMESTAMP(3),
  "hairRemovalBy"                 TEXT,
  "incisionTypes"                 TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "incisionOther"                 TEXT,
  "incisionSite"                  TEXT,
  "incisionLengthCm"              DOUBLE PRECISION,
  "haemostasisMethods"            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "haemostasisOther"              TEXT,
  "estimatedBloodLossMl"          INTEGER,
  "bleedingSource"                TEXT,
  "haemostasisSatisfactory"       BOOLEAN,
  "tourniquetMinutes"             INTEGER,
  "findings"                      TEXT NOT NULL,
  "woundClass"                    TEXT,
  "tissueQuality"                 TEXT,
  "perfusion"                     TEXT,
  "contaminationPresent"          BOOLEAN,
  "pusPresent"                    BOOLEAN,
  "necrosisPresent"               BOOLEAN,
  "foreignBodyFound"              BOOLEAN,
  "adhesionsPresent"              BOOLEAN,
  "boneExposed"                   BOOLEAN,
  "tendonExposed"                 BOOLEAN,
  "implantPlaced"                 BOOLEAN,
  "implantDetails"                TEXT,
  "nerveStatus"                   TEXT,
  "vascularStatus"                TEXT,
  "fluidsGivenMl"                 INTEGER,
  "urineOutputMl"                 INTEGER,
  "complicationOccurred"          BOOLEAN,
  "complicationDetails"           TEXT,
  "procedureChanged"              BOOLEAN,
  "procedureChangeReason"         TEXT,
  "closureMethods"                TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "closureOther"                  TEXT,
  "sutureMaterial"                TEXT,
  "sutureMaterialOther"           TEXT,
  "sutureSize"                    TEXT,
  "closureNotes"                  TEXT,
  "dressingTypes"                 TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "dressingOther"                 TEXT,
  "dressingLayers"                INTEGER,
  "dressingNotes"                 TEXT,
  "wardPosition"                  TEXT,
  "wardPositionOther"             TEXT,
  "headElevationDegrees"          INTEGER,
  "positionRestrictions"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "positionRestrictionOther"      TEXT,
  "feedingTiming"                 TEXT,
  "feedingAt"                     TIMESTAMP(3),
  "feedingOther"                  TEXT,
  "dietType"                      TEXT,
  "dietOther"                     TEXT,
  "feedingNotes"                  TEXT,
  "mobilisation"                  TEXT,
  "mobilisationOther"             TEXT,
  "mobilisationRestrictions"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "mobilisationRestrictionOther"  TEXT,
  "oralMedicationTiming"          TEXT,
  "oralMedicationAt"              TIMESTAMP(3),
  "oralMedicationOther"           TEXT,
  "vtePlan"                       TEXT,
  "vteMechanical"                 TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "vteMechanicalOther"            TEXT,
  "vteDrug"                       TEXT,
  "vteDose"                       TEXT,
  "vteRoute"                      TEXT,
  "vteFrequency"                  TEXT,
  "vteStartAt"                    TIMESTAMP(3),
  "vteDuration"                   TEXT,
  "vteWithheldReason"             TEXT,
  "antibioticPlan"                TEXT,
  "antibioticDrug"                TEXT,
  "antibioticDose"                TEXT,
  "antibioticRoute"               TEXT,
  "antibioticFrequency"           TEXT,
  "antibioticDuration"            TEXT,
  "antibioticReviewOn"            TIMESTAMP(3),
  "analgesiaPlan"                 TEXT,
  "analgesiaOther"                TEXT,
  "painAssessmentRequired"        BOOLEAN,
  "analgesiaNotes"                TEXT,
  "fluidPlan"                     TEXT,
  "fluidType"                     TEXT,
  "fluidRate"                     TEXT,
  "fluidNotes"                    TEXT,
  "catheterPresent"               BOOLEAN,
  "catheterType"                  TEXT,
  "catheterIndication"            TEXT,
  "catheterMonitoring"            TEXT,
  "catheterAction"                TEXT,
  "catheterRemovalAt"             TIMESTAMP(3),
  "woundMonitoring"               TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "woundMonitoringOther"          TEXT,
  "firstDressingChangeAt"         TIMESTAMP(3),
  "woundMonitoringNotes"          TEXT,
  "observations"                  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "observationsOther"             TEXT,
  "observationFrequency"          TEXT,
  "escalationTriggers"            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "escalationOther"               TEXT,
  "escalationNotes"               TEXT,
  "escalationContact"             TEXT,
  "reviewTiming"                  TEXT,
  "reviewAt"                      TIMESTAMP(3),
  "reviewOther"                   TEXT,
  "reviewNotes"                   TEXT,
  "extras"                        JSONB,
  "images"                        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "signedAt"                      TIMESTAMP(3),
  "signedById"                    TEXT,
  "signedByName"                  TEXT,
  "surgeonId"                     TEXT,
  "surgeonName"                   TEXT,
  "createdById"                   TEXT NOT NULL,
  "createdByName"                 TEXT NOT NULL,
  "createdAt"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version"                  INTEGER NOT NULL DEFAULT 0,
  "sync_origin"                   TEXT,
  "sync_hlc"                      TEXT,

  CONSTRAINT "post_op_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "post_op_notes_surgeryId_createdAt_idx" ON "post_op_notes" ("surgeryId", "createdAt");
CREATE INDEX IF NOT EXISTS "post_op_notes_patientId_idx" ON "post_op_notes" ("patientId");
CREATE INDEX IF NOT EXISTS "post_op_notes_status_signedAt_idx" ON "post_op_notes" ("status", "signedAt");
CREATE INDEX IF NOT EXISTS "post_op_notes_templateKey_idx" ON "post_op_notes" ("templateKey");
CREATE INDEX IF NOT EXISTS "post_op_notes_woundClass_idx" ON "post_op_notes" ("woundClass");
CREATE INDEX IF NOT EXISTS "post_op_notes_surgeonId_signedAt_idx" ON "post_op_notes" ("surgeonId", "signedAt");

CREATE TABLE IF NOT EXISTS "post_op_prep_steps" (
  "id"            TEXT NOT NULL,
  "noteId"        TEXT NOT NULL,
  "sequence"      INTEGER NOT NULL,
  "kind"          TEXT NOT NULL,
  "agent"         TEXT,
  "dryingMethod"  TEXT,
  "agentOther"    TEXT,
  "site"          TEXT,
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version"  INTEGER NOT NULL DEFAULT 0,
  "sync_origin"   TEXT,
  "sync_hlc"      TEXT,

  CONSTRAINT "post_op_prep_steps_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "post_op_prep_steps_noteId_sequence_idx" ON "post_op_prep_steps" ("noteId", "sequence");
CREATE INDEX IF NOT EXISTS "post_op_prep_steps_agent_idx" ON "post_op_prep_steps" ("agent");

CREATE TABLE IF NOT EXISTS "post_op_drains" (
  "id"               TEXT NOT NULL,
  "noteId"           TEXT NOT NULL,
  "drainType"        TEXT NOT NULL,
  "drainTypeOther"   TEXT,
  "site"             TEXT NOT NULL,
  "sizeFr"           TEXT,
  "suction"          TEXT,
  "fixation"         TEXT,
  "monitoring"       TEXT,
  "removalCriteria"  TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version"     INTEGER NOT NULL DEFAULT 0,
  "sync_origin"      TEXT,
  "sync_hlc"         TEXT,

  CONSTRAINT "post_op_drains_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "post_op_drains_noteId_idx" ON "post_op_drains" ("noteId");

CREATE TABLE IF NOT EXISTS "post_op_specimens" (
  "id"                TEXT NOT NULL,
  "noteId"            TEXT NOT NULL,
  "label"             TEXT NOT NULL,
  "description"       TEXT NOT NULL,
  "site"              TEXT,
  "destination"       TEXT NOT NULL,
  "destinationOther"  TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version"      INTEGER NOT NULL DEFAULT 0,
  "sync_origin"       TEXT,
  "sync_hlc"          TEXT,

  CONSTRAINT "post_op_specimens_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "post_op_specimens_noteId_idx" ON "post_op_specimens" ("noteId");
CREATE INDEX IF NOT EXISTS "post_op_specimens_destination_idx" ON "post_op_specimens" ("destination");

CREATE TABLE IF NOT EXISTS "post_op_held_medications" (
  "id"                  TEXT NOT NULL,
  "noteId"              TEXT NOT NULL,
  "drugName"            TEXT NOT NULL,
  "previousDose"        TEXT,
  "reasonHeld"          TEXT,
  "restartInstruction"  TEXT NOT NULL,
  "restartAt"           TIMESTAMP(3),
  "restartOther"        TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version"        INTEGER NOT NULL DEFAULT 0,
  "sync_origin"         TEXT,
  "sync_hlc"            TEXT,

  CONSTRAINT "post_op_held_medications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "post_op_held_medications_noteId_idx" ON "post_op_held_medications" ("noteId");

-- ---------------------------------------------------------------------------
-- The extras index.
--
-- `extras` holds the fields a procedure template contributes — flap pedicle,
-- graft mesh ratio, tourniquet position. A GIN index is what keeps them real
-- research data rather than a dumping ground: extras->>'flapType' stays a
-- query, not a scan, so a question about flaps can still be asked of five years
-- of notes.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "post_op_notes_extras_idx" ON "post_op_notes" USING GIN ("extras");

-- ---------------------------------------------------------------------------
-- Foreign keys.
--
-- ON DELETE CASCADE from the note to its children, because a preparation step
-- without its note is not a record of anything. The note itself cascades from
-- the surgery for the same reason.
--
-- patientId carries NO foreign key, matching ssi_surveillance and the other
-- soft references in this schema: a note must never be refused on a node that
-- has not yet received the patient row, and patients replicate separately.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE "post_op_notes" ADD CONSTRAINT "post_op_notes_surgeryId_fkey"
    FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "post_op_prep_steps" ADD CONSTRAINT "post_op_prep_steps_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "post_op_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "post_op_drains" ADD CONSTRAINT "post_op_drains_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "post_op_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "post_op_specimens" ADD CONSTRAINT "post_op_specimens_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "post_op_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "post_op_held_medications" ADD CONSTRAINT "post_op_held_medications_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "post_op_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- A signed note has a signature.
--
-- The status and the signature are two halves of one fact, and they live in
-- separate columns because Prisma cannot express the dependency. Without this
-- constraint a note can read SIGNED with no signatory, which is the one state a
-- medical record must never be in: a claim nobody made.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE "post_op_notes"
    ADD CONSTRAINT "post_op_notes_signed_has_signature"
    CHECK ("status" <> 'SIGNED' OR ("signedAt" IS NOT NULL AND "signedById" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- A preparation step is a step in a sequence.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE "post_op_prep_steps"
    ADD CONSTRAINT "post_op_prep_steps_sequence_positive" CHECK ("sequence" >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Capture, enabled at creation.
--
-- sync_enable_table(), never a hand-written CREATE TRIGGER: it installs the
-- pair of triggers, and the single combined one that looks obviously correct
-- gets DELETE wrong. scripts/lib-tests/syncCapture.test.ts reads these calls to
-- prove every classified table is really captured, so a hand-rolled trigger is
-- invisible to the one check that would catch its absence.
--
-- The matching entries in lib/sync/syncPolicy.ts are added in the same commit.
-- All five are QUARANTINE, as intraoperative_records already is: this is what
-- was done to a patient, and two differing accounts of that need a person, not
-- a comparison of timestamps.
-- ---------------------------------------------------------------------------
SELECT sync_enable_table('post_op_notes');
SELECT sync_enable_table('post_op_prep_steps');
SELECT sync_enable_table('post_op_drains');
SELECT sync_enable_table('post_op_specimens');
SELECT sync_enable_table('post_op_held_medications');
