-- Deploy Roster System to Production Database
-- Run this SQL on your production PostgreSQL database

-- 1. Create DutyShift enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE "DutyShift" AS ENUM ('MORNING', 'CALL', 'NIGHT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create StaffCategory enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE "StaffCategory" AS ENUM ('NURSES', 'ANAESTHETISTS', 'PORTERS', 'CLEANERS', 'ANAESTHETIC_TECHNICIANS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Create Roster table
CREATE TABLE IF NOT EXISTS "Roster" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "staffName" TEXT NOT NULL,
    "staffCategory" "StaffCategory" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "theatreId" TEXT NOT NULL,
    "shift" "DutyShift" NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "Roster_pkey" PRIMARY KEY ("id")
);

-- 4. Add shift column to TheatreAllocation table if it doesn't exist
DO $$ BEGIN
    ALTER TABLE "TheatreAllocation" ADD COLUMN "shift" "DutyShift";
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- 5. Create indexes on Roster table
CREATE INDEX IF NOT EXISTS "Roster_date_theatreId_shift_idx" ON "Roster"("date", "theatreId", "shift");
CREATE INDEX IF NOT EXISTS "Roster_staffCategory_date_idx" ON "Roster"("staffCategory", "date");
CREATE INDEX IF NOT EXISTS "Roster_userId_idx" ON "Roster"("userId");
CREATE INDEX IF NOT EXISTS "Roster_theatreId_idx" ON "Roster"("theatreId");
CREATE INDEX IF NOT EXISTS "Roster_uploadedBy_idx" ON "Roster"("uploadedBy");

-- 6. Add foreign key constraints
DO $$ BEGIN
    ALTER TABLE "Roster" ADD CONSTRAINT "Roster_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Roster" ADD CONSTRAINT "Roster_theatreId_fkey" 
        FOREIGN KEY ("theatreId") REFERENCES "TheatreSuite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Roster" ADD CONSTRAINT "Roster_uploadedBy_fkey" 
        FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Success message
SELECT 'Roster system successfully deployed to production!' as message;
