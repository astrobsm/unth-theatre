-- Attendance without a review, and where the reviewer was standing.
--
-- Two findings from the theatre on 3 November, one cause. An anaesthetist went
-- round to review two urology cases listed for the next morning and neither
-- patient was in the assigned ward — day cases, most likely, never admitted.
-- The form then asked for a fitness decision, which cannot honestly be given
-- about a patient nobody has seen, so the review could not be completed and
-- both cases read as simply unreviewed. The doctor who walked to the ward was
-- recorded as having done nothing; the patient who was never produced was
-- recorded nowhere.
--
-- So attendance becomes recordable on its own, and a position is taken when it
-- is claimed. EVERY COLUMN HERE IS NULLABLE, which is the whole design: a ward
-- behind concrete, a handset with its radio off and a page served over plain
-- http all produce no position, and a record that could not be written without
-- one would not be written at all.

-- The review: where it was recorded from.
ALTER TABLE "preoperative_anesthetic_reviews"
  ADD COLUMN IF NOT EXISTS "reviewerLatitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "reviewerLongitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "reviewerAccuracyM" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "reviewerFixVerdict" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewerDistanceM" INTEGER,
  ADD COLUMN IF NOT EXISTS "reviewerLocationAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewerLocationUnavailableReason" TEXT;

-- The assignment: attended, and the patient was not there.
ALTER TABLE "preop_review_assignments"
  ADD COLUMN IF NOT EXISTS "patientAbsentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "patientAbsentById" TEXT,
  ADD COLUMN IF NOT EXISTS "patientAbsentByName" TEXT,
  ADD COLUMN IF NOT EXISTS "patientAbsentReason" TEXT,
  ADD COLUMN IF NOT EXISTS "patientAbsentLatitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "patientAbsentLongitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "patientAbsentAccuracyM" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "patientAbsentFixVerdict" TEXT,
  ADD COLUMN IF NOT EXISTS "patientAbsentDistanceM" INTEGER,
  ADD COLUMN IF NOT EXISTS "patientAbsentLocationUnavailable" TEXT;

-- Finding tonight's attended-but-absent cases without a scan: the evening
-- watch reads one operating day at a time.
CREATE INDEX IF NOT EXISTS "preop_review_assignments_surgeryDate_patientAbsentAt_idx"
  ON "preop_review_assignments" ("surgeryDate", "patientAbsentAt");
