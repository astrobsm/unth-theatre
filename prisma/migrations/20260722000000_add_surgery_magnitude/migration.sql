-- Operative magnitude captured at booking (MAJOR | INTERMEDIATE | MINOR).
-- Nullable so the 351 existing rows migrate cleanly. Used to scale the
-- mandatory base consumable pack. Additive only — no data loss.
ALTER TABLE "surgeries" ADD COLUMN "magnitude" TEXT;
