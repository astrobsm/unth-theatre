// Delete theatre suites matching (VAMED) or (NIGERIAN SIDE) and their
// dependent records, in FK-safe order, inside a single transaction.
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
    console.log('No matching theatre suites found. Nothing to delete.');
    return;
  }

  const ids = suites.map((s) => s.id);
  console.log(`Deleting ${suites.length} theatre suite(s):`);
  suites.forEach((s) => console.log(`  - ${s.name}`));

  const allocationIds = (
    await prisma.theatreAllocation.findMany({ where: { theatreId: { in: ids } }, select: { id: true } })
  ).map((r) => r.id);
  const setupIds = (
    await prisma.theatreSetup.findMany({ where: { theatreId: { in: ids } }, select: { id: true } })
  ).map((r) => r.id);
  const setupLogIds = (
    await prisma.anesthesiaSetupLog.findMany({ where: { theatreId: { in: ids } }, select: { id: true } })
  ).map((r) => r.id);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Unlink anesthesia setup logs that point at allocations being deleted.
    if (allocationIds.length) {
      await tx.anesthesiaSetupLog.updateMany({
        where: { allocationId: { in: allocationIds } },
        data: { allocationId: null },
      });
    }
    // 2. Equipment-check logs under the theatre's setup logs.
    if (setupLogIds.length) {
      await tx.equipmentCheckLog.deleteMany({ where: { setupLogId: { in: setupLogIds } } });
    }
    // 3. Anesthesia setup logs for these theatres.
    const setupLogs = await tx.anesthesiaSetupLog.deleteMany({ where: { theatreId: { in: ids } } });
    // 4. Theatre-setup children, then the setups.
    if (setupIds.length) {
      await tx.theatreSetupItem.deleteMany({ where: { setupId: { in: setupIds } } });
      await tx.theatreSetupReturn.deleteMany({ where: { setupId: { in: setupIds } } });
    }
    const setups = await tx.theatreSetup.deleteMany({ where: { theatreId: { in: ids } } });
    // 5. Cleaning logs.
    const cleaningLogs = await tx.theatreCleaningLog.deleteMany({ where: { theatreId: { in: ids } } });
    // 6. Allocations.
    const allocations = await tx.theatreAllocation.deleteMany({ where: { theatreId: { in: ids } } });
    // 7. Unassign equipment (kept, just unlinked).
    const equipment = await tx.equipment.updateMany({
      where: { assignedTheatreId: { in: ids } },
      data: { assignedTheatreId: null },
    });
    // 8. Finally the suites (Roster.theatreId is auto-nulled via onDelete: SetNull).
    const deletedSuites = await tx.theatreSuite.deleteMany({ where: { id: { in: ids } } });

    return { setupLogs, setups, cleaningLogs, allocations, equipment, deletedSuites };
  });

  console.log('\nDone.');
  console.log(`  AnesthesiaSetupLog deleted : ${result.setupLogs.count}`);
  console.log(`  TheatreSetup deleted       : ${result.setups.count}`);
  console.log(`  TheatreCleaningLog deleted : ${result.cleaningLogs.count}`);
  console.log(`  TheatreAllocation deleted  : ${result.allocations.count}`);
  console.log(`  Equipment unassigned       : ${result.equipment.count}`);
  console.log(`  TheatreSuite deleted       : ${result.deletedSuites.count}`);
}

main()
  .catch((e) => { console.error('Error:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
