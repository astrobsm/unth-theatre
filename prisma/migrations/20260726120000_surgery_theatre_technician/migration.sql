-- Assigned anaesthetic technician for a surgery (soft reference to User.id, no FK).
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "theatreTechnicianId" TEXT;
