const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function extractUsers() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        staffId: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        phoneNumber: true,
        department: true,
        staffCode: true,
        isFirstLogin: true,
        createdAt: true,
        approvedAt: true,
      },
      orderBy: [{ department: 'asc' }, { fullName: 'asc' }],
    });

    console.log(`\n========== TOTAL USERS: ${users.length} ==========\n`);

    // Summary by status
    const byStatus = users.reduce((acc, u) => {
      acc[u.status] = (acc[u.status] || 0) + 1;
      return acc;
    }, {});
    console.log('By Status:', byStatus);

    // Summary by role
    const byRole = users.reduce((acc, u) => {
      acc[u.role] = (acc[u.role] || 0) + 1;
      return acc;
    }, {});
    console.log('By Role:', byRole);

    // First-login (never logged in)
    const neverLoggedIn = users.filter((u) => u.isFirstLogin).length;
    console.log(`Never logged in (still first-login): ${neverLoggedIn}\n`);

    // Output dir
    const outDir = path.join(__dirname, '..', 'exports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    // JSON
    const jsonPath = path.join(outDir, `users-${stamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(users, null, 2));
    console.log(`JSON saved: ${jsonPath}`);

    // CSV
    const headers = [
      'fullName',
      'username',
      'staffId',
      'role',
      'department',
      'status',
      'email',
      'phoneNumber',
      'staffCode',
      'isFirstLogin',
      'createdAt',
      'approvedAt',
    ];
    const escape = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const csv = [
      headers.join(','),
      ...users.map((u) => headers.map((h) => escape(u[h])).join(',')),
    ].join('\n');
    const csvPath = path.join(outDir, `users-${stamp}.csv`);
    fs.writeFileSync(csvPath, csv);
    console.log(`CSV saved:  ${csvPath}\n`);

    // Console table
    console.table(
      users.map((u) => ({
        Name: u.fullName,
        Username: u.username,
        Role: u.role,
        Dept: u.department || '-',
        Status: u.status,
        FirstLogin: u.isFirstLogin ? 'YES' : 'no',
      }))
    );
  } catch (err) {
    console.error('Error extracting users:', err.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

extractUsers();
