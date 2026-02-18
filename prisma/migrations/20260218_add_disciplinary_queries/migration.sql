-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DisciplinaryQueryStatus" AS ENUM ('ISSUED', 'ACKNOWLEDGED', 'RESPONDED', 'ESCALATED', 'RESOLVED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DisciplinaryQueryType" AS ENUM ('READINESS_LATE', 'THEATRE_SETUP_LATE', 'DUTY_ABANDONMENT', 'PROTOCOL_VIOLATION', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "disciplinary_queries" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientRole" TEXT NOT NULL,
    "recipientUnit" TEXT NOT NULL,
    "queryType" "DisciplinaryQueryType" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "deadlineTime" TIMESTAMP(3) NOT NULL,
    "deadlineType" TEXT NOT NULL,
    "evidence" TEXT,
    "status" "DisciplinaryQueryStatus" NOT NULL DEFAULT 'ISSUED',
    "recipientResponse" TEXT,
    "respondedAt" TIMESTAMP(3),
    "escalatedTo" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "escalationReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "issuedById" TEXT,
    "issuedByName" TEXT NOT NULL DEFAULT 'Office of the Chief Medical Director',
    "issuedByTitle" TEXT NOT NULL DEFAULT 'University of Nigeria Teaching Hospital, Ituku Ozalla',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disciplinary_queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "disciplinary_queries_referenceNumber_key" ON "disciplinary_queries"("referenceNumber");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "disciplinary_queries" ADD CONSTRAINT "disciplinary_queries_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "disciplinary_queries" ADD CONSTRAINT "disciplinary_queries_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
