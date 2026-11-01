-- Celebrations: the days the theatre says something kind on.
--
-- Guarded throughout, like every migration on this project: a failed migration
-- blocks `migrate deploy` and therefore blocks every later release, and
-- Postgres has no IF NOT EXISTS for ADD CONSTRAINT.

-- AlterTable: when this person last told us which days they want celebrated.
-- Null means never asked, which is what makes the sign-in prompt appear once.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "celebrationPrefsSetAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "staff_celebrations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "sinceYear" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "staff_celebrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One of each kind per day per person: somebody who presses save twice must
-- not end up with two identical birthdays and therefore two greetings.
CREATE UNIQUE INDEX IF NOT EXISTS "staff_celebrations_userId_kind_month_day_key"
  ON "staff_celebrations"("userId", "kind", "month", "day");

-- CreateIndex
-- The board reads "whose day is it today" by month and day, every time it is
-- opened, for every member of staff.
CREATE INDEX IF NOT EXISTS "staff_celebrations_month_day_idx"
  ON "staff_celebrations"("month", "day");
CREATE INDEX IF NOT EXISTS "staff_celebrations_userId_idx"
  ON "staff_celebrations"("userId");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "staff_celebrations"
    ADD CONSTRAINT "staff_celebrations_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Replicate: a colleague enters their birthday on whichever node they happen
-- to sign in on, and the board that offers the greeting is usually the other
-- one. Without this, half the hospital's birthdays would be invisible to
-- whoever is sending.
SELECT sync_enable_table('staff_celebrations');
