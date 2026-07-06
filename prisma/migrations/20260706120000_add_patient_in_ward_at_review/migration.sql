-- Migration: Record whether the patient was in the ward at the planned anaesthetic review.

ALTER TABLE "preoperative_anesthetic_reviews" ADD COLUMN IF NOT EXISTS "patientInWardAtReview" BOOLEAN;
ALTER TABLE "preoperative_anesthetic_reviews" ADD COLUMN IF NOT EXISTS "patientAbsenceNote" TEXT;
