-- Idempotency guard for offline-queued writes (dedupe on reconnect-sync). Idempotent.
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "key" TEXT PRIMARY KEY,
  "responseStatus" INTEGER NOT NULL,
  "responseBody" TEXT NOT NULL,
  "route" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idempotency_keys_createdAt_idx" ON "idempotency_keys" ("createdAt");
