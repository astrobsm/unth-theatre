-- =============================================================================
-- Tentative cases: what a unit is planning, before it has a date
-- -----------------------------------------------------------------------------
-- A unit decides on Monday that Mrs Okeke needs a hemicolectomy "in the next
-- fortnight". Today that lives in a WhatsApp message or a registrar's notebook
-- until somebody books it, and what the theatre sees is a list that grows on
-- Thursday evening for a Friday it cannot resource.
--
-- This table holds the plan. It is NOT a surgery: nothing here is on any list,
-- no theatre is reserved, no pack is picked, no deposit is quoted. It becomes a
-- case only when the unit chooses a date and presses Publish, and that creates
-- an ordinary row in "surgeries" through the ordinary booking route.
--
-- WHY THE DATE IS NULLABLE. It is the entire point. A draft with a mandatory
-- date is a booking with extra steps, and the unit would put a placeholder date
-- in it — which is exactly the fictional list this is meant to replace.
--
-- WHY THE PATIENT IS NULLABLE TOO. A unit plans around a person before that
-- person is registered. So a draft may carry a name and a folder number as
-- text; publishing requires a real patient id, and the application says which
-- drafts are short of one rather than refusing to hold the plan.
-- =============================================================================

CREATE TABLE "surgery_schedule_drafts" (
  "id"                   TEXT NOT NULL,

  -- Whose plan it is. "unit" matches Surgery.unit and SurgicalUnit.name, as
  -- text, because that is how every other surgical table names a unit.
  "unit"                 TEXT NOT NULL,
  "subspecialty"         TEXT NOT NULL,

  -- The patient, once there is one.
  "patientId"            TEXT,
  "patientName"          TEXT,
  "patientFolderNumber"  TEXT,

  "surgeonId"            TEXT,
  "surgeonName"          TEXT,

  "procedureName"        TEXT NOT NULL,
  "additionalProcedures" TEXT,
  "indication"           TEXT,
  "magnitude"            TEXT,
  "surgeryType"          TEXT NOT NULL DEFAULT 'ELECTIVE',
  "anesthesiaType"       TEXT,
  "estimatedDuration"    INTEGER NOT NULL DEFAULT 60,

  -- What the unit is aiming for. Both advisory: the date actually booked is
  -- chosen at the moment of publishing.
  "targetDate"           TIMESTAMP(3),
  "preferredTime"        TEXT,

  -- LOW | NORMAL | HIGH — how soon the unit wants it, which is not the same
  -- question as ELECTIVE/URGENT/EMERGENCY and is theirs to state.
  "priority"             TEXT NOT NULL DEFAULT 'NORMAL',
  "notes"                TEXT,

  -- DRAFT | PUBLISHED | WITHDRAWN.
  "status"               TEXT NOT NULL DEFAULT 'DRAFT',

  -- Set when published. Keeping the surgery id makes publishing idempotent in
  -- the only way that matters clinically: a second press cannot produce a
  -- second case, because the draft already names the one it made.
  "publishedSurgeryId"   TEXT,
  "publishedAt"          TIMESTAMP(3),
  "publishedById"        TEXT,
  "publishedForDate"     TIMESTAMP(3),

  "createdById"          TEXT,
  "createdByName"        TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "surgery_schedule_drafts_pkey" PRIMARY KEY ("id")
);

-- The list a unit opens: its own drafts, newest first.
CREATE INDEX "surgery_schedule_drafts_unit_status_idx"
  ON "surgery_schedule_drafts" ("unit", "status");

-- The planning view: what is coming, across units.
CREATE INDEX "surgery_schedule_drafts_targetDate_idx"
  ON "surgery_schedule_drafts" ("targetDate");

CREATE INDEX "surgery_schedule_drafts_status_idx"
  ON "surgery_schedule_drafts" ("status");

-- Finding the draft behind a published case, for the audit trail.
CREATE INDEX "surgery_schedule_drafts_publishedSurgeryId_idx"
  ON "surgery_schedule_drafts" ("publishedSurgeryId");

-- No foreign keys to patients, users or surgeries. The rest of this schema
-- deliberately uses soft references for exactly these joins (see Surgery
-- .theatreId and .theatreTechnicianId), because a hard FK turns a row that
-- has not synced yet into a refused insert on the other node — which is the
-- failure currently stranding 267 surgery_special_needs rows.

-- Replicated. A plan made on a ward computer must be visible on the theatre
-- server, and a plan made on the theatre server must reach the cloud.
SELECT sync_enable_table('surgery_schedule_drafts');
