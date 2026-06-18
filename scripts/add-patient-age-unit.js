// Add the "ageUnit" column to the patients table. Idempotent.
// Stores the unit for the patient's age so neonates/infants can be recorded
// as e.g. 2 WEEKS or 1 MONTH instead of being forced into whole years.
// Run with: node scripts/add-patient-age-unit.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "patients"
    ADD COLUMN IF NOT EXISTS "ageUnit" TEXT NOT NULL DEFAULT 'YEARS';
  `);
  console.log('✓ patients.ageUnit column ensured');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
