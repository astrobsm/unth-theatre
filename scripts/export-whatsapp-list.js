const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const ROLE_LABEL = {
  ADMIN: 'Administrators',
  SURGEON: 'Surgeons',
  CONSULTANT_ANAESTHETIST: 'Consultant Anaesthetists',
  ANAESTHETIST: 'Anaesthetists',
  ANAESTHETIC_TECHNICIAN: 'Anaesthetic Technicians',
  SCRUB_NURSE: 'Scrub Nurses',
  RECOVERY_ROOM_NURSE: 'Recovery Room Nurses',
  HOUSE_OFFICER: 'House Officers',
  PHARMACIST: 'Pharmacists',
  PORTER: 'Porters',
  CLEANER: 'Cleaners',
  CSSD_SUPERVISOR: 'CSSD Supervisors',
  CSSD_STAFF: 'CSSD Staff',
  LAUNDRY_SUPERVISOR: 'Laundry Supervisors',
  LAUNDRY_STAFF: 'Laundry Staff',
  PLUMBING_SUPERVISOR: 'Plumbing Supervisors',
  OXYGEN_UNIT_SUPERVISOR: 'Oxygen Unit Supervisors',
  PROCUREMENT_OFFICER: 'Procurement Officers',
  CONSUMABLE_PACK_PROVIDER: 'Consumable Pack Providers',
};

const ROLE_ORDER = [
  'ADMIN',
  'CONSULTANT_ANAESTHETIST',
  'ANAESTHETIST',
  'ANAESTHETIC_TECHNICIAN',
  'SURGEON',
  'HOUSE_OFFICER',
  'SCRUB_NURSE',
  'RECOVERY_ROOM_NURSE',
  'PHARMACIST',
  'CSSD_SUPERVISOR',
  'CSSD_STAFF',
  'LAUNDRY_SUPERVISOR',
  'LAUNDRY_STAFF',
  'OXYGEN_UNIT_SUPERVISOR',
  'PLUMBING_SUPERVISOR',
  'PROCUREMENT_OFFICER',
  'CONSUMABLE_PACK_PROVIDER',
  'PORTER',
  'CLEANER',
];

function cleanName(name) {
  if (!name) return '';
  // If name is just digits (e.g., staff ID), return placeholder
  if (/^\d+$/.test(name.trim())) return null;
  // Title-case if entirely upper or lower
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return trimmed;
}

async function main() {
  const users = await prisma.user.findMany({
    where: { status: 'APPROVED' },
    select: { fullName: true, username: true, role: true, isFirstLogin: true },
  });

  // Group by role
  const groups = {};
  for (const u of users) {
    const name = cleanName(u.fullName);
    if (!name) continue;
    if (!groups[u.role]) groups[u.role] = [];
    groups[u.role].push({ name, username: u.username, firstLogin: u.isFirstLogin });
  }

  // Sort each group by name
  for (const role of Object.keys(groups)) {
    groups[role].sort((a, b) => a.name.localeCompare(b.name));
  }

  const total = users.length;
  const loggedIn = users.filter((u) => !u.isFirstLogin).length;
  const pending = total - loggedIn;

  const lines = [];
  lines.push('📋 *ORM PLATFORM — REGISTERED USERS LIST*');
  lines.push('');
  lines.push(`*Total Profiles Created:* ${total}`);
  lines.push(`✅ *Already Logged In:* ${loggedIn}`);
  lines.push(`⏳ *Yet to Log In:* ${pending}`);
  lines.push('');
  lines.push('🔗 *App Link:* https://unth-theatre-mai.vercel.app');
  lines.push('');
  lines.push('────────────────────────────');
  lines.push('Kindly check your name below. If your name is *missing or misspelt*, please notify the ORM Team immediately.');
  lines.push('────────────────────────────');
  lines.push('');

  const orderedRoles = [
    ...ROLE_ORDER.filter((r) => groups[r]),
    ...Object.keys(groups).filter((r) => !ROLE_ORDER.includes(r)),
  ];

  for (const role of orderedRoles) {
    const label = ROLE_LABEL[role] || role;
    const list = groups[role];
    lines.push(`*${label.toUpperCase()} (${list.length})*`);
    list.forEach((u, i) => {
      const marker = u.firstLogin ? '⏳' : '✅';
      lines.push(`${i + 1}. ${marker} ${u.name}`);
    });
    lines.push('');
  }

  lines.push('────────────────────────────');
  lines.push('*Legend:*  ✅ Logged in   ⏳ Yet to log in');
  lines.push('');
  lines.push('💬 If your name is missing, please send your *Full Name*, *Role*, and *Department* to the ORM Team.');

  const outDir = path.join(__dirname, '..', 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const outPath = path.join(outDir, `whatsapp-users-list-${stamp}.txt`);
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

  console.log(`\n✅ WhatsApp list saved to:\n   ${outPath}\n`);
  console.log(`Total: ${total} | Logged in: ${loggedIn} | Pending: ${pending}`);
  console.log(`Roles: ${orderedRoles.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
