-- Add theatre-assignment and change-of-theatre audit fields to anesthesia setup logs
ALTER TABLE "anesthesia_setup_logs"
  ADD COLUMN IF NOT EXISTS "assignedTheatreId" TEXT,
  ADD COLUMN IF NOT EXISTS "assignedTheatreName" TEXT,
  ADD COLUMN IF NOT EXISTS "theatreChanged" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "theatreChangeReason" TEXT;
