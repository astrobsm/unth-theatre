-- Chasing the whole emergency team against the one-hour rule.
--
-- Asked for on 6 November 2026:
--
--   "add a functionality to chase all the team in emergency reminding them of
--    the rule that any emergency booked must be started within an hour, chase
--    everyone on the list, from surgeon to the anaesthetist etc, anaesthetist
--    must review and indicate the review on the app and every team member must
--    indicate availability"
--
-- One row per round of chasing, holding the roll call as it stood when the
-- chase went out. When a case is reviewed afterwards the first question is who
-- was told and when, and "I rang him" is not an answer anybody can check.
--
-- Guarded throughout: a failed migration blocks `migrate deploy` and therefore
-- every later release, and Postgres has no IF NOT EXISTS for ADD CONSTRAINT.
-- Plain double-dash comments only; a Prisma triple-slash doc comment in a
-- migration once broke `migrate deploy`.

-- CreateTable
CREATE TABLE IF NOT EXISTS "emergency_team_chases" (
    "id" TEXT NOT NULL,
    "emergencyBookingId" TEXT NOT NULL,
    "chasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chasedById" TEXT,
    "chasedByName" TEXT,
    "deadlineAt" TIMESTAMP(3),
    "minutesToDeadline" INTEGER,
    "overdue" BOOLEAN NOT NULL DEFAULT false,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "expected" INTEGER NOT NULL DEFAULT 0,
    "responded" INTEGER NOT NULL DEFAULT 0,
    "reviewRecorded" BOOLEAN NOT NULL DEFAULT false,
    "rollCall" TEXT,
    "whatsappQueued" INTEGER NOT NULL DEFAULT 0,
    "whatsappSkipped" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "emergency_team_chases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Every read is "the chases on this booking, newest first".
CREATE INDEX IF NOT EXISTS "emergency_team_chases_emergencyBookingId_chasedAt_idx"
  ON "emergency_team_chases"("emergencyBookingId", "chasedAt");

-- AddForeignKey
-- Guarded by name, because ADD CONSTRAINT has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'emergency_team_chases_emergencyBookingId_fkey'
  ) THEN
    ALTER TABLE "emergency_team_chases"
      ADD CONSTRAINT "emergency_team_chases_emergencyBookingId_fkey"
      FOREIGN KEY ("emergencyBookingId") REFERENCES "emergency_surgery_bookings"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Replicate. An emergency is chased from whichever node the theatre manager
-- has in their hand, and "has this team been chased, and when" must be the
-- same answer on both. LWW matches the booking it hangs off.
SELECT sync_enable_table('emergency_team_chases');
