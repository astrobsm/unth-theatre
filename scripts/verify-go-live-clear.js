/* eslint-disable */
const fs = require('fs');
const path = require('path');
try {
  const t = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  for (const l of t.split(/\r?\n/)) {
    const m = l.match(/^\s*DIRECT_URL\s*=\s*(.+)/);
    if (m) process.env.DATABASE_URL = m[1].replace(/^['"]|['"]$/g, '');
  }
} catch {}
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [s, a, po, dq, dqOld] = await Promise.all([
    db.surgery.count(),
    db.anestheticPrescription.count(),
    db.postOpPrescription.count(),
    db.disciplinaryQuery.count(),
    db.disciplinaryQuery.count({ where: { createdAt: { lt: startOfToday } } }),
  ]);
  console.log('surgeries:', s);
  console.log('anestheticPrescriptions:', a);
  console.log('postOpPrescriptions:', po);
  console.log('disciplinaryQueries total:', dq, '| before today:', dqOld);
  await db.$disconnect();
})();
