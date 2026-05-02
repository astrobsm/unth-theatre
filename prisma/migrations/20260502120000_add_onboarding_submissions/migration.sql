-- CreateTable
CREATE TABLE "onboarding_submissions" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "department" TEXT,
    "staffCode" TEXT,
    "staffId" TEXT,
    "title" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "importedAt" TIMESTAMP(3),
    "importedBy" TEXT,
    "importError" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_submissions_status_idx" ON "onboarding_submissions"("status");

-- CreateIndex
CREATE INDEX "onboarding_submissions_createdAt_idx" ON "onboarding_submissions"("createdAt");
