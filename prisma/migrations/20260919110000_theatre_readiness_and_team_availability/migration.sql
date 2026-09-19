-- ============================================================
-- Who has made the theatre ready, and who is coming to the case
-- ------------------------------------------------------------
-- Two gaps in the same morning.
--
-- The first: theatre readiness lived on theatre_setups, the material
-- COLLECTION record. A nurse standing in a prepared theatre could not say so
-- until somebody had first entered a stores document — which is what the
-- "No material collection recorded for today yet" notice on the setup screen
-- was really saying. Readiness now stands on its own, one row per person-role
-- per theatre per day, and the theatre technician gets a list of their own
-- because the machine, the gases and the airway are not the scrub nurse's to
-- answer for.
--
-- The second: nobody knew who was coming. A case has a surgeon, an
-- anaesthetist, a scrub nurse and a technician, and on the morning of the list
-- that was established by telephone, one person at a time, by whoever was
-- already standing in the theatre. Each member now answers once, on their own
-- dashboard, and everybody on that case sees every answer.
--
-- theatre_readiness_confirmations  one row per role per theatre per day
-- case_team_availability           one row per member per case
--
-- Both replicate. A readiness ticked on the theatre server during an outage
-- must reach the cloud — that is where the CMD's board reads it — and an
-- availability given on a phone in the cloud must reach the theatre floor.
-- ============================================================

-- ------------------------------------------------------------
-- Theatre readiness
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TheatreReadinessRole') THEN
    CREATE TYPE "TheatreReadinessRole" AS ENUM ('SCRUB_NURSE', 'THEATRE_TECHNICIAN');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "theatre_readiness_confirmations" (
  "id"               TEXT NOT NULL,
  "theatreId"        TEXT NOT NULL,
  "theatreName"      TEXT,
  "readyDate"        DATE NOT NULL,
  "role"             "TheatreReadinessRole" NOT NULL,
  "confirmedById"    TEXT NOT NULL,
  "confirmedByName"  TEXT NOT NULL,
  -- Which version of the list in src/lib/theatre/readiness.ts was ticked. The
  -- lists change; a confirmation is a claim about the list as it stood that
  -- day and must still read correctly afterwards.
  "checklistVersion" INTEGER NOT NULL DEFAULT 1,
  -- JSON object, check id to true. Text, as every other JSON blob here is.
  "ticks"            TEXT,
  "note"             TEXT,
  "complete"         BOOLEAN NOT NULL DEFAULT false,
  "completedAt"      TIMESTAMP(3),
  -- Set once. A re-tick must not announce the same theatre a second time.
  "announcedAt"      TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version"     INTEGER NOT NULL DEFAULT 0,
  "sync_origin"      TEXT,
  "sync_hlc"         TEXT,
  CONSTRAINT "theatre_readiness_confirmations_pkey" PRIMARY KEY ("id")
);

-- One statement per person-role per theatre per day. A second tick edits the
-- first rather than recording a second opinion about the same room.
CREATE UNIQUE INDEX IF NOT EXISTS "theatre_readiness_confirmations_theatreId_readyDate_role_key"
  ON "theatre_readiness_confirmations" ("theatreId", "readyDate", "role");

CREATE INDEX IF NOT EXISTS "theatre_readiness_confirmations_readyDate_complete_idx"
  ON "theatre_readiness_confirmations" ("readyDate", "complete");

-- ------------------------------------------------------------
-- Team availability
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CaseAvailabilityStatus') THEN
    CREATE TYPE "CaseAvailabilityStatus" AS ENUM ('AVAILABLE', 'DELAYED', 'UNAVAILABLE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "case_team_availability" (
  "id"          TEXT NOT NULL,
  -- Soft reference to surgeries.id, matching theatre_team_assignments. The
  -- team is assembled from six columns on Surgery plus two side tables, and a
  -- foreign key here adds nothing the server-side assembly does not enforce.
  "surgeryId"   TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "userName"    TEXT NOT NULL,
  "roleOnCase"  TEXT NOT NULL,
  "status"      "CaseAvailabilityStatus" NOT NULL,
  "etaMinutes"  INTEGER,
  "note"        TEXT,
  "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version" INTEGER NOT NULL DEFAULT 0,
  "sync_origin"  TEXT,
  "sync_hlc"     TEXT,
  CONSTRAINT "case_team_availability_pkey" PRIMARY KEY ("id")
);

-- One answer per person per case. Changing your mind edits it; it does not
-- leave two contradictory answers on the board.
CREATE UNIQUE INDEX IF NOT EXISTS "case_team_availability_surgeryId_userId_key"
  ON "case_team_availability" ("surgeryId", "userId");

CREATE INDEX IF NOT EXISTS "case_team_availability_surgeryId_idx"
  ON "case_team_availability" ("surgeryId");

CREATE INDEX IF NOT EXISTS "case_team_availability_userId_respondedAt_idx"
  ON "case_team_availability" ("userId", "respondedAt");

-- ------------------------------------------------------------
-- Replication
-- ------------------------------------------------------------
-- Both are last-writer-wins on a small, self-contained row, and both are read
-- on the node that did not write them: the CMD reads readiness from the cloud
-- while it is ticked on the theatre floor, and the theatre floor reads
-- availability given on phones outside the hospital.
--
-- Both reference their parent by a plain column rather than a foreign key, so
-- neither can park behind a missing parent. Both parents replicate anyway:
-- theatre_suites since 20260901130000_sync_remaining_modules, surgeries since
-- 20260810090000_hybrid_sync_journal — so a row landing on the far node finds
-- the theatre and the case it names.
SELECT sync_enable_table('theatre_readiness_confirmations');
SELECT sync_enable_table('case_team_availability');
