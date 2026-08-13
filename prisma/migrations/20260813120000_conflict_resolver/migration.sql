-- ============================================================
-- Conflict Resolver — 9 tables
-- ------------------------------------------------------------
-- HAND-FILTERED from `prisma migrate diff`, which ALSO proposed dropping the
-- sync_hlc / sync_origin / sync_version columns from `patients` and the primary
-- keys from sync_applied, sync_conflicts and sync_journal. Applying its output
-- unedited would have disabled change capture and undone this week's sync work.
-- That is the second time this tool has proposed destroying the sync layer while
-- asked for something entirely unrelated.
--
-- Only conflict_* objects are kept, and anything containing DROP is excluded on
-- principle rather than on inspection. Additive throughout.
-- ============================================================

-- CreateEnum
CREATE TYPE "ConflictStatus" AS ENUM ('DRAFT', 'OPEN_FOR_RESPONSES', 'RESPONSE_CLOSED', 'ANALYSING', 'UNDER_REVIEW', 'REVISION_REQUIRED', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'IMPLEMENTED', 'CLOSED', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConflictUrgency" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "ConflictAnonymity" AS ENUM ('IDENTIFIED', 'CONFIDENTIAL', 'ANONYMOUS');

-- CreateEnum
CREATE TYPE "ConflictQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTI_CHOICE', 'YES_NO', 'LIKERT', 'RATING', 'RANKING', 'SHORT_TEXT', 'LONG_TEXT', 'NUMERIC', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "ConflictStakeholderRole" AS ENUM ('STAKEHOLDER', 'CHAIR', 'REVIEWER', 'OBSERVER');

-- CreateTable
CREATE TABLE "conflict_decisions" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "problemStatement" TEXT NOT NULL,
    "decisionRequired" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "urgency" "ConflictUrgency" NOT NULL DEFAULT 'NORMAL',
    "status" "ConflictStatus" NOT NULL DEFAULT 'DRAFT',
    "anonymity" "ConflictAnonymity" NOT NULL DEFAULT 'IDENTIFIED',
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "quorumPercent" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "reviewDueAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conflict_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflict_stakeholders" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userRole" TEXT,
    "role" "ConflictStakeholderRole" NOT NULL DEFAULT 'STAKEHOLDER',
    "responded" BOOLEAN NOT NULL DEFAULT false,
    "respondedAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remindedAt" TIMESTAMP(3),

    CONSTRAINT "conflict_stakeholders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflict_questions" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "type" "ConflictQuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "helpText" TEXT,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "showIfQuestionId" TEXT,
    "showIfValue" TEXT,

    CONSTRAINT "conflict_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflict_responses" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "userRole" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT,

    CONSTRAINT "conflict_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflict_answers" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "choiceValue" TEXT,
    "choiceValues" JSONB,
    "numericValue" DOUBLE PRECISION,
    "textValue" TEXT,
    "ranking" JSONB,

    CONSTRAINT "conflict_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflict_evidence" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileData" TEXT,
    "url" TEXT,
    "addedById" TEXT,
    "addedByName" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conflict_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflict_analyses" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "statistics" JSONB NOT NULL,
    "respondedCount" INTEGER NOT NULL,
    "invitedCount" INTEGER NOT NULL,
    "quorumMet" BOOLEAN NOT NULL DEFAULT false,
    "executiveSummary" TEXT,
    "keyArguments" TEXT,
    "risks" TEXT,
    "recommendation" TEXT,
    "rationale" TEXT,
    "conditions" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById" TEXT,
    "generatedByName" TEXT,

    CONSTRAINT "conflict_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflict_reviews" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "reviewerName" TEXT,
    "outcome" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conflict_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflict_approvals" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "approverRole" TEXT,
    "approverId" TEXT,
    "approverName" TEXT,
    "decisionMade" TEXT NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conflict_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conflict_decisions_number_key" ON "conflict_decisions"("number");

-- CreateIndex
CREATE INDEX "conflict_decisions_status_closesAt_idx" ON "conflict_decisions"("status", "closesAt");

-- CreateIndex
CREATE INDEX "conflict_decisions_category_publishedAt_idx" ON "conflict_decisions"("category", "publishedAt");

-- CreateIndex
CREATE INDEX "conflict_stakeholders_userId_responded_idx" ON "conflict_stakeholders"("userId", "responded");

-- CreateIndex
CREATE UNIQUE INDEX "conflict_stakeholders_decisionId_userId_key" ON "conflict_stakeholders"("decisionId", "userId");

-- CreateIndex
CREATE INDEX "conflict_questions_decisionId_order_idx" ON "conflict_questions"("decisionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "conflict_responses_idempotencyKey_key" ON "conflict_responses"("idempotencyKey");

-- CreateIndex
CREATE INDEX "conflict_responses_decisionId_submittedAt_idx" ON "conflict_responses"("decisionId", "submittedAt");

-- CreateIndex
CREATE INDEX "conflict_answers_questionId_idx" ON "conflict_answers"("questionId");

-- CreateIndex
CREATE INDEX "conflict_answers_responseId_idx" ON "conflict_answers"("responseId");

-- CreateIndex
CREATE INDEX "conflict_evidence_decisionId_idx" ON "conflict_evidence"("decisionId");

-- CreateIndex
CREATE INDEX "conflict_analyses_decisionId_version_idx" ON "conflict_analyses"("decisionId", "version");

-- CreateIndex
CREATE INDEX "conflict_reviews_decisionId_createdAt_idx" ON "conflict_reviews"("decisionId", "createdAt");

-- CreateIndex
CREATE INDEX "conflict_approvals_decisionId_idx" ON "conflict_approvals"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "conflict_approvals_decisionId_level_key" ON "conflict_approvals"("decisionId", "level");

-- AddForeignKey
ALTER TABLE "conflict_stakeholders" ADD CONSTRAINT "conflict_stakeholders_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "conflict_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_questions" ADD CONSTRAINT "conflict_questions_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "conflict_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_responses" ADD CONSTRAINT "conflict_responses_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "conflict_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_answers" ADD CONSTRAINT "conflict_answers_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "conflict_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_answers" ADD CONSTRAINT "conflict_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "conflict_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_evidence" ADD CONSTRAINT "conflict_evidence_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "conflict_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_analyses" ADD CONSTRAINT "conflict_analyses_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "conflict_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_reviews" ADD CONSTRAINT "conflict_reviews_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "conflict_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_approvals" ADD CONSTRAINT "conflict_approvals_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "conflict_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
