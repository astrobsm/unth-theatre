-- The emergency pre-anaesthetic assessment now ends in a fitness decision.
--
-- Asked for on 6 November 2026:
--
--   "fix it such that at the end of second step, fitness status will be
--    selected and recommendation made on what will be done to make the
--    patient fit, then advice surgeon to optimize and reschedule asap"
--
-- The elective review has answered this question since August. The emergency
-- one ended in prose, which nobody downstream could act on: "would benefit
-- from optimisation of haemoglobin" leaves a scrub nurse to decide for herself
-- whether the case is off, and two people read it two ways.
--
-- fitnessDecision reuses the existing "AnaestheticFitness" enum rather than
-- introducing a second vocabulary for emergencies. The type already exists,
-- so nothing is created here.
--
-- Every column is nullable: reviews already in the database were written
-- before the question was asked, and back-filling a clinical decision nobody
-- made would be a lie in a record.
--
-- Guarded throughout. Plain double-dash comments only; a Prisma triple-slash
-- doc comment in a migration once broke `migrate deploy`.

ALTER TABLE "emergency_pre_anaesthetic_reviews"
  ADD COLUMN IF NOT EXISTS "fitnessDecision" "AnaestheticFitness",
  ADD COLUMN IF NOT EXISTS "fitnessDecidedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fitnessDecidedById" TEXT,
  ADD COLUMN IF NOT EXISTS "optimisationPlan" TEXT,
  ADD COLUMN IF NOT EXISTS "surgeonAdvisedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "surgeonAdviceText" TEXT;

-- No sync_enable_table call: emergency_pre_anaesthetic_reviews is already
-- captured, and sync_capture() uses to_jsonb(NEW), so new columns flow with
-- the row they belong to.
