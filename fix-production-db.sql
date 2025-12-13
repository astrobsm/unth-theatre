-- Manual SQL to add staffCode and password reset fields to User table
-- Run this in Vercel Postgres Query editor if automatic migration fails

-- Add staffCode column (for cleaners and porters quick duty logging)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffCode" TEXT;

-- Add password reset columns
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetTokenExpiry" TIMESTAMP(3);

-- Add unique constraint for staffCode
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'User_staffCode_key'
    ) THEN
        CREATE UNIQUE INDEX "User_staffCode_key" ON "User"("staffCode");
    END IF;
END $$;

-- Verify columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'User'
AND column_name IN ('staffCode', 'resetToken', 'resetTokenExpiry')
ORDER BY column_name;
