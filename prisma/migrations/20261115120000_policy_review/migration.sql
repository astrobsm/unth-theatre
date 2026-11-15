-- The Theatre Users Committee reviewing a draft policy inside ORM.
--
-- WHAT THIS REPLACES. A consolidated draft goes to every committee member,
-- their input is harmonised, and a revised version goes to Hospital
-- Management. Until now that happened in a WhatsApp group and a shared
-- document. Two things go wrong there and both are visible in the draft.
--
-- The draft carries around forty values in [square brackets] -- "[11:00]",
-- "[24 hours]", "[80%]". Each is an open proposal the committee must settle.
-- In a group chat they are settled by whoever answers last, and nobody can
-- say afterwards how many people supported the number that ended up in the
-- policy. And a single patient-safety objection reads exactly like every
-- other message, thirty messages back: the majority does not have to
-- overrule it, it simply scrolls away.
--
-- So: a stance per section, a tally per bracketed value, and minority safety
-- concerns surfaced as their own class rather than averaged away.
--
-- RESUMABILITY IS WHY THE RESPONSE ROWS EXIST EARLY. A member opens the link
-- in WhatsApp on a phone, answers six sections, is called away, and finishes
-- on a desktop two days later. That only works if progress is a fact in this
-- database rather than in one browser, so a section response row exists from
-- the moment a stance is chosen, with submittedAt still null. The draft is
-- not a blob beside the answers; the draft IS the answers.
--
-- Thirteen tables in one migration, three of which (analysis runs, proposed
-- changes, final proposals) are not read until the second half of this work
-- lands later the same week. One deploy against the live database rather than
-- two was the safer trade.
--
-- Guarded throughout: a failed migration blocks `migrate deploy` and
-- therefore every later release, and Postgres has no IF NOT EXISTS for
-- CREATE TYPE or ADD CONSTRAINT. Plain double-dash comments only; a Prisma
-- triple-slash doc comment in a migration once broke `migrate deploy`.

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyDocumentStatus') THEN
    CREATE TYPE "PolicyDocumentStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'ANALYSED', 'FINAL');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicySourceFormat') THEN
    CREATE TYPE "PolicySourceFormat" AS ENUM ('MARKDOWN', 'DOCX', 'PASTED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyDecisionItemType') THEN
    CREATE TYPE "PolicyDecisionItemType" AS ENUM ('TIME', 'PERCENTAGE', 'NUMBER', 'DURATION', 'FREE_TEXT', 'CHOICE');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyRoundStatus') THEN
    CREATE TYPE "PolicyRoundStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'ANALYSED', 'FINALISED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyResultsVisibility') THEN
    CREATE TYPE "PolicyResultsVisibility" AS ENUM ('OWNER_ONLY', 'RELEASED_ATTRIBUTED', 'RELEASED_BY_ROLE');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyStance') THEN
    CREATE TYPE "PolicyStance" AS ENUM ('AGREE', 'AGREE_WITH_CHANGES', 'DISAGREE', 'NOT_MY_AREA');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyConcernType') THEN
    CREATE TYPE "PolicyConcernType" AS ENUM ('PATIENT_SAFETY', 'FEASIBILITY', 'RESOURCES', 'LEGAL_OR_DISCIPLINARY', 'CLARITY', 'OTHER');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyPriority') THEN
    CREATE TYPE "PolicyPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyAnalysisStatus') THEN
    CREATE TYPE "PolicyAnalysisStatus" AS ENUM ('RUNNING', 'VALIDATED', 'FAILED_VALIDATION', 'FAILED_API');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyChangeType') THEN
    CREATE TYPE "PolicyChangeType" AS ENUM ('WORDING', 'VALUE', 'ADD', 'REMOVE');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicySupportStrength') THEN
    CREATE TYPE "PolicySupportStrength" AS ENUM ('STRONG', 'MODERATE', 'WEAK');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyOwnerDecision') THEN
    CREATE TYPE "PolicyOwnerDecision" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EDITED', 'FOR_COMMITTEE');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "policy_documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sourceFileName" TEXT,
    "sourceFormat" "PolicySourceFormat" NOT NULL,
    "status" "PolicyDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT,
    "importedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "policy_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "policy_sections" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "number" TEXT,
    "title" TEXT NOT NULL,
    "parentId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "body" TEXT NOT NULL,
    "isAppendix" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "policy_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "policy_decision_items" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "placeholder" TEXT NOT NULL,
    "surroundingSentence" TEXT NOT NULL,
    "type" "PolicyDecisionItemType" NOT NULL,
    "currentValue" TEXT NOT NULL,
    "options" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "policy_decision_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "policy_review_rounds" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3) NOT NULL,
    "status" "PolicyRoundStatus" NOT NULL DEFAULT 'DRAFT',
    "resultsVisibility" "PolicyResultsVisibility" NOT NULL DEFAULT 'OWNER_ONLY',
    "quorumPercent" INTEGER,
    "remindedAt48h" TIMESTAMP(3),
    "remindedAt12h" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "policy_review_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "policy_invitations" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "userId" TEXT,
    "inviteeName" TEXT NOT NULL,
    "inviteeRole" TEXT,
    "inviteeUnit" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "tokenHash" TEXT NOT NULL,
    "selfEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "remindedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "policy_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "policy_participations" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "currentStepId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "policy_participations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "policy_section_responses" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "stance" "PolicyStance" NOT NULL,
    "comment" TEXT,
    "proposedWording" TEXT,
    "concernType" "PolicyConcernType",
    "priority" "PolicyPriority",
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "policy_section_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "policy_decision_item_responses" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "decisionItemId" TEXT NOT NULL,
    "acceptsCurrent" BOOLEAN NOT NULL,
    "proposedValue" TEXT,
    "reason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "policy_decision_item_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "policy_general_responses" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "overallSupport" INTEGER,
    "concern1" TEXT,
    "concern2" TEXT,
    "concern3" TEXT,
    "barriers" TEXT,
    "resourcesNeeded" TEXT,
    "otherComments" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "policy_general_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "policy_response_revisions" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "policy_response_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "policy_analysis_runs" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputSnapshotHash" TEXT NOT NULL,
    "status" "PolicyAnalysisStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "output" JSONB,
    "validationErrors" JSONB,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costCents" INTEGER,
    "runById" TEXT,
    "runByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "policy_analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "policy_proposed_changes" (
    "id" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "sectionId" TEXT,
    "type" "PolicyChangeType" NOT NULL,
    "currentText" TEXT,
    "proposedText" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "supportingResponseIds" JSONB NOT NULL,
    "supportStrength" "PolicySupportStrength" NOT NULL,
    "clinicalReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "ownerDecision" "PolicyOwnerDecision" NOT NULL DEFAULT 'PENDING',
    "editedText" TEXT,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "policy_proposed_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "policy_final_proposals" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "changeLog" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById" TEXT,
    "generatedByName" TEXT,
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "policy_final_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_documents_status_importedAt_idx" ON "policy_documents"("status", "importedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_sections_documentId_order_idx" ON "policy_sections"("documentId", "order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_sections_parentId_order_idx" ON "policy_sections"("parentId", "order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_decision_items_sectionId_order_idx" ON "policy_decision_items"("sectionId", "order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_review_rounds_status_closesAt_idx" ON "policy_review_rounds"("status", "closesAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_review_rounds_documentId_status_idx" ON "policy_review_rounds"("documentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "policy_invitations_tokenHash_key" ON "policy_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_invitations_roundId_submittedAt_idx" ON "policy_invitations"("roundId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "policy_invitations_roundId_userId_key" ON "policy_invitations"("roundId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "policy_participations_invitationId_key" ON "policy_participations"("invitationId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "policy_participations_idempotencyKey_key" ON "policy_participations"("idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_participations_roundId_submittedAt_idx" ON "policy_participations"("roundId", "submittedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_section_responses_roundId_sectionId_stance_idx" ON "policy_section_responses"("roundId", "sectionId", "stance");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_section_responses_roundId_concernType_priority_idx" ON "policy_section_responses"("roundId", "concernType", "priority");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "policy_section_responses_roundId_invitationId_sectionId_key" ON "policy_section_responses"("roundId", "invitationId", "sectionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_decision_item_responses_roundId_decisionItemId_idx" ON "policy_decision_item_responses"("roundId", "decisionItemId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "policy_decision_item_responses_roundId_invitationId_decisio_key" ON "policy_decision_item_responses"("roundId", "invitationId", "decisionItemId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "policy_general_responses_invitationId_key" ON "policy_general_responses"("invitationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_general_responses_roundId_idx" ON "policy_general_responses"("roundId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_response_revisions_roundId_editedAt_idx" ON "policy_response_revisions"("roundId", "editedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_response_revisions_responseId_editedAt_idx" ON "policy_response_revisions"("responseId", "editedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_analysis_runs_roundId_startedAt_idx" ON "policy_analysis_runs"("roundId", "startedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_proposed_changes_analysisRunId_ownerDecision_idx" ON "policy_proposed_changes"("analysisRunId", "ownerDecision");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_proposed_changes_sectionId_idx" ON "policy_proposed_changes"("sectionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_final_proposals_roundId_generatedAt_idx" ON "policy_final_proposals"("roundId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "policy_final_proposals_roundId_version_key" ON "policy_final_proposals"("roundId", "version");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_sections_documentId_fkey') THEN
    ALTER TABLE "policy_sections" ADD CONSTRAINT "policy_sections_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "policy_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_sections_parentId_fkey') THEN
    ALTER TABLE "policy_sections" ADD CONSTRAINT "policy_sections_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "policy_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_decision_items_sectionId_fkey') THEN
    ALTER TABLE "policy_decision_items" ADD CONSTRAINT "policy_decision_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "policy_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_review_rounds_documentId_fkey') THEN
    ALTER TABLE "policy_review_rounds" ADD CONSTRAINT "policy_review_rounds_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "policy_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_invitations_roundId_fkey') THEN
    ALTER TABLE "policy_invitations" ADD CONSTRAINT "policy_invitations_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "policy_review_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_participations_roundId_fkey') THEN
    ALTER TABLE "policy_participations" ADD CONSTRAINT "policy_participations_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "policy_review_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_participations_invitationId_fkey') THEN
    ALTER TABLE "policy_participations" ADD CONSTRAINT "policy_participations_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "policy_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_section_responses_roundId_fkey') THEN
    ALTER TABLE "policy_section_responses" ADD CONSTRAINT "policy_section_responses_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "policy_review_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_section_responses_invitationId_fkey') THEN
    ALTER TABLE "policy_section_responses" ADD CONSTRAINT "policy_section_responses_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "policy_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_section_responses_sectionId_fkey') THEN
    ALTER TABLE "policy_section_responses" ADD CONSTRAINT "policy_section_responses_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "policy_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_decision_item_responses_roundId_fkey') THEN
    ALTER TABLE "policy_decision_item_responses" ADD CONSTRAINT "policy_decision_item_responses_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "policy_review_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_decision_item_responses_invitationId_fkey') THEN
    ALTER TABLE "policy_decision_item_responses" ADD CONSTRAINT "policy_decision_item_responses_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "policy_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_decision_item_responses_decisionItemId_fkey') THEN
    ALTER TABLE "policy_decision_item_responses" ADD CONSTRAINT "policy_decision_item_responses_decisionItemId_fkey" FOREIGN KEY ("decisionItemId") REFERENCES "policy_decision_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_general_responses_roundId_fkey') THEN
    ALTER TABLE "policy_general_responses" ADD CONSTRAINT "policy_general_responses_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "policy_review_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_general_responses_invitationId_fkey') THEN
    ALTER TABLE "policy_general_responses" ADD CONSTRAINT "policy_general_responses_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "policy_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_analysis_runs_roundId_fkey') THEN
    ALTER TABLE "policy_analysis_runs" ADD CONSTRAINT "policy_analysis_runs_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "policy_review_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_proposed_changes_analysisRunId_fkey') THEN
    ALTER TABLE "policy_proposed_changes" ADD CONSTRAINT "policy_proposed_changes_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "policy_analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_final_proposals_roundId_fkey') THEN
    ALTER TABLE "policy_final_proposals" ADD CONSTRAINT "policy_final_proposals_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "policy_review_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Replicate. Classified in src/lib/sync/syncPolicy.ts, twelve of the
-- thirteen CLOUD_AUTHORITATIVE.
--
-- The committee answers on the public node, because the link in their
-- WhatsApp is built by publicSiteUrl() and the theatre node answers on a
-- Tailscale address no phone can resolve. But the Chairman reads the
-- dashboard from inside the hospital, where the browser may well be on the
-- theatre node. Without replication he would open the dashboard in his own
-- office and see no responses at all -- which reads as "nobody has answered",
-- not as "you are looking at the wrong node".
--
-- Writes stay single-node in practice, so the cloud owning every row costs
-- nothing and removes the possibility of two nodes publishing different
-- versions of one policy. The edit history is APPEND_ONLY instead, because
-- it is insert-only and the two sides can simply be unioned.

SELECT sync_enable_table('policy_documents');  -- The imported draft itself.
SELECT sync_enable_table('policy_sections');  -- The section tree the whole review hangs off.
SELECT sync_enable_table('policy_decision_items');  -- The bracketed values the committee must settle.
SELECT sync_enable_table('policy_review_rounds');  -- One review, its deadline and its state.
SELECT sync_enable_table('policy_invitations');  -- Who was asked. Part of every participation figure.
SELECT sync_enable_table('policy_participations');  -- Where each reviewer had got to -- the resume cursor.
SELECT sync_enable_table('policy_section_responses');  -- What each reviewer said about each section.
SELECT sync_enable_table('policy_decision_item_responses');  -- Each reviewer on each open value.
SELECT sync_enable_table('policy_general_responses');  -- Overall support, barriers, resources needed.
SELECT sync_enable_table('policy_response_revisions');  -- Append-only history of post-submission edits.
SELECT sync_enable_table('policy_analysis_runs');  -- Each analysis run, its prompt version and its usage.
SELECT sync_enable_table('policy_proposed_changes');  -- Proposals, and the owner's decision on each.
SELECT sync_enable_table('policy_final_proposals');  -- The revised policy that goes to Management.
