-- Stop capture on idempotency_keys, which has been breaking every insert.
--
-- WHAT WAS HAPPENING
--
-- sync_capture() takes row_id from to_jsonb(NEW)->>'id'. idempotency_keys is
-- keyed on `key` and has no id column at all, so row_id came out NULL against a
-- NOT NULL column and EVERY INSERT FAILED:
--
--   Invalid `prisma.idempotencyKey.create()` invocation:
--   Null constraint violation on the fields: (`row_id`)
--
-- Those errors are in the server log on 22, 24 and 26 August. They were not
-- noticed because rememberResult() swallows storage errors by design — a
-- failure to record a key must never block the write it was protecting.
--
-- So the failure was invisible AND the protection was absent: replay guarding
-- for offline-queued mutations has not worked since capture was enabled here.
-- The offline layer attaches a stable X-Idempotency-Key and replays on
-- reconnect; without the stored key, a replayed emergency booking creates a
-- second case.
--
-- It should never have been captured. Replay protection is deliberately shared
-- between nodes in the policy, but this table cannot carry the trigger as the
-- trigger is written, and a table whose every insert fails is not synchronised.
-- It is simply gone.

DROP TRIGGER IF EXISTS zz_sync_capture ON idempotency_keys;
DROP TRIGGER IF EXISTS zz_sync_capture_del ON idempotency_keys;

-- Left in place deliberately: the columns are harmless, and dropping them would
-- churn a table that is written on every offline mutation.
