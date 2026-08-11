-- ============================================================
-- Attach change capture to patients
-- ------------------------------------------------------------
-- patients joined the synced set because it is the parent of surgeries and
-- most of the clinical tables; without it a cloud booking could not be
-- inserted locally at all (surgeries_patientId_fkey).
--
-- A migration rather than a manual psql call so both nodes get it the same
-- way: supabase-migrate.sh for the cloud, apply-migrations.sh for the server.
-- Doing it by hand is how local and cloud drifted apart before.
--
-- sync_enable_table is idempotent — it re-creates the triggers and uses
-- ADD COLUMN IF NOT EXISTS — so re-running this is harmless.
-- ============================================================

SELECT sync_enable_table('patients');

-- Note on existing rows: enabling capture journals FUTURE changes only. The
-- patients already in each database were never journaled, so a surgery that
-- references one still cannot apply. Those land in sync_deferred, which names
-- exactly which patients are missing — a short, targeted list to seed, rather
-- than re-journaling every patient row on both nodes and drowning the
-- quarantine queue in rows that never actually disagreed.
