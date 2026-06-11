-- Water Supply department daily readiness reports (separate from Plumbing).
CREATE TABLE IF NOT EXISTS "water_supply_readiness" (
  "id" TEXT NOT NULL,
  "readinessDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "forDate" TIMESTAMP(3) NOT NULL,
  "overheadTankLevel" INTEGER NOT NULL DEFAULT 0,
  "groundTankLevel" INTEGER NOT NULL DEFAULT 0,
  "restroomsWaterReady" BOOLEAN NOT NULL DEFAULT false,
  "scrubbingWaterReady" BOOLEAN NOT NULL DEFAULT false,
  "theatreActivitiesWaterReady" BOOLEAN NOT NULL DEFAULT false,
  "noShortageConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "overallReadiness" TEXT NOT NULL,
  "riskDetails" TEXT,
  "actionTaken" TEXT,
  "notes" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isLate" BOOLEAN NOT NULL DEFAULT false,
  "disciplinaryQueryIssued" BOOLEAN NOT NULL DEFAULT false,
  "loggedById" TEXT NOT NULL,
  "loggedByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "water_supply_readiness_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "water_supply_readiness_forDate_idx" ON "water_supply_readiness"("forDate");
CREATE INDEX IF NOT EXISTS "water_supply_readiness_overallReadiness_idx" ON "water_supply_readiness"("overallReadiness");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'water_supply_readiness_loggedById_fkey'
  ) THEN
    ALTER TABLE "water_supply_readiness"
      ADD CONSTRAINT "water_supply_readiness_loggedById_fkey"
      FOREIGN KEY ("loggedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
