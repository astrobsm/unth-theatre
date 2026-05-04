-- Add new staff categories for weekly roster forms
ALTER TYPE "StaffCategory" ADD VALUE IF NOT EXISTS 'PHARMACISTS';
ALTER TYPE "StaffCategory" ADD VALUE IF NOT EXISTS 'RECOVERY_NURSES';

-- Add nurse sub-role + roster location columns
ALTER TABLE "rosters" ADD COLUMN IF NOT EXISTS "subRole"  TEXT;
ALTER TABLE "rosters" ADD COLUMN IF NOT EXISTS "location" TEXT;

-- Index for filtering rosters by physical location (MAIN_THEATRE | A_AND_E)
CREATE INDEX IF NOT EXISTS "rosters_location_date_idx"
  ON "rosters" ("location", "date");
