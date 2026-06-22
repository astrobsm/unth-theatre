// Add Modified Aldrete score columns + missing discharge-criteria columns to
// the pacu_assessments table. Idempotent.
//   aldreteActivity / aldreteRespiration / aldreteCirculation /
//   aldreteConsciousness / aldreteOxygenSaturation / aldreteTotalScore (0-2 each, /10)
//   dischargeAbleToMobilize / dischargeNoActiveBleedingOrOozing
// Run with: node scripts/add-aldrete-columns.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "pacu_assessments"
    ADD COLUMN IF NOT EXISTS "aldreteActivity" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "aldreteRespiration" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "aldreteCirculation" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "aldreteConsciousness" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "aldreteOxygenSaturation" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "aldreteTotalScore" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "dischargeAbleToMobilize" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "dischargeNoActiveBleedingOrOozing" BOOLEAN NOT NULL DEFAULT false;
  `);

  console.log('✓ Aldrete + discharge-criteria columns ensured on pacu_assessments');

  // PACU medications administration log.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "pacu_medications" (
      "id" TEXT NOT NULL,
      "pacuAssessmentId" TEXT NOT NULL,
      "administeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "administeredBy" TEXT NOT NULL,
      "medicationName" TEXT NOT NULL,
      "dose" TEXT NOT NULL,
      "route" TEXT NOT NULL,
      "indication" TEXT,
      "notes" TEXT,
      CONSTRAINT "pacu_medications_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "pacu_medications_pacuAssessmentId_idx"
    ON "pacu_medications" ("pacuAssessmentId");
  `);
  // Add the FK only if it does not already exist.
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'pacu_medications_pacuAssessmentId_fkey'
      ) THEN
        ALTER TABLE "pacu_medications"
        ADD CONSTRAINT "pacu_medications_pacuAssessmentId_fkey"
        FOREIGN KEY ("pacuAssessmentId") REFERENCES "pacu_assessments"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  console.log('✓ pacu_medications table ensured');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
