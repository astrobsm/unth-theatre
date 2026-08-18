-- ============================================================
-- Changing what a case is packed with, after it was booked
-- ------------------------------------------------------------
-- The consumables and the pharmacy pack were chosen at booking and could never
-- be changed afterwards. A surgeon who decided on Tuesday that Monday's list
-- needed a different mesh had nowhere to say so, so the change happened
-- verbally at the theatre door and the pack provider found out by being handed
-- a request they had no record of.
--
-- NOTHING IS DELETED. Removing an item cancels it — SurgeryPackStatus already
-- has CANCELLED — and records who removed it and why. The row stays, because
-- the provider may already have picked the item, and a list that silently
-- loses a line looks like a list that never had it. A DELETE here would make
-- the two indistinguishable.
--
-- Every change carries a reason, and not for ceremony: the provider reads it
-- to decide whether to repack a tray or simply not add to it, and "switching
-- to a lightweight mesh" answers that where a bare diff does not.
--
-- addedAfterBooking defaults to false, which is true of every row already
-- there: all of them came from a booking form, because until now there was no
-- other way for one to exist.
-- ============================================================

ALTER TABLE "surgery_consumable_requests"
  ADD COLUMN IF NOT EXISTS "addedAfterBooking" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "additionReason"    TEXT,
  ADD COLUMN IF NOT EXISTS "removedById"       TEXT,
  ADD COLUMN IF NOT EXISTS "removedAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "removalReason"     TEXT;

ALTER TABLE "surgery_drug_dressing_requests"
  ADD COLUMN IF NOT EXISTS "addedAfterBooking" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "additionReason"    TEXT,
  ADD COLUMN IF NOT EXISTS "removedById"       TEXT,
  ADD COLUMN IF NOT EXISTS "removedAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "removalReason"     TEXT;
