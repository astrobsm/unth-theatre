-- End-of-care feedback: which care it is about, without who it is from.
--
-- An invitation handed to a patient at the end of their care is anonymous —
-- nothing on the submission points back to a patient or a case. But feedback
-- that cannot be routed to anybody improves nothing, so the unit and the
-- theatre complex are kept and the identity is not.
--
-- Nullable because every row already on file was submitted through the open
-- public link, where there is no care context to record and never was.

ALTER TABLE "patient_feedback" ADD COLUMN IF NOT EXISTS "careUnit" TEXT;
ALTER TABLE "patient_feedback" ADD COLUMN IF NOT EXISTS "careComplex" TEXT;

-- Reading the board by unit is the whole point of keeping the column.
CREATE INDEX IF NOT EXISTS "patient_feedback_careUnit_idx"
  ON "patient_feedback" ("careUnit");
