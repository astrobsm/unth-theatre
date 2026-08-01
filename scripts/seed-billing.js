/**
 * Seeds revenue accounts and the default split rules.
 *
 *     node scripts/seed-billing.js
 *
 * Without a hospital revenue account, settling the very first invoice fails —
 * correctly, since money with nowhere to go should not be recorded as
 * distributed. This makes the system usable out of the box.
 *
 * Everything here is a SEED, not a constant. Percentages, accounts and bank
 * details are all editable rows; a hospital that splits theatre income
 * differently changes the rules rather than the code. The shares below are a
 * defensible starting point, not a policy — an administrator is expected to set
 * them to whatever this hospital has actually agreed.
 *
 * Idempotent: matched on `code`, so re-running updates rather than duplicates,
 * and it never overwrites bank details somebody has since entered.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ACCOUNTS = [
  { code: 'ACC-HOSP', name: 'Hospital General Revenue', kind: 'HOSPITAL' },
  { code: 'ACC-THEATRE', name: 'Theatre Commercialized Unit', kind: 'THEATRE' },
  { code: 'ACC-PHARM', name: 'Pharmacy', kind: 'PHARMACY' },
  { code: 'ACC-CSSD', name: 'CSSD', kind: 'CSSD' },
  { code: 'ACC-LAB', name: 'Laboratory', kind: 'LABORATORY' },
  { code: 'ACC-BLOOD', name: 'Blood Bank', kind: 'BLOOD_BANK' },
];

/**
 * Default shares, in basis points (10,000 = 100%). Each charge kind must total
 * 10,000 or the settings screen will flag it.
 */
const RULES = [
  // Theatre and procedure income is split between the hospital and the unit
  // that did the work.
  { kind: 'THEATRE', account: 'ACC-HOSP', bp: 6000 },
  { kind: 'THEATRE', account: 'ACC-THEATRE', bp: 4000 },
  { kind: 'PROCEDURE', account: 'ACC-HOSP', bp: 6000 },
  { kind: 'PROCEDURE', account: 'ACC-THEATRE', bp: 4000 },

  // Anaesthesia and recovery follow the theatre.
  { kind: 'ANAESTHESIA', account: 'ACC-HOSP', bp: 6000 },
  { kind: 'ANAESTHESIA', account: 'ACC-THEATRE', bp: 4000 },
  { kind: 'RECOVERY', account: 'ACC-HOSP', bp: 7000 },
  { kind: 'RECOVERY', account: 'ACC-THEATRE', bp: 3000 },

  // Drugs are the pharmacy's, less a hospital margin. Note that consignment
  // lines never reach these rules — they pay their own vendor directly.
  { kind: 'DRUG', account: 'ACC-PHARM', bp: 8000 },
  { kind: 'DRUG', account: 'ACC-HOSP', bp: 2000 },

  { kind: 'CONSUMABLE', account: 'ACC-HOSP', bp: 7000 },
  { kind: 'CONSUMABLE', account: 'ACC-THEATRE', bp: 3000 },

  { kind: 'IMPLANT', account: 'ACC-HOSP', bp: 10000 },
  { kind: 'CSSD', account: 'ACC-CSSD', bp: 10000 },
  { kind: 'LABORATORY', account: 'ACC-LAB', bp: 10000 },
  { kind: 'BLOOD', account: 'ACC-BLOOD', bp: 10000 },
  { kind: 'OXYGEN', account: 'ACC-HOSP', bp: 10000 },
  { kind: 'EMERGENCY', account: 'ACC-HOSP', bp: 10000 },
  { kind: 'OTHER', account: 'ACC-HOSP', bp: 10000 },
];

(async () => {
  console.log('Revenue accounts\n');
  const byCode = new Map();
  let created = 0;
  let kept = 0;

  for (const acc of ACCOUNTS) {
    const existing = await prisma.revenueAccount.findUnique({ where: { code: acc.code } });
    if (existing) {
      byCode.set(acc.code, existing.id);
      kept += 1;
      console.log(`  kept     ${acc.code.padEnd(14)} ${existing.name}`);
      continue;
    }
    const row = await prisma.revenueAccount.create({ data: acc });
    byCode.set(acc.code, row.id);
    created += 1;
    console.log(`  created  ${acc.code.padEnd(14)} ${acc.name}`);
  }

  console.log('\nDefault split rules');
  // The effective date is deliberately in the past so the rules apply to any
  // invoice settled today, including one for a case done last week.
  const from = new Date('2020-01-01');
  let rulesCreated = 0;
  let rulesKept = 0;

  for (const rule of RULES) {
    const accountId = byCode.get(rule.account);
    const existing = await prisma.revenueRule.findFirst({
      where: { kind: rule.kind, accountId, effectiveTo: null },
    });
    if (existing) {
      rulesKept += 1;
      continue;
    }
    await prisma.revenueRule.create({
      data: {
        kind: rule.kind,
        accountId,
        shareBasisPoints: rule.bp,
        effectiveFrom: from,
        notes: 'Seeded default — edit to match this hospital’s agreed split.',
      },
    });
    rulesCreated += 1;
  }

  // Prove each kind adds to 100%: a set that does not is distributed in
  // proportion anyway, which is rarely what anybody intended.
  const live = await prisma.revenueRule.findMany({ where: { effectiveTo: null } });
  const totals = new Map();
  for (const r of live) totals.set(r.kind, (totals.get(r.kind) ?? 0) + r.shareBasisPoints);

  console.log('');
  let allValid = true;
  for (const [kind, bp] of Array.from(totals.entries()).sort()) {
    const ok = bp === 10000;
    if (!ok) allValid = false;
    console.log(`  ${ok ? 'ok  ' : 'WARN'}  ${kind.padEnd(14)} ${(bp / 100).toFixed(2)}%`);
  }

  console.log(
    `\n${created} accounts created, ${kept} kept. ${rulesCreated} rules created, ${rulesKept} kept.`
  );
  console.log(allValid ? 'Every charge kind splits to exactly 100%.' : 'SOME KINDS DO NOT TOTAL 100% — fix before settling invoices.');

  await prisma.$disconnect();
  process.exitCode = allValid ? 0 : 1;
})().catch(async (err) => {
  console.error('Seeding failed:', err.message);
  await prisma.$disconnect();
  process.exit(1);
});
