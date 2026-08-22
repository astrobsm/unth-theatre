#!/usr/bin/env bash
# =============================================================================
# Nightly retention for the two tables that grow without anybody reading them.
# -----------------------------------------------------------------------------
# Measured on 22 August 2026, before this existed:
#
#   notifications         79,275 rows   40 MB   45 write call-sites, 0 reads,
#                                               no retention, replicated to the
#                                               cloud where nothing read them
#                                               either.
#   radio_announcements    2,715 rows           every one in a terminal state;
#                                               the live queue was ZERO, and the
#                                               poll scanned all 2,715 of them
#                                               ~2 million times looking for
#                                               nothing.
#
# Both fed the sync journal across a domestic uplink. On 18 August that journal
# deadlocked with 176 unsent entries, 154 of them notifications.
#
# TWO RULES THIS SCRIPT EXISTS TO FOLLOW:
#
#   1. notifications is NO LONGER CAPTURED for sync — its zz_sync_capture
#      triggers were dropped on both databases. Deleting from it therefore
#      journals nothing. If those triggers are ever restored, a 49,000-row
#      prune becomes a 49,000-entry sync backlog, so check before assuming.
#
#   2. radio_announcements IS still captured, because remote users need the
#      radio to work. Every delete here DOES journal, so it is done in small
#      batches with the queue checked between them. A single unbatched delete
#      of a few thousand rows is how the 18 August deadlock happened.
#
# Usage:
#   ./prune-ephemera.sh              # prune with the defaults below
#   ./prune-ephemera.sh --dry-run    # count only, change nothing
# =============================================================================
set -euo pipefail

APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
NOTIFICATION_DAYS="${ORM_NOTIFICATION_DAYS:-30}"
RADIO_DAYS="${ORM_RADIO_DAYS:-7}"
# Small enough that a night's prune never outruns the sync worker, which moves
# 200 entries a batch on a link that has timed out before.
RADIO_BATCH="${ORM_RADIO_BATCH:-200}"
RADIO_MAX_BATCHES="${ORM_RADIO_MAX_BATCHES:-5}"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

DB=$(grep -E '^DATABASE_URL=' "$APP_DIR/.env.local" | tail -1 | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')
DB=${DB%%\?*}
[ -n "$DB" ] || { echo "no DATABASE_URL found in $APP_DIR/.env.local" >&2; exit 1; }

q() { psql "$DB" -X -t -A -c "$1"; }

echo "== ORM ephemera prune $(date -u '+%Y-%m-%d %H:%M UTC') =="

# --- Guard: refuse to prune notifications if they are being captured again ---
CAPTURED=$(q "SELECT count(*) FROM pg_trigger WHERE tgrelid='notifications'::regclass AND NOT tgisinternal;")
if [ "$CAPTURED" -gt 0 ]; then
  echo "REFUSING: notifications has $CAPTURED sync trigger(s) again."
  echo "Pruning it now would flood the sync journal. Drop the triggers or"
  echo "prune it in batches deliberately."
  exit 1
fi

N_OLD=$(q "SELECT count(*) FROM notifications WHERE \"createdAt\" < now() - interval '$NOTIFICATION_DAYS days';")
echo "notifications older than ${NOTIFICATION_DAYS}d : $N_OLD"

R_OLD=$(q "SELECT count(*) FROM radio_announcements WHERE status IN ('PLAYED','ACKNOWLEDGED','EXPIRED','CANCELLED') AND \"createdAt\" < now() - interval '$RADIO_DAYS days';")
echo "spent radio announcements >${RADIO_DAYS}d  : $R_OLD"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "(dry run — nothing deleted)"
  exit 0
fi

# --- notifications: unjournalled, so delete in one statement ----------------
if [ "$N_OLD" -gt 0 ]; then
  q "DELETE FROM notifications WHERE \"createdAt\" < now() - interval '$NOTIFICATION_DAYS days';" >/dev/null
  echo "deleted $N_OLD notifications"
fi

# --- radio: journalled, so batch and watch the queue ------------------------
deleted=0
for _ in $(seq 1 "$RADIO_MAX_BATCHES"); do
  n=$(q "
    WITH doomed AS (
      SELECT id FROM radio_announcements
      WHERE status IN ('PLAYED','ACKNOWLEDGED','EXPIRED','CANCELLED')
        AND \"createdAt\" < now() - interval '$RADIO_DAYS days'
      LIMIT $RADIO_BATCH
    )
    DELETE FROM radio_announcements r USING doomed d WHERE r.id = d.id RETURNING 1;" | grep -c 1 || true)
  [ "$n" -eq 0 ] && break
  deleted=$((deleted + n))
  # Stop early if the queue is already backing up: better to leave rows for
  # tomorrow than to bury a link that is struggling.
  unsent=$(q "SELECT count(*) FROM sync_journal WHERE ack_at IS NULL;")
  if [ "$unsent" -gt 1500 ]; then
    echo "stopping: sync queue at $unsent, leaving the rest for the next run"
    break
  fi
done
[ "$deleted" -gt 0 ] && echo "deleted $deleted radio announcements"

echo "unsent sync entries now: $(q 'SELECT count(*) FROM sync_journal WHERE ack_at IS NULL;')"
echo "done."
