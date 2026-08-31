-- Why a case did not start when it should have.
--
-- The commonest event in a theatre suite, and the one with nowhere to be
-- written down. An anaesthetist arrives for a nine o'clock list, the scrub
-- nurse is in another room, and he waits — nobody outside that room learns
-- anything, and the reason is never recorded. The DELAY was always visible.
-- The CAUSE never was, which is why nothing about it ever changed.

CREATE TABLE IF NOT EXISTS "case_blocker_reports" (
  "id"             TEXT NOT NULL,
  "surgeryId"      TEXT NOT NULL,
  "reason"         TEXT NOT NULL,
  "detail"         TEXT,
  "reportedById"   TEXT,
  "reportedByName" TEXT NOT NULL,
  "reportedByRole" TEXT,
  "reportedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "minutesLate"    INTEGER,
  "outcome"        TEXT NOT NULL DEFAULT 'PENDING',
  "outcomeNote"    TEXT,
  "outcomeAt"      TIMESTAMP(3),
  "outcomeById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "case_blocker_reports_pkey" PRIMARY KEY ("id")
);

-- The board reads "what is blocking this case": surgery plus time.
CREATE INDEX IF NOT EXISTS "case_blocker_reports_surgeryId_reportedAt_idx"
  ON "case_blocker_reports" ("surgeryId", "reportedAt");

-- Reports read "what blocked us this month": time alone...
CREATE INDEX IF NOT EXISTS "case_blocker_reports_reportedAt_idx"
  ON "case_blocker_reports" ("reportedAt");

-- ...and "which reason comes up most", which is the whole point of a fixed list.
CREATE INDEX IF NOT EXISTS "case_blocker_reports_reason_idx"
  ON "case_blocker_reports" ("reason");

-- Guarded, because a bare ADD CONSTRAINT is not idempotent. On 28 August
-- exactly that broke the cloud build: the table had been created ahead of its
-- migration, re-adding the key failed with 42710, and the whole deploy stopped.
-- A migration that cannot be run twice will eventually halt a deploy at the
-- worst possible moment.
DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_blocker_reports_surgeryId_fkey'
  ) THEN
    ALTER TABLE "case_blocker_reports"
      ADD CONSTRAINT "case_blocker_reports_surgeryId_fkey"
      FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$fk$;

-- Replicated from the start. A blocker raised on the theatre server while the
-- link is down is precisely the report that must not be lost, and a table left
-- out of this is how the emergency board came to disagree with itself.
SELECT sync_enable_table('case_blocker_reports');
