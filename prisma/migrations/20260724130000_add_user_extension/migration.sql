-- Internal theatre extension / bleep for roster contact display. Additive & idempotent.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "extension" TEXT;
