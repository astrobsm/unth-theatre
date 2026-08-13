-- ============================================================
-- Theatre team assignments — many people per role, each attributed
-- ------------------------------------------------------------
-- TheatreAllocation carries one column per role, which cannot express "two
-- technicians on this case", and in practice more than one person covers a
-- category. So the team becomes rows rather than columns.
--
-- The attribution matters as much as the assignment: anaesthesia is assigned by
-- the anaesthetists and technicians by the technicians, so "who put me on this
-- list" must have an answer.
--
-- Additive. TheatreAllocation is left exactly as it is — the readiness board and
-- the call-for-patient board read it, and this table supplements rather than
-- replaces it.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "TheatreTeamRole" AS ENUM (
    'SCRUB_NURSE', 'CIRCULATING_NURSE', 'CONSULTANT_ANAESTHETIST',
    'ANAESTHETIST', 'ANAESTHETIC_TECHNICIAN'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "theatre_team_assignments" (
  "id"             TEXT NOT NULL,
  "surgeryId"      TEXT NOT NULL,
  "role"           "TheatreTeamRole" NOT NULL,
  "userId"         TEXT NOT NULL,
  -- Snapshotted: a rota printed today must still read correctly if the person is
  -- later renamed or leaves.
  "userName"       TEXT NOT NULL,

  "assignedById"   TEXT,
  "assignedByName" TEXT,
  "assignedByRole" TEXT,
  "assignedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Set instead of deleting, so a removal is still a recorded decision.
  "removedAt"      TIMESTAMP(3),
  "removedById"    TEXT,
  "removedByName"  TEXT,

  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "theatre_team_assignments_pkey" PRIMARY KEY ("id")
);

-- The same person twice in the same role on one case is a mistake, not an
-- intention.
CREATE UNIQUE INDEX IF NOT EXISTS "theatre_team_assignments_surgery_role_user_key"
  ON "theatre_team_assignments" ("surgeryId", "role", "userId");

CREATE INDEX IF NOT EXISTS "theatre_team_assignments_surgery_role_idx"
  ON "theatre_team_assignments" ("surgeryId", "role");

-- "What am I on?" is asked by a person about themselves, most often for today.
CREATE INDEX IF NOT EXISTS "theatre_team_assignments_user_idx"
  ON "theatre_team_assignments" ("userId", "assignedAt");
