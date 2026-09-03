-- ============================================================
-- Chasing an emergency that was booked and never started
-- ------------------------------------------------------------
-- The theatre's rule is that a booked emergency starts within the hour. Cases
-- were being booked, the hour passing, and no reason recorded — so a case could
-- sit for an afternoon with no name against the delay and no trail afterwards.
--
-- emergency_delay_escalations  one row per booking: how far the chase has got.
-- audit_committee_invitations  one row per person: the invitation an
--                              administrator sends at the third hour.
-- ============================================================

CREATE TABLE IF NOT EXISTS "emergency_delay_escalations" (
  "id"                     TEXT NOT NULL,
  "bookingId"              TEXT NOT NULL,
  "stage"                  INTEGER NOT NULL DEFAULT 0,
  "stage1At"               TIMESTAMP(3),
  "stage2At"               TIMESTAMP(3),
  "stage3At"               TIMESTAMP(3),
  "minutesLateAtLastStage" INTEGER,
  "reasonAtLastStage"      TEXT,
  "resolvedAt"             TIMESTAMP(3),
  "resolvedReason"         TEXT,
  "lastCheckedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version"           INTEGER NOT NULL DEFAULT 0,
  "sync_origin"            TEXT,
  "sync_hlc"               TEXT,
  CONSTRAINT "emergency_delay_escalations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "emergency_delay_escalations_bookingId_key"
  ON "emergency_delay_escalations" ("bookingId");
CREATE INDEX IF NOT EXISTS "emergency_delay_escalations_stage_resolvedAt_idx"
  ON "emergency_delay_escalations" ("stage", "resolvedAt");

CREATE TABLE IF NOT EXISTS "audit_committee_invitations" (
  "id"           TEXT NOT NULL,
  "escalationId" TEXT NOT NULL,
  "bookingId"    TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "personName"   TEXT NOT NULL,
  "roleOnCase"   TEXT NOT NULL,
  "phoneNumber"  TEXT,
  "message"      TEXT NOT NULL,
  "appearAt"     TIMESTAMP(3),
  "sentAt"       TIMESTAMP(3),
  "sentById"     TEXT,
  "channel"      TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_version" INTEGER NOT NULL DEFAULT 0,
  "sync_origin"  TEXT,
  "sync_hlc"     TEXT,
  CONSTRAINT "audit_committee_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "audit_committee_invitations_escalationId_userId_key"
  ON "audit_committee_invitations" ("escalationId", "userId");
CREATE INDEX IF NOT EXISTS "audit_committee_invitations_bookingId_idx"
  ON "audit_committee_invitations" ("bookingId");
CREATE INDEX IF NOT EXISTS "audit_committee_invitations_sentAt_idx"
  ON "audit_committee_invitations" ("sentAt");

-- Foreign keys, guarded: a bare ADD CONSTRAINT is not idempotent and raises
-- 42710 on a re-run, which has broken a deployment here before.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emergency_delay_escalations_bookingId_fkey') THEN
    ALTER TABLE "emergency_delay_escalations"
      ADD CONSTRAINT "emergency_delay_escalations_bookingId_fkey"
      FOREIGN KEY ("bookingId") REFERENCES "emergency_surgery_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_committee_invitations_escalationId_fkey') THEN
    ALTER TABLE "audit_committee_invitations"
      ADD CONSTRAINT "audit_committee_invitations_escalationId_fkey"
      FOREIGN KEY ("escalationId") REFERENCES "emergency_delay_escalations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_committee_invitations_userId_fkey') THEN
    ALTER TABLE "audit_committee_invitations"
      ADD CONSTRAINT "audit_committee_invitations_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ------------------------------------------------------------
-- Capture on BOTH nodes. These are operational records, not privileges: an
-- escalation raised on the theatre server must reach the cloud, because that is
-- where an administrator reviews the invitations before sending them.
--
-- Their foreign-key parents both replicate already — emergency_surgery_bookings
-- since 20260831100000, users since 20260817170000 — so a row arriving on the
-- far node finds what it points at. A child whose parent does not travel parks
-- for ever, which is the failure this project has already had twice.
-- ------------------------------------------------------------
SELECT sync_enable_table('emergency_delay_escalations');
SELECT sync_enable_table('audit_committee_invitations');
