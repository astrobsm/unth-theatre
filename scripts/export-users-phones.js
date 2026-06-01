const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

function normalizePhone(p) {
  if (!p) return '';
  let s = String(p).trim().replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) return s;
  if (s.startsWith('234')) return '+' + s;
  if (s.startsWith('0') && s.length === 11) return '+234' + s.slice(1);
  return s;
}

async function main() {
  const users = await prisma.user.findMany({
    where: { status: 'APPROVED' },
    select: {
      fullName: true,
      username: true,
      role: true,
      department: true,
      phoneNumber: true,
      email: true,
    },
    orderBy: [{ department: 'asc' }, { fullName: 'asc' }],
  });

  const withPhone = [];
  const withoutPhone = [];
  for (const u of users) {
    const phone = normalizePhone(u.phoneNumber);
    const name = (u.fullName || '').trim();
    const skip = !name || /^\d+$/.test(name);
    if (skip) continue;
    if (phone) withPhone.push({ ...u, phoneNumber: phone });
    else withoutPhone.push(u);
  }

  console.log(`\nTotal approved users: ${users.length}`);
  console.log(`With phone number:    ${withPhone.length}`);
  console.log(`Without phone number: ${withoutPhone.length}\n`);

  // Group by department for the readable list
  const byDept = {};
  for (const u of withPhone) {
    const d = u.department || 'Unassigned';
    if (!byDept[d]) byDept[d] = [];
    byDept[d].push(u);
  }
  const depts = Object.keys(byDept).sort();

  // ---- Readable (WhatsApp/Word friendly) ----
  const lines = [];
  lines.push('📒 *ORM PLATFORM — REGISTERED USERS & PHONE NUMBERS*');
  lines.push(`Total: ${withPhone.length} (with phone) + ${withoutPhone.length} (missing phone)`);
  lines.push(`🔗 https://unth-theatre-mai.vercel.app`);
  lines.push('');
  let counter = 0;
  for (const d of depts) {
    lines.push(`*${d.toUpperCase()} (${byDept[d].length})*`);
    byDept[d].forEach((u) => {
      counter += 1;
      lines.push(`${counter}. ${u.fullName} — ${u.phoneNumber} _(${u.role})_`);
    });
    lines.push('');
  }

  if (withoutPhone.length > 0) {
    lines.push('────────────────────────────');
    lines.push(`⚠️ *USERS WITHOUT A PHONE NUMBER ON FILE* (${withoutPhone.length})`);
    lines.push('Kindly send your phone number to the ORM Team to be added.');
    lines.push('────────────────────────────');
    withoutPhone.forEach((u, i) => {
      lines.push(`${i + 1}. ${u.fullName} _(${u.role}${u.department ? ', ' + u.department : ''})_`);
    });
  }

  // ---- CSV ----
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const csvHeaders = ['Full Name', 'Phone', 'Role', 'Department', 'Username', 'Email'];
  const csvRows = [
    csvHeaders.join(','),
    ...withPhone.map((u) =>
      [u.fullName, u.phoneNumber, u.role, u.department, u.username, u.email]
        .map(esc)
        .join(','),
    ),
  ];

  // ---- Phone-only (for bulk SMS / contact import) ----
  const phoneOnly = withPhone.map((u) => u.phoneNumber).join('\n');

  const outDir = path.join(__dirname, '..', 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().split('T')[0];

  const txtPath = path.join(outDir, `users-phone-list-${stamp}.txt`);
  const csvPath = path.join(outDir, `users-phone-list-${stamp}.csv`);
  const phonesPath = path.join(outDir, `users-phones-only-${stamp}.txt`);

  fs.writeFileSync(txtPath, lines.join('\n'), 'utf8');
  fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');
  fs.writeFileSync(phonesPath, phoneOnly, 'utf8');

  console.log(`📄 Readable list: ${txtPath}`);
  console.log(`📊 CSV:           ${csvPath}`);
  console.log(`📱 Phones only:   ${phonesPath}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
