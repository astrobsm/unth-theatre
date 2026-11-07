-- Why a booked emergency has not started, and who was chased about it.
--
-- Asked for on 7 November 2026:
--
--   "kindly add here a place to report reason for the case not starting yet or
--    any blocker to the emergency so that the appropriate person can be chased
--    with whatsapp message"
--
-- The one-hour rule has always said a booked emergency is defensible in two
-- ways only: it starts within the hour, or a blocker is recorded within the
-- hour. Every chase message says so. Until this table there was nowhere on the
-- emergency board to record one -- case_blocker_reports hangs off a surgery
-- row, and an emergency has no surgery until it is approved, which is exactly
-- the stretch of time where the hour runs out.
--
-- One row per blocker. It closes when a person records that it is cleared, and
-- on no other condition.
--
-- Guarded throughout: a failed migration blocks `migrate deploy` and therefore
-- every later release, and Postgres has no IF NOT EXISTS for ADD CONSTRAINT.
-- Plain double-dash comments only; a Prisma triple-slash doc comment in a
-- migration once broke `migrate deploy`.

-- CreateTable
CREATE TABLE IF NOT EXISTS "emergency_case_blockers" (
    "id" TEXT NOT NULL,
    "emergencyBookingId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "reportedById" TEXT,
    "reportedByName" TEXT NOT NULL,
    "reportedByRole" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3),
    "minutesToDeadline" INTEGER,
    "overdueWhenReported" BOOLEAN NOT NULL DEFAULT false,
    "chased" TEXT,
    "whatsappQueued" INTEGER NOT NULL DEFAULT 0,
    "whatsappSkipped" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedByName" TEXT,
    "resolvedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "emergency_case_blockers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The card's own read: the blockers on this booking, newest first.
CREATE INDEX IF NOT EXISTS "emergency_case_blockers_emergencyBookingId_reportedAt_idx"
  ON "emergency_case_blockers"("emergencyBookingId", "reportedAt");

-- The board's read: everything still open, across every case.
CREATE INDEX IF NOT EXISTS "emergency_case_blockers_resolvedAt_idx"
  ON "emergency_case_blockers"("resolvedAt");

-- The month's figures: how often each reason stopped a case.
CREATE INDEX IF NOT EXISTS "emergency_case_blockers_reason_idx"
  ON "emergency_case_blockers"("reason");

-- AddForeignKey
-- Guarded by name, because ADD CONSTRAINT has no IF NOT EXISTS.
-- RESTRICT, not CASCADE: the reason a case was held up outlives any tidying of
-- the booking, and a review months later asks for exactly this row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'emergency_case_blockers_emergencyBookingId_fkey'
  ) THEN
    ALTER TABLE "emergency_case_blockers"
      ADD CONSTRAINT "emergency_case_blockers_emergencyBookingId_fkey"
      FOREIGN KEY ("emergencyBookingId") REFERENCES "emergency_surgery_bookings"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Replicate. A blocker is recorded from whichever node the person standing in
-- the theatre has in their hand, and cleared from whichever is up at the time.
-- "Is anything holding this case up" must be the same answer on both.
SELECT sync_enable_table('emergency_case_blockers');
