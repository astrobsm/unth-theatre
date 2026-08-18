-- ============================================================
-- Certifying a theatre ready, and meaning it
-- ------------------------------------------------------------
-- Marking a theatre ready already required every equipment check to be ticked.
-- What it did not require was anybody to have understood what they were
-- asserting — and "this theatre is ready" is a statement made to a surgical
-- team who will act on it without going to look.
--
-- So a declaration is acknowledged, and THE VERSION OF THE WORDING IS RECORDED
-- WITH IT. That is the whole difference between this and a cosmetic warning: a
-- dialog somebody dismissed leaves no evidence, and once the text is revised
-- there is no way to say which version a person actually agreed to. Storing a
-- boolean alone would have looked like compliance and proved nothing.
--
-- deficiencyReportedAt/ById are separate from the existing blockingIssues,
-- which is a free-text note. These record the MOMENT somebody stood the
-- theatre down and who did it — the two facts asked for afterwards.
--
-- Nothing here is backfilled. Setup logs already marked ready were certified
-- under the old rule, and stamping them as though a declaration had been
-- acknowledged would manufacture evidence of something that did not happen.
-- They keep complianceAcknowledged = false, which is the truth about them.
-- ============================================================

ALTER TABLE "anesthesia_setup_logs"
  ADD COLUMN IF NOT EXISTS "complianceAcknowledged"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "complianceAcknowledgedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "complianceDeclarationVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "deficiencyReportedAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deficiencyReportedById"       TEXT;
