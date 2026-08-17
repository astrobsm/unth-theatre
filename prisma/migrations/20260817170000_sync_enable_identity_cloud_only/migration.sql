-- ============================================================
-- Phase 3: replicate identity DOWNWARD only
-- ------------------------------------------------------------
-- Why this was outstanding, and what changed.
--
-- users, user_module_grants and onboarding_submissions are classified
-- CLOUD_AUTHORITATIVE. Capture was deliberately left off, because touching
-- identity replication risks locking people out of a system they are
-- operating. That caution was right, and the cost of it became clear on
-- 17 August 2026: a surgeon, a consultant anaesthetist and seven house
-- officers had registered on the cloud over six days and existed nowhere on
-- the theatre server. They could not sign in there at all, and every
-- notification and audit_log addressed to them failed
-- notifications_userId_fkey and parked in sync_deferred — 143 entries, retried
-- 7,522 times, healing never. Seeding the users by hand cleared all 143 in one
-- cycle, which is the proof that the only thing missing was the parent rows.
--
-- Doing nothing means that recurs on the next registration.
--
-- ------------------------------------------------------------
-- THE TRIGGER GOES ON THE CLOUD ONLY. This is the point of the migration.
--
-- "Cloud authoritative" is enforced in decide() only for CONCURRENT changes:
-- when the incoming baseVersion matches the local version, decide() returns
-- APPLY as "in sequence" BEFORE it ever consults the class. So a local edit to
-- a user, made while the two sides agree, would be applied on the cloud —
-- which is the lockout the original caution was about. Deactivating an account
-- on the theatre server would deactivate it everywhere.
--
-- Attaching capture on the cloud alone removes that by construction rather
-- than by trusting a code path. The local node never journals a users row, so
-- it has nothing to send, so no local identity edit can ever reach the cloud.
-- Cloud changes still flow down every cycle, which is the direction that was
-- missing. "Unconditionally authoritative" becomes a property of the
-- plumbing instead of a claim in a comment.
--
-- The consequence to know: a user edited ONLY on the local server will be
-- silently overwritten the next time the cloud sends that row. That is the
-- intended meaning of cloud-authoritative. Identity is administered in the
-- cloud; the theatre server receives it.
--
-- ------------------------------------------------------------
-- Existing rows are NOT journaled by this. Capture records future changes
-- only, so the accounts already diverged stay diverged until they are seeded:
--
--   ./scripts/local-server/backfill-from-cloud.sh --apply users
--
-- Run that once after this migration reaches the cloud.
-- ============================================================

DO $$
DECLARE
  this_node text;
BEGIN
  SELECT node_id INTO this_node FROM sync_node WHERE id;

  IF this_node IS NULL OR this_node = 'unset' THEN
    RAISE EXCEPTION 'sync_node.node_id is not set on this database; refusing to guess which side this is.';
  END IF;

  IF this_node = 'cloud' THEN
    PERFORM sync_enable_table('users');
    PERFORM sync_enable_table('user_module_grants');
    PERFORM sync_enable_table('onboarding_submissions');
    RAISE NOTICE 'sync: identity capture enabled (cloud node)';
  ELSE
    -- Not an omission and not a failure. The local node must never journal
    -- identity, so there is nothing to do here.
    RAISE NOTICE 'sync: identity capture is cloud-only; skipped on node %', this_node;
  END IF;
END $$;
