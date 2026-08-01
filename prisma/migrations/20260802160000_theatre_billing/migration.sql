-- Theatre billing: tariffs, one invoice per surgery, revenue distribution.
--
-- ORM had no billing layer at all, so this is seven new tables rather than a
-- change to existing ones. Additive only; nothing is dropped or altered.
--
-- Two decisions are enforced by the schema itself:
--   invoices.surgeryId is UNIQUE, so one surgery can never carry two bills;
--   tariffs and revenue_rules are effective-dated, so a bill raised in March
--   still reprices to March after the price list is updated in June.
--
-- Money is integer kobo and shares are basis points. Neither is a float: a
-- revenue split stored as a float cannot be made to sum back to the total.
--
-- The generated diff again proposed dropping the updatedAt default on four
-- unrelated theatre tables. That is pre-existing drift and is left alone.

-- CreateEnum
CREATE TYPE "ChargeKind" AS ENUM ('PROCEDURE', 'THEATRE', 'ANAESTHESIA', 'CONSUMABLE', 'DRUG', 'IMPLANT', 'CSSD', 'RECOVERY', 'LABORATORY', 'BLOOD', 'OXYGEN', 'EMERGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethodKind" AS ENUM ('CASH', 'TRANSFER', 'POS', 'CHEQUE', 'WAIVER', 'NHIS', 'HMO');

-- CreateEnum
CREATE TYPE "RevenueAccountKind" AS ENUM ('HOSPITAL', 'VENDOR', 'CSSD', 'PHARMACY', 'LABORATORY', 'BLOOD_BANK', 'DEPARTMENT', 'THEATRE');

-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('PENDING', 'SETTLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "tariffs" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ChargeKind" NOT NULL,
    "itemId" TEXT,
    "surgicalPackId" TEXT,
    "amount" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "reason" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "patientId" TEXT,
    "patientName" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "discountReason" TEXT,
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "issuedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" "ChargeKind" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "lineTotal" INTEGER NOT NULL,
    "sourceKind" TEXT,
    "sourceId" TEXT,
    "tariffId" TEXT,
    "vendorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethodKind" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "evidenceDataUrl" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" TEXT,
    "receivedByName" TEXT,
    "notes" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "RevenueAccountKind" NOT NULL,
    "vendorId" UUID,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_rules" (
    "id" TEXT NOT NULL,
    "kind" "ChargeKind" NOT NULL,
    "accountId" TEXT NOT NULL,
    "shareBasisPoints" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_distributions" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" "ChargeKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "shareBasisPoints" INTEGER NOT NULL,
    "status" "DistributionStatus" NOT NULL DEFAULT 'PENDING',
    "settledAt" TIMESTAMP(3),
    "settlementRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tariffs_code_effectiveFrom_idx" ON "tariffs"("code", "effectiveFrom");

-- CreateIndex
CREATE INDEX "tariffs_kind_effectiveFrom_idx" ON "tariffs"("kind", "effectiveFrom");

-- CreateIndex
CREATE INDEX "tariffs_itemId_idx" ON "tariffs"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_surgeryId_key" ON "invoices"("surgeryId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_patientId_idx" ON "invoices"("patientId");

-- CreateIndex
CREATE INDEX "invoices_issuedAt_idx" ON "invoices"("issuedAt");

-- CreateIndex
CREATE INDEX "invoice_lines_invoiceId_idx" ON "invoice_lines"("invoiceId");

-- CreateIndex
CREATE INDEX "invoice_lines_kind_idx" ON "invoice_lines"("kind");

-- CreateIndex
CREATE INDEX "invoice_lines_vendorId_idx" ON "invoice_lines"("vendorId");

-- CreateIndex
CREATE INDEX "invoice_payments_invoiceId_idx" ON "invoice_payments"("invoiceId");

-- CreateIndex
CREATE INDEX "invoice_payments_receivedAt_idx" ON "invoice_payments"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_accounts_code_key" ON "revenue_accounts"("code");

-- CreateIndex
CREATE INDEX "revenue_accounts_kind_isActive_idx" ON "revenue_accounts"("kind", "isActive");

-- CreateIndex
CREATE INDEX "revenue_rules_kind_effectiveFrom_idx" ON "revenue_rules"("kind", "effectiveFrom");

-- CreateIndex
CREATE INDEX "revenue_rules_accountId_idx" ON "revenue_rules"("accountId");

-- CreateIndex
CREATE INDEX "revenue_distributions_invoiceId_idx" ON "revenue_distributions"("invoiceId");

-- CreateIndex
CREATE INDEX "revenue_distributions_accountId_status_idx" ON "revenue_distributions"("accountId", "status");

-- AddForeignKey
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "tariffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "imprest_vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_accounts" ADD CONSTRAINT "revenue_accounts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "imprest_vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_rules" ADD CONSTRAINT "revenue_rules_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "revenue_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_distributions" ADD CONSTRAINT "revenue_distributions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_distributions" ADD CONSTRAINT "revenue_distributions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "revenue_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

