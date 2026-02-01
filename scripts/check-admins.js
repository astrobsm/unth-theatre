const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkAdmins() {
  try {
    const users = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { username: true, status: true, role: true, password: true }
    });
    
    console.log('Admin users found:', users.length);
    users.forEach(u => {
      console.log(`  - ${u.username} | Status: ${u.status} | Password hash exists: ${!!u.password}`);
    });
    
    if (users.length === 0) {
      console.log('\n⚠️ No admin users found! Run: npx prisma db seed');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkAdmins();
