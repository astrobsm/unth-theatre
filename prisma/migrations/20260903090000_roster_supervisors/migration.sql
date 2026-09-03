-- ============================================================
-- Departmental roster supervisors
-- ------------------------------------------------------------
-- Who may edit and publish a duty roster was decided purely by ROLE. There was
-- no way to say "this person runs the porters' roster" without making them a
-- theatre manager, which grants every other theatre-manager power in the
-- system as the price of one duty roster.
--
-- This table grants that authority per person, per department, and nothing
-- else.
-- ============================================================

CREATE TABLE IF NOT EXISTS "roster_supervisors" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "deptSlug"     TEXT NOT NULL,
  "assignedById" TEXT,
  "assignedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes"        TEXT,
  "sync_version" INTEGER NOT NULL DEFAULT 0,
  "sync_origin"  TEXT,
  "sync_hlc"     TEXT,
  CONSTRAINT "roster_supervisors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "roster_supervisors_userId_deptSlug_key"
  ON "roster_supervisors" ("userId", "deptSlug");
CREATE INDEX IF NOT EXISTS "roster_supervisors_deptSlug_idx"
  ON "roster_supervisors" ("deptSlug");

-- Foreign keys, guarded: a bare ADD CONSTRAINT is not idempotent and raises
-- 42710 on a re-run, which has broken a deployment here before.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roster_supervisors_userId_fkey') THEN
    ALTER TABLE "roster_supervisors"
      ADD CONSTRAINT "roster_supervisors_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roster_supervisors_assignedById_fkey') THEN
    ALTER TABLE "roster_supervisors"
      ADD CONSTRAINT "roster_supervisors_assignedById_fkey"
      FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ------------------------------------------------------------
-- CAPTURE IS ENABLED ON THE CLOUD ONLY, exactly as identity is.
--
-- This table grants authority. "Cloud authoritative" is enforced in decide()
-- only for CONCURRENT changes: an in-sequence edit is applied BEFORE the class
-- is consulted, so a row written on the theatre server would reach the cloud.
-- For a privilege table that is a route to granting yourself rights on the node
-- with the weaker physical security and having them propagate.
--
-- Attaching capture on the cloud alone removes that by construction rather than
-- by trusting a code path: the local node never journals this table, so it has
-- nothing to send. Cloud assignments still flow down every cycle, which is the
-- direction that matters — supervisors are appointed centrally.
--
-- The consequence to know: assigning a supervisor while working ON the theatre
-- server stays on the theatre server. Assign them from the cloud application.
-- ------------------------------------------------------------
DO $$
DECLARE
  this_node text;
BEGIN
  SELECT node_id INTO this_node FROM sync_node WHERE id;

  IF this_node IS NULL OR this_node = 'unset' THEN
    RAISE EXCEPTION 'sync_node.node_id is not set on this database; refusing to guess which side this is.';
  END IF;

  IF this_node = 'cloud' THEN
    PERFORM sync_enable_table('roster_supervisors');
    RAISE NOTICE 'sync: roster_supervisors capture enabled (cloud node)';
  ELSE
    RAISE NOTICE 'sync: roster_supervisors capture is cloud-only; skipped on node %', this_node;
  END IF;
END $$;
