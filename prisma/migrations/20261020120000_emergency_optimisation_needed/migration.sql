-- ============================================================
-- What has to be put right before this emergency goes to theatre
-- ------------------------------------------------------------
-- The emergency pre-anaesthetic assessment records what the anaesthetist
-- found. It had nowhere to record what somebody else now has to DO about it,
-- so an anaesthetist who wanted a unit of blood crossmatched or a potassium
-- corrected wrote it into the free-text risk field, where it read as context
-- rather than as an instruction and was acted on by nobody.
--
-- Kept apart from riskAssessment on purpose. A risk is something to hold in
-- mind during the case; this is a list of things that must happen before it
-- starts. A reader cannot act on the second when it is buried in the first.
--
-- It is announced the moment the review is saved — on the theatre radio and
-- on the operating surgeon's board — which is the point of recording it
-- somewhere a machine can read.
--
-- One nullable column. Additive, and IF NOT EXISTS so a partially-applied
-- state on the theatre server cannot abort the deploy.
-- ============================================================

ALTER TABLE "emergency_pre_anaesthetic_reviews"
  ADD COLUMN IF NOT EXISTS "optimisationNeeded" TEXT;
