-- Who pays, asked once when the patient is registered.
--
-- It is a fact about the PATIENT, not about an operation: a man enrolled with
-- the NHIA is enrolled for his hernia in March and his cholecystectomy in
-- August. The booking still carries its own copy -- a scheme can lapse, and a
-- case already routed must not change counter because somebody edited a
-- patient record -- but the booking form is now filled in from this.
--
-- PRIVATE IS THE DEFAULT, on instruction, and it is also what every patient
-- already on file was in practice: before any of this existed, every case was
-- packed and billed as self-paying. The default therefore states what the
-- records already say rather than inventing something new, and no existing
-- patient's routing changes.

ALTER TABLE "patients"
  ADD COLUMN IF NOT EXISTS "payerCategory"    "PayerCategory" NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN IF NOT EXISTS "payerSchemeId"    TEXT,
  ADD COLUMN IF NOT EXISTS "payerIsNyscCorps" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "patients_payerCategory_idx"
  ON "patients" ("payerCategory");
