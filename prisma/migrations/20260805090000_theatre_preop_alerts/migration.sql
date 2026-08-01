-- The 60-minute preoperative alert, recorded once per case.
--
-- surgeryId is UNIQUE and that is the entire reason this table exists: the
-- alert job runs every five minutes, so without a unique anchor a case due in
-- an hour would be announced twelve times before it started.
--
-- Additive only. Nothing existing is altered.

CREATE TABLE "theatre_preop_alerts" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "minutesBefore" INTEGER NOT NULL,
    "recipientIds" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "announced" BOOLEAN NOT NULL DEFAULT false,
    "wardNotified" BOOLEAN NOT NULL DEFAULT false,
    "pushSent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "theatre_preop_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "theatre_preop_alerts_surgeryId_key" ON "theatre_preop_alerts"("surgeryId");

CREATE INDEX "theatre_preop_alerts_sentAt_idx" ON "theatre_preop_alerts"("sentAt");

-- surgeries.id is TEXT (verified against the live database, not assumed).
ALTER TABLE "theatre_preop_alerts" ADD CONSTRAINT "theatre_preop_alerts_surgeryId_fkey"
    FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
