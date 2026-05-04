-- Add missing Roster.seniorityLevel column (was added to schema.prisma but never migrated)
ALTER TABLE "rosters" ADD COLUMN IF NOT EXISTS "seniorityLevel" TEXT;

-- Add missing UserRole enum value for the cafeteria manager role
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'THEATRE_CAFETERIA_MANAGER';
