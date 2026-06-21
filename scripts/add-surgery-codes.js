// Add patient-facing code columns used to hand a surgery's requested items to
// the relevant provider. Idempotent.
//   surgeries.consumablePackCode   -> Consumable Pack Provider keys this in
//   surgeries.pharmacyDrugCode     -> Pharmacy keys this in for packing
//   surgeries.anaesthesiaDrugCode  -> generated after the anaesthetist prescribes
//   emergency_prescriptions.anaesthesiaDrugCode -> emergency anaesthesia code
// Run with: node scripts/add-surgery-codes.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "surgeries"
    ADD COLUMN IF NOT EXISTS "consumablePackCode" TEXT,
    ADD COLUMN IF NOT EXISTS "pharmacyDrugCode" TEXT,
    ADD COLUMN IF NOT EXISTS "anaesthesiaDrugCode" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "emergency_prescriptions"
    ADD COLUMN IF NOT EXISTS "anaesthesiaDrugCode" TEXT;
  `);

  // Unique indexes (created concurrently-safe via IF NOT EXISTS). NULLs are
  // allowed to repeat in Postgres, so legacy rows without codes are fine.
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "surgeries_consumablePackCode_key"
    ON "surgeries" ("consumablePackCode");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "surgeries_pharmacyDrugCode_key"
    ON "surgeries" ("pharmacyDrugCode");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "surgeries_anaesthesiaDrugCode_key"
    ON "surgeries" ("anaesthesiaDrugCode");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "emergency_prescriptions_anaesthesiaDrugCode_key"
    ON "emergency_prescriptions" ("anaesthesiaDrugCode");
  `);

  console.log('✓ surgery + emergency-prescription code columns ensured');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
