-- ============================================================
-- Amending a prescription without destroying the one before it
-- ------------------------------------------------------------
-- There was no way to amend an anaesthetic prescription at all. It could be
-- created, approved, packed and tracked through to reconciliation, but never
-- changed — so a dose that needed correcting was corrected by writing a second
-- prescription that looked unrelated to the first, or on paper. Neither leaves
-- pharmacy able to answer the question an incident review actually asks: what
-- was I asked for, by whom, at the moment I packed this.
--
-- AN AMENDMENT IS A NEW ROW. The previous prescription is never edited in
-- place. It keeps its medications exactly as they were prescribed, is marked
-- SUPERSEDED, and points at what replaced it. Both ends of the link are stored
-- so the chain can be walked from either direction.
--
-- Two statuses are added rather than reusing what exists:
--
--   CANCELLED   the prescriber standing a prescription down. Deliberately not
--               REJECTED, which already means a consultant declined to approve
--               it — merging them would lose which of the two happened.
--   SUPERSEDED  replaced by a later version.
--
-- The other twelve statuses are untouched. The existing workflow is more
-- detailed than the one being added and describes real steps — packed,
-- collected, in use, reconciled, returned — so it is extended, not replaced.
--
-- version defaults to 1, which is true of every prescription already written:
-- none of them has been amended, because until now none of them could be.
-- ============================================================

ALTER TYPE "PrescriptionStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "PrescriptionStatus" ADD VALUE IF NOT EXISTS 'SUPERSEDED';

ALTER TABLE "anesthetic_prescriptions"
  ADD COLUMN IF NOT EXISTS "version"            INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "supersedesId"       TEXT,
  ADD COLUMN IF NOT EXISTS "supersededById"     TEXT,
  ADD COLUMN IF NOT EXISTS "supersededAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "amendedById"        TEXT,
  ADD COLUMN IF NOT EXISTS "amendedByName"      TEXT,
  ADD COLUMN IF NOT EXISTS "amendedAt"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "amendmentReason"    TEXT,
  ADD COLUMN IF NOT EXISTS "cancelledById"      TEXT,
  ADD COLUMN IF NOT EXISTS "cancelledAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;

-- Walking a chain from either end, and finding the live version for a case,
-- are the two reads this feature performs.
CREATE INDEX IF NOT EXISTS "anesthetic_prescriptions_supersedesId_idx"
  ON "anesthetic_prescriptions" ("supersedesId");
CREATE INDEX IF NOT EXISTS "anesthetic_prescriptions_surgeryId_version_idx"
  ON "anesthetic_prescriptions" ("surgeryId", "version");
