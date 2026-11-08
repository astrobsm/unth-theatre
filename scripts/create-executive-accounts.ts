/**
 * UNTH Theatre Management System
 * Create the executive accounts: Chief Medical Director, CMAC, DC MAC.
 *
 * WHY A SCRIPT AND NOT THE REGISTRATION FORM.
 * These three roles are deliberately absent from ONBOARDING_ROLES and from the
 * bulk-upload allow-list, and `auditCommitteeRoles.test.ts` asserts they stay
 * absent: anyone who could pick "Chief Medical Director" on the public
 * registration form would be granting themselves the top of the emergency
 * escalation ladder. Bulk upload is reachable by a THEATRE_MANAGER, which is
 * the wrong hand on this particular lever too. So an executive account is made
 * by somebody with database access, on purpose, once.
 *
 * WHAT IT IS FOR. When an emergency case has not started two hours after its
 * due time, stage 2 of the escalation writes a dashboard notice to every
 * APPROVED user whose role is in CMD_ROLES. With no such account that notice
 * is addressed to nobody — the rung fires, the record says it fired, and no
 * human is told. See src/lib/emergencyEscalationRunner.ts.
 *
 * Usage:
 *   npx tsx scripts/create-executive-accounts.ts people.json           # preview
 *   npx tsx scripts/create-executive-accounts.ts people.json --force   # write
 *
 * people.json — an array. Keep it OUT of the repository; it names real people.
 *   [
 *     { "role": "CHIEF_MEDICAL_DIRECTOR", "fullName": "...", "username": "...",
 *       "email": "...", "phoneNumber": "0803...", "staffCode": "UNTH/EXE/001" }
 *   ]
 * Only role, fullName and username are required.
 *
 * The password is GENERATED, printed once to this terminal, and never written
 * to a file. The account is created with mustChangePassword, so the generated
 * value stops working the moment the officer first signs in.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();

/**
 * The only roles this script may create. A script that could mint an ADMIN
 * would be a back door with a helpful comment on it.
 */
const EXECUTIVE_ROLES = ['CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC'] as const;
type ExecutiveRole = typeof EXECUTIVE_ROLES[number];

const ROLE_LABEL: Record<ExecutiveRole, string> = {
  CHIEF_MEDICAL_DIRECTOR: 'Chief Medical Director',
  CMAC: 'Chairman, Medical Advisory Committee',
  DC_MAC: 'Deputy Chairman, Medical Advisory Committee',
};

interface Person {
  role: ExecutiveRole;
  fullName: string;
  username: string;
  email?: string;
  phoneNumber?: string;
  staffCode?: string;
  department?: string;
}

/**
 * A password a person can read off a screen and type without a typo.
 *
 * No O/0, I/l/1 — an executive who mistypes this twice will ask for a reset,
 * and a reset on this account is a conversation nobody wants to have twice.
 * 16 characters from a 56-symbol alphabet is ~93 bits, and it only has to
 * survive until first sign-in.
 */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 16; i += 1) out += alphabet[randomInt(alphabet.length)];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12)}`;
}

function parsePeople(path: string): Person[] {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('Expected a JSON array of people.');

  return raw.map((p: Record<string, unknown>, i: number) => {
    const where = `entry ${i + 1}`;
    const role = String(p.role ?? '');
    if (!EXECUTIVE_ROLES.includes(role as ExecutiveRole)) {
      throw new Error(
        `${where}: role "${role}" is not an executive seat. This script creates only `
        + `${EXECUTIVE_ROLES.join(', ')}. Every other role is onboarded through the app.`,
      );
    }
    const fullName = String(p.fullName ?? '').trim();
    const username = String(p.username ?? '').trim().toLowerCase();
    if (!fullName) throw new Error(`${where}: fullName is required.`);
    if (!/^[a-z0-9][a-z0-9._-]{2,40}$/.test(username)) {
      throw new Error(
        `${where}: username "${username}" must be 3-41 characters of letters, digits, dot, `
        + 'underscore or hyphen.',
      );
    }
    return {
      role: role as ExecutiveRole,
      fullName,
      username,
      email: p.email ? String(p.email).trim().toLowerCase() : undefined,
      phoneNumber: p.phoneNumber ? String(p.phoneNumber).trim() : undefined,
      staffCode: p.staffCode ? String(p.staffCode).trim() : undefined,
      department: p.department ? String(p.department).trim() : undefined,
    };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const path = args.find((a) => !a.startsWith('--'));

  if (!path) {
    console.error('Give the path to a JSON file of people. See the header of this script.');
    process.exit(1);
  }

  const people = parsePeople(path);

  console.log(`\n${force ? 'CREATING' : 'PREVIEW (no changes — pass --force to write)'}`);
  console.log(`${people.length} executive account(s) from ${path}\n`);

  // Report the seats that are currently empty, so the operator can see what
  // this run is actually fixing rather than taking it on trust.
  const existing = await prisma.user.findMany({
    where: { role: { in: EXECUTIVE_ROLES as unknown as never[] } },
    select: { username: true, fullName: true, role: true, status: true },
  });
  console.log('Executive seats before this run:');
  for (const role of EXECUTIVE_ROLES) {
    const held = existing.filter((u) => String(u.role) === role);
    console.log(held.length === 0
      ? `  ${ROLE_LABEL[role]}: EMPTY — escalation stage 2 reaches nobody`
      : `  ${ROLE_LABEL[role]}: ${held.map((h) => `${h.fullName} (${h.username}, ${h.status})`).join(', ')}`);
  }
  console.log('');

  const credentials: Array<{ username: string; password: string; role: string }> = [];
  let wouldCreate = 0;

  for (const p of people) {
    const prior = await prisma.user.findUnique({
      where: { username: p.username },
      select: { id: true, fullName: true, role: true, status: true },
    });

    // An existing account is never promoted into an executive seat by this
    // script. A mistyped username that happened to match a surgeon would
    // otherwise hand that surgeon the top of the escalation ladder, silently.
    if (prior && !EXECUTIVE_ROLES.includes(prior.role as ExecutiveRole)) {
      console.log(
        `  SKIP ${p.username} — already held by ${prior.fullName} as ${prior.role}. `
        + 'This script will not change an existing non-executive account. Check the username.',
      );
      continue;
    }

    if (prior) {
      // Already an executive. Make sure the seat is usable, and leave the
      // password alone: resetting a working password is not a fix.
      const needs = prior.role !== p.role || prior.status !== 'APPROVED';
      if (!needs) {
        console.log(`  OK   ${p.username} — ${ROLE_LABEL[p.role]}, already approved. Nothing to do.`);
        continue;
      }
      console.log(
        `  FIX  ${p.username} — ${prior.role}/${prior.status} -> ${p.role}/APPROVED`
        + ' (password left as it is)',
      );
      if (force) {
        await prisma.user.update({
          where: { id: prior.id },
          data: { role: p.role as never, status: 'APPROVED' as never },
        });
      }
      continue;
    }

    console.log(`  NEW  ${p.username} — ${p.fullName}, ${ROLE_LABEL[p.role]}`);

    if (force) {
      const password = generatePassword();
      await prisma.user.create({
        data: {
          username: p.username,
          fullName: p.fullName,
          email: p.email ?? null,
          phoneNumber: p.phoneNumber ?? null,
          staffCode: p.staffCode ?? null,
          department: p.department ?? 'Hospital Management',
          password: await bcrypt.hash(password, 10),
          role: p.role as never,
          // APPROVED on creation: an administrator with database access has
          // already made the decision an approval queue exists to capture.
          status: 'APPROVED' as never,
          // The generated password stops working at first sign-in.
          mustChangePassword: true,
          isFirstLogin: true,
        },
      });
      // Collected only on a real run: printing a password in preview would
      // hand out a credential that was never set on any account.
      credentials.push({ username: p.username, password, role: ROLE_LABEL[p.role] });
    } else {
      wouldCreate += 1;
    }
  }

  if (wouldCreate > 0) {
    console.log(
      `\n${wouldCreate} account(s) would be created. Re-run with --force to create them; `
      + 'the passwords are generated at that point and printed once.',
    );
  }

  if (credentials.length > 0) {
    console.log('\n================ CREDENTIALS — SHOWN ONCE ================');
    console.log('Hand each of these to its officer directly. They are not stored');
    console.log('anywhere and cannot be shown again; each must be changed at first');
    console.log('sign-in. Do not paste them into WhatsApp or email.\n');
    for (const c of credentials) {
      console.log(`  ${c.role}`);
      console.log(`    username: ${c.username}`);
      console.log(`    password: ${c.password}\n`);
    }
    console.log('==========================================================');
  }

  console.log('');
}

main()
  .catch((e) => {
    console.error('\nFailed:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
