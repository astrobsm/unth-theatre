-- ============================================================
-- A sweeper saying "I looked and there was nothing to do" is not news
-- ------------------------------------------------------------
-- WHAT THIS FIXES. The emergency delay escalation runner sweeps every
-- unresolved escalation on a timer. When no rung is due it still stamps
-- lastCheckedAt, so the sweep leaves a record of having happened
-- (src/lib/emergencyEscalationRunner.ts, the `if (!due.length)` branch).
--
-- That is a real column change, so the capture trigger journals the WHOLE row
-- every sweep, for every unresolved escalation. Measured on the theatre server
-- on 23 September 2026, in one thirty-minute window of the cloud-to-theatre
-- stream:
--
--   emergency_delay_escalations   1853 entries    26 distinct rows
--   surgery_consumable_requests    297
--   audit_logs                      75
--   surgeries                       21
--
-- Twenty-six rows, rewritten about once every twenty-five seconds each,
-- producing 74% of everything the theatre server had to apply — and the
-- surgeries a theatre was waiting for queued behind them at twenty-one per
-- half hour. None of those 1,853 entries carried a clinical fact. Every one
-- of them said only that a timer had run.
--
-- THE MECHANISM ALREADY EXISTS FOR updatedAt. The trigger decides whether a
-- change is worth shipping by diffing the row and ignoring four columns:
-- sync_version, sync_origin, sync_hlc and updatedAt. If nothing else differs
-- it returns without journalling — "an update that changed nothing of
-- substance is not worth shipping". lastCheckedAt is the same kind of column
-- and was simply not on the list.
--
-- It cannot be hardcoded beside updatedAt, because the name is only
-- meaningless HERE. A lastCheckedAt on an equipment or drug-expiry table is a
-- clinical fact about when something was last inspected, and suppressing that
-- would lose real information. So it is registered per table.
--
-- WHAT THIS DOES NOT DO. The column is still SHIPPED — it stays in the
-- payload, so whenever the row travels for a genuine reason the peer receives
-- the current value and the two nodes converge. This changes only whether a
-- bookkeeping write, on its own, is worth waking the sync for. The local value
-- is untouched, so "when did the sweeper last look at this?" is still
-- answerable on the node that swept, which is the node the question is about.
--
-- ONE THING TO BE CAREFUL OF, recorded because the next person to add a row
-- here will not otherwise see it: an ignored column is left out of
-- changed_cols. decide() reads changed_cols to quarantine a write that touches
-- a PROTECTED_COLUMN on an LWW table, so a column that is both ignored and
-- protected would slip past that guard. emergency_delay_escalations has no
-- protected columns, and scripts/lib-tests/syncIgnoredColumns.test.ts holds
-- the two lists apart from here on.
-- ============================================================

CREATE TABLE IF NOT EXISTS sync_ignored_columns (
  table_name  text NOT NULL,
  column_name text NOT NULL,
  PRIMARY KEY (table_name, column_name)
);

COMMENT ON TABLE sync_ignored_columns IS
  'Columns whose change does not, by itself, justify a journal entry. The column is still carried in the payload when the row ships for another reason; this only stops bookkeeping writes from generating traffic of their own.';

INSERT INTO sync_ignored_columns (table_name, column_name) VALUES
  ('emergency_delay_escalations','lastCheckedAt')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- The capture trigger, re-declared. One clause differs from
-- 20260923120000_omit_unchanged_blob_columns: the diff that decides whether a
-- change is worth shipping now also skips the registered bookkeeping columns.
-- ---------------------------------------------------------------------------
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
  IF NOT sync_capture_enabled() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

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
    -- THE CHANGED CLAUSE. sync_ignored_columns joins sync_version,
    -- sync_origin, sync_hlc and updatedAt as changes that do not by themselves
    -- make a row worth shipping.
    SELECT array_agg(key) INTO v_cols
      FROM jsonb_each(v_row) n
      WHERE n.value IS DISTINCT FROM (v_old -> n.key)
        AND n.key NOT IN ('sync_version','sync_origin','sync_hlc','updatedAt')
        AND NOT EXISTS (
          SELECT 1 FROM sync_ignored_columns i
           WHERE i.table_name = TG_TABLE_NAME AND i.column_name = n.key);
    -- An update that changed nothing of substance is not worth shipping.
    IF v_cols IS NULL THEN RETURN NEW; END IF;
  ELSE
    v_base := 0;
  END IF;

  v_hlc := sync_next_hlc();
  v_new := v_base + 1;

  NEW.sync_version := v_new;
  NEW.sync_origin  := sync_node_id();
  NEW.sync_hlc     := v_hlc;

  v_payload := jsonb_set(jsonb_set(jsonb_set(v_row,
                 '{sync_version}', to_jsonb(v_new)),
                 '{sync_origin}',  to_jsonb(sync_node_id())),
                 '{sync_hlc}',     to_jsonb(v_hlc));

  -- Hold back the large columns, keeping a digest so divergence stays visible.
  -- A when_unchanged column is omitted only on an UPDATE that did not touch
  -- it; on INSERT it is kept, so a NOT NULL blob still reaches the peer.
  SELECT array_agg(column_name) INTO v_omit
    FROM sync_omitted_columns
   WHERE table_name = TG_TABLE_NAME
     AND (NOT when_unchanged
          OR (TG_OP = 'UPDATE'
              AND NOT (column_name = ANY (COALESCE(v_cols, ARRAY[]::text[])))));

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

-- ---------------------------------------------------------------------------
-- The entries already queued.
-- ---------------------------------------------------------------------------
-- Unsent escalation entries whose only substance was the sweep timestamp are
-- dropped rather than shipped. They convey nothing the peer can use, the row
-- they describe travels again the moment anything real happens to it, and
-- every one of them is a slot in a batch that a surgery could have had.
--
-- Restricted to entries the peer has NOT acknowledged, so nothing already
-- settled is rewritten, and to entries whose changed_cols is exactly
-- {lastCheckedAt} — an entry that also carried a stage change or a resolution
-- is real and is left alone.
DELETE FROM sync_journal
 WHERE table_name = 'emergency_delay_escalations'
   AND op = 'UPDATE'
   AND ack_at IS NULL
   AND changed_cols = ARRAY['lastCheckedAt']::text[];
