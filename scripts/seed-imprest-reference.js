/**
 * Imprest reference data — departments, financial years, budget heads, vote
 * codes, cost centres and expense categories.
 *
 *     node scripts/seed-imprest-reference.js --dry-run
 *     node scripts/seed-imprest-reference.js
 *
 * Ported from the imprest system's own prisma/seed.ts, which is where these
 * codes and budget-head numbers come from — they mirror the unit's chart of
 * accounts, so they are reproduced rather than invented.
 *
 * Idempotent: every row is upserted on its natural key, so re-running only
 * refreshes names. Nothing is deleted, and no imprest DUTY is assigned here —
 * duties are granted deliberately from Imprest → Duties.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const isoDate = (s) => new Date(`${s}T00:00:00.000Z`);

const FINANCIAL_YEARS = [
  { label: '2026', startDate: isoDate('2026-01-01'), endDate: isoDate('2026-12-31'), isCurrent: true, isClosed: false },
  { label: '2025', startDate: isoDate('2025-01-01'), endDate: isoDate('2025-12-31'), isCurrent: false, isClosed: true },
];

const DEPARTMENTS = [
  { code: 'TCU', name: 'Theatre Commercialized Unit', office: 'Office of the Chairman' },
  { code: 'THE', name: 'Main Theatre', office: 'Surgical Block' },
  { code: 'ANA', name: 'Anaesthesia', office: 'Surgical Block' },
  { code: 'CSSD', name: 'Central Sterile Supply Department', office: 'Surgical Block' },
  { code: 'ADM', name: 'Administration', office: 'Administrative Block' },
  { code: 'FIN', name: 'Finance and Accounts', office: 'Administrative Block' },
  { code: 'AUD', name: 'Internal Audit', office: 'Administrative Block' },
];

const BUDGET_HEADS = [
  { code: '2201', name: 'Office Stationery and Consumables', description: 'Recurrent — general office running costs' },
  { code: '2202', name: 'Maintenance of Equipment', description: 'Recurrent — servicing and repair of theatre equipment' },
  { code: '2203', name: 'Fuel and Lubricants', description: 'Recurrent — generator and vehicle fuel' },
  { code: '2204', name: 'Medical and Surgical Consumables', description: 'Recurrent — theatre consumables' },
  { code: '2205', name: 'Utilities and Communication', description: 'Recurrent — electricity, water, telephone, internet' },
  { code: '2206', name: 'Transport and Travelling', description: 'Recurrent — local running and duty travel' },
  { code: '2207', name: 'Cleaning and Sanitation', description: 'Recurrent — cleaning materials and waste disposal' },
  { code: '2301', name: 'Minor Capital Items', description: 'Capital — small equipment purchases' },
];

const VOTE_CODES = [
  { code: '2201-001', name: 'Printing and stationery', budgetHead: '2201' },
  { code: '2201-002', name: 'Computer consumables', budgetHead: '2201' },
  { code: '2202-001', name: 'Theatre equipment servicing', budgetHead: '2202' },
  { code: '2202-002', name: 'Electrical repairs', budgetHead: '2202' },
  { code: '2203-001', name: 'Diesel for generator', budgetHead: '2203' },
  { code: '2204-001', name: 'Surgical gloves and drapes', budgetHead: '2204' },
  { code: '2204-002', name: 'Sutures and dressings', budgetHead: '2204' },
  { code: '2205-001', name: 'Internet subscription', budgetHead: '2205' },
  { code: '2206-001', name: 'Local running', budgetHead: '2206' },
  { code: '2207-001', name: 'Cleaning materials', budgetHead: '2207' },
];

const COST_CENTRES = [
  { code: 'CC-TCU-01', name: 'Theatre Commercialized Unit — Operations' },
  { code: 'CC-TCU-02', name: 'Theatre Commercialized Unit — Maintenance' },
  { code: 'CC-ADM-01', name: 'Administration — General' },
];

// Order matters: it is the order the categories appear in a form.
const EXPENSE_CATEGORIES = [
  'Stationery', 'Office Supplies', 'Maintenance', 'Fuel', 'Transportation',
  'Cleaning Materials', 'Electrical Materials', 'Repairs', 'Medical Consumables',
  'Equipment', 'Communication', 'Utilities', 'Training', 'Printing', 'Miscellaneous',
];

/** Which budget head a category is charged to unless overridden on the line. */
const CATEGORY_BUDGET_HEAD = {
  Stationery: '2201',
  'Office Supplies': '2201',
  Maintenance: '2202',
  Fuel: '2203',
  Transportation: '2206',
  'Cleaning Materials': '2207',
  'Electrical Materials': '2202',
  Repairs: '2202',
  'Medical Consumables': '2204',
  Equipment: '2301',
  Communication: '2205',
  Utilities: '2205',
  Training: '2206',
  Printing: '2201',
  Miscellaneous: '2201',
};

async function main() {
  console.log(`Seeding imprest reference data${DRY_RUN ? ' (DRY RUN — nothing will be written)' : ''}...`);
  await prisma.$connect();

  if (DRY_RUN) {
    console.log(`  would upsert ${FINANCIAL_YEARS.length} financial years`);
    console.log(`  would upsert ${DEPARTMENTS.length} departments`);
    console.log(`  would upsert ${BUDGET_HEADS.length} budget heads, ${VOTE_CODES.length} vote codes`);
    console.log(`  would upsert ${COST_CENTRES.length} cost centres`);
    console.log(`  would upsert ${EXPENSE_CATEGORIES.length} expense categories`);
    return;
  }

  for (const year of FINANCIAL_YEARS) {
    await prisma.financialYear.upsert({
      where: { label: year.label },
      create: year,
      update: { isCurrent: year.isCurrent, isClosed: year.isClosed },
    });
  }
  console.log(`  ${FINANCIAL_YEARS.length} financial years`);

  for (const d of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { code: d.code },
      create: d,
      update: { name: d.name, office: d.office },
    });
  }
  console.log(`  ${DEPARTMENTS.length} departments`);

  const headByCode = new Map();
  for (const h of BUDGET_HEADS) {
    const row = await prisma.budgetHead.upsert({
      where: { code: h.code },
      create: h,
      update: { name: h.name, description: h.description },
    });
    headByCode.set(h.code, row.id);
  }

  for (const v of VOTE_CODES) {
    await prisma.voteCode.upsert({
      where: { code: v.code },
      create: { code: v.code, name: v.name, budgetHeadId: headByCode.get(v.budgetHead) ?? null },
      update: { name: v.name, budgetHeadId: headByCode.get(v.budgetHead) ?? null },
    });
  }

  for (const c of COST_CENTRES) {
    await prisma.costCentre.upsert({ where: { code: c.code }, create: c, update: { name: c.name } });
  }
  console.log(`  ${BUDGET_HEADS.length} budget heads, ${VOTE_CODES.length} vote codes, ${COST_CENTRES.length} cost centres`);

  for (const [index, name] of EXPENSE_CATEGORIES.entries()) {
    const data = {
      name,
      // Seeded categories can be deactivated but never removed.
      isSystem: true,
      sortOrder: (index + 1) * 10,
      defaultBudgetHeadId: headByCode.get(CATEGORY_BUDGET_HEAD[name] ?? '2201') ?? null,
    };
    // No unique constraint on name alone (it is name+parentId), so find first.
    const existing = await prisma.expenseCategory.findFirst({ where: { name, parentId: null } });
    if (existing) await prisma.expenseCategory.update({ where: { id: existing.id }, data });
    else await prisma.expenseCategory.create({ data });
  }
  console.log(`  ${EXPENSE_CATEGORIES.length} expense categories`);

  const counts = {
    financialYears: await prisma.financialYear.count(),
    departments: await prisma.department.count(),
    budgetHeads: await prisma.budgetHead.count(),
    voteCodes: await prisma.voteCode.count(),
    costCentres: await prisma.costCentre.count(),
    categories: await prisma.expenseCategory.count(),
    duties: await prisma.imprestRoleAssignment.count(),
  };
  console.log('\nIn the database now:', JSON.stringify(counts, null, 2));

  if (counts.duties === 0) {
    console.log(
      '\nNOTE: no imprest duty is assigned yet, so imprest routes will refuse everyone.\n' +
      'An ADMIN or SYSTEM_ADMINISTRATOR holds an implicit administrator duty — sign in as\n' +
      'one and assign the real duties from Imprest → Duties.'
    );
  }
}

main()
  .catch((e) => { console.error('Seed failed:', e.message || e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
