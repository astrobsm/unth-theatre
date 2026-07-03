-- Migration: Walkie-talkie radio pickup/return log for porters and cleaners.

CREATE TABLE IF NOT EXISTS "walkie_talkie_logs" (
    "id" TEXT NOT NULL,
    "deviceSerial" TEXT NOT NULL,
    "staffId" TEXT,
    "staffName" TEXT NOT NULL,
    "staffRole" TEXT,
    "location" TEXT NOT NULL DEFAULT 'UNTH Ituku-Ozalla (Enugu–Port Harcourt Expressway)',
    "status" TEXT NOT NULL DEFAULT 'OUT',
    "pickupAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pickupById" TEXT,
    "returnAt" TIMESTAMP(3),
    "returnById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "walkie_talkie_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "walkie_talkie_logs_status_idx" ON "walkie_talkie_logs"("status");
CREATE INDEX IF NOT EXISTS "walkie_talkie_logs_deviceSerial_idx" ON "walkie_talkie_logs"("deviceSerial");
CREATE INDEX IF NOT EXISTS "walkie_talkie_logs_pickupAt_idx" ON "walkie_talkie_logs"("pickupAt");
