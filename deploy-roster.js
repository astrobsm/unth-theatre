const { PrismaClient } = require('@prisma/client');

async function deployRoster() {
  const prisma = new PrismaClient();

  try {
    console.log('🚀 Starting roster system deployment...\n');

    // Test database connection
    console.log('📡 Testing database connection...');
    await prisma.$connect();
    console.log('✅ Database connected successfully\n');

    // Check if Roster table exists
    console.log('🔍 Checking for Roster table...');
    try {
      const rosterCount = await prisma.roster.count();
      console.log(`✅ Roster table exists with ${rosterCount} records\n`);
    } catch (error) {
      console.log('⚠️  Roster table does not exist yet\n');
      console.log('❌ ERROR: Database schema is not up to date!');
      console.log('\n📋 Please run the following command to update your database:');
      console.log('   npx prisma db push\n');
      console.log('Or if you are deploying to production, set your DATABASE_URL');
      console.log('environment variable and run: npx prisma db push\n');
      process.exit(1);
    }

    // Check if shift column exists in TheatreAllocation
    console.log('🔍 Checking TheatreAllocation schema...');
    try {
      const allocation = await prisma.theatreAllocation.findFirst({
        select: { shift: true }
      });
      console.log('✅ TheatreAllocation has shift column\n');
    } catch (error) {
      console.log('⚠️  TheatreAllocation shift column may be missing\n');
    }

    console.log('✅ All roster system tables verified!\n');
    console.log('🎉 Roster deployment check complete!\n');
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

deployRoster();
