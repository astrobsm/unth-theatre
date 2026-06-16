// One-off, idempotent migration: add patient + caregiver phone columns to the
// patients table. Uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS, which is
// non-destructive and safe to run against production (no data loss).
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const host = (process.env.DATABASE_URL || '').replace(/^.*@/, '').split('/')[0];
  console.log('ENV_OK host=' + host);

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "caregiverName" TEXT`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "caregiverPhone" TEXT`
  );
  console.log('OK: phoneNumber, caregiverName, caregiverPhone present on patients');
}

main()
  .catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
