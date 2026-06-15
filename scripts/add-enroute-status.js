// One-off, idempotent migration: add ENROUTE_TO_THEATRE to the HoldingAreaStatus
// enum. Uses ALTER TYPE ... ADD VALUE IF NOT EXISTS, which is non-destructive and
// safe to run against production (no table rewrite, no data loss).
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const host = (process.env.DATABASE_URL || '').replace(/^.*@/, '').split('/')[0];
  console.log('ENV_OK host=' + host);

  // ALTER TYPE ADD VALUE cannot run inside a transaction block, so run it raw.
  await prisma.$executeRawUnsafe(
    `ALTER TYPE "HoldingAreaStatus" ADD VALUE IF NOT EXISTS 'ENROUTE_TO_THEATRE'`
  );
  console.log('OK: ENROUTE_TO_THEATRE present on HoldingAreaStatus enum');
}

main()
  .catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
