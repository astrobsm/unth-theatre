const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const p = new PrismaClient();

async function check() {
  const user = await p.user.findUnique({
    where: { username: 'admin_1' },
    select: { id: true, username: true, fullName: true, role: true, status: true, password: true }
  });

  if (!user) {
    console.log('❌ admin_1 NOT FOUND in database');
    await p.$disconnect();
    return;
  }

  console.log('User found:', user.username);
  console.log('Full Name:', user.fullName);
  console.log('Role:', user.role);
  console.log('Status:', user.status);

  const match = await bcrypt.compare('test123', user.password);
  console.log('Password "test123" matches:', match);

  if (!match) {
    console.log('\nResetting password to test123...');
    const newHash = await bcrypt.hash('test123', 10);
    await p.user.update({ where: { username: 'admin_1' }, data: { password: newHash } });
    console.log('✅ Password reset done');
  } else {
    console.log('✅ Password is correct');
  }

  // Also check total user count
  const count = await p.user.count();
  console.log('\nTotal users in DB:', count);

  await p.$disconnect();
}

check().catch(e => { console.error(e); p.$disconnect(); });
