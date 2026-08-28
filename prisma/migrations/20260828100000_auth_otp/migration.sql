-- One-time codes for account recovery, delivered by SMS.
--
-- 97% of approved staff have a phone number on file and only 82% have an email
-- address, so the phone reaches 79 more people than the emailed reset link ever
-- did -- and it works for somebody standing in a theatre corridor who cannot
-- reach their inbox from the hospital network.
--
-- The code itself is NEVER stored: code_hash is an HMAC-SHA256 of the code
-- under a server-side pepper, so read access to this table does not yield a
-- working code.

CREATE TABLE IF NOT EXISTS "auth_otps" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  -- PASSWORD_RESET | USERNAME_RECOVERY
  "purpose"     TEXT NOT NULL,
  "codeHash"    TEXT NOT NULL,
  -- Masked for display only, e.g. "0803****373". Never the full number.
  "destination" TEXT NOT NULL,
  "channel"     TEXT NOT NULL DEFAULT 'SMS',
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "consumedAt"  TIMESTAMP(3),
  "requestIp"   TEXT,
  "providerRef" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "auth_otps_pkey" PRIMARY KEY ("id")
);

-- Rate limiting reads "codes issued for this account and purpose, recently",
-- on every request. Without this index that is a sequential scan on a table
-- that only grows.
CREATE INDEX IF NOT EXISTS "auth_otps_userId_purpose_createdAt_idx"
  ON "auth_otps" ("userId", "purpose", "createdAt");

-- For pruning old rows and for looking at request patterns across accounts,
-- which is how a script working through staff names becomes visible.
CREATE INDEX IF NOT EXISTS "auth_otps_createdAt_idx" ON "auth_otps" ("createdAt");

-- Cascade: a deleted user's unused codes must not outlive the account.
ALTER TABLE "auth_otps"
  ADD CONSTRAINT "auth_otps_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
