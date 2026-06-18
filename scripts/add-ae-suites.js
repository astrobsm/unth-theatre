// Ensure the A&E theatre location has its two suites: North Wing & South Wing.
// Idempotent — safe to run multiple times. Run with: node scripts/add-ae-suites.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const suites = [
    { name: 'A&E North Wing Suite', location: 'A&E' },
    { name: 'A&E South Wing Suite', location: 'A&E' },
  ];

  for (const s of suites) {
    const existing = await prisma.theatreSuite.findUnique({ where: { name: s.name } });
    if (existing) {
      console.log(`= already present: ${s.name}`);
      continue;
    }
    await prisma.theatreSuite.create({
      data: { name: s.name, location: s.location, capacity: 1, status: 'AVAILABLE' },
    });
    console.log(`+ created: ${s.name}`);
  }

  console.log('OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
