const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function resetAdminPassword() {
  try {
    // Create a fresh password hash for 'admin123'
    const newPassword = await bcrypt.hash('admin123', 10);
    
    // Update admin_1's password
    const updated = await prisma.user.update({
      where: { username: 'admin_1' },
      data: { password: newPassword }
    });
    
    console.log('✅ Password reset for admin_1');
    console.log('Username: admin_1');
    console.log('Password: admin123');
    
    // Verify the hash works
    const user = await prisma.user.findUnique({
      where: { username: 'admin_1' }
    });
    
    const isValid = await bcrypt.compare('admin123', user.password);
    console.log('Password verification:', isValid ? '✅ SUCCESS' : '❌ FAILED');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

resetAdminPassword();
