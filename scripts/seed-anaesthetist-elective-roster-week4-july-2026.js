/**
 * Anaesthetist ELECTIVE roster — Week 4, July 2026 (Mon 27 – Fri 31).
 * ------------------------------------------------------------------
 * The departmental elective list: for each weekday, each surgical subspecialty
 * running an elective list gets one consultant anaesthetist and two or three
 * resident anaesthetists.
 *
 * Convention (see the anaesthetist subspecialty-rostering work, July 2026):
 *   shift          = MORNING          (elective; CALL is the emergency/ICU roster)
 *   subRole        = the covered SurgicalUnit.subspecialty, verbatim
 *   seniorityLevel = CONSULTANT for the consultant of the list, else null
 *   location       = MAIN_THEATRE
 * so that /api/roster/anaesthetist-coverage and the booking auto-assign in
 * /api/surgeries can align each booked case to the anaesthetist covering its
 * subspecialty.
 *
 * Idempotent: re-running replaces only the ANAESTHETISTS *MORNING* rows dated
 * 27–31 July 2026. The July CALL roster
 * (scripts/seed-anaesthetist-call-roster-july-2026.js) is left untouched.
 *
 * Run from the project root:
 *     node scripts/seed-anaesthetist-elective-roster-week4-july-2026.js --dry-run
 *     node scripts/seed-anaesthetist-elective-roster-week4-july-2026.js
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// The roster as supplied by the department. `specialty` is the department's own
// label; SPECIALTY_TO_SUBSPECIALTY below translates it to the canonical
// SurgicalUnit.subspecialty string (validated against the database at run time).
// ---------------------------------------------------------------------------
const ROSTER = {
  '2026-07-27': [ // Monday
    { specialty: 'OBGYN',              consultant: 'OKAFOR',   doctors: ['OGBONNA', 'AMALAHU'] },
    { specialty: 'Urology',            consultant: 'NWOKE',    doctors: ['NDIWEOGU', 'IBEKWE', 'CORNELIUS'] },
    { specialty: 'General Surgery',    consultant: 'APEH',     doctors: ['EKANEM', 'ARUM'] },
    { specialty: 'Neurosurgery',       consultant: 'OKAFOR',   doctors: ['IKECHIOTTEH', 'IDOKO'] },
    { specialty: 'Paediatric Surgery', consultant: 'MUOGHALU', doctors: ['OGBODO', 'LUCY'] },
  ],
  '2026-07-28': [ // Tuesday
    { specialty: 'General Surgery',     consultant: 'EZUGWU', doctors: ['NDIWEOGU', 'UZOMA'] },
    { specialty: 'ENT',                 consultant: 'ONYEKA', doctors: ['OGBONNA', 'IDOKO'] },
    { specialty: 'CTU',                 consultant: 'OKONNA', doctors: ['ASUQUO', 'OGBODO'] },
    { specialty: 'Maxillofacial (MFU)', consultant: 'ACHI',   doctors: ['OLUHARA', 'MBANUSI'] },
    { specialty: 'OBGYN',               consultant: 'EYA',    doctors: ['EZE', 'IBEKWE'] },
    { specialty: 'Orthopaedics',        consultant: 'OHAKA',  doctors: ['ILOH', 'AMALAHU'] },
  ],
  '2026-07-29': [ // Wednesday
    { specialty: 'OBGYN',           consultant: 'EYA',    doctors: ['BODE', 'MBANUSI'] },
    { specialty: 'ENT',             consultant: 'ONYEKA', doctors: ['IKECHIOTTEH', 'OKONKWO'] },
    { specialty: 'MFU',             consultant: 'EYA',    doctors: ['OGBONNA', 'LUCY', 'AMALAHU'] },
    { specialty: 'General Surgery', consultant: 'OROCK',  doctors: ['ILOH', 'CORNELIUS'] },
    { specialty: 'Neurosurgery',    consultant: 'ARUM',   doctors: ['EZE', 'OGBODO'] },
    { specialty: 'Urology',         consultant: 'ARUM',   doctors: ['ASUQUO', 'UZOMA'] },
    { specialty: 'Plastic Surgery', consultant: 'OROCK',  doctors: ['OLUHARA', 'BODE'] },
  ],
  '2026-07-30': [ // Thursday
    { specialty: 'OBGYN',           consultant: 'NWOKE',  doctors: ['ILOH', 'AMALAHU'] },
    { specialty: 'CTU',             consultant: 'OKORIE', doctors: ['IKECHIOTTEH', 'LUCY'] },
    { specialty: 'Orthopaedics',    consultant: 'OHAKA',  doctors: ['IKE', 'CORNELIUS'] },
    { specialty: 'General Surgery', consultant: 'NWOKE',  doctors: ['BODE', 'OGBODO'] },
    { specialty: 'Urology',         consultant: 'ARUM',   doctors: ['BODE', 'ARUM'] },
    { specialty: 'Neurosurgery',    consultant: 'ARUM',   doctors: ['IGBONEKWU', 'AZUKA'] },
    { specialty: 'Plastic Surgery', consultant: 'OHAKA',  doctors: ['IKE', 'OKONKWO'] },
    { specialty: 'Eye',             consultant: 'OROCK',  doctors: ['EZE', 'MBANUSI'] },
  ],
  '2026-07-31': [ // Friday
    { specialty: 'General Surgery',     consultant: 'EZUGWU',    doctors: ['IGBONEKWU', 'ILOH'] },
    { specialty: 'Paediatric Surgery',  consultant: 'MUOGHALU',  doctors: ['EZE', 'IDOKO'] },
    { specialty: 'Orthopaedic Surgery', consultant: 'ACHI',      doctors: ['OGBODO', 'CORNELIUS'] },
    { specialty: 'O&G',                 consultant: 'ACHI',      doctors: ['NDIWEOGU', 'AMALAHU'] },
    { specialty: 'ENT',                 consultant: 'AMUCHEAZI', doctors: ['IKE', 'AZUKA'] },
    { specialty: 'Neurosurgery',        consultant: 'ARUM',      doctors: ['BODE', 'ARUM'] },
    { specialty: 'CTU',                 consultant: 'EJEZIE',    doctors: ['EKANEM', 'IBEKWE'] },
    { specialty: 'Eye',                 consultant: 'EZUGWU',    doctors: ['IKECHIOTTEH', 'OKONKWO'] },
  ],
};

// Department label -> canonical SurgicalUnit.subspecialty.
const SPECIALTY_TO_SUBSPECIALTY = {
  'obgyn': 'Obstetrics & Gynaecology',
  'o&g': 'Obstetrics & Gynaecology',
  'urology': 'Urology',
  'general surgery': 'General Surgery',
  'neurosurgery': 'Neurosurgery',
  'paediatric surgery': 'Paediatric Surgery',
  'ent': 'ENT (Otorhinolaryngology)',
  'ctu': 'Cardiothoracic Surgery',
  'maxillofacial (mfu)': 'Maxillofacial Surgery',
  'mfu': 'Maxillofacial Surgery',
  'orthopaedics': 'Orthopaedics',
  'orthopaedic surgery': 'Orthopaedics',
  'plastic surgery': 'Plastic Surgery',
  'eye': 'Ophthalmology',
};

// ---------------------------------------------------------------------------
// Name -> staffCode. Curated by hand, as in the call-roster import: the app's
// own name matching is a `contains` search that picks non-deterministically
// ("EZE" matches forty-odd users), so staffCode is the only safe key.
//
// The consultant column and the assigned-doctors column are mapped separately
// because ARUM is two different people: Dr Arum Ejike Emmanuel (consultant,
// ANS011) runs lists, while Arum Chinyere (registrar, ANS040) is assigned to
// them.
// ---------------------------------------------------------------------------
const CONSULTANT_TO_STAFFCODE = {
  // Confirmed with the department, 2026-07-26: "Dr Okafor" is Okafor Celestine C.
  // The account is roled ANAESTHETIST, so the CONSULTANT seniority is carried on
  // the roster row rather than inferred from the role.
  okafor: 'ANS002',      // Okafor Celestine C.
  muoghalu: 'CAN007',    // Muoghalu Christopher.C.C
  ezugwu: 'CAN002',      // Ezugwu Hilary Uchenna
  eya: 'ANS008',         // Jonathan Chukwuemeka Eya
  ohaka: 'CAN003',       // Ohaka onyeka ezinwanne
  orock: 'CAN005',       // OROCKARRAH OROCK
  arum: 'ANS011',        // Arum Ejike Emmanuel (NOT Arum Chinyere, ANS040)
  okorie: 'CAN001',      // DR OKORIE CHUKWUEMEKA OGUERI
  amucheazi: 'CAN008',   // Amucheazi Adaobi
  ejezie: 'CAN004',      // Ejezie Chijioke Chukwuemeka
};

const TOKEN_TO_STAFFCODE = {
  ogbonna: 'ANS031',     // Ogbonna Chigozie Ann
  ndiweogu: 'ANS029',    // Ndiwe-Ogu Chukwuebuka Junior
  ibekwe: 'ANS025',      // Chigozie Blessing Ibekwe
  ekanem: 'ANS013',      // MICHAEL SOLOMON EKANEM
  arum: 'ANS040',        // Arum Chinyere
  idoko: 'ANS019',       // Idoko Sunday Emeka
  ogbodo: 'ANS037',      // Ogbodo Obinna Victor
  uzoma: 'ANS023',       // Uzoma Chiagoziem Hillary
  asuquo: 'ANS014',      // Effiong Godwin Asuquo
  oluhara: 'ANS015',     // DR OLUHARA OKECHUKWU C
  mbanusi: 'ANS035',     // Chizoba Mbanusi
  eze: 'ANS020',         // Chigekwu Eze
  iloh: 'ANS016',        // ILO ODINAKACHUKWU — confirmed with the department 2026-07-26
  bode: 'ANS039',        // AKorede Olabode
  okonkwo: 'ANS041',     // Ebere Maryanne okonkwo
  ike: 'ANS009',         // Ike Basil
  igbonekwu: 'ANS036',   // Igbonekwu Chinemelum O.
  azuka: 'ANS030',       // AZUKA CHIJIOKE.H
};

// Names with no account of their own. Created as APPROVED placeholders so no
// list is silently dropped — the department replaces them with the real people.
// LUCY and IKECHIOTTEH already exist as placeholders from the July call roster
// and are reused by exact fullName, so the same person keeps one account.
const PLACEHOLDER_CONSULTANTS = {
  nwoke:  'Nwoke (elective roster — name to be confirmed)',
  apeh:   'Apeh (elective roster — name to be confirmed)',
  okonna: 'Okonna (elective roster — name to be confirmed)',
  achi:   'Achi (elective roster — name to be confirmed)',
  onyeka: 'Onyeka (elective roster — name to be confirmed)',
};

const PLACEHOLDER_DOCTORS = {
  lucy:        'Lucy (call roster — name to be confirmed)',
  ikechiotteh: 'Ikechi-Otteh (call roster — name to be confirmed)',
  amalahu:     'Amalahu (elective roster — name to be confirmed)',
  cornelius:   'Cornelius (elective roster — name to be confirmed)',
};

const DATE_MIN = new Date('2026-07-27T00:00:00.000Z');
const DATE_MAX = new Date('2026-07-31T00:00:00.000Z');

function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z]/g, '');
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
}

async function main() {
  console.log(`Connecting to database${DRY_RUN ? ' (DRY RUN — nothing will be written)' : ''}...`);
  await prisma.$connect();

  // 1. uploadedBy = first ADMIN (fallback: any user).
  const admin = (await prisma.user.findFirst({ where: { role: 'ADMIN' } }))
    || (await prisma.user.findFirst());
  if (!admin) throw new Error('No users in database; cannot set uploadedBy.');
  console.log(`uploadedBy = ${admin.fullName} (${admin.id})`);

  // 2. The subspecialty strings must match SurgicalUnit.subspecialty exactly, or
  //    the coverage board and booking auto-assign will never align a case.
  const units = await prisma.surgicalUnit.findMany({ select: { subspecialty: true } });
  const knownSubspecialties = new Set(units.map((u) => u.subspecialty));
  const badSpecialties = [...new Set(Object.values(SPECIALTY_TO_SUBSPECIALTY))]
    .filter((s) => !knownSubspecialties.has(s));
  if (badSpecialties.length) {
    throw new Error(
      `These subspecialties do not exist in SurgicalUnit: ${badSpecialties.join(', ')}. ` +
      'Fix SPECIALTY_TO_SUBSPECIALTY before importing.'
    );
  }
  console.log(`Validated ${Object.keys(SPECIALTY_TO_SUBSPECIALTY).length} specialty labels against SurgicalUnit.`);

  // 3. Resolve the registered anaesthetists by staffCode.
  const wantedCodes = Array.from(new Set([
    ...Object.values(CONSULTANT_TO_STAFFCODE),
    ...Object.values(TOKEN_TO_STAFFCODE),
  ]));
  const users = await prisma.user.findMany({ where: { staffCode: { in: wantedCodes } } });
  const codeToUser = new Map(users.map((u) => [u.staffCode, u]));
  const missingCodes = wantedCodes.filter((c) => !codeToUser.has(c));
  if (missingCodes.length) {
    throw new Error(
      `These staffCodes are no longer in the database: ${missingCodes.join(', ')}. ` +
      'The mapping table is stale — re-check it before importing.'
    );
  }
  console.log(`Resolved ${codeToUser.size} registered anaesthetists by staffCode.`);

  // 4. Find or create the placeholder accounts.
  const placeholderCache = new Map();
  async function ensurePlaceholder(fullName, role) {
    if (placeholderCache.has(fullName)) return placeholderCache.get(fullName);
    let user = await prisma.user.findFirst({ where: { fullName } });
    if (user) {
      console.log(`  reusing existing placeholder: ${fullName} (${user.staffCode})`);
    } else if (DRY_RUN) {
      user = { id: `dry-run-${slugify(fullName)}`, fullName, role, staffCode: 'RANS???' };
      console.log(`  would create placeholder ${role}: ${fullName}`);
    } else {
      const base = slugify(fullName) || 'anaesthetist';
      let username = base;
      let n = 1;
      while (await prisma.user.findFirst({ where: { username } })) username = `${base}.${n++}`;
      let code;
      do { code = `RANS${String(Math.floor(100 + Math.random() * 900))}`; }
      while (await prisma.user.findFirst({ where: { staffCode: code } }));
      const password = await bcrypt.hash(`Theatre@${Math.random().toString(36).slice(2, 8)}`, 10);
      user = await prisma.user.create({
        data: {
          username,
          fullName,
          password,
          role,
          status: 'APPROVED',
          department: 'Anaesthesia',
          staffCode: code,
          mustChangePassword: true,
          isFirstLogin: true,
        },
      });
      console.log(`  created placeholder ${role}: ${fullName} (username=${username}, staffCode=${code})`);
    }
    placeholderCache.set(fullName, user);
    return user;
  }

  async function resolveConsultant(token) {
    const key = norm(token);
    const code = CONSULTANT_TO_STAFFCODE[key];
    if (code) return codeToUser.get(code);
    if (PLACEHOLDER_CONSULTANTS[key]) {
      return ensurePlaceholder(PLACEHOLDER_CONSULTANTS[key], 'CONSULTANT_ANAESTHETIST');
    }
    return null;
  }

  async function resolveDoctor(token) {
    const key = norm(token);
    const code = TOKEN_TO_STAFFCODE[key];
    if (code) return codeToUser.get(code);
    if (PLACEHOLDER_DOCTORS[key]) {
      return ensurePlaceholder(PLACEHOLDER_DOCTORS[key], 'ANAESTHETIST');
    }
    return null;
  }

  // 5. Build the rows.
  const rows = [];
  const unresolved = [];
  const perPerson = new Map();
  const perDayPerson = new Map(); // "date|name" -> [subspecialty, ...]

  function record(user, date, dateStr, subspecialty, isConsultant, consultantName) {
    rows.push({
      userId: user.id,
      staffName: user.fullName,
      staffCategory: 'ANAESTHETISTS',
      seniorityLevel: isConsultant ? 'CONSULTANT'
        : (user.role === 'CONSULTANT_ANAESTHETIST' ? 'CONSULTANT' : null),
      subRole: subspecialty,
      location: 'MAIN_THEATRE',
      date,
      theatreId: null,
      shift: 'MORNING',
      uploadedBy: admin.id,
      notes: isConsultant
        ? `Elective list — ${subspecialty} (consultant anaesthetist)`
        : `Elective list — ${subspecialty} (consultant: ${consultantName})`,
    });
    perPerson.set(user.fullName, (perPerson.get(user.fullName) || 0) + 1);
    const dayKey = `${dateStr}|${user.fullName}`;
    perDayPerson.set(dayKey, [...(perDayPerson.get(dayKey) || []), subspecialty]);
  }

  for (const [dateStr, lists] of Object.entries(ROSTER)) {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    for (const list of lists) {
      const subspecialty = SPECIALTY_TO_SUBSPECIALTY[list.specialty.trim().toLowerCase()];
      if (!subspecialty) {
        unresolved.push({ dateStr, specialty: list.specialty, reason: 'unknown specialty label' });
        continue;
      }
      const consultant = await resolveConsultant(list.consultant);
      if (!consultant) {
        unresolved.push({ dateStr, specialty: list.specialty, token: list.consultant, reason: 'consultant' });
        continue;
      }
      record(consultant, date, dateStr, subspecialty, true, consultant.fullName);
      for (const token of list.doctors) {
        const doctor = await resolveDoctor(token);
        if (!doctor) {
          unresolved.push({ dateStr, specialty: list.specialty, token, reason: 'assigned doctor' });
          continue;
        }
        record(doctor, date, dateStr, subspecialty, false, consultant.fullName);
      }
    }
  }

  const expected = Object.values(ROSTER)
    .reduce((n, lists) => n + lists.reduce((m, l) => m + 1 + l.doctors.length, 0), 0);
  console.log(`\nPrepared ${rows.length} of ${expected} assignments across ${Object.keys(ROSTER).length} days.`);
  if (unresolved.length) {
    console.error('UNRESOLVED — these assignments would be dropped:', unresolved);
    throw new Error('Refusing to import with unresolved names.');
  }

  // Same person on two lists the same morning: kept as supplied, but reported.
  const clashes = [...perDayPerson.entries()].filter(([, subs]) => subs.length > 1);
  if (clashes.length) {
    console.log('\nSame person on more than one list the same morning (as supplied by the department):');
    for (const [key, subs] of clashes) {
      const [dateStr, name] = key.split('|');
      console.log(`  ${dateStr}  ${name} — ${subs.join(' + ')}`);
    }
  }

  console.log('\nElective sessions per person:');
  for (const [name, n] of [...perPerson.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(2)}  ${name}`);
  }

  if (DRY_RUN) {
    console.log('\nDry run complete — nothing written.');
    return;
  }

  // 6. Idempotent replace of the elective rows only — the CALL roster stays.
  const deleted = await prisma.roster.deleteMany({
    where: {
      staffCategory: 'ANAESTHETISTS',
      shift: 'MORNING',
      date: { gte: DATE_MIN, lte: DATE_MAX },
    },
  });
  console.log(`\nRemoved ${deleted.count} existing anaesthetist MORNING rows for 27–31 July 2026.`);

  const result = await prisma.roster.createMany({ data: rows });
  console.log(`Inserted ${result.count} anaesthetist elective roster rows.`);
  console.log('Done.');
}

main()
  .catch((e) => { console.error('Seed failed:', e.message || e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
