-- Multidisciplinary surgery: the other units on a joint case, and who is
-- coming from each of them.
--
-- Until now a joint case was free text in the booking notes, which meant the
-- second and third units' surgeons found out they were operating when
-- somebody telephoned them on the morning. A row in the new table is a named
-- person the system can reach: the case appears on their own dashboard before
-- the day.
--
-- Idempotent throughout. These migrations are applied to two databases that
-- have diverged before, and a re-run must not fail the deploy.

-- The flag is kept separately from the rows on purpose: "booked as a joint
-- case, other units not named yet" is an unfinished booking, and inferring
-- the flag from an empty list would make it indistinguishable from a finished
-- single-unit case.
ALTER TABLE "surgeries"
  ADD COLUMN IF NOT EXISTS "isMultidisciplinary" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "surgery_participating_units" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "surgeonName" TEXT NOT NULL,
    -- Soft reference to users.id with no foreign key, matching
    -- surgeries.scrubNurseId and surgeries.theatreTechnicianId. Null where the
    -- booking named a surgeon with no account: a visiting surgeon from another
    -- hospital is exactly the case this feature exists for, and must stay
    -- bookable. A null costs only the dashboard entry, never the name.
    "surgeonId" TEXT,
    "role" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "surgery_participating_units_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "surgery_participating_units_surgeryId_idx"
  ON "surgery_participating_units"("surgeryId");

-- The dashboard query for an invited surgeon reads this one.
CREATE INDEX IF NOT EXISTS "surgery_participating_units_surgeonId_idx"
  ON "surgery_participating_units"("surgeonId");

-- A unit joins a case once, with one named lead from it. Naming a second
-- colleague from the same unit is an edit of that row, not a second unit.
CREATE UNIQUE INDEX IF NOT EXISTS "surgery_participating_units_surgeryId_unit_key"
  ON "surgery_participating_units"("surgeryId", "unit");

DO $$
BEGIN
  ALTER TABLE "surgery_participating_units"
    ADD CONSTRAINT "surgery_participating_units_surgeryId_fkey"
    FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Replicate: a case is booked on whichever node the surgeon happens to be
-- signed in on, and the invited surgeon reads their dashboard on the other
-- one. Without this, half of these invitations would be invisible to exactly
-- the person they were written for.
SELECT sync_enable_table('surgery_participating_units');
