-- Roster draft/publish governance + publication versioning. Additive & idempotent.
-- Existing roster rows default to PUBLISHED so current consumers keep working.
ALTER TABLE "rosters" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "rosters" ADD COLUMN IF NOT EXISTS "publicationId" TEXT;
ALTER TABLE "rosters" ADD COLUMN IF NOT EXISTS "version" INTEGER;
CREATE INDEX IF NOT EXISTS "rosters_status_date_idx" ON "rosters" ("status", "date");

CREATE TABLE IF NOT EXISTS "roster_publications" (
  "id" TEXT PRIMARY KEY,
  "department" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "location" TEXT,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  "publishedById" TEXT,
  "publishedByName" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "snapshot" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "roster_publications_department_periodStart_idx" ON "roster_publications" ("department", "periodStart");
