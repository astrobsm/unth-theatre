-- Enrich CSSD readiness reports with structured pack/material detail and
-- first-knife-at-risk escalation fields.
ALTER TABLE "cssd_readiness_reports"
  ADD COLUMN IF NOT EXISTS "instrumentPacks" TEXT,
  ADD COLUMN IF NOT EXISTS "surgicalMaterials" TEXT,
  ADD COLUMN IF NOT EXISTS "machineFaults" TEXT,
  ADD COLUMN IF NOT EXISTS "blockingReason" TEXT,
  ADD COLUMN IF NOT EXISTS "redAlertTriggered" BOOLEAN NOT NULL DEFAULT false;

-- Enrich laundry readiness reports with the theatre-items workflow and faults.
ALTER TABLE "laundry_readiness"
  ADD COLUMN IF NOT EXISTS "itemsSentForWashing" TEXT,
  ADD COLUMN IF NOT EXISTS "itemsTransferredToCssd" TEXT,
  ADD COLUMN IF NOT EXISTS "faultsReported" TEXT,
  ADD COLUMN IF NOT EXISTS "redAlertTriggered" BOOLEAN NOT NULL DEFAULT false;
