// Create the feedback module tables + enum. Idempotent.
// Run with: node scripts/add-feedback-tables.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Enum
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FeedbackCategory') THEN
        CREATE TYPE "FeedbackCategory" AS ENUM ('THEATRE_MANAGEMENT', 'APPLICATION');
      END IF;
    END
    $$;
  `);

  // Staff feedback
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "staff_feedback" (
      "id" TEXT PRIMARY KEY,
      "category" "FeedbackCategory" NOT NULL,
      "title" TEXT,
      "message" TEXT NOT NULL,
      "rating" INTEGER,
      "authorId" TEXT,
      "authorName" TEXT,
      "authorRole" TEXT,
      "status" TEXT NOT NULL DEFAULT 'OPEN',
      "adminNotes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "staff_feedback_category_idx" ON "staff_feedback" ("category");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "staff_feedback_status_idx" ON "staff_feedback" ("status");`);

  // Patient feedback
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "patient_feedback" (
      "id" TEXT PRIMARY KEY,
      "patientName" TEXT,
      "folderNumber" TEXT,
      "phoneNumber" TEXT,
      "relationship" TEXT,
      "overallRating" INTEGER,
      "staffCourtesyRating" INTEGER,
      "cleanlinessRating" INTEGER,
      "waitTimeRating" INTEGER,
      "communicationRating" INTEGER,
      "painManagementRating" INTEGER,
      "journeyStage" TEXT,
      "whatWentWell" TEXT,
      "whatToImprove" TEXT,
      "message" TEXT,
      "wouldRecommend" BOOLEAN,
      "status" TEXT NOT NULL DEFAULT 'NEW',
      "source" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "patient_feedback_status_idx" ON "patient_feedback" ("status");`);

  console.log('OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
