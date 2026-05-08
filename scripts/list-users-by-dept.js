const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const users = await p.user.findMany({
    where: { status: 'APPROVED' },
    select: {
      fullName: true,
      role: true,
      department: true,
      staffCode: true,
      staffId: true,
      email: true,
      phoneNumber: true,
      createdAt: true,
    },
    orderBy: [{ department: 'asc' }, { role: 'asc' }, { fullName: 'asc' }],
  });

  const groups = {};
  for (const u of users) {
    const k = u.department || '(No department)';
    (groups[k] = groups[k] || []).push(u);
  }

  console.log('============================================================');
  console.log('  UNTH THEATRE — APPROVED USERS BY DEPARTMENT');
  console.log('  Generated: ' + new Date().toLocaleString());
  console.log('  Total approved users: ' + users.length);
  console.log('============================================================');

  for (const dept of Object.keys(groups).sort()) {
    const list = groups[dept];
    console.log('\n=== ' + dept + '  (' + list.length + ' user' + (list.length === 1 ? '' : 's') + ') ===');
    list.forEach((u, i) => {
      console.log(
        '  ' + (i + 1).toString().padStart(2, ' ') + '. ' +
        u.fullName.padEnd(28, ' ') + ' | ' +
        (u.role || '-').padEnd(28, ' ') + ' | ' +
        (u.staffCode || '-').padEnd(8, ' ') + ' | ' +
        'StaffID: ' + (u.staffId || '-').padEnd(12, ' ') + ' | ' +
        (u.email || '-')
      );
    });
  }

  console.log('\n------------------------------------------------------------');
  console.log('Counts by department:');
  for (const dept of Object.keys(groups).sort()) {
    console.log('  ' + dept.padEnd(40, '.') + ' ' + groups[dept].length);
  }

  await p.$disconnect();
})().catch(async (e) => { console.error(e); await p.$disconnect(); process.exit(1); });
