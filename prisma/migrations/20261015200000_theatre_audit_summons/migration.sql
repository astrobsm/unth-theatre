-- ============================================================
-- Summoning people to the theatre audit, and knowing who to summon
-- ------------------------------------------------------------
-- Two findings feed one weekly meeting, and until now neither had anywhere
-- to be recorded.
--
-- A CASE THAT DID NOT HOLD. case_cancellations has existed since August and
-- nothing ever linked to the form that writes it, so cases were closed by
-- editing their status instead. The committee therefore met over a list of
-- cancelled cases with no reasons attached to any of them.
--
-- A CASE THAT REACHED THE MORNING UNREVIEWED. The preoperative anaesthetic
-- review is due by 9pm the evening before. When it is missed the list slips
-- for everybody behind it, and there was no record that it had been missed,
-- let alone of who was supposed to have done it.
--
-- WHY preop_review_assignments IS A SEPARATE TABLE from the review itself.
-- The row has to exist for cases that have NO review — that is the entire
-- point of it. Recording the expectation on preoperative_anesthetic_reviews
-- would mean the cases that failed are precisely the ones with nothing
-- written down.
--
-- WHY ONE audit_summonses TABLE for both causes, and for emergency delays
-- too. A consultant summoned for a cancellation and a missed review in the
-- same week should receive one notice naming both, not two notices from two
-- subsystems that have never heard of each other.
--
-- The unique index on (cause, userId, surgeryId) is what stops that notice
-- multiplying: the evening watch re-runs twice a night and the escalation
-- runner every fifteen minutes, and without it a consultant would collect a
-- fresh summons on every pass.
--
-- theatre_audit_conferences gains mode, meetingLink and the period it
-- reviews. The sitting model already existed for structural business and is
-- reused rather than duplicated; cancellations are NOT forced into
-- conference_issues, which means "a proposed structural adjustment" and
-- would lose that meaning if a cancelled hernia were filed as one.
-- ============================================================

-- CreateEnum
CREATE TYPE "ConferenceMode" AS ENUM ('PHYSICAL', 'VIRTUAL', 'HYBRID');

-- CreateEnum
CREATE TYPE "AuditSummonsCause" AS ENUM ('CASE_CANCELLATION', 'PREOP_REVIEW_LAPSE', 'EMERGENCY_DELAY');

-- CreateEnum
CREATE TYPE "AuditSummonsStatus" AS ENUM ('PENDING', 'NOTIFIED', 'ACKNOWLEDGED', 'ATTENDED', 'EXCUSED', 'NO_SHOW', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "theatre_audit_conferences" ADD COLUMN     "meetingLink" TEXT,
ADD COLUMN     "mode" "ConferenceMode" NOT NULL DEFAULT 'PHYSICAL',
ADD COLUMN     "periodEnd" DATE,
ADD COLUMN     "periodStart" DATE;

-- CreateTable
CREATE TABLE "audit_summonses" (
    "id" TEXT NOT NULL,
    "cause" "AuditSummonsCause" NOT NULL,
    "ground" TEXT NOT NULL,
    "conferenceId" TEXT,
    "userId" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "roleOnCase" TEXT NOT NULL,
    "surgeryId" TEXT,
    "cancellationId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "AuditSummonsStatus" NOT NULL DEFAULT 'PENDING',
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raisedBy" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "excusedAt" TIMESTAMP(3),
    "excusedReason" TEXT,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "audit_summonses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preop_review_assignments" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "surgeryDate" DATE NOT NULL,
    "expectedReviewerId" TEXT,
    "expectedReviewerName" TEXT,
    "assignmentSource" TEXT,
    "handedBackAt" TIMESTAMP(3),
    "handedBackById" TEXT,
    "handedBackReason" TEXT,
    "reassignedToId" TEXT,
    "reassignedToName" TEXT,
    "reassignedAt" TIMESTAMP(3),
    "reassignedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "hodNotifiedAt" TIMESTAMP(3),
    "lapsedAt" TIMESTAMP(3),
    "lapseGround" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "preop_review_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_summonses_conferenceId_idx" ON "audit_summonses"("conferenceId");

-- CreateIndex
CREATE INDEX "audit_summonses_status_raisedAt_idx" ON "audit_summonses"("status", "raisedAt");

-- CreateIndex
CREATE INDEX "audit_summonses_userId_status_idx" ON "audit_summonses"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "audit_summonses_cause_userId_surgeryId_key" ON "audit_summonses"("cause", "userId", "surgeryId");

-- CreateIndex
CREATE UNIQUE INDEX "preop_review_assignments_surgeryId_key" ON "preop_review_assignments"("surgeryId");

-- CreateIndex
CREATE INDEX "preop_review_assignments_surgeryDate_lapsedAt_idx" ON "preop_review_assignments"("surgeryDate", "lapsedAt");

-- CreateIndex
CREATE INDEX "preop_review_assignments_expectedReviewerId_surgeryDate_idx" ON "preop_review_assignments"("expectedReviewerId", "surgeryDate");

-- AddForeignKey
ALTER TABLE "audit_summonses" ADD CONSTRAINT "audit_summonses_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "theatre_audit_conferences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_summonses" ADD CONSTRAINT "audit_summonses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_summonses" ADD CONSTRAINT "audit_summonses_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preop_review_assignments" ADD CONSTRAINT "preop_review_assignments_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- Replication
-- ------------------------------------------------------------
-- Enabled parent-first: theatre_audit_conferences and surgeries already
-- replicate, so a summons arriving on the far node always finds the sitting
-- and the case it points at. A child whose parent does not travel parks in
-- sync_deferred for ever, which this project has already had happen twice.
--
-- Both are classified LWW in lib/sync/syncPolicy.ts. A summons is raised by a
-- job and then edited by people — acknowledged, excused, marked attended —
-- and a later edit of the same field is a correction of it. Nothing here is
-- append-only: the whole value of the row is that its status changes.
SELECT sync_enable_table('audit_summonses');
SELECT sync_enable_table('preop_review_assignments');
