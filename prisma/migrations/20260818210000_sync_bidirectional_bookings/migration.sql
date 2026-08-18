-- ============================================================
-- A case booked in theatre must be visible outside it, and the reverse
-- ------------------------------------------------------------
-- Reported plainly: cases booked on the theatre network could not be seen from
-- outside the hospital. Two separate causes, both of them gaps rather than
-- faults, and both closed here.
--
-- ------------------------------------------------------------
-- 1. IDENTITY NOW TRAVELS UPWARD AS WELL AS DOWN.
--
-- 20260817170000 attached identity capture to the CLOUD ONLY, because
-- decide() enforced CLOUD_AUTHORITATIVE only for concurrent changes: an
-- in-sequence local edit slipped past the class check and could have become
-- the cloud's version of a user account. One-way capture removed that risk by
-- construction, and it was the right call at the time.
--
-- The cost of it was this bug. A member of staff who registered on the theatre
-- server existed nowhere else, so every case they booked failed
-- surgeries_surgeonId_fkey on the cloud and parked in sync_deferred — the
-- mirror image of the notifications backlog, pointing the other way.
--
-- decide() now settles cloud-authoritative tables BEFORE the in-sequence
-- shortcut, so a local UPDATE to a user is ignored by the cloud whether or not
-- the two sides had diverged. With the hole closed, local capture is safe:
-- new registrations reach the cloud as inserts, and edits still cannot
-- overwrite it. The lockout the original caution was about remains impossible.
--
-- ------------------------------------------------------------
-- 2. THE PACK LISTS TRAVEL WITH THE BOOKING.
--
-- Neither request table replicated, so a booking arrived in the cloud stripped
-- of the consumables and drugs it was booked with — which reads as a booking
-- somebody forgot to finish rather than as a sync gap.
--
-- The TEMPLATES are enabled in the same migration and not as a later tidy-up,
-- because the synced set must be CLOSED UNDER ITS FOREIGN KEYS. A request row
-- carries templateId; a request arriving on a node that has never seen that
-- template is refused by the FK and parks forever. That is precisely how the
-- notifications backlog happened, and it is a mistake worth making only once.
-- ============================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- Identity, now on both nodes. Cloud still wins every edit.
    'users', 'user_module_grants', 'onboarding_submissions',
    -- The booking's own lists, and the reference data they point at.
    'surgical_consumable_templates',
    'surgical_drug_dressing_templates',
    'surgery_consumable_requests',
    'surgery_drug_dressing_requests'
  ] LOOP
    IF to_regclass(t) IS NULL THEN
      RAISE NOTICE 'sync: table % not found, skipped', t;
    ELSE
      PERFORM sync_enable_table(to_regclass(t));
    END IF;
  END LOOP;
END $$;

-- Rows written before capture was attached were never journaled and will not
-- travel on their own. Seed them once, parents before children:
--
--   ./scripts/local-server/backfill-from-cloud.sh --apply \
--     users surgical_consumable_templates surgical_drug_dressing_templates \
--     patients surgeries surgery_consumable_requests surgery_drug_dressing_requests
--
-- That script only copies cloud to local. Anything the LOCAL server holds and
-- the cloud does not is diagnosed by scripts/local-server/why-not-syncing.sh.
