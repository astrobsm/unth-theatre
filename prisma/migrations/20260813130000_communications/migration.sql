-- ============================================================
-- Communications — 6 tables
-- ------------------------------------------------------------
-- HAND-FILTERED from `prisma migrate diff`, which for the THIRD time also
-- proposed dropping the sync columns from `patients` and the primary keys from
-- the sync tables. Anything containing DROP is excluded on principle rather than
-- on inspection.
--
-- Additive: six new tables, four new enum types, nothing existing touched.
-- ============================================================

-- CreateEnum
CREATE TYPE "CommChannel" AS ENUM ('IN_APP', 'PUSH', 'RADIO', 'EMAIL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "CommStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CommPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CommSensitivity" AS ENUM ('OPERATIONAL', 'PATIENT_IDENTIFIED', 'CLINICAL');

-- CreateTable
CREATE TABLE "communication_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "channel" "CommChannel" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" JSONB,
    "sensitivity" "CommSensitivity" NOT NULL DEFAULT 'OPERATIONAL',
    "providerTemplateId" TEXT,
    "providerStatus" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_messages" (
    "id" TEXT NOT NULL,
    "channel" "CommChannel" NOT NULL,
    "priority" "CommPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "CommStatus" NOT NULL DEFAULT 'QUEUED',
    "recipientUserId" TEXT,
    "recipientName" TEXT,
    "recipientAddress" TEXT,
    "templateCode" TEXT,
    "renderedSubject" TEXT,
    "renderedBody" TEXT NOT NULL,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "ruleId" TEXT,
    "escalationLevel" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "failureReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByName" TEXT,

    CONSTRAINT "communication_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_events" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "status" "CommStatus" NOT NULL,
    "providerEventId" TEXT,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" TEXT NOT NULL,
    "conditions" JSONB,
    "actions" JSONB NOT NULL,
    "priority" "CommPriority" NOT NULL DEFAULT 'NORMAL',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "escalationPolicyId" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "levels" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escalation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_requests" (
    "id" TEXT NOT NULL,
    "patientId" TEXT,
    "surgeryId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestedById" TEXT,
    "requestedByName" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "responseData" JSONB,

    CONSTRAINT "feedback_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "communication_templates_code_channel_isActive_idx" ON "communication_templates"("code", "channel", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "communication_templates_code_channel_version_key" ON "communication_templates"("code", "channel", "version");

-- CreateIndex
CREATE UNIQUE INDEX "communication_messages_idempotencyKey_key" ON "communication_messages"("idempotencyKey");

-- CreateIndex
CREATE INDEX "communication_messages_status_priority_queuedAt_idx" ON "communication_messages"("status", "priority", "queuedAt");

-- CreateIndex
CREATE INDEX "communication_messages_recipientUserId_queuedAt_idx" ON "communication_messages"("recipientUserId", "queuedAt");

-- CreateIndex
CREATE INDEX "communication_messages_relatedType_relatedId_idx" ON "communication_messages"("relatedType", "relatedId");

-- CreateIndex
CREATE INDEX "communication_events_messageId_occurredAt_idx" ON "communication_events"("messageId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "communication_events_messageId_providerEventId_key" ON "communication_events"("messageId", "providerEventId");

-- CreateIndex
CREATE INDEX "workflow_rules_trigger_isActive_idx" ON "workflow_rules"("trigger", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "escalation_policies_name_key" ON "escalation_policies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_requests_tokenHash_key" ON "feedback_requests"("tokenHash");

-- CreateIndex
CREATE INDEX "feedback_requests_patientId_idx" ON "feedback_requests"("patientId");

-- CreateIndex
CREATE INDEX "feedback_requests_expiresAt_submittedAt_idx" ON "feedback_requests"("expiresAt", "submittedAt");

-- AddForeignKey
ALTER TABLE "communication_events" ADD CONSTRAINT "communication_events_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "communication_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
