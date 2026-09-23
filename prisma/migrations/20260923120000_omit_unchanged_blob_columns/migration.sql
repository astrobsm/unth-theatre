-- ============================================================
-- Stop re-shipping a megabyte of audio to record that it played
-- ------------------------------------------------------------
-- WHAT WENT WRONG. announcements.audioData holds an MP3 as base64 — 1.3 to
-- 1.5 MB a row. Every time an announcement plays, the scheduler bumps
-- playCount and lastPlayedAt, the capture trigger serialises the WHOLE row,
-- and the journal gains another entry carrying the entire audio file to
-- convey two integers.
--
-- The cost, measured on the theatre server on 23 September 2026:
--
--   announcements    222 entries    385 MB      1778 kB per entry
--   everything else  ~50k entries   under 2 MB  a few hundred bytes
--
-- One table, five distinct announcements, 385 MB — and of the 222 entries
-- 179 had already been shipped and acknowledged, so roughly 250 MB of audio
-- had crossed the hospital's link purely to say "it played again".
--
-- THE HARM WAS NOT DISK, IT WAS DELAY. The push batch is bounded by a byte
-- budget, so a single announcement entry fills a batch on its own. After the
-- three-day outage of 20-23 September the queue held 2,721 entries with 42 of
-- these at the head of it, and the log read "sending 12 of 200 queued (byte
-- budget reached)". Theatre work done during the outage — surgeries, radio
-- messages, PACU assessments — sat behind audio files it had nothing to do
-- with. That is why the cloud had cases the local server did not.
--
-- THE FIX uses machinery that already existed. sync_omitted_columns holds
-- columns never copied into a payload (the consent blobs on surgeries are
-- there). A blanket omission is wrong for audioData, because the column is
-- NOT NULL: leave it out of the INSERT that first carries a new announcement
-- and the apply fails 23502 on the peer, forever, since nothing else will
-- ever supply it.
--
-- So the omission becomes conditional. when_unchanged = true means: ship this
-- column when it is actually new or actually changed, and omit it otherwise.
-- A new announcement carries its audio exactly once. Replacing the audio
-- carries it again. A play counter carries none of it. The digest is still
-- recorded, so a genuine divergence stays detectable.
--
-- The existing three rows keep when_unchanged = false — always omitted — which
-- is deliberate and unchanged: those columns are nullable and have a
-- fetch-on-demand path, and this migration is not the place to revisit them.
-- ============================================================

ALTER TABLE sync_omitted_columns
  ADD COLUMN IF NOT EXISTS when_unchanged boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN sync_omitted_columns.when_unchanged IS
  'false = never ship this column. true = ship it only on INSERT or when it is in changed_cols, so an unrelated edit does not re-send the blob.';

-- audioData is the column that caused the incident. The other three are the
-- same shape and were found by the guardrail written alongside this migration
-- (scripts/lib-tests/syncBlobColumns.test.ts): a base64 payload on a table
-- whose rows replicate and are edited after the payload is written. None of
-- them is bloating the journal yet, because the media features are barely
-- used — an anaesthetic review that is filled in over several visits, and a
-- tip or security report that is triaged after it is filed, would each re-ship
-- their attachment on every subsequent edit. Registering them now costs
-- nothing and removes the same failure before it happens.
--
-- All four are conditional. For the three nullable ones a blanket omission
-- would technically apply, but it would mean the bytes never reach the peer at
-- all; when_unchanged carries them once, with the row that owns them.
INSERT INTO sync_omitted_columns (table_name, column_name, when_unchanged) VALUES
  ('announcements','audioData', true),
  ('anonymous_tips','mediaUrl', true),
  ('security_reports','mediaUrl', true),
  ('preoperative_anesthetic_reviews','anaesthesiaConsentSignature', true)
ON CONFLICT (table_name, column_name) DO UPDATE SET when_unchanged = excluded.when_unchanged;

-- ---------------------------------------------------------------------------
-- The capture trigger, re-declared. One clause differs: the selection of
-- columns to omit now consults when_unchanged. Everything else is byte for
-- byte what 20260810090000_hybrid_sync_journal installed.
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
    SELECT array_agg(key) INTO v_cols
      FROM jsonb_each(v_row) n
      WHERE n.value IS DISTINCT FROM (v_old -> n.key)
        AND n.key NOT IN ('sync_version','sync_origin','sync_hlc','updatedAt');
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
  --
  -- THE CHANGED CLAUSE. A when_unchanged column is omitted only on an UPDATE
  -- that did not touch it. On INSERT, v_cols is NULL and the second branch is
  -- false, so the column is kept and the blob travels with the row that needs
  -- it — which is what stops a NOT NULL column failing to apply on the peer.
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
-- Without this the fix only helps future plays, and the entries already in the
-- queue still have to crawl out roughly one per batch.
--
-- ONE OF THEM WAS NOT CRAWLING AT ALL, and it is the reason the theatre server
-- had sent nothing for three days. A single entry — 3,298 kB, op UPDATE,
-- changed_cols {playCount}, one integer carried by an entire MP3 — sat at the
-- head of the queue with shipped_at set and ack_at null. Every cycle re-sent
-- it, every cycle the request was aborted after 120 seconds, and the worker
-- halved the batch and tried again: "push of 109 timed out — rows 200 -> 100,
-- budget 3500 -> 1750 kB", five attempts deep. Halving cannot help when ONE
-- row exceeds what the link carries in the timeout, and because the queue ships
-- oldest-first, every one of the 2,721 entries behind it was stuck too. The
-- adaptive batch made the stall look like a slow link rather than a wedge.
--
-- So shipped-but-unacknowledged entries are rewritten as well. The peer has by
-- definition not confirmed them, so nothing there records a digest of this
-- entry as authoritative, and re-sending it without the column is not a
-- revision of anything the peer has accepted. An ACKNOWLEDGED entry is still
-- left untouched — that one is settled history.
--
-- Only UPDATE entries that did not change audioData are touched, and only
-- where the peer has already acknowledged an earlier entry for the same
-- announcement — proof it holds the row, so leaving the column out cannot
-- strand it. The peer keeps the audio it already has and applies the counter.
UPDATE sync_journal j
   SET payload        = j.payload - 'audioData',
       omitted_cols   = array_append(COALESCE(j.omitted_cols, ARRAY[]::text[]), 'audioData'),
       omitted_digest = encode(digest(COALESCE(j.payload ->> 'audioData', ''), 'sha256'), 'hex')
 WHERE j.table_name = 'announcements'
   AND j.op = 'UPDATE'
   AND j.ack_at IS NULL
   AND j.payload ? 'audioData'
   AND NOT ('audioData' = ANY (COALESCE(j.changed_cols, ARRAY[]::text[])))
   AND EXISTS (
     SELECT 1 FROM sync_journal p
      WHERE p.table_name = 'announcements'
        AND p.row_id = j.row_id
        AND p.ack_at IS NOT NULL
   );
