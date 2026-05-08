const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const r = await p.user.updateMany({
    where: { department: { in: ['Theatre / Operating Rooms', 'Recovery / PACU', 'Holding Area'] } },
    data: { department: 'Nursing Department' },
  });
  console.log('Migrated rows:', r.count);
  await p.$disconnect();
})();
