-- Stage published roster rows for removal (draft-based editing of published
-- rosters). Additive & idempotent. Staged rows stay live until the next publish.
ALTER TABLE "rosters" ADD COLUMN IF NOT EXISTS "pendingRemoval" BOOLEAN NOT NULL DEFAULT false;
