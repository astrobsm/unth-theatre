/**
 * Manual Database Migration Script
 * Run this to add missing columns to production database
 * 
 * Usage: node update-production-db.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Starting database update...');
  
  try {
    // Execute raw SQL to add missing columns
    await prisma.$executeRaw`
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffCode" TEXT;
    `;
    console.log('✅ Added staffCode column');

    await prisma.$executeRaw`
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetToken" TEXT;
    `;
    console.log('✅ Added resetToken column');

    await prisma.$executeRaw`
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetTokenExpiry" TIMESTAMP(3);
    `;
    console.log('✅ Added resetTokenExpiry column');

    // Add unique constraint
    await prisma.$executeRaw`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'User_staffCode_key'
        ) THEN
          CREATE UNIQUE INDEX "User_staffCode_key" ON "User"("staffCode");
        END IF;
      END $$;
    `;
    console.log('✅ Added unique constraint for staffCode');

    // Verify columns exist
    const result = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'User'
      AND column_name IN ('staffCode', 'resetToken', 'resetTokenExpiry')
      ORDER BY column_name;
    `;
    
    console.log('\n📊 Verification - Columns added:');
    console.table(result);

    console.log('\n✨ Database update completed successfully!');
  } catch (error) {
    console.error('❌ Error updating database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
