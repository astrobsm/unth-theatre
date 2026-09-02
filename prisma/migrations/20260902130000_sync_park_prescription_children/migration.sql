-- Stop capturing three tables whose foreign-key parent does not replicate.
--
-- 20260901130000_sync_remaining_modules switched capture on for 47 tables.
-- Three of them carry a prescriptionId:
--
--   additional_medication_requests
--   medication_non_return_queries
--   medication_reconciliations
--
-- Their parent, anesthetic_prescriptions, is classified QUARANTINE but capture
-- has deliberately NOT been enabled for it: the clinical tables wait for a
-- clinician to confirm their classifications before they start replicating.
--
-- A child whose parent does not travel fails its foreign key on arrival and
-- parks in sync_deferred for ever, retrying. That is not a theoretical concern
-- here: 37 rows are currently retrying on this node, one of them for the
-- 1,216th time, because of unique keys that can never be satisfied.
--
-- So capture is switched off for these three until prescriptions replicate.
-- They journal nothing meanwhile, which is honest: they were not arriving
-- before this migration either, they were merely failing more expensively.
--
-- TO RE-ENABLE: turn on capture for anesthetic_prescriptions first, then call
-- sync_enable_table on each of these three and classify them in
-- src/lib/sync/syncPolicy.ts. They are listed in PENDING_CAPTURE in
-- scripts/lib-tests/syncCapture.test.ts, which will hold you to it.

DROP TRIGGER IF EXISTS zz_sync_capture ON "additional_medication_requests";
DROP TRIGGER IF EXISTS zz_sync_capture_del ON "additional_medication_requests";

DROP TRIGGER IF EXISTS zz_sync_capture ON "medication_non_return_queries";
DROP TRIGGER IF EXISTS zz_sync_capture_del ON "medication_non_return_queries";

DROP TRIGGER IF EXISTS zz_sync_capture ON "medication_reconciliations";
DROP TRIGGER IF EXISTS zz_sync_capture_del ON "medication_reconciliations";
