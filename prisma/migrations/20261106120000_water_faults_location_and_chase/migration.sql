-- Water reports: where they were logged from, what is actually wrong, and a
-- fault that stays open until somebody goes back and looks again.
--
-- Asked for on 6 November 2026:
--
--   "modify also such that for the user to log the water status or readiness
--    status location will be tracked; again when any other status apart from
--    ok is selected, a dynamic field appears to state the problem and the
--    action taken, and the plan b for water for that day; upon submission of
--    any report with any status apart from ok, a very distress whatsapp
--    message will be created to chase the head of water supply, and head of
--    works department; and when the error is fixed, the user need to
--    re-assess and correct the status."
--
-- Guarded throughout, like every migration on this project: a failed
-- migration blocks `migrate deploy` and therefore blocks every later release,
-- and Postgres has no IF NOT EXISTS for ADD CONSTRAINT.
--
-- Plain double-dash comments only. A Prisma triple-slash doc comment here
-- once broke `migrate deploy`.

-- ---------------------------------------------------------------------------
-- The shift water report
-- ---------------------------------------------------------------------------
-- contingencyPlan is nullable although the API now requires it whenever an
-- area is not OK. The requirement belongs to new reports; months of existing
-- rows were filed before anybody was asked for a plan B, and back-filling
-- them with an invented string would be a lie in a record.
ALTER TABLE "plumbing_water_status"
  ADD COLUMN IF NOT EXISTS "contingencyPlan" TEXT,
  ADD COLUMN IF NOT EXISTS "loggedLatitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "loggedLongitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "loggedAccuracyM" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "loggedFixVerdict" TEXT,
  ADD COLUMN IF NOT EXISTS "loggedDistanceM" INTEGER,
  ADD COLUMN IF NOT EXISTS "loggedLocationAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "loggedLocationUnavailableReason" TEXT;

-- ---------------------------------------------------------------------------
-- The daily readiness report
-- ---------------------------------------------------------------------------
ALTER TABLE "water_supply_readiness"
  ADD COLUMN IF NOT EXISTS "contingencyPlan" TEXT,
  ADD COLUMN IF NOT EXISTS "loggedLatitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "loggedLongitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "loggedAccuracyM" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "loggedFixVerdict" TEXT,
  ADD COLUMN IF NOT EXISTS "loggedDistanceM" INTEGER,
  ADD COLUMN IF NOT EXISTS "loggedLocationAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "loggedLocationUnavailableReason" TEXT;

-- ---------------------------------------------------------------------------
-- The fault itself
-- ---------------------------------------------------------------------------
-- One row per area per episode. Opened by the report that first finds an area
-- not OK, refreshed by every later report that still finds it broken, closed
-- only by a report that looks at the same area and finds it OK.
CREATE TABLE IF NOT EXISTS "water_area_issues" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "areaKey" TEXT NOT NULL,
    "areaName" TEXT NOT NULL,
    "location" TEXT,
    "status" TEXT NOT NULL,
    "problem" TEXT,
    "actionTaken" TEXT,
    "contingencyPlan" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedById" TEXT,
    "openedByName" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenStatus" TEXT,
    "sightings" INTEGER NOT NULL DEFAULT 1,
    "lastChasedAt" TIMESTAMP(3),
    "chaseCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedByName" TEXT,
    "resolvedBySourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "water_area_issues_pkey" PRIMARY KEY ("id")
);

-- The open-issue lookup on every submission, and the board's "what is still
-- broken" query, are both "resolvedAt IS NULL ordered by openedAt".
CREATE INDEX IF NOT EXISTS "water_area_issues_areaKey_idx"
  ON "water_area_issues"("areaKey");
CREATE INDEX IF NOT EXISTS "water_area_issues_resolvedAt_idx"
  ON "water_area_issues"("resolvedAt");
CREATE INDEX IF NOT EXISTS "water_area_issues_openedAt_idx"
  ON "water_area_issues"("openedAt");

-- Replicate. A fault is opened from whichever node the plumber's handset
-- reached and re-assessed from whichever node is up that morning, and "is the
-- Eye Theatre still dry" must be the same answer on both. LWW matches the two
-- reports it hangs off, which are already LWW: the latest statement about a
-- room is the one that stands.
SELECT sync_enable_table('water_area_issues');
