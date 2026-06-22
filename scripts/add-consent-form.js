// Add structured UNTH consent-form columns to the surgeries table. Idempotent.
//   surgeries.consentFormData             -> JSON of the filled consent form + signatures
//   surgeries.consentSignedElectronically -> true when signed in-app (vs uploaded scan)
//   surgeries.consentCompletedAt          -> when the consent was completed
// The generated/uploaded hard-copy PDF reuses the existing consentFile* columns.
// Run with: node scripts/add-consent-form.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "surgeries"
    ADD COLUMN IF NOT EXISTS "consentFormData" TEXT,
    ADD COLUMN IF NOT EXISTS "consentSignedElectronically" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "consentCompletedAt" TIMESTAMP(3);
  `);

  console.log('✓ consent-form columns ensured on surgeries');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
