-- CreateEnum
CREATE TYPE "ResearchAccessStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'REVOKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'ETHICS_COMMITTEE_CHAIRMAN';
ALTER TYPE "UserRole" ADD VALUE 'HEAD_OF_MAXILLOFACIAL';
ALTER TYPE "UserRole" ADD VALUE 'HEAD_OF_ENT';
ALTER TYPE "UserRole" ADD VALUE 'HEAD_OF_OPHTHALMOLOGY';
ALTER TYPE "UserRole" ADD VALUE 'HEAD_OF_OPERATIONS';

-- CreateTable
CREATE TABLE "research_access_requests" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "scopeRequested" TEXT NOT NULL,
    "periodFrom" DATE,
    "periodTo" DATE,
    "ethicsReference" TEXT,
    "status" "ResearchAccessStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueBy" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decisionNote" TEXT,
    "scopeGranted" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "research_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "research_access_requests_applicantId_status_idx" ON "research_access_requests"("applicantId", "status");

-- CreateIndex
CREATE INDEX "research_access_requests_status_submittedAt_idx" ON "research_access_requests"("status", "submittedAt");

-- AddForeignKey
ALTER TABLE "research_access_requests" ADD CONSTRAINT "research_access_requests_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_access_requests" ADD CONSTRAINT "research_access_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The table is read on both nodes: a clinician may apply on one and the board
-- may decide on the other. Without capture, an approval granted at the theatre
-- would be invisible to the same person on the cloud deployment, and they
-- would be told to apply again for a grant they already hold.
SELECT sync_enable_table('research_access_requests');
