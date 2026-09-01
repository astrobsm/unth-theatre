-- Everything else the theatre runs on.
--
-- The patient journey went first, because that is where the fault was visible.
-- These are the rest: the departments that keep the journey possible, and whose
-- records were equally stranded on whichever node happened to create them.
--
-- Same two guards as before. to_regclass so a missing table skips instead of
-- aborting the deploy, and an `id` check because sync_capture reads row_id from
-- to_jsonb(NEW)->>'id' — enabling a table keyed on anything else makes every
-- insert into it fail, which is an outage rather than a sync problem.
--
-- DELIBERATELY NOT HERE, and each for a reason:
--
--   notifications          45 write sites, zero reads, 79,275 rows, and a
--                          journal deadlock on 18 August. Excluded 22 August
--                          on measurement, and nothing has changed.
--   push_subscriptions     A browser endpoint belongs to one device talking to
--                          one origin. Replicating it sends pushes twice.
--   device_tokens          The same, for native handsets.
--   hotspot_handoffs       A captive-portal handshake, seconds long, local to
--                          the node that issued it.
--   sync_* tables          The machinery itself. Replicating the journal would
--                          be a loop.
--   assistant_interactions Chat transcripts. Large, and nothing reads them
--                          across nodes.

DO $sync$
DECLARE
  t    text;
  reg  regclass;
  list text[] := ARRAY[
    -- ── Scheduling and the theatre day ───────────────────────────────────
    'surgery_drafts', 'roster_publications', 'surgical_units',
    'surgical_unit_schedules', 'theatre_suites', 'theatre_case_flows',
    'surgical_team_members', 'surgery_items', 'case_cancellations',
    'preoperative_fitness_assessments', 'anaesthetic_optimisation_requirements',
    'theatre_cleaning_logs', 'staff_duty_logs', 'walkie_talkie_logs',

    -- ── Theatre setup and the store ──────────────────────────────────────
    'theatre_setups', 'theatre_setup_items', 'theatre_setup_returns',
    'theatre_extra_requests', 'store_consumables', 'consumable_consumptions',
    'supply_records', 'theatre_sub_stores', 'sub_store_item_faults',
    'sub_store_usage_logs', 'sub_store_restock_requests', 'stock_transfers',

    -- ── Pharmacy ─────────────────────────────────────────────────────────
    'medication_collections', 'medication_usage_records',
    'medication_reconciliations', 'medication_returns',
    'additional_medication_requests', 'medication_non_return_queries',

    -- ── Laboratory ───────────────────────────────────────────────────────
    'emergency_lab_requests', 'emergency_lab_tests', 'emergency_lab_notifications',

    -- ── Sterile services ─────────────────────────────────────────────────
    'cssd_inventory', 'cssd_usage_history', 'cssd_sterilization_logs',
    'cssd_readiness_reports',

    -- ── Equipment and engineering ────────────────────────────────────────
    'equipment_maintenance', 'daily_equipment_status', 'equipment_check_logs',
    'equipment_checkouts', 'checkout_items', 'equipment_fault_alerts',
    'fault_reports', 'maintenance_logs', 'maintenance_alerts',

    -- ── Utilities ────────────────────────────────────────────────────────
    'power_house_status', 'power_fuel_consumption', 'power_maintenance_logs',
    'power_readiness_reports', 'oxygen_readiness_reports', 'oxygen_alerts',
    'plumbing_faults', 'plumbing_water_status', 'water_supply_readiness',
    'water_supply_logs', 'laundry_readiness',

    -- ── Governance, safety and the record ────────────────────────────────
    'disciplinary_queries', 'incident_reports', 'mortalities', 'mortality_audits',
    'anonymous_tips', 'security_reports', 'user_reports', 'staff_feedback',
    'patient_feedback', 'handover_audit_logs',

    -- ── Emergency coordination and the radio ─────────────────────────────
    'emergency_team_availability', 'announcements', 'announcement_playbacks',
    'radio_broadcasts', 'tv_alert_display_logs'
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
      RAISE WARNING 'sync: table % has no id column — NOT enabled', t;
      CONTINUE;
    END IF;

    PERFORM sync_enable_table(reg);
  END LOOP;
END
$sync$;
