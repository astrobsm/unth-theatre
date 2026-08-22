-- Missed deadlines, addressed to the person who can still fix them.
--
-- Replaces going straight to a disciplinary query. See the model comment for
-- what "attended to" means and why a delay reason alone does not close a
-- record.
CREATE TYPE "DeadlineSubjectType" AS ENUM ('EMERGENCY_ALERT', 'THEATRE_SETUP', 'READINESS_LOG', 'ROSTER_SUBMISSION');
CREATE TYPE "DeadlineAttentionStatus" AS ENUM ('OPEN', 'DELAY_LOGGED', 'RESOLVED', 'IN_AUDIT');

CREATE TABLE "deadline_attentions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "subjectType" "DeadlineSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectLabel" TEXT NOT NULL,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DeadlineAttentionStatus" NOT NULL DEFAULT 'OPEN',
    "delayReason" TEXT,
    "delayLoggedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "movedToAuditAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "deadline_attentions_pkey" PRIMARY KEY ("id")
);

-- One open record per person per thing missed, so a checker running every
-- fifteen minutes cannot raise the same deadline repeatedly.
CREATE UNIQUE INDEX "deadline_attentions_userId_subjectType_subjectId_key"
  ON "deadline_attentions" ("userId", "subjectType", "subjectId");
CREATE INDEX "deadline_attentions_status_idx" ON "deadline_attentions" ("status");
CREATE INDEX "deadline_attentions_userId_status_idx" ON "deadline_attentions" ("userId", "status");
CREATE INDEX "deadline_attentions_movedToAuditAt_idx" ON "deadline_attentions" ("movedToAuditAt");
