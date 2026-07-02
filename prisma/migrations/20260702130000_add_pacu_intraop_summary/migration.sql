-- Migration: Add intra-operative handover summary (JSON) to PACU assessments
-- Captured at PACU admission from the selected surgery (scrub nurse, anaesthetist,
-- anaesthesia type, diagnosis, procedure, times, estimated blood loss, notes).

ALTER TABLE "pacu_assessments" ADD COLUMN IF NOT EXISTS "intraOpSummary" TEXT;
