// Add the second-transporter (trolley partner) columns to patient_transport_logs.
// Idempotent. Run with: node scripts/add-transport-partner.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "patient_transport_logs"
    ADD COLUMN IF NOT EXISTS "porter2Id" TEXT,
    ADD COLUMN IF NOT EXISTS "porter2Code" TEXT,
    ADD COLUMN IF NOT EXISTS "porter2Name" TEXT;
  `);

  console.log('✓ porter2 columns ensured on patient_transport_logs');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
