-- Native mobile push tokens (Firebase Cloud Messaging).
CREATE TABLE IF NOT EXISTS "device_tokens" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'android',
  "userId" TEXT,
  "userRole" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "device_tokens_token_key" ON "device_tokens"("token");
CREATE INDEX IF NOT EXISTS "device_tokens_userId_idx" ON "device_tokens"("userId");
CREATE INDEX IF NOT EXISTS "device_tokens_userRole_idx" ON "device_tokens"("userRole");
