-- Devices kept signed in to the theatre Wi-Fi.
--
-- Idempotent throughout: this migration is applied to the cloud node by the
-- build and to the theatre server by its own nightly self-update, and both
-- have re-run a migration before now.
--
-- NO sync_enable_table() HERE, deliberately. A MAC address is meaningful only
-- on the network it joined, and the cloud node has no hotspot. See the note on
-- the model in schema.prisma.

CREATE TABLE IF NOT EXISTS "hotspot_devices" (
  "id"          TEXT NOT NULL,
  "mac"         TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "remembered"  BOOLEAN NOT NULL DEFAULT true,
  "label"       TEXT,
  "userAgent"   TEXT,
  "enrolledAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"  TIMESTAMP(3),
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "revokedAt"   TIMESTAMP(3),
  "revokedById" TEXT,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hotspot_devices_pkey" PRIMARY KEY ("id")
);

-- One row per handset: whoever signed in last owns the enrolment.
CREATE UNIQUE INDEX IF NOT EXISTS "hotspot_devices_mac_key" ON "hotspot_devices"("mac");
CREATE INDEX IF NOT EXISTS "hotspot_devices_userId_idx" ON "hotspot_devices"("userId");
CREATE INDEX IF NOT EXISTS "hotspot_devices_expiresAt_idx" ON "hotspot_devices"("expiresAt");

-- Cascade: deleting a member of staff must not leave their phone trusted.
DO $$
BEGIN
  ALTER TABLE "hotspot_devices"
    ADD CONSTRAINT "hotspot_devices_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
