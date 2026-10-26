-- Guarded throughout: every CREATE, every ADD COLUMN, and every ADD
-- CONSTRAINT. ADD CONSTRAINT has no IF NOT EXISTS in Postgres, and three
-- unguarded ones in the previous migration would have failed the retry and
-- wedged every later deploy at P3009. Found by audit, not by luck.

-- AlterTable
ALTER TABLE "special_need_items" ADD COLUMN IF NOT EXISTS     "pricedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "pricedByName" TEXT,
ADD COLUMN IF NOT EXISTS     "unitPrice" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS     "sourceCode" TEXT,
ADD COLUMN IF NOT EXISTS     "unit" TEXT NOT NULL DEFAULT 'piece';

-- CreateIndex
-- Plain, not partial. Postgres treats NULLs as distinct in a unique index,
-- so everything seeded before the hospital's price list existed coexists
-- happily with no code. Kept plain because Prisma cannot express a partial
-- index, and a shape Prisma cannot see is permanent drift on a project
-- where a failed migration blocks every deploy.
CREATE UNIQUE INDEX IF NOT EXISTS "special_need_items_sourceCode_key"
  ON "special_need_items"("sourceCode");

-- AlterTable
ALTER TABLE "case_deposit_status" ADD COLUMN IF NOT EXISTS     "consumableContingency" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS     "consumableSubtotal" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS     "pharmacySubtotal" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS     "unpricedLineCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "magnitude_bundle_items" (
    "id" TEXT NOT NULL,
    "magnitude" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByName" TEXT,

    CONSTRAINT "magnitude_bundle_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "magnitude_bundle_items_magnitude_idx" ON "magnitude_bundle_items"("magnitude");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "magnitude_bundle_items_magnitude_itemId_key" ON "magnitude_bundle_items"("magnitude", "itemId");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "magnitude_bundle_items" ADD CONSTRAINT "magnitude_bundle_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "special_need_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Replicate: the store prices items on the theatre server while a surgeon
-- books from outside, and "what does this cost" must be the same answer on
-- both sides.
SELECT sync_enable_table('magnitude_bundle_items');
