-- ============================================================================
-- Hybrid sync: change journal, row metadata, capture triggers, conflict store
-- ----------------------------------------------------------------------------
-- Additive only. Nothing here alters existing columns or constraints, so it can
-- be applied to the live cloud database and to the local clone independently
-- and in any order.
--
-- Capture is done with TRIGGERS rather than in the application, because the
-- application is not the only writer: migrations, the maintenance scripts, the
-- seed and any psql session all write directly. A sync layer that misses those
-- writes is worse than none, because it manufactures confident disagreement.
-- ============================================================================

-- Which node is this? Set per deployment; the trigger stamps it onto every row.
-- 'unset' is deliberate: an unconfigured node is visible in the data rather
-- than silently masquerading as another one.
CREATE TABLE IF NOT EXISTS sync_node (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),   -- single row
  node_id     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO sync_node (id, node_id) VALUES (true, 'unset') ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION sync_node_id() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT node_id FROM sync_node WHERE id ORDER BY 1 LIMIT 1 $$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- A kill switch. Capture runs on every statement against every synced table,
-- so there must be a way to stop it in one command without dropping triggers
-- under load. It ships as FALSE: the triggers exist and do nothing until
-- somebody turns them on deliberately, which is what makes applying this
-- migration to a live database a non-event.
ALTER TABLE sync_node ADD COLUMN IF NOT EXISTS capture_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION sync_capture_enabled() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT capture_enabled FROM sync_node WHERE id ORDER BY 1 LIMIT 1 $$;

-- Columns never copied into a journal payload.
--
-- surgeries is 58 MB for 481 rows because consent forms are held as base64
-- data URLs. Copying those into a journal entry on every edit would write
-- ~120 KB per change into an append-only table and fill the local server's
-- disk within weeks. Their SHA-256 is recorded instead, so a difference is
-- still DETECTABLE without shipping megabytes; the bytes are fetched on demand.
CREATE TABLE IF NOT EXISTS sync_omitted_columns (
  table_name  text NOT NULL,
  column_name text NOT NULL,
  PRIMARY KEY (table_name, column_name)
);
INSERT INTO sync_omitted_columns (table_name, column_name) VALUES
  ('surgeries','consentFileData'), ('surgeries','consentFormData'), ('surgeries','complexityData')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- The journal. Append-only, and the source of truth for what must be shipped.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_journal (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name     text        NOT NULL,
  row_id         text        NOT NULL,
  op             text        NOT NULL CHECK (op IN ('INSERT','UPDATE','DELETE')),

  -- Version the writer derived this change from. Conflict detection is exact
  -- rather than heuristic: a change conflicts iff base_version is no longer
  -- the version the receiver holds.
  base_version   integer     NOT NULL DEFAULT 0,
  new_version    integer     NOT NULL DEFAULT 0,

  -- Hybrid Logical Clock, as a string that sorts correctly in SQL. Wall clocks
  -- here are demonstrably unreliable; see lib/sync/hlc.ts.
  hlc            text        NOT NULL,
  origin_node    text        NOT NULL,

  -- Full row after the change (NULL for DELETE), and the columns that changed.
  payload        jsonb,
  changed_cols   text[],
  -- Large columns held back from the payload, with a digest so a difference
  -- between the nodes is still detectable without shipping the bytes.
  omitted_cols   text[],
  omitted_digest text,

  created_at     timestamptz NOT NULL DEFAULT now(),

  -- Shipping state. Rows are only trimmed once the peer has acknowledged.
  shipped_at     timestamptz,
  ack_at         timestamptz,
  attempts       integer     NOT NULL DEFAULT 0,
  last_error     text
);

-- The worker's hot path: unshipped entries in causal order.
-- Upgrade path for a journal created by an EARLIER version of this file.
--
-- CREATE TABLE IF NOT EXISTS silently skips the whole statement when the table
-- exists, so columns added later never appear — while CREATE OR REPLACE
-- FUNCTION above DOES update the trigger. The result is a new trigger writing
-- to an old table, and every write to a captured table fails with
-- "column omitted_cols does not exist". That took down the radio queue on the
-- local server and would have done the same to the cloud.
ALTER TABLE sync_journal ADD COLUMN IF NOT EXISTS omitted_cols   text[];
ALTER TABLE sync_journal ADD COLUMN IF NOT EXISTS omitted_digest text;
ALTER TABLE sync_journal ADD COLUMN IF NOT EXISTS shipped_at     timestamptz;
ALTER TABLE sync_journal ADD COLUMN IF NOT EXISTS ack_at         timestamptz;
ALTER TABLE sync_journal ADD COLUMN IF NOT EXISTS attempts       integer NOT NULL DEFAULT 0;
ALTER TABLE sync_journal ADD COLUMN IF NOT EXISTS last_error     text;

CREATE INDEX IF NOT EXISTS sync_journal_pending_idx
  ON sync_journal (hlc) WHERE ack_at IS NULL;
CREATE INDEX IF NOT EXISTS sync_journal_row_idx ON sync_journal (table_name, row_id, hlc);
CREATE INDEX IF NOT EXISTS sync_journal_origin_idx ON sync_journal (origin_node, created_at);

-- ---------------------------------------------------------------------------
-- Entries received from the peer. Exactly-once apply: at-least-once delivery is
-- made safe by remembering ids, which is what allows aggressive retry.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_applied (
  journal_id   uuid        PRIMARY KEY,
  from_node    text        NOT NULL,
  table_name   text        NOT NULL,
  row_id       text        NOT NULL,
  decision     text        NOT NULL CHECK (decision IN ('APPLY','IGNORE','QUARANTINE')),
  reason       text,
  applied_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_applied_at_idx ON sync_applied (applied_at);

-- ---------------------------------------------------------------------------
-- Conflicts. NOTHING IS EVER DISCARDED: the losing version is kept here in
-- full, whether it lost to last-writer-wins or is awaiting a person.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name     text        NOT NULL,
  row_id         text        NOT NULL,
  sync_class     text        NOT NULL,

  incoming       jsonb       NOT NULL,
  incoming_hlc   text        NOT NULL,
  incoming_node  text        NOT NULL,
  local_snapshot jsonb,
  local_hlc      text,

  reason         text        NOT NULL,
  -- OPEN for quarantine (a person must act); AUTO_RESOLVED when a policy
  -- decided it and we are keeping the loser only for the record.
  status         text        NOT NULL DEFAULT 'OPEN'
                  CHECK (status IN ('OPEN','AUTO_RESOLVED','RESOLVED_KEEP_LOCAL','RESOLVED_TAKE_INCOMING')),
  resolved_by    text,
  resolved_at    timestamptz,
  resolution_note text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_conflicts_open_idx ON sync_conflicts (created_at) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS sync_conflicts_row_idx ON sync_conflicts (table_name, row_id);

-- ---------------------------------------------------------------------------
-- Per-peer progress, health, and the retry backoff state.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_state (
  peer_node          text        PRIMARY KEY,
  last_push_at       timestamptz,
  last_push_ok_at    timestamptz,
  last_pull_at       timestamptz,
  last_pull_ok_at    timestamptz,
  -- Watermark: the highest peer HLC we have applied. Pull resumes from here.
  pull_cursor        text        NOT NULL DEFAULT '',
  consecutive_errors integer     NOT NULL DEFAULT 0,
  next_attempt_at    timestamptz NOT NULL DEFAULT now(),
  last_error         text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Row metadata + capture trigger
-- ---------------------------------------------------------------------------
-- Adds sync_version / sync_origin / sync_hlc to a table and attaches the
-- trigger. Idempotent, so it is safe to re-run as tables are classified.
CREATE OR REPLACE FUNCTION sync_enable_table(target regclass) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE t text := target::text;
BEGIN
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS sync_version integer NOT NULL DEFAULT 0', t);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS sync_origin text', t);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS sync_hlc text', t);
  EXECUTE format('DROP TRIGGER IF EXISTS zz_sync_capture ON %s', t);
  EXECUTE format('DROP TRIGGER IF EXISTS zz_sync_capture_del ON %s', t);
  -- BEFORE for writes, so the row is stamped by assigning to NEW. The first
  -- version ran a SECOND UPDATE against the same row to stamp it, doubling
  -- every write on hot tables like notifications and needing a re-entrancy
  -- guard. Assignment costs nothing and removes both problems.
  EXECUTE format(
    'CREATE TRIGGER zz_sync_capture BEFORE INSERT OR UPDATE ON %s
     FOR EACH ROW EXECUTE FUNCTION sync_capture()', t);
  -- AFTER for deletes: there is no NEW to stamp.
  EXECUTE format(
    'CREATE TRIGGER zz_sync_capture_del AFTER DELETE ON %s
     FOR EACH ROW EXECUTE FUNCTION sync_capture()', t);
END $$;

-- The clock, in SQL. Monotonic per node even if the system clock moves
-- backwards: the counter advances when physical time does not. Kept in a table
-- rather than a sequence so the physical component is inspectable.
CREATE TABLE IF NOT EXISTS sync_clock (
  id       boolean PRIMARY KEY DEFAULT true CHECK (id),
  physical bigint  NOT NULL DEFAULT 0,
  counter  integer NOT NULL DEFAULT 0
);
INSERT INTO sync_clock (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION sync_next_hlc() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE wall bigint; p bigint; c integer;
BEGIN
  wall := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;
  -- FOR UPDATE serialises concurrent writers so two rows never share a stamp.
  SELECT physical, counter INTO p, c FROM sync_clock WHERE id FOR UPDATE;
  IF wall > p THEN p := wall; c := 0; ELSE c := c + 1; END IF;
  UPDATE sync_clock SET physical = p, counter = c WHERE id;
  RETURN lpad(p::text, 15, '0') || ':' || lpad(c::text, 6, '0') || ':' || sync_node_id();
END $$;

CREATE OR REPLACE FUNCTION sync_capture() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_row     jsonb;
  v_old     jsonb;
  v_id      text;
  v_base    integer := 0;
  v_new     integer := 0;
  v_hlc     text;
  v_cols    text[];
  v_omit    text[];
  v_digest  text;
  v_payload jsonb;
BEGIN
  -- Off by default. One UPDATE on sync_node stops all capture instantly,
  -- without dropping triggers on a live system.
  IF NOT sync_capture_enabled() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- A row arriving FROM the peer is applied with this set, so applying a
  -- change does not generate a journal entry that ships straight back and
  -- ping-pongs between the two nodes forever.
  IF current_setting('orm.sync_applying', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old  := to_jsonb(OLD);
    v_base := COALESCE((v_old ->> 'sync_version')::integer, 0);
    INSERT INTO sync_journal (table_name, row_id, op, base_version, new_version, hlc, origin_node, payload)
    VALUES (TG_TABLE_NAME, v_old ->> 'id', 'DELETE', v_base, v_base,
            sync_next_hlc(), sync_node_id(), v_old);
    RETURN OLD;
  END IF;

  v_row := to_jsonb(NEW);
  v_id  := v_row ->> 'id';

  IF TG_OP = 'UPDATE' THEN
    v_old  := to_jsonb(OLD);
    v_base := COALESCE((v_old ->> 'sync_version')::integer, 0);
    SELECT array_agg(key) INTO v_cols
      FROM jsonb_each(v_row) n
      WHERE n.value IS DISTINCT FROM (v_old -> n.key)
        AND n.key NOT IN ('sync_version','sync_origin','sync_hlc','updatedAt');
    -- An update that changed nothing of substance is not worth shipping.
    IF v_cols IS NULL THEN RETURN NEW; END IF;
  ELSE
    v_base := 0;
  END IF;

  v_hlc := sync_next_hlc();
  v_new := v_base + 1;

  -- This is a BEFORE trigger, so the row is stamped by assigning to NEW. The
  -- first version ran a second UPDATE against the same row, which doubled
  -- every write on hot tables and needed a re-entrancy guard to avoid
  -- recursing. Assignment costs nothing and removes both problems.
  NEW.sync_version := v_new;
  NEW.sync_origin  := sync_node_id();
  NEW.sync_hlc     := v_hlc;

  v_payload := jsonb_set(jsonb_set(jsonb_set(v_row,
                 '{sync_version}', to_jsonb(v_new)),
                 '{sync_origin}',  to_jsonb(sync_node_id())),
                 '{sync_hlc}',     to_jsonb(v_hlc));

  -- Hold back the large columns, keeping a digest so divergence stays visible.
  SELECT array_agg(column_name) INTO v_omit
    FROM sync_omitted_columns WHERE table_name = TG_TABLE_NAME;

  IF v_omit IS NOT NULL THEN
    SELECT encode(digest(
             coalesce(string_agg(coalesce(v_payload ->> c, ''), '|' ORDER BY c), ''), 'sha256'), 'hex')
      INTO v_digest FROM unnest(v_omit) AS c;
    SELECT jsonb_object_agg(key, value) INTO v_payload
      FROM jsonb_each(v_payload) WHERE key <> ALL (v_omit);
  END IF;

  INSERT INTO sync_journal (table_name, row_id, op, base_version, new_version, hlc,
                            origin_node, payload, changed_cols, omitted_cols, omitted_digest)
  VALUES (TG_TABLE_NAME, v_id, TG_OP, v_base, v_new, v_hlc, sync_node_id(),
          v_payload, v_cols, v_omit, v_digest);

  RETURN NEW;
END $$;

-- Trim acknowledged entries. This is the ONLY thing that removes from the
-- journal, and only entries the peer has confirmed. Unacknowledged entries are
-- never trimmed at any age: that is the no-data-loss guarantee, and it means a
-- long outage grows the journal rather than silently dropping work.
CREATE OR REPLACE FUNCTION sync_trim(older_than interval DEFAULT '30 days') RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  DELETE FROM sync_journal WHERE ack_at IS NOT NULL AND ack_at < now() - older_than;
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM sync_applied WHERE applied_at < now() - GREATEST(older_than, interval '30 days');
  RETURN n;
END $$;

-- ---------------------------------------------------------------------------
-- Enable capture on the classified tables. Kept in step with
-- lib/sync/syncPolicy.ts; a table absent from BOTH is simply not replicated,
-- which is the intended default.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- PHASE 1 ONLY. Append-only event streams, where a conflict is impossible
    -- by construction, plus the administrative tables whose conflicts are
    -- scheduling rather than clinical.
    'audit_logs','notifications','patient_movements',
    'radio_announcements','surgery_team_check_ins','stock_movements','idempotency_keys',
    'surgeries','theatre_allocations','rosters','equipment','theatre_meals','wards'

    -- PHASE 2, deliberately NOT enabled yet. These are classified in
    -- lib/sync/syncPolicy.ts and will quarantine rather than overwrite, but
    -- every conflict in them needs a person, so a clinician confirms the
    -- classifications before capture is switched on:
    --   preoperative_investigations, pre_operative_visits,
    --   holding_area_assessments, pacu_assessments, pacu_medications,
    --   pacu_vital_signs, anesthetic_prescriptions, postop_prescriptions,
    --   emergency_prescriptions, prescription_medication_items, blood_requests
    --
    -- PHASE 3: users, user_module_grants, onboarding_submissions. Cloud
    -- authoritative, and touching identity replication before the data layer
    -- is proven would risk locking people out of a system they are operating.
  ] LOOP
    -- to_regclass returns NULL rather than raising, so a table that does not
    -- exist under that name is reported and skipped instead of aborting the
    -- whole migration.
    IF to_regclass(t) IS NULL THEN
      RAISE NOTICE 'sync: table % not found, skipped', t;
    ELSE
      PERFORM sync_enable_table(to_regclass(t));
    END IF;
  END LOOP;
END $$;
