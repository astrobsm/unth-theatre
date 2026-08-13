-- ============================================================
-- Deferred pre-operative requirements (emergencies only)
-- ------------------------------------------------------------
-- Consent and pre-op labs are mandatory. An ELECTIVE case cannot be booked
-- without them. An EMERGENCY can, because a hard block would mean theatre never
-- hears about the case at all, and the safest place for an unconsented emergency
-- patient is a booked theatre with a team on the way.
--
-- But only with a named clinician and a reason, recorded here. A deferral is a
-- debt, not a discharge: preop_outstanding keeps what is still missing so it
-- stays visible on the board and in the holding area until it is cleared.
--
-- All nullable and additive, so existing rows migrate untouched.
-- ============================================================

ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "preopOverrideReason" TEXT;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "preopOverrideById"   TEXT;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "preopOverrideByName" TEXT;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "preopOverrideAt"     TIMESTAMP(3);
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "preopOutstanding"    TEXT;

-- The holding-area and theatre boards filter on "still outstanding", which is a
-- small slice of a large table.
CREATE INDEX IF NOT EXISTS "surgeries_preop_outstanding_idx"
  ON "surgeries" ("preopOutstanding")
  WHERE "preopOutstanding" IS NOT NULL;
