-- Recording a theatre setup must not depend on the handset having a GPS fix.
--
-- latitude/longitude/locationName were NOT NULL, so an anaesthetic technician
-- whose phone reported "Location permission denied" could not log that the
-- theatre was set up at all. The board then showed the theatre as untouched
-- while it was in fact ready. Evidence about a claim is now allowed to be
-- missing without taking the claim down with it.
--
-- Safe on a live table: dropping NOT NULL rewrites nothing and takes only a
-- brief catalogue lock. No existing row changes.

ALTER TABLE "anesthesia_setup_logs" ALTER COLUMN "latitude" DROP NOT NULL;
ALTER TABLE "anesthesia_setup_logs" ALTER COLUMN "longitude" DROP NOT NULL;
ALTER TABLE "anesthesia_setup_logs" ALTER COLUMN "locationName" DROP NOT NULL;

-- Why there is no position, in the browser's own words. Null when there is one.
ALTER TABLE "anesthesia_setup_logs"
  ADD COLUMN IF NOT EXISTS "locationUnavailableReason" TEXT;
