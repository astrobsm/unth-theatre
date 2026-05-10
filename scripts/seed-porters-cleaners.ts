/**
 * UNTH Theatre — Seed Porters & Cleaners (CTU + Main Theatre)
 *
 * Creates User rows for the supplied roster of porters and cleaners with:
 *  - role           : PORTER | CLEANER
 *  - status         : APPROVED
 *  - staffCode      : PRT### / CLN### (sequential, continues from existing max)
 *  - staffId        : null (each staff member sets it on first login)
 *  - isFirstLogin   : true
 *  - mustChangePassword: true (forces password change on first sign-in)
 *  - default password: their own phone number (memorable, private)
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/seed-porters-cleaners.ts
 *
 * Idempotent: re-running will skip names that already exist (matched by
 * normalised username) and only create the missing ones. Existing users are
 * never overwritten.
 *
 * After completion the script prints a credentials table (Name | Username |
 * Default Password | Staff Code | Phone | Department).
 */

import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

type Row = {
  name: string;
  phone: string;
  role: 'PORTER' | 'CLEANER';
  department: string;
};

// ---------------------------------------------------------------------------
// Roster supplied by the Theatre Chairman (May 2026)
// ---------------------------------------------------------------------------
const ROSTER: Row[] = [
  // CTU - THEATRE
  { name: 'ONUOHA PRICILLA E.', phone: '07037861635', role: 'CLEANER', department: 'CTU Theatre' },
  { name: 'OKOLO IFEANYI H.', phone: '08061626289', role: 'PORTER', department: 'CTU Theatre' },
  { name: 'UGWU CHINYERE', phone: '08064082080', role: 'CLEANER', department: 'CTU Theatre' },
  { name: 'IBIOFIA CHARLES I.', phone: '08035318995', role: 'PORTER', department: 'CTU Theatre' },
  { name: 'EZENMA FIDELIS', phone: '07062465414', role: 'PORTER', department: 'CTU Theatre' },
  { name: 'ENE AMAKA', phone: '07036630420', role: 'CLEANER', department: 'CTU Theatre' },
  { name: 'UGWU ALBERT', phone: '07082205236', role: 'PORTER', department: 'CTU Theatre' },
  { name: 'OGWURIKE JUSTICE CHUKWUEMEKA', phone: '09067808761', role: 'PORTER', department: 'CTU Theatre' },

  // MAIN THEATRE — Cleaners
  { name: 'OKECHUKWU RACHEAL', phone: '08131597172', role: 'CLEANER', department: 'Main Theatre' },
  { name: 'UDEH PATRICIA', phone: '08034146505', role: 'CLEANER', department: 'Main Theatre' },
  { name: 'MADUABUCHI CECILIA', phone: '08079085191', role: 'CLEANER', department: 'Main Theatre' },
  { name: 'AGODO DEBORAH', phone: '08130403441', role: 'CLEANER', department: 'Main Theatre' },
  { name: 'IFENABOR JUSTINA', phone: '07034375056', role: 'CLEANER', department: 'Main Theatre' },
  { name: 'OGUAMALAM PATIENCE', phone: '09114150709', role: 'CLEANER', department: 'Main Theatre' },
  { name: 'EZENWAGU HELEN', phone: '07062116389', role: 'CLEANER', department: 'Main Theatre' },
  { name: 'OKONKWO NKIRU', phone: '09063949547', role: 'CLEANER', department: 'Main Theatre' },
  { name: 'NWABUEZE PHILOMENA', phone: '08064135551', role: 'CLEANER', department: 'Main Theatre' },
  { name: 'ONYEMA UKAMAKA', phone: '08161816702', role: 'CLEANER', department: 'Main Theatre' },
  { name: 'OKAFOR EDITH', phone: '08148549801', role: 'CLEANER', department: 'Main Theatre' },
  { name: 'OZOR MARTINA', phone: '09076058001', role: 'CLEANER', department: 'Main Theatre' },
  { name: 'UDEH GLORIA', phone: '08063769136', role: 'CLEANER', department: 'Main Theatre' },
  { name: 'NWANI LUCY', phone: '08164380347', role: 'CLEANER', department: 'Main Theatre' },
  { name: 'UDEH OGOCHUKWU', phone: '08105924322', role: 'CLEANER', department: 'Main Theatre' },
  { name: 'NWANZE VICTORIA', phone: '07079745660', role: 'CLEANER', department: 'Main Theatre' },
  { name: 'ONYINYE UGWU', phone: '07030964845', role: 'CLEANER', department: 'Main Theatre' },
  { name: 'NWAFOR CHIDIEBERE', phone: '08143151625', role: 'CLEANER', department: 'Main Theatre' },

  // MAIN THEATRE — Porters
  { name: 'NEVO S.U', phone: '08032264045', role: 'PORTER', department: 'Main Theatre' },
  { name: 'ONWU EMEKA', phone: '07048235740', role: 'PORTER', department: 'Main Theatre' },
  { name: 'EBERECHI CHUKWUDI', phone: '08065483272', role: 'PORTER', department: 'Main Theatre' },
  { name: 'NWAIGWE RISE', phone: '08067112764', role: 'PORTER', department: 'Main Theatre' },
  { name: 'NWEKE STEPHEN', phone: '08165593079', role: 'PORTER', department: 'Main Theatre' },
  { name: 'OKONKWO ELOCHUKWU', phone: '08039368294', role: 'PORTER', department: 'Main Theatre' },
  { name: 'OGUZIE CHIBUEZE', phone: '07035842449', role: 'PORTER', department: 'Main Theatre' },
  { name: 'NDUBUISI NJOKU', phone: '08138770875', role: 'PORTER', department: 'Main Theatre' },
  { name: 'EZE JOSEPH', phone: '08109549551', role: 'PORTER', department: 'Main Theatre' },
  { name: 'OKULI CHUKWUEBUKA', phone: '07019748006', role: 'PORTER', department: 'Main Theatre' },
  { name: 'OKORO UGOCHUKWU', phone: '08063718647', role: 'PORTER', department: 'Main Theatre' },
  { name: 'UWAKWE OGADINMA', phone: '09064318757', role: 'PORTER', department: 'Main Theatre' },
  { name: 'SUNDAY NWANKWO', phone: '09015463923', role: 'PORTER', department: 'Main Theatre' },
  { name: 'DAVID NNADI', phone: '09021824707', role: 'PORTER', department: 'Main Theatre' },
  { name: 'IBE CHIEMERIEM', phone: '08100177482', role: 'PORTER', department: 'Main Theatre' },
  { name: 'OKOYE MARK', phone: '07066930698', role: 'PORTER', department: 'Main Theatre' },
  { name: 'OKOLI JOHN', phone: '09067139712', role: 'PORTER', department: 'Main Theatre' },
  { name: 'KOJO IKECHUKWU', phone: '09037726370', role: 'PORTER', department: 'Main Theatre' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toUsername(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 40);
}

async function nextStaffCode(role: 'PORTER' | 'CLEANER', allocated: Set<string>) {
  const prefix = role === 'PORTER' ? 'PRT' : 'CLN';
  const existing = await prisma.user.findMany({
    where: { staffCode: { startsWith: prefix } },
    select: { staffCode: true },
  });
  const re = new RegExp(`^${prefix}(\\d+)$`);
  const used = new Set<number>();
  for (const r of existing) {
    const m = (r.staffCode || '').match(re);
    if (m) used.add(parseInt(m[1], 10));
  }
  for (const c of Array.from(allocated)) {
    const m = c.match(re);
    if (m) used.add(parseInt(m[1], 10));
  }
  let n = 1;
  while (used.has(n)) n += 1;
  const code = `${prefix}${String(n).padStart(3, '0')}`;
  allocated.add(code);
  return code;
}

async function uniqueUsername(base: string): Promise<string> {
  let candidate = base;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const hit = await prisma.user.findUnique({ where: { username: candidate } });
    if (!hit) return candidate;
    suffix += 1;
    candidate = `${base}.${suffix}`;
    if (suffix > 50) throw new Error(`Could not derive unique username for ${base}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
type Credential = {
  name: string;
  username: string;
  password: string;
  staffCode: string;
  phone: string;
  role: string;
  department: string;
  status: 'created' | 'existing';
};

async function main() {
  console.log(`\n🌱 Seeding ${ROSTER.length} porters/cleaners ...\n`);

  const allocated = new Set<string>();
  const credentials: Credential[] = [];

  for (const row of ROSTER) {
    const baseUsername = toUsername(row.name);
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { username: baseUsername },
          { fullName: row.name, role: row.role as UserRole },
          { phoneNumber: row.phone, role: row.role as UserRole },
        ],
      },
      select: {
        username: true,
        staffCode: true,
        phoneNumber: true,
        fullName: true,
        department: true,
        role: true,
      },
    });

    if (existing) {
      console.log(`↩  exists  ${row.name.padEnd(36)}  ${existing.username}  ${existing.staffCode || '-'}`);
      credentials.push({
        name: row.name,
        username: existing.username,
        password: '(unchanged — already onboarded)',
        staffCode: existing.staffCode || '(none)',
        phone: existing.phoneNumber || row.phone,
        role: existing.role,
        department: existing.department || row.department,
        status: 'existing',
      });
      continue;
    }

    const username = await uniqueUsername(baseUsername);
    const staffCode = await nextStaffCode(row.role, allocated);
    const password = row.phone; // memorable default; mustChangePassword=true forces reset
    const hashed = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        username,
        fullName: row.name,
        password: hashed,
        role: row.role as UserRole,
        status: 'APPROVED',
        phoneNumber: row.phone,
        department: row.department,
        staffCode,
        staffId: null,            // captured on first login
        isFirstLogin: true,
        mustChangePassword: true,
      },
    });

    console.log(`✅ created ${row.name.padEnd(36)}  ${username}  ${staffCode}`);
    credentials.push({
      name: row.name,
      username,
      password,
      staffCode,
      phone: row.phone,
      role: row.role,
      department: row.department,
      status: 'created',
    });
  }

  // ----------------------------- credentials table ------------------------
  console.log('\n\n📋 CREDENTIALS — distribute privately to each staff member');
  console.log('   Default password is the staff member\'s own phone number.');
  console.log('   They will be prompted to change the password and enter their hospital Staff ID on first login.\n');

  const header = ['#', 'Name', 'Username', 'Password', 'Staff Code', 'Phone', 'Dept'];
  const rows = credentials.map((c, i) => [
    String(i + 1),
    c.name,
    c.username,
    c.password,
    c.staffCode,
    c.phone,
    c.department,
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length))
  );
  const fmt = (cells: string[]) =>
    cells.map((cell, i) => cell.padEnd(widths[i])).join('  ');

  console.log(fmt(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((r) => console.log(fmt(r)));

  const created = credentials.filter((c) => c.status === 'created').length;
  const existed = credentials.length - created;
  console.log(`\nSummary: ${created} created, ${existed} already existed.`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
