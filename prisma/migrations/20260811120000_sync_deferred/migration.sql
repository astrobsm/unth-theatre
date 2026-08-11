-- ============================================================
-- Deferred entries: what to do with a change that cannot be applied YET
-- ------------------------------------------------------------
-- The worker used to stop at the first entry it could not apply, so as never
-- to advance the cursor past something unsaved. That protected the data and
-- then blocked everything: one surgery whose patient had not arrived held up
-- all 72 entries behind it, permanently.
--
-- Most such failures are ORDERING, not corruption. The row is fine; its parent
-- simply has not been applied yet. Parking it durably here lets the rest of the
-- batch through, and the next cycle retries it — by which time the patient has
-- usually landed and it applies without anyone intervening.
--
-- This is the safe half of skipping: the entry is stored in full, so advancing
-- the cursor loses nothing.
-- ============================================================

CREATE TABLE IF NOT EXISTS sync_deferred (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id    uuid NOT NULL UNIQUE,
  from_node     text NOT NULL,
  table_name    text NOT NULL,
  row_id        text NOT NULL,
  -- The whole wire entry, so a retry needs nothing from the peer.
  entry         jsonb NOT NULL,
  attempts      integer NOT NULL DEFAULT 0,
  last_error    text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_try_at   timestamptz,
  resolved_at   timestamptz
);

-- The retry sweep reads only unresolved rows, oldest first: a parent deferred
-- before its child is retried before it, which is the order that resolves.
CREATE INDEX IF NOT EXISTS sync_deferred_pending_idx
  ON sync_deferred (first_seen_at) WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS sync_deferred_table_idx
  ON sync_deferred (table_name, resolved_at);
