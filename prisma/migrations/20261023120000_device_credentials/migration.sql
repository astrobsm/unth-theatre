-- Guarded with IF NOT EXISTS throughout.
--
-- A migration that fails half-way leaves the chain at P3009, which blocks
-- EVERY later deploy until someone resolves it by hand — the build runs
-- `migrate deploy` before `next build`, so a wedged migration means nothing
-- ships at all. That has happened here once. These guards make a retry a
-- no-op instead of a duplicate-object error.

-- CreateTable
CREATE TABLE IF NOT EXISTS "device_credentials" (
    "id" TEXT NOT NULL,
    "selector" TEXT NOT NULL,
    "verifierHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "device_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "device_credentials_selector_key" ON "device_credentials"("selector");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "device_credentials_userId_idx" ON "device_credentials"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "device_credentials_expiresAt_idx" ON "device_credentials"("expiresAt");

-- Replicate between the cloud and the theatre server.
--
-- Without this the feature is broken in the way that is hardest to notice: a
-- phone registers its fingerprint against whichever node it reached first,
-- and then fails to recognise itself on the other one. unth-theatre.link
-- resolves to the theatre server on hospital wifi and to Vercel outside it,
-- so the same surgeon walking in through the front door crosses nodes without
-- doing anything. The radio volume slider had exactly this bug.
--
-- sync_enable_table adds the three sync columns and the capture triggers, and
-- is safe to re-run.
SELECT sync_enable_table('device_credentials');
