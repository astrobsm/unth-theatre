/**
 * Anaesthetist call roster — July 2026.
 * ------------------------------------------------------------------
 * Loads the departmental call roster (the anaesthetists rostered to cover
 * EMERGENCY SURGERIES and the ICU) into the Roster table, one row per person
 * per post per day.
 *
 * Source: corrected_july_call_roster_2026.json, supplied by the department.
 * Each day names two anaesthetists for theatre (emergency cover) and two for
 * ICU. Every row is shift = CALL; theatre vs ICU is distinguished by
 * `location` (MAIN_THEATRE vs ICU), following the convention already set by
 * seed-technician-roster.js.
 *
 * Idempotent: re-running replaces every ANAESTHETISTS row dated in July 2026.
 * Run from the project root:
 *     node scripts/seed-anaesthetist-call-roster-july-2026.js --dry-run
 *     node scripts/seed-anaesthetist-call-roster-july-2026.js
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// The roster, transcribed from the department's JSON.
//
// One source anomaly, corrected here: the 27th arrived as
// { day: "Monday 27/7/2026", date: "MONDAY 27/7/2026" } instead of a bare
// "27/7/2026". It is read as 27 July, which is indeed a Monday. Every other
// day-of-week in the source agrees with the 2026 calendar.
// ---------------------------------------------------------------------------
const ROSTER = {
  '2026-07-01': { theatre: ['ASUQUO', 'MBANUSI'],       icu: ['OLUHARA', 'AGWU'] },
  '2026-07-02': { theatre: ['BODE', 'OKONKWO'],         icu: ['ERI', 'UZOMA'] },
  '2026-07-03': { theatre: ['NDIWEOGU', 'AZUKA'],       icu: ['EZE', 'ARUM'] },
  '2026-07-04': { theatre: ['OKEREKE', 'IDOKO'],        icu: ['UGWUANYI', 'LUCY'] },
  '2026-07-05': { theatre: ['EKANEM', 'EBIPAMA'],       icu: ['IKE', 'IBEKWE'] },
  '2026-07-06': { theatre: ['IGBONEKWU', 'AGWU'],       icu: ['EZENWABACHI', 'MBANUSI'] },
  '2026-07-07': { theatre: ['OGBONNA', 'UZOMA'],        icu: ['OGBODO', 'OKONKWO'] },
  '2026-07-08': { theatre: ['IKECHIOTTEH', 'ARUM'],     icu: ['ERI', 'AZUKA'] },
  '2026-07-09': { theatre: ['UGWUANYI', 'LUCY'],        icu: ['OKEREKE', 'IDOKO'] },
  '2026-07-10': { theatre: ['OLUHARA', 'IBEKWE'],       icu: ['BODE', 'AGWU'] },
  '2026-07-11': { theatre: ['EZE', 'MBANUSI'],          icu: ['IKECHIOTTEH', 'EBIPAMA'] },
  '2026-07-12': { theatre: ['ASUQUO', 'OKONKWO'],       icu: ['NDIWEOGU', 'UZOMA'] },
  '2026-07-13': { theatre: ['IKE', 'AZUKA'],            icu: ['EKANEM', 'ARUM'] },
  '2026-07-14': { theatre: ['EZENWABACHI', 'IDOKO'],    icu: ['IGBONEKWU', 'LUCY'] },
  '2026-07-15': { theatre: ['OKEREKE', 'AGWU'],         icu: ['OGBONNA', 'IBEKWE'] },
  '2026-07-16': { theatre: ['IKECHIOTTEH', 'EBIPAMA'],  icu: ['EZE', 'MBANUSI'] },
  '2026-07-17': { theatre: ['ASUQUO', 'UZOMA'],         icu: ['OGBODO', 'OKONKWO'] },
  '2026-07-18': { theatre: ['NDIWEOGU', 'ARUM'],        icu: ['OLUHARA', 'AZUKA'] },
  '2026-07-19': { theatre: ['UGWUANYI', 'LUCY'],        icu: ['EKANEM', 'IDOKO'] },
  '2026-07-20': { theatre: ['BODE', 'IBEKWE'],          icu: ['OGBONNA', 'AGWU'] },
  '2026-07-21': { theatre: ['EZENWABACHILI', 'MBANUSI'], icu: ['IKE', 'UZOMA'] },
  '2026-07-22': { theatre: ['IGBONEKWU', 'OKONKWO'],    icu: ['IKECHIOTTEH', 'LUCY'] },
  '2026-07-23': { theatre: ['NDIWEOGU', 'AZUKA'],       icu: ['OLUHARA', 'ARUM'] },
  '2026-07-24': { theatre: ['OGBODO', 'IDOKO'],         icu: ['EKANEM', 'IBEKWE'] },
  '2026-07-25': { theatre: ['EZENWABACHILI', 'AGWU'],   icu: ['ASUQUO', 'EBIPAMA'] },
  '2026-07-26': { theatre: ['EZE', 'UZOMA'],            icu: ['UGWUANYI', 'MBANUSI'] },
  '2026-07-27': { theatre: ['OGBODO', 'LUCY'],          icu: ['BODE', 'OKONKWO'] },
  '2026-07-28': { theatre: ['IKE', 'ARUM'],             icu: ['IGBONEKWU', 'AZUKA'] },
  '2026-07-29': { theatre: ['EKANEM', 'IBEKWE'],        icu: ['NDIWEOGU', 'IDOKO'] },
  '2026-07-30': { theatre: ['ASUQUO', 'UZOMA'],         icu: ['OGBONNA', 'AGWU'] },
  '2026-07-31': { theatre: ['OLUHARA', 'MBANUSI'],      icu: ['ERI', 'LUCY'] },
};

const POSTS = {
  theatre: { location: 'MAIN_THEATRE', label: 'Theatre call — emergency surgery cover' },
  icu:     { location: 'ICU',          label: 'ICU call cover' },
};

// ---------------------------------------------------------------------------
// Roster surname -> staffCode. Hand-curated against the anaesthetist user list,
// because the app's own name matching is a `contains` substring search that
// picks non-deterministically: "ERI" alone also matches OGUERI, "EZE" matches
// forty-odd users across every role. staffCode is unique, so it is the only
// safe key for a bulk import.
//
// Where a person holds several accounts, the one they actually sign in with was
// chosen (the others have never been logged into). The duplicates are listed so
// they can be merged later:
//   ERI       -> ANS004  (also ANS017, ANS018 — never used)
//   EZE       -> ANS020  (also ANS032, ANS033 — never used)
//   UGWUANYI  -> ANS021  (also ANS006 — never used)
//   IGBONEKWU -> ANS036  (also ANS034 — never used, but holds 1 surgery)
// ---------------------------------------------------------------------------
const TOKEN_TO_STAFFCODE = {
  asuquo: 'ANS014',        // Effiong Godwin Asuquo
  mbanusi: 'ANS035',       // Chizoba Mbanusi
  oluhara: 'ANS015',       // DR OLUHARA OKECHUKWU C
  agwu: 'ANS024',          // Agwu Chimaobi Francis
  bode: 'ANS039',          // AKorede Olabode
  okonkwo: 'ANS041',       // Ebere Maryanne okonkwo
  eri: 'ANS004',           // Eri Charles Onyeka
  uzoma: 'ANS023',         // Uzoma Chiagoziem Hillary
  ndiweogu: 'ANS029',      // Ndiwe-Ogu Chukwuebuka Junior
  azuka: 'ANS030',         // AZUKA CHIJIOKE.H
  eze: 'ANS020',           // Chigekwu Eze
  arum: 'ANS040',          // Arum Chinyere (NOT Arum Ejike Emmanuel, ANS011)
  okereke: 'ANS026',       // Okereke David Daberechi
  idoko: 'ANS019',         // Idoko Sunday Emeka
  ugwuanyi: 'ANS021',      // UGWUANYI SAMSON EJIOFOR
  ekanem: 'ANS013',        // MICHAEL SOLOMON EKANEM
  ike: 'ANS009',           // Ike Basil
  ibekwe: 'ANS025',        // Chigozie Blessing Ibekwe
  igbonekwu: 'ANS036',     // Igbonekwu Chinemelum O.
  ogbonna: 'ANS031',       // Ogbonna Chigozie Ann
  ogbodo: 'ANS037',        // Ogbodo Obinna Victor
  // The source spells this name two ways on different days; one person.
  ezenwabachi: 'ANS003',   // EZENWABACHILI AMAKA EUNICE
  ezenwabachili: 'ANS003',
};

// On the roster but with no anaesthetist account in the system. Created as
// APPROVED placeholder anaesthetists so no shift is silently dropped — the
// department should replace these with the real names and credentials.
//
// Note LUCY: the only Lucy in the system is Emenike Helen Lucy (ANT030), an
// ANAESTHETIC_TECHNICIAN. She is deliberately NOT used — every other name in
// this roster is an anaesthetist, so a placeholder is the honest reading.
const PLACEHOLDER_NAMES = {
  lucy: 'Lucy (call roster — name to be confirmed)',
  ebipama: 'Ebipama (call roster — name to be confirmed)',
  ikechiotteh: 'Ikechi-Otteh (call roster — name to be confirmed)',
};

const DATE_MIN = new Date('2026-07-01T00:00:00.000Z');
const DATE_MAX = new Date('2026-07-31T00:00:00.000Z');

function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z]/g, '');
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
}

// Seniority is not held on the User record; the only signal is the role.
function seniorityFor(user) {
  return user.role === 'CONSULTANT_ANAESTHETIST' ? 'CONSULTANT' : null;
}

async function main() {
  console.log(`Connecting to database${DRY_RUN ? ' (DRY RUN — nothing will be written)' : ''}...`);
  await prisma.$connect();

  // 1. uploadedBy = first ADMIN (fallback: any user).
  const admin = (await prisma.user.findFirst({ where: { role: 'ADMIN' } }))
    || (await prisma.user.findFirst());
  if (!admin) throw new Error('No users in database; cannot set uploadedBy.');
  console.log(`uploadedBy = ${admin.fullName} (${admin.id})`);

  // 2. Resolve the registered anaesthetists by staffCode.
  const wantedCodes = Array.from(new Set(Object.values(TOKEN_TO_STAFFCODE)));
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

  // 3. Find or create the placeholder accounts.
  const placeholderCache = new Map();
  async function ensurePlaceholder(fullName) {
    if (placeholderCache.has(fullName)) return placeholderCache.get(fullName);
    let user = await prisma.user.findFirst({ where: { fullName } });
    if (!user) {
      if (DRY_RUN) {
        user = { id: `dry-run-${slugify(fullName)}`, fullName, role: 'ANAESTHETIST', staffCode: 'RANS???' };
        console.log(`  would create placeholder anaesthetist: ${fullName}`);
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
            role: 'ANAESTHETIST',
            status: 'APPROVED',
            department: 'Anaesthesia',
            staffCode: code,
            mustChangePassword: true,
            isFirstLogin: true,
          },
        });
        console.log(`  created placeholder anaesthetist: ${fullName} (username=${username}, staffCode=${code})`);
      }
    }
    placeholderCache.set(fullName, user);
    return user;
  }

  // 4. Resolve one roster token to a user.
  async function resolveToken(token) {
    const key = norm(token);
    if (!key) return null;
    const code = TOKEN_TO_STAFFCODE[key];
    if (code) return codeToUser.get(code);
    if (PLACEHOLDER_NAMES[key]) return ensurePlaceholder(PLACEHOLDER_NAMES[key]);
    return null;
  }

  // 5. Build the rows.
  const rows = [];
  const unresolved = [];
  const perPerson = new Map();

  for (const [dateStr, posts] of Object.entries(ROSTER)) {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    for (const [post, meta] of Object.entries(POSTS)) {
      for (const token of posts[post] || []) {
        const user = await resolveToken(token);
        if (!user) { unresolved.push({ dateStr, post, token }); continue; }
        rows.push({
          userId: user.id,
          staffName: user.fullName,
          staffCategory: 'ANAESTHETISTS',
          date,
          theatreId: null,
          location: meta.location,
          shift: 'CALL',
          seniorityLevel: seniorityFor(user),
          uploadedBy: admin.id,
          notes: meta.label,
        });
        perPerson.set(user.fullName, (perPerson.get(user.fullName) || 0) + 1);
      }
    }
  }

  const expected = Object.values(ROSTER).reduce((n, d) => n + d.theatre.length + d.icu.length, 0);
  console.log(`\nPrepared ${rows.length} of ${expected} assignments across ${Object.keys(ROSTER).length} days.`);
  if (unresolved.length) {
    console.error('UNRESOLVED — these shifts would be dropped:', unresolved);
    throw new Error('Refusing to import with unresolved names.');
  }

  console.log('\nCall days per person:');
  for (const [name, n] of [...perPerson.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(2)}  ${name}`);
  }

  if (DRY_RUN) {
    console.log('\nDry run complete — nothing written.');
    return;
  }

  // 6. Idempotent replace across the covered range.
  const deleted = await prisma.roster.deleteMany({
    where: { staffCategory: 'ANAESTHETISTS', date: { gte: DATE_MIN, lte: DATE_MAX } },
  });
  console.log(`\nRemoved ${deleted.count} existing anaesthetist roster rows in July 2026.`);

  const result = await prisma.roster.createMany({ data: rows });
  console.log(`Inserted ${result.count} anaesthetist call roster rows.`);
  console.log('Done.');
}

main()
  .catch((e) => { console.error('Seed failed:', e.message || e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
