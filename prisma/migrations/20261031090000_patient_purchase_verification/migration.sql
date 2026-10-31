-- Medicines the patient had to buy, and the check on what came back.
--
-- When pharmacy cannot supply an item, the patient is handed a printed list,
-- buys it outside the hospital and brings it back. The pharmacist checks it
-- at the counter — and until now recorded that nowhere, so a drug of unknown
-- provenance reached an anaesthetic trolley with nothing in the record saying
-- anybody had looked at it.
--
-- Guarded with IF NOT EXISTS throughout. A migration that fails half-way
-- leaves the chain at P3009, which blocks EVERY later deploy until somebody
-- clears it by hand: the build runs `migrate deploy` before `next build`, so
-- nothing ships at all. That has happened on this project once.
--
-- anesthetic_prescriptions is already sync-enabled; the capture trigger is
-- generic over the row, so new columns need no re-registration.

ALTER TABLE "anesthetic_prescriptions"
  ADD COLUMN IF NOT EXISTS "purchaseListPrintedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "purchaseListPrintedById" TEXT,
  ADD COLUMN IF NOT EXISTS "purchaseVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "purchaseVerifiedById" TEXT,
  ADD COLUMN IF NOT EXISTS "purchaseVerifiedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "purchaseVerification" TEXT;
