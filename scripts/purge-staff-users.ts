/**
 * UNTH Theatre Management System
 * Purge Staff & Users Script
 *
 * Removes ALL users from the database except the explicit allow-list
 * (admin, douglas, ngozi.mba) and CASCADE-removes every dependent record
 * (surgeries, allocations, rosters, prescriptions, logs, audit trails, etc.).
 *
 * After purging, the allowed admin users are re-created via ensure-admin.ts
 * logic so you can immediately log back in.
 *
 * Usage:
 *   npx ts-node scripts/purge-staff-users.ts          # dry-run preview
 *   npx ts-node scripts/purge-staff-users.ts --force  # actually delete
 *
 * WARNING: --force is destructive. All user-linked clinical & operational
 * data (surgeries, transfers, cancellations, rosters, allocations, logs,
 * prescriptions, blood requests, mortalities, audit logs, etc.) will be
 * wiped. Theatres, patients, and inventory items are preserved.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const KEEP_USERNAMES = ['admin', 'douglas', 'ngozi.mba'];

interface UserSeed {
  username: string;
  password: string;
  fullName: string;
  email: string;
  staffCode: string;
  role: 'ADMIN' | 'SURGEON' | 'ANAESTHETIST';
}

const USERS_TO_RECREATE: UserSeed[] = [
  {
    username: 'admin',
    password: 'admin123',
    fullName: 'Super Administrator',
    email: 'admin@unth.edu.ng',
    staffCode: 'UNTH/ADM/001',
    role: 'ADMIN',
  },
  {
    username: 'douglas',
    password: 'blackvelvet',
    fullName: 'Douglas Administrator',
    email: 'douglas@unth.edu.ng',
    staffCode: 'UNTH/ADM/002',
    role: 'ADMIN',
  },
  {
    username: 'ngozi.mba',
    password: 'changeme123',
    fullName: 'Ngozi Mba',
    email: 'ngozi.mba@unth.edu.ng',
    staffCode: 'UNTH/ADM/003',
    role: 'ADMIN',
  },
];

async function main() {
  const force = process.argv.includes('--force');

  console.log('========================================================');
  console.log('  UNTH Theatre — Purge Staff & Users');
  console.log('========================================================');
  console.log(`Mode: ${force ? 'EXECUTE (--force)' : 'DRY RUN'}`);
  console.log(`Allow-list (will be preserved/recreated): ${KEEP_USERNAMES.join(', ')}`);
  console.log('');

  const allUsers = await prisma.user.findMany({
    select: { id: true, username: true, fullName: true, role: true, status: true },
    orderBy: { username: 'asc' },
  });

  const keepers = allUsers.filter(u => KEEP_USERNAMES.includes(u.username));
  const victims = allUsers.filter(u => !KEEP_USERNAMES.includes(u.username));

  console.log(`Total users in DB     : ${allUsers.length}`);
  console.log(`Will be preserved     : ${keepers.length}`);
  keepers.forEach(u => console.log(`   ✓ ${u.username.padEnd(20)} ${u.fullName} [${u.role}]`));
  console.log(`Will be DELETED       : ${victims.length}`);
  victims.slice(0, 25).forEach(u => console.log(`   ✗ ${u.username.padEnd(20)} ${u.fullName} [${u.role}]`));
  if (victims.length > 25) console.log(`   … and ${victims.length - 25} more`);
  console.log('');

  if (!force) {
    console.log('⚠  DRY RUN — no changes made. Re-run with --force to execute.');
    console.log('');
    console.log('   This will TRUNCATE the users table with CASCADE, removing');
    console.log('   every dependent record (surgeries, allocations, rosters,');
    console.log('   prescriptions, blood requests, mortalities, logs, audits…).');
    console.log('   Theatres, patients, and inventory items are NOT touched.');
    return;
  }

  console.log('🗑  Executing TRUNCATE "users" CASCADE …');
  // Postgres TRUNCATE ... CASCADE removes all rows in users plus every row
  // in every table that has a FK referencing users (transitively).
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE');
  console.log('   ✓ users table truncated (CASCADE applied).');
  console.log('');

  console.log('🔐 Re-creating allow-listed users …');
  for (const u of USERS_TO_RECREATE) {
    const hash = await bcrypt.hash(u.password, 10);
    await prisma.user.create({
      data: {
        username: u.username,
        email: u.email,
        password: hash,
        fullName: u.fullName,
        role: u.role,
        status: 'APPROVED',
        staffCode: u.staffCode,
        isFirstLogin: false,
        mustChangePassword: u.username === 'ngozi.mba',
      },
    });
    console.log(`   ✓ ${u.username} (${u.fullName}) created [${u.role}]`);
  }

  console.log('');
  console.log('✅ Done. Login credentials:');
  USERS_TO_RECREATE.forEach(u => {
    console.log(`   ${u.username.padEnd(20)} / ${u.password}`);
  });
  console.log('');
  console.log('   Ngozi Mba will be required to change password on first login.');
}

main()
  .catch((e) => {
    console.error('❌ Purge failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
