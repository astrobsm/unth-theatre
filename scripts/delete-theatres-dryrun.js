// Read-only dry run: report theatre suites matching (VAMED) or (NIGERIAN SIDE)
// and count every dependent record that would have to be removed/updated
// before the suites can be deleted.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const suites = await prisma.theatreSuite.findMany({
    where: {
      OR: [
        { name: { contains: '(VAMED)' } },
        { name: { contains: '(NIGERIAN SIDE)' } },
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  if (suites.length === 0) {
    console.log('No matching theatre suites found.');
    return;
  }

  const ids = suites.map((s) => s.id);
  console.log(`Matching theatre suites (${suites.length}):`);
  suites.forEach((s) => console.log(`  - ${s.name}`));

  const setupIds = (
    await prisma.theatreSetup.findMany({ where: { theatreId: { in: ids } }, select: { id: true } })
  ).map((r) => r.id);
  const setupLogIds = (
    await prisma.anesthesiaSetupLog.findMany({ where: { theatreId: { in: ids } }, select: { id: true } })
  ).map((r) => r.id);

  const [
    allocations,
    setups,
    cleaningLogs,
    setupLogs,
    rosters,
    equipment,
    setupItems,
    setupReturns,
    equipmentChecks,
  ] = await Promise.all([
    prisma.theatreAllocation.count({ where: { theatreId: { in: ids } } }),
    Promise.resolve(setupIds.length),
    prisma.theatreCleaningLog.count({ where: { theatreId: { in: ids } } }),
    Promise.resolve(setupLogIds.length),
    prisma.roster.count({ where: { theatreId: { in: ids } } }),
    prisma.equipment.count({ where: { assignedTheatreId: { in: ids } } }),
    setupIds.length ? prisma.theatreSetupItem.count({ where: { setupId: { in: setupIds } } }) : 0,
    setupIds.length ? prisma.theatreSetupReturn.count({ where: { setupId: { in: setupIds } } }) : 0,
    setupLogIds.length ? prisma.equipmentCheckLog.count({ where: { setupLogId: { in: setupLogIds } } }) : 0,
  ]);

  console.log('\nDependent records that will be DELETED:');
  console.log(`  TheatreAllocation     : ${allocations}`);
  console.log(`  TheatreSetup          : ${setups}`);
  console.log(`  TheatreSetupItem      : ${setupItems}`);
  console.log(`  TheatreSetupReturn    : ${setupReturns}`);
  console.log(`  TheatreCleaningLog    : ${cleaningLogs}`);
  console.log(`  AnesthesiaSetupLog    : ${setupLogs}`);
  console.log(`  EquipmentCheckLog     : ${equipmentChecks}`);
  console.log('\nRecords that will be UPDATED (kept, just unlinked):');
  console.log(`  Equipment (unassigned): ${equipment}`);
  console.log(`  Roster (theatre nulled): ${rosters}`);
}

main()
  .catch((e) => { console.error('Error:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
