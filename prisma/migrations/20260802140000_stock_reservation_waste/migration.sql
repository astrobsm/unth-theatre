-- Waste on a reservation, kept apart from quantityUsed.
--
-- The patient is billed for what was USED. A dropped vial or a contaminated
-- pack still has to be accounted for, because it left the store, but it is the
-- hospital's loss rather than the patient's charge.
--
-- Without this column waste had nowhere to go on the reservation: it would
-- either have been folded into quantityUsed, quietly billing patients for
-- breakages, or left the case showing stock outstanding that had in fact been
-- discarded and could never be returned.

ALTER TABLE "stock_reservations" ADD COLUMN "quantityWasted" INTEGER NOT NULL DEFAULT 0;
