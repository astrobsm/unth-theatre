-- Make the patient journey replicate, end to end.
--
-- WHAT WAS ACTUALLY WRONG
--
-- The sync policy classified 60 tables. Only 26 had capture triggers. Listing a
-- table in the policy never enabled anything — it recorded an intention, and
-- the migration that acts on it was written for some tables and not others.
-- So holding_area_assessments has been QUARANTINE in the policy since it was
-- written, and has never replicated a single row.
--
-- On 1 September that surfaced as a patient being admitted to the holding area
-- on one node and simply not existing on the other: the nurse saw "No patients
-- in holding area" while the patient was standing in front of her. That is the
-- worst version of this fault, because the reasonable conclusion is that the
-- app is broken, and the reasonable response is to go back to paper.
--
-- TWO GUARDS, both learned the hard way.
--
-- to_regclass: a table named here that does not exist would abort the whole
-- migration and take the deploy with it.
--
-- The `id` check is the important one. sync_capture() reads
-- row_id := to_jsonb(NEW)->>'id'. A table keyed on anything else yields NULL,
-- sync_journal.row_id is NOT NULL, and EVERY INSERT ON THAT TABLE THEN FAILS.
-- That is not a sync problem, it is an outage — it is what breaks
-- idempotency_keys today, which is keyed on `key`. Enabling capture blindly on
-- a table without `id` would take the feature down instead of syncing it.

DO $sync$
DECLARE
  t    text;
  reg  regclass;
  list text[] := ARRAY[
    -- ── The holding area, first, because that is where it broke ──────────
    'holding_area_assessments',
    'holding_area_red_alerts',
    'preoperative_safety_checks',

    -- ── Calling the patient up from the ward ─────────────────────────────
    'patient_call_ups',
    'daily_first_case_sending',
    'patient_transport_logs',

    -- ── Theatre: the checks and the clock ────────────────────────────────
    'who_checklists',
    'surgical_timings',
    'surgical_events',
    'surgical_count_checklists',
    'surgical_count_events',
    'intraoperative_records',

    -- ── Anaesthesia through the case ─────────────────────────────────────
    'anesthesia_monitoring_records',
    'anesthesia_vital_signs',
    'anesthesia_medication_records',
    'anesthesia_setup_logs',
    'preoperative_anesthetic_reviews',
    'emergency_pre_anaesthetic_reviews',

    -- ── Recovery ─────────────────────────────────────────────────────────
    'pacu_assessments',
    'pacu_vital_signs',
    'pacu_medications',
    'pacu_red_alerts',

    -- ── Handover out ─────────────────────────────────────────────────────
    'nurse_handovers',
    'handover_checklist_items'
  ];
BEGIN
  FOREACH t IN ARRAY list LOOP
    reg := to_regclass(t);

    IF reg IS NULL THEN
      RAISE NOTICE 'sync: table % does not exist, skipped', t;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = t AND column_name = 'id'
    ) THEN
      RAISE WARNING 'sync: table % has no id column — NOT enabled (capture would fail every insert)', t;
      CONTINUE;
    END IF;

    PERFORM sync_enable_table(reg);
    RAISE NOTICE 'sync: enabled %', t;
  END LOOP;
END
$sync$;
