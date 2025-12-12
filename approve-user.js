const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function approveUser() {
  try {
    const result = await prisma.user.updateMany({
      where: {
        username: 'astrodouglas'
      },
      data: {
        status: 'APPROVED'
      }
    });
    
    console.log('✅ User approved successfully!');
    console.log(`Updated ${result.count} user(s)`);
    
    // Show the user details
    const user = await prisma.user.findUnique({
      where: { username: 'astrodouglas' },
      select: {
        username: true,
        fullName: true,
        email: true,
        role: true,
        status: true
      }
    });
    
    if (user) {
      console.log('\nUser Details:');
      console.log('Username:', user.username);
      console.log('Full Name:', user.fullName);
      console.log('Email:', user.email);
      console.log('Role:', user.role);
      console.log('Status:', user.status);
      console.log('\n✅ You can now login at: https://unth-theatre-mai.vercel.app/auth/login');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

approveUser();
