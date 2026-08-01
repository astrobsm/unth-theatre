/**
 * Seeds the Theatre Supply Unit's stores.
 *
 *     node scripts/seed-stock-locations.js
 *
 * These are SEEDS, not constants. Every one of them is an ordinary row an
 * administrator can rename, deactivate or add to — a hospital without a cold
 * chain store should not be looking at an empty one it cannot remove, and a
 * hospital with two implant rooms should be able to say so.
 *
 * Idempotent: matched on `code`, so re-running updates rather than duplicates,
 * and never overwrites a name an administrator has since changed.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const STORES = [
  {
    code: 'TSU-CONS',
    name: 'Consumables Store',
    description: 'General surgical consumables — sutures, gloves, drapes, dressings.',
    sortOrder: 10,
  },
  {
    code: 'TSU-DRUG',
    name: 'Drug Holding Bay',
    description: 'Ward-stock drugs held for theatre use.',
    sortOrder: 20,
  },
  {
    code: 'TSU-CSSD',
    name: 'CSSD Sterile Store',
    description: 'Sterilised instrument sets and packs awaiting issue.',
    sortOrder: 30,
  },
  {
    code: 'TSU-EMERG',
    name: 'Emergency Store',
    description: 'Ring-fenced emergency stock. An elective case needs authorisation to draw on it.',
    isEmergency: true,
    sortOrder: 40,
  },
  {
    code: 'TSU-IMPL',
    name: 'High Value Implant Store',
    description: 'Implants and high-value devices, individually tracked.',
    sortOrder: 50,
  },
  {
    code: 'TSU-COLD',
    name: 'Cold Chain Store',
    description: 'Refrigerated stock. Excursions outside the range must be recorded.',
    minTempC: 2,
    maxTempC: 8,
    sortOrder: 60,
  },
  {
    code: 'TSU-CD',
    name: 'Controlled Drug Safe',
    description: 'Controlled drugs. Issue and discard both require a second officer as witness.',
    isControlled: true,
    sortOrder: 70,
  },
  {
    code: 'TSU-RET',
    name: 'Returns Store',
    description: 'Items returned unused from theatre, pending checking back into stock.',
    sortOrder: 80,
  },
  {
    code: 'TSU-QUAR',
    name: 'Quarantine Store',
    description: 'Stock withdrawn from use — recalled, damaged, or awaiting investigation.',
    sortOrder: 90,
  },
  {
    code: 'TSU-CONSIGN',
    name: 'Vendor Consignment Store',
    description: 'Vendor-owned stock held on site. Ownership passes to the hospital on consumption.',
    isConsignment: true,
    sortOrder: 100,
  },
];

(async () => {
  let created = 0;
  let updated = 0;

  for (const store of STORES) {
    const existing = await prisma.stockLocation.findUnique({ where: { code: store.code } });

    if (existing) {
      // Only the behavioural flags are refreshed. The name and description are
      // left alone: an administrator may have reworded them for local usage,
      // and a seed script should not undo that.
      await prisma.stockLocation.update({
        where: { code: store.code },
        data: {
          isControlled: Boolean(store.isControlled),
          isEmergency: Boolean(store.isEmergency),
          isConsignment: Boolean(store.isConsignment),
          minTempC: store.minTempC ?? null,
          maxTempC: store.maxTempC ?? null,
          sortOrder: store.sortOrder,
        },
      });
      updated += 1;
      console.log(`  updated  ${store.code.padEnd(12)} ${existing.name}`);
    } else {
      await prisma.stockLocation.create({
        data: {
          code: store.code,
          name: store.name,
          description: store.description,
          isControlled: Boolean(store.isControlled),
          isEmergency: Boolean(store.isEmergency),
          isConsignment: Boolean(store.isConsignment),
          minTempC: store.minTempC ?? null,
          maxTempC: store.maxTempC ?? null,
          sortOrder: store.sortOrder,
        },
      });
      created += 1;
      console.log(`  created  ${store.code.padEnd(12)} ${store.name}`);
    }
  }

  const total = await prisma.stockLocation.count();
  console.log(`\n${created} created, ${updated} updated. ${total} stores in the Theatre Supply Unit.`);
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error('Seeding failed:', err.message);
  await prisma.$disconnect();
  process.exit(1);
});
