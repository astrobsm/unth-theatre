/**
 * Seed the Theatre (Anaesthetic) Technicians' weekly duty roster.
 *
 * Source: hand-transcribed from the printed duty roster covering
 *   Mon 25 May 2026 -> Sun 28 June 2026.
 *
 * Mapping rules (confirmed with theatre lead):
 *  - Theatre / Suite / CTU / Eye columns  -> MORNING shift (elective cases in that theatre)
 *  - ICU column                            -> MORNING shift, location "ICU" (covers ICU 08:00-17:00)
 *  - CALL DUTY column                      -> CALL shift   (emergency cover 08:00-17:00)
 *  - Evening call column                   -> NIGHT shift  (emergency cover 17:00 -> 08:00 next day)
 *  - A cell "Name1/Name2" means BOTH technicians are assigned to that post that day.
 *
 * Idempotent: every run deletes existing ANAESTHETIC_TECHNICIANS roster rows in the
 * date range and re-inserts, so re-running converges to this spec without duplicates.
 *
 * Run:  cd unth-theatre; node scripts/seed-technician-roster.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Column order for every roster row below.
const COLUMNS = ['T1', 'T2', 'T3', 'T4', 'T5', 'S1', 'S23', 'CTU', 'ICU', 'EYE', 'CALL', 'EVE'];

// Per-column shift / theatre / location metadata.
const COLUMN_META = {
  T1:  { shift: 'MORNING', theatre: 'Theatre 1',  label: 'Theatre 1' },
  T2:  { shift: 'MORNING', theatre: 'Theatre 2',  label: 'Theatre 2' },
  T3:  { shift: 'MORNING', theatre: 'Theatre 3',  label: 'Theatre 3' },
  T4:  { shift: 'MORNING', theatre: 'Theatre 4',  label: 'Theatre 4' },
  T5:  { shift: 'MORNING', theatre: 'Theatre 5',  label: 'Theatre 5' },
  S1:  { shift: 'MORNING', theatre: 'Suite 1',    label: 'Suite 1' },
  S23: { shift: 'MORNING', theatre: 'Suite 2',    label: 'Suite 2/3' },
  CTU: { shift: 'MORNING', theatre: 'CTU TH1',    label: 'CTU Theatre' },
  ICU: { shift: 'MORNING', theatre: null, location: 'ICU', label: 'ICU (08:00-17:00)' },
  EYE: { shift: 'MORNING', theatre: 'Eye Theatre', label: 'Eye Theatre' },
  CALL:{ shift: 'CALL',  theatre: null, label: 'Call duty (emergency 08:00-17:00)' },
  EVE: { shift: 'NIGHT', theatre: null, label: 'Evening call (emergency 17:00 -> 08:00)' },
};

// Roster cells per date. Each array maps 1:1 to COLUMNS. '' = nobody assigned.
const ROSTER = {
  // ---- Page 1 : 25 May -> 7 June ----
  '2026-05-25': ['Nnaji Hellen','', 'Ugwoke/igwe','Ugwoke/igwe','Ugwoke/igwe','Ogbozor/Uba','Ogbozor/Uba','Ozulu/kelechi','Ozulu/kelechi','Obi Racheal','Obi Racheal','Odigwe Esther'],
  '2026-05-26': ['Austin','', 'Loveth','Ejim/chidera','Ejim/chidera','Neboh/Nelson','Neboh/Nelson','Sam/John','Sam/John','Chioma/Peter','Chioma/Peter','Constance'],
  '2026-05-27': ['Nnaji Hellen','', 'Obi/igwe','Obi/igwe','Obi/igwe','Ogbozor/ubah','Ogbozor/ubah','Ozulu Daniel','Ozulu Daniel','Ozulu Daniel','Ozulu Daniel','Odigwe'],
  '2026-05-28': ['Constance','', 'Chioma','Austin/chidera','Austin/chidera','Neboh/Nelson','Neboh/Nelson','Sam/John','Sam/John','Loveth/Peter','Loveth/Peter','Ejim B'],
  '2026-05-29': ['Nnaji Hellen','', 'Ugwoke/igwe','Ugwoke/igwe','Ugwoke/igwe','Ogbozor/Uba','Ogbozor/Uba','Ozulu','Ozulu','Obi Racheal','Obi Racheal','Odigwe Esther'],
  '2026-05-30': ['','','','','','','','','','', 'Ani sam','Ejim B'],
  '2026-05-31': ['','','','','','','','','','', 'Ozulu Daniel','Ugwoke'],
  '2026-06-01': ['Chioma','', 'Loveth/Peter','Loveth/Peter','Ejim B','Neboh/chidera','Neboh/chidera','Sam/Nelson','Sam/Nelson','Austin/John','Austin/John','Constance'],
  '2026-06-02': ['Nnaji','', 'Obi/','Obi/igwe','Obi/igwe','Ogbozor/kelechi','Ogbozor/kelechi','Ozulu/ubah','Ozulu/ubah','Ugwoke','Ugwoke','Odigwe'],
  '2026-06-03': ['Ejim','', 'Austin','Chioma/Peter','Chioma/Peter','Neboh/chidera','Neboh/chidera','Sam/Nelson','Sam/Nelson','Constance/John','Constance/John','Loveth'],
  '2026-06-04': ['Nnaji','', 'Ugwoke','Ugwoke/David','Ugwoke/David','Ogbozor/kelechi','Ogbozor/kelechi','Ozulu/ubah','Ozulu/ubah','Obi Racheal','Obi Racheal','Odigwe'],
  '2026-06-05': ['Constance','', 'Ejim/Peter','Ejim/Peter','Loveth','Neboh/chidera','Neboh/chidera','Sam/Nelson','Sam/Nelson','Chioma/John','Chioma/John','Austin'],
  '2026-06-06': ['','','','','','','','','','', 'Obi Racheal','Nnaji Hellen'],
  '2026-06-07': ['','','','','','','','','','', 'Chioma','Loveth'],
  // ---- Page 2 : 8 June -> 21 June ----
  '2026-06-08': ['Nnaji Hellen','', 'Obi Racheal','Obi/Uba','Obi/Uba','Ogbozor/kelechi','Ogbozor/kelechi','Ozulu/igwe','Ozulu/igwe','Anthony ugwoke','Anthony ugwoke','Odigwe Esther'],
  '2026-06-09': ['Ejim B','', 'Chioma','Austin/chidera','Austin/chidera','Neboh/Peter','Neboh/Peter','Sam/John','Sam/John','Loveth/Nelson','Loveth/Nelson','Constance'],
  '2026-06-10': ['Nnaji Hellen','', 'Ugwoke','Ugwoke/Uba','Ugwoke/Uba','Ogbozor/kelechi','Ogbozor/kelechi','Ozulu/igwe','Ozulu/igwe','Joy','Joy','Odigwe Esther'],
  '2026-06-11': ['Ejim B','', 'Constance','Loveth/chidera','Loveth/chidera','Neboh/Peter','Neboh/Peter','Sam/John','Sam/John','Chioma/Nelson','Chioma/Nelson','Austin'],
  '2026-06-12': ['Nnaji Hellen','', 'Joy','Joy/Uba','Joy/Uba','Ogbozor/kelechi','Ogbozor/kelechi','Ozulu/igwe','Ozulu/igwe','Ugwoke Anthony','Ugwoke Anthony','Odigwe Esther'],
  '2026-06-13': ['','','','','','','','','','', 'Nebo ifeanyi','Austin mbaeze'],
  '2026-06-14': ['','','','','','','','','','', 'Ogbozor Solomon','Odigwe Esther'],
  '2026-06-15': ['Austin/John','', 'Austin/John','Chioma/Nelson','Chioma/Nelson','Neboh/chidera','Neboh/chidera','Sam/Peter','Sam/Peter','Loveth','Loveth','Constance'],
  '2026-06-16': ['Nnaji Hellen','', 'Ugwoke','Ugwoke/igwe','Ugwoke/igwe','Ogbozor/Uba','Ogbozor/Uba','Ozulu/kelechi','Ozulu/kelechi','Joy Michael','Joy Michael','Odigwe Esther'],
  '2026-06-17': ['Loveth/John','', 'Loveth/John','Constance/Nelson','Constance/Nelson','Neboh/chidera','Neboh/chidera','Sam/Peter','Sam/Peter','Chioma','Chioma','Austin'],
  '2026-06-18': ['Nnaji Hellen','', 'Ugwoke Anthony','Ugwoke/igwe','Ugwoke/igwe','Ogbozor/ubah','Ogbozor/ubah','Ozulu/kelechi','Ozulu/kelechi','Joy Michael','Joy Michael','Odigwe Esther'],
  '2026-06-19': ['Loveth/John','', 'Loveth/John','Austin/Nelson','Austin/Nelson','Neboh/chidera','Neboh/chidera','Sam/Peter','Sam/Peter','Constance','Constance','Chioma'],
  '2026-06-20': ['','','','','','','','','','', 'Ugwoke Anthony','Joy Michael'],
  '2026-06-21': ['','','','','','','','','','', 'Ani Samuel','Constance'],
  // ---- Page 3 : 22 June -> 28 June ----
  '2026-06-22': ['Nnaji Hellen','', 'Joy','Joy/kelechi','Joy/kelechi','Ogbozor/igwe','Ogbozor/igwe','Ozulu/Uba','Ozulu/Uba','Ugwoke','Ugwoke','Esther odigwe'],
  '2026-06-23': ['Chioma/Peter','', 'Chioma/Peter','Austin/chidera','Austin/chidera','Neboh/Nelson','Neboh/Nelson','Sam/John','Sam/John','Loveth','Loveth','Constance'],
  '2026-06-24': ['Nnaji Hellen','', 'Ugwoke','Ugwoke/kelechi','Ugwoke/kelechi','Ogbozor/igwe','Ogbozor/igwe','Ozulu/Uba','Ozulu/Uba','Joy','Joy','Odigwe Esther'],
  '2026-06-25': ['Austin/Peter','', 'Austin/Peter','Constance/chidera','Constance/chidera','Neboh/Nelson','Neboh/Nelson','Sam/John','Sam/John','Chioma','Chioma','Loveth'],
  '2026-06-26': ['Nnaji Hellen','', 'Joy','Joy/kelechi','Joy/kelechi','Ogbozor/igwe','Ogbozor/igwe','Ozulu/Uba','Ozulu/Uba','Ugwoke','Ugwoke','Odigwe Esther'],
  '2026-06-27': ['','','','','','','','','','', 'Chioma','Loveth'],
  '2026-06-28': ['','','','','','','','','','', 'Ozulu Daniel','Nnaji Hellen'],
};

// Roster name token (lower-cased, trimmed) -> registered technician staffCode.
const TOKEN_TO_STAFFCODE = {
  'ugwoke': 'ANT016', 'anthony': 'ANT016', 'anthony ugwoke': 'ANT016', 'ugwoke anthony': 'ANT016',
  'igwe': 'ANT002', 'david': 'ANT002', 'ugwoke/david': 'ANT002',
  'ogbozor': 'ANT017', 'solomon': 'ANT017', 'ogbozor solomon': 'ANT017',
  'uba': 'ANT015', 'ubah': 'ANT015', 'uba d': 'ANT015',
  'ozulu': 'ANT005', 'ozulu daniel': 'ANT005', 'daniel': 'ANT005',
  'kelechi': 'ANT010',
  'obi': 'ANT013', 'obi racheal': 'ANT013', 'racheal': 'ANT013',
  'austin': 'ANT006', 'austin mbaeze': 'ANT006', 'mbaeze': 'ANT006',
  'loveth': 'ANT014',
  'chidera': 'ANT025',
  'neboh': 'ANT008', 'nebo': 'ANT008', 'nebo ifeanyi': 'ANT008', 'ifeanyi': 'ANT008',
  'nelson': 'ANT003',
  'sam': 'ANT007', 'ani sam': 'ANT007', 'ani samuel': 'ANT007', 'ani samuel chibuzor': 'ANT007', 'ani': 'ANT007', 'samuel': 'ANT007',
  'john': 'ANT026',
  'chioma': 'ANT021',
  'peter': 'ANT004',
  'constance': 'ANT012', 'constan': 'ANT012',
  'joy': 'ANT011', 'joy michael': 'ANT011', 'michael': 'ANT011',
};

// Names that appear on the roster but are NOT registered technicians.
// They will be find-or-created as APPROVED ANAESTHETIC_TECHNICIAN placeholder accounts.
const PLACEHOLDER_NAMES = {
  'nnaji hellen': 'Nnaji Hellen', 'nnaji': 'Nnaji Hellen', 'hellen': 'Nnaji Hellen',
  'odigwe esther': 'Odigwe Esther', 'esther odigwe': 'Odigwe Esther', 'odigwe': 'Odigwe Esther', 'esther': 'Odigwe Esther',
  'ejim': 'Ejim', 'ejim b': 'Ejim',
};

const DATE_MIN = new Date('2026-05-25T00:00:00.000Z');
const DATE_MAX = new Date('2026-06-28T00:00:00.000Z');

function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
}

async function main() {
  console.log('Connecting to database...');
  await prisma.$connect();

  // 1. uploadedBy = first ADMIN (fallback: any user).
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
    || await prisma.user.findFirst();
  if (!admin) throw new Error('No users in database; cannot set uploadedBy.');
  const uploadedBy = admin.id;
  console.log(`uploadedBy = ${admin.fullName} (${admin.id})`);

  // 2. Resolve registered technicians by staffCode.
  const wantedCodes = Array.from(new Set(Object.values(TOKEN_TO_STAFFCODE)));
  const techUsers = await prisma.user.findMany({ where: { staffCode: { in: wantedCodes } } });
  const codeToUser = new Map(techUsers.map((u) => [u.staffCode, u]));
  const missingCodes = wantedCodes.filter((c) => !codeToUser.has(c));
  if (missingCodes.length) console.warn('WARNING: staffCodes not found, will create placeholders:', missingCodes);

  // 3. Resolve / create placeholder users (unregistered roster names + any missing staffCodes).
  const fullNameToUser = new Map();
  async function ensurePlaceholder(fullName) {
    if (fullNameToUser.has(fullName)) return fullNameToUser.get(fullName);
    let user = await prisma.user.findFirst({ where: { fullName } });
    if (!user) {
      const base = slugify(fullName) || 'tech';
      let username = base;
      let n = 1;
      while (await prisma.user.findFirst({ where: { username } })) username = `${base}.${n++}`;
      // Unique staffCode in the RTEC* space.
      let code;
      do { code = `RTEC${String(Math.floor(100 + Math.random() * 900))}`; }
      while (await prisma.user.findFirst({ where: { staffCode: code } }));
      const password = await bcrypt.hash(`Theatre@${Math.random().toString(36).slice(2, 8)}`, 10);
      user = await prisma.user.create({
        data: {
          username,
          fullName,
          password,
          role: 'ANAESTHETIC_TECHNICIAN',
          status: 'APPROVED',
          department: 'Anaesthesia',
          staffCode: code,
          mustChangePassword: true,
          isFirstLogin: true,
        },
      });
      console.log(`Created placeholder technician: ${fullName} (username=${username}, staffCode=${code})`);
    }
    fullNameToUser.set(fullName, user);
    return user;
  }

  // 4. Resolve theatre suites by name.
  const theatreNames = Array.from(new Set(
    Object.values(COLUMN_META).map((m) => m.theatre).filter(Boolean)
  ));
  const theatres = await prisma.theatreSuite.findMany({ where: { name: { in: theatreNames } } });
  const theatreByName = new Map(theatres.map((t) => [t.name, t]));
  for (const name of theatreNames) {
    if (!theatreByName.has(name)) console.warn(`WARNING: TheatreSuite "${name}" not found; rows will have theatreId=null.`);
  }

  // 5. Resolve a single roster token -> user (registered or placeholder).
  async function resolveToken(token) {
    const key = norm(token);
    if (!key) return null;
    if (TOKEN_TO_STAFFCODE[key]) {
      const code = TOKEN_TO_STAFFCODE[key];
      const u = codeToUser.get(code);
      if (u) return u;
      // staffCode missing in DB -> placeholder using a readable name.
      return ensurePlaceholder(token.trim());
    }
    if (PLACEHOLDER_NAMES[key]) return ensurePlaceholder(PLACEHOLDER_NAMES[key]);
    // Unknown token -> placeholder so nothing is silently dropped.
    console.warn(`Unrecognised roster name "${token}" -> creating placeholder.`);
    return ensurePlaceholder(token.trim());
  }

  // 6. Build roster rows.
  const rows = [];
  const unresolved = [];
  for (const [dateStr, cells] of Object.entries(ROSTER)) {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    for (let i = 0; i < COLUMNS.length; i++) {
      const col = COLUMNS[i];
      const meta = COLUMN_META[col];
      const cell = cells[i];
      if (!cell) continue;
      const tokens = String(cell).split('/').map((t) => t.trim()).filter(Boolean);
      for (const token of tokens) {
        const user = await resolveToken(token);
        if (!user) { unresolved.push({ dateStr, col, token }); continue; }
        rows.push({
          userId: user.id,
          staffName: token,
          staffCategory: 'ANAESTHETIC_TECHNICIANS',
          date,
          theatreId: meta.theatre ? (theatreByName.get(meta.theatre)?.id || null) : null,
          location: meta.location || null,
          shift: meta.shift,
          uploadedBy,
          notes: meta.label,
        });
      }
    }
  }

  console.log(`Prepared ${rows.length} roster assignments across ${Object.keys(ROSTER).length} days.`);
  if (unresolved.length) console.warn('Unresolved cells:', unresolved);

  // 7. Idempotent replace within the covered date range.
  const deleted = await prisma.roster.deleteMany({
    where: { staffCategory: 'ANAESTHETIC_TECHNICIANS', date: { gte: DATE_MIN, lte: DATE_MAX } },
  });
  console.log(`Removed ${deleted.count} existing technician roster rows in range.`);

  const result = await prisma.roster.createMany({ data: rows });
  console.log(`Inserted ${result.count} technician roster rows.`);
  console.log('Done.');
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
