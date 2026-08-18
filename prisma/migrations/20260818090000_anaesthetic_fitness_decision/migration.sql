-- ============================================================
-- Fitness for the proposed anaesthesia, and the requirements to achieve it
-- ------------------------------------------------------------
-- The pre-operative anaesthetic review used to end in three prose fields:
-- review notes, an anaesthetic plan, and special considerations. None of them
-- answered the question the rest of the theatre needs answered — may this
-- patient have this anaesthetic today, yes or no — and prose cannot be acted
-- on by anybody but its author. A scrub nurse reading "would benefit from
-- optimisation of haemoglobin prior to listing" has to decide for herself
-- whether the case is off, and two people read it two ways.
--
-- So the decision becomes a field with two values, and everything that must
-- happen before an unfit patient becomes fit becomes rows with an owner, a
-- target and a status.
--
-- ------------------------------------------------------------
-- NOTHING IS DROPPED. review_notes, recommendations, anesthetic_plan and
-- special_considerations all stay exactly where they are.
--
-- Reviews written before today carry real clinical prose in those columns.
-- Dropping them to tidy the model would destroy the record of what an
-- anaesthetist actually said about a patient, which is the one thing a
-- clinical system must never do to make a schema neater. The form stops
-- collecting them; where a value exists it is still shown, read only, so an
-- old review reads as it was written.
--
-- ------------------------------------------------------------
-- fitness_decision is NULLABLE, and stays nullable.
--
-- Every review already in the database was completed without one. Backfilling
-- a default would be inventing a clinical decision nobody made — and "FIT" is
-- exactly the wrong thing to invent. A null means "not recorded", which is
-- what those reviews honestly are, and the code treats not-recorded as
-- blocking rather than as permission.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "AnaestheticFitness" AS ENUM ('FIT', 'NOT_FIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "OptimisationStatus" AS ENUM ('OUTSTANDING', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "OptimisationPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "preoperative_anesthetic_reviews"
  ADD COLUMN IF NOT EXISTS "fitnessDecision"    "AnaestheticFitness",
  ADD COLUMN IF NOT EXISTS "fitnessDecidedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fitnessDecidedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reassessedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reassessedById"     TEXT,
  ADD COLUMN IF NOT EXISTS "reassessmentNote"   TEXT;

CREATE TABLE IF NOT EXISTS "anaesthetic_optimisation_requirements" (
  "id"               TEXT NOT NULL,
  "reviewId"         TEXT NOT NULL,
  "surgeryId"        TEXT NOT NULL,
  "patientId"        TEXT,
  -- Text rather than an enum: an institution adding a category must not need a
  -- migration to do it. The offered list lives in lib/anaesthesia/fitness.ts.
  "category"         TEXT NOT NULL,
  "action"           TEXT NOT NULL,
  "responsible"      TEXT,
  "targetCompletion" TIMESTAMP(3),
  "priority"         "OptimisationPriority" NOT NULL DEFAULT 'MEDIUM',
  "status"           "OptimisationStatus"   NOT NULL DEFAULT 'OUTSTANDING',
  "raisedById"       TEXT NOT NULL,
  "raisedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Claimed done, and separately confirmed. Both carry who as well as when,
  -- because "it was done" and "somebody checked it was done" are different
  -- statements and only one of them is evidence.
  "completedById"    TEXT,
  "completedAt"      TIMESTAMP(3),
  "verifiedById"     TEXT,
  "verifiedAt"       TIMESTAMP(3),
  "notes"            TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "anaesthetic_optimisation_requirements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "anaesthetic_optimisation_requirements_surgeryId_idx"
  ON "anaesthetic_optimisation_requirements" ("surgeryId");
CREATE INDEX IF NOT EXISTS "anaesthetic_optimisation_requirements_reviewId_idx"
  ON "anaesthetic_optimisation_requirements" ("reviewId");
CREATE INDEX IF NOT EXISTS "anaesthetic_optimisation_requirements_status_idx"
  ON "anaesthetic_optimisation_requirements" ("status");

DO $$ BEGIN
  ALTER TABLE "anaesthetic_optimisation_requirements"
    ADD CONSTRAINT "anaesthetic_optimisation_requirements_reviewId_fkey"
    FOREIGN KEY ("reviewId") REFERENCES "preoperative_anesthetic_reviews"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Capture is NOT enabled here, and the table is deliberately left out of
-- TABLE_POLICIES for now. It is clinical content: two nodes disagreeing about
-- whether a patient's haemoglobin has been corrected needs a person, not a
-- clock, so it belongs in the quarantine phase with the other clinical tables
-- once a clinician has confirmed the classifications.
--
-- Note what that means today: this table does NOT replicate between the local
-- server and the cloud. A requirement raised in theatre is invisible in the
-- cloud and vice versa. That is the documented default — "the failure mode of
-- an unsynced table is visible divergence, which an operator notices" — and it
-- is a real limitation to close when the quarantine phase is switched on, not
-- an oversight. syncCapture.test.ts will not catch it: that suite checks the
-- tables the policy already names, and an unclassified table passes it
-- silently by design.
