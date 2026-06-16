// One-off, idempotent migration: add requester columns to the
// surgery_consumable_requests table. Non-destructive (no data loss).
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const host = (process.env.DATABASE_URL || '').replace(/^.*@/, '').split('/')[0];
  console.log('ENV_OK host=' + host);

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "surgery_consumable_requests" ADD COLUMN IF NOT EXISTS "requestedById" TEXT`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "surgery_consumable_requests" ADD COLUMN IF NOT EXISTS "requestedByName" TEXT`
  );
  console.log('OK: requestedById, requestedByName present on surgery_consumable_requests');
}

main()
  .catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
