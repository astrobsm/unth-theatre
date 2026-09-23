-- ============================================================
-- One entry that cannot be sent must not stop the ones that can
-- ------------------------------------------------------------
-- The push selects `where ack_at is null and origin_node = $1 order by hlc
-- limit N`. Strictly oldest first, with nothing to say "this one has had its
-- turn". So an entry the peer will never accept sits at the oldest HLC and is
-- in EVERY batch, for ever.
--
-- Measured on the theatre server, 23 September 2026:
--
--   emergency_surgery_bookings  INSERT   11171 attempts
--   emergency_team_availability INSERT   11171 attempts
--   emergency_team_availability INSERT   11171 attempts
--   emergency_team_availability INSERT   11171 attempts
--   ... 306 legitimate entries behind them, none of which ever shipped
--
-- Eleven thousand attempts is not a retry strategy. These four are one
-- emergency booking and its team-availability rows, created on the theatre
-- server, whose surgeryId the cloud already holds under a different booking id
-- — two records claiming one identity, which a person has to settle. Until
-- somebody does, they fail on arrival every time.
--
-- AND THEY DID NOT FAIL CHEAPLY. Each one costs the receiving batch a
-- savepoint, a failed statement and a rollback, and the cloud's apply
-- transaction has a 110-second budget for the whole batch. Four of them
-- consumed enough of it that the batch returned P2028 — a transaction timeout
-- — which the worker read as "too big" and answered by halving the batch,
-- 200 to 100 to 50. Halving cannot help when the problem is in the first four
-- rows, so the queue made no progress at any size. The same failure is
-- recorded in src/lib/sync/permanentFailure.ts, which is where the 110-second
-- budget is described; what was missing is that nothing ever moved a
-- persistent offender OUT of the way.
--
-- THE FIX IS BACKOFF, NOT DISCARD. next_push_at holds an entry out of the
-- batch for a while once it has failed enough times to prove it is not a
-- passing error. It is still queued, still counted, still visible, and still
-- retried — an hour apart instead of every sixty seconds, because the thing it
-- is waiting for is a human decision, not a network. Nothing is dropped: that
-- remains the one outcome worse than a stuck entry.
--
-- NULL means "send at the next opportunity", so every existing row and every
-- new one behaves exactly as before until it has earned a backoff.
-- ============================================================

ALTER TABLE sync_journal ADD COLUMN IF NOT EXISTS next_push_at timestamptz;

COMMENT ON COLUMN sync_journal.next_push_at IS
  'Do not include this entry in a push batch before this time. Set once an entry has failed enough times to be a persistent offender rather than a passing error, so it cannot starve the entries behind it. NULL = send at the next opportunity.';

-- The push already filters on (ack_at, origin_node) and orders by hlc; the new
-- column joins that predicate, so the index carries it too.
CREATE INDEX IF NOT EXISTS sync_journal_pushable_idx
  ON sync_journal (origin_node, hlc)
  WHERE ack_at IS NULL;

-- Stand the known offenders down immediately.
--
-- Without this the fix only applies to whatever fails next, and the 306 entries
-- behind these four — PACU assessments, radio traffic, transport logs, a
-- theatre's work for three days — wait for the worker to be restarted and then
-- to accumulate the attempts all over again. They have accumulated 11,171.
UPDATE sync_journal
   SET next_push_at = now() + interval '1 hour'
 WHERE ack_at IS NULL
   AND attempts >= 10;
