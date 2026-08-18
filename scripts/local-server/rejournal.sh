#!/usr/bin/env bash
# =============================================================================
# Send rows that predate capture UP to the cloud
# -----------------------------------------------------------------------------
#   ./rejournal.sh --table surgery_consumable_requests --since 2026-08-01
#   ./rejournal.sh --table surgery_consumable_requests --surgery <id> --apply
#
# Capture journals FUTURE changes only. A row written before its table had a
# trigger attached was never journaled, so it will never be sent — it simply
# sits here, correct and invisible to the other side.
#
# backfill-from-cloud.sh solves that in one direction by copying cloud rows
# down. This is the other direction, and it cannot work the same way: the cloud
# is reached only by the sync worker, so the honest move is to make the rows
# LOOK like changes and let the normal machinery ship them.
#
# HOW: a no-op UPDATE — setting each row's updatedAt to the value it already
# holds — fires the existing capture trigger, which journals the full row with
# a proper HLC, version stamp and omitted-column handling. Reusing the trigger
# is deliberate: hand-writing journal entries would mean reimplementing that
# logic and getting one detail subtly wrong.
#
# WHAT IT DOES NOT CHANGE: no column value is altered. sync_version increments,
# which is what makes the row shippable, and updatedAt is written back
# unchanged so nothing downstream reads it as a fresh edit.
#
# MIND THE VOLUME. The uplink here manages roughly 6 to 13 journal entries per
# push cycle. Re-journalling two thousand rows is therefore hours of queue, and
# it delays genuinely new work behind it. Scope it with --surgery or --since.
# =============================================================================

set -euo pipefail
APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

TABLE=""; SURGERY=""; SINCE=""; APPLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --table)   TABLE="${2:-}"; shift 2 ;;
    --surgery) SURGERY="${2:-}"; shift 2 ;;
    --since)   SINCE="${2:-}"; shift 2 ;;
    --apply)   APPLY=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
else B=""; G=""; Y=""; R=""; N=""; fi

[[ -n "$TABLE" ]] || { echo "usage: $0 --table <name> [--surgery <id>] [--since <date>] [--apply]" >&2; exit 2; }

# Only tables that are actually classified for sync. Re-journalling anything
# else would fill the queue with entries the peer is required to ignore.
case "$TABLE" in
  surgeries|patients|surgery_consumable_requests|surgery_drug_dressing_requests|\
  surgical_consumable_templates|surgical_drug_dressing_templates|\
  theatre_allocations|inventory_items|patient_transfers) ;;
  *) echo "${R}Refusing:${N} '$TABLE' is not a table this script will re-journal." >&2
     echo "  Add it here only if it is classified in lib/sync/syncPolicy.ts AND its" >&2
     echo "  foreign-key parents are classified too, or every row will park on the peer." >&2
     exit 2 ;;
esac

read_env_key() {
  local key="$1" file v
  for file in "$APP_DIR/.env.local" "$APP_DIR/.env"; do
    [[ -f "$file" ]] || continue
    v="$(grep -E "^${key}=" "$file" | tail -1 | sed -E "s/^${key}=//; s/^\"//; s/\"$//" || true)"
    [[ -n "$v" ]] && { printf '%s' "$v"; return 0; }
  done
  return 1
}
DB="$(read_env_key DATABASE_URL || true)"; U="${DB%%\?*}"
[[ -n "$U" ]] || { echo "no DATABASE_URL in .env.local" >&2; exit 1; }
case "$U" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "${R}DATABASE_URL is not local.${N} This re-journals the LOCAL database only." >&2; exit 1 ;;
esac

WHERE="1=1"
[[ -n "$SURGERY" ]] && WHERE="$WHERE and \"surgeryId\" = '$SURGERY'"
[[ -n "$SINCE"   ]] && WHERE="$WHERE and \"createdAt\" >= '$SINCE'"

echo
echo "${B}Re-journalling $TABLE${N}"
[[ -n "$SURGERY" ]] && echo "  scoped to surgery $SURGERY"
[[ -n "$SINCE"   ]] && echo "  created on or after $SINCE"

if ! psql "$U" -tAXc "select 1 from pg_trigger where tgname='zz_sync_capture' and tgrelid='\"$TABLE\"'::regclass" | grep -q 1; then
  echo "  ${R}FAIL${N} $TABLE has no capture trigger, so a no-op update would journal nothing."
  echo "        Apply migrations first: ./apply-migrations.sh"
  exit 1
fi

COUNT="$(psql "$U" -tAXc "select count(*) from \"$TABLE\" where $WHERE")"
echo "  rows matching: ${B}${COUNT}${N}"

QUEUED="$(psql "$U" -tAXc "select count(*) from sync_journal where ack_at is null")"
echo "  already queued and unsent: $QUEUED"

if [[ "$COUNT" -gt 500 ]]; then
  echo "  ${Y}That is a large batch.${N} At roughly 6-13 entries per push cycle this is"
  echo "  hours of queue, and it delays new theatre work behind it. Consider --since."
fi

if [[ $APPLY -ne 1 ]]; then
  echo
  echo "Report only. Re-run with ${B}--apply${N} to queue these for the cloud."
  exit 0
fi

echo
echo "  queueing…"
psql "$U" -v ON_ERROR_STOP=1 -q -c "update \"$TABLE\" set \"updatedAt\" = \"updatedAt\" where $WHERE"

AFTER="$(psql "$U" -tAXc "select count(*) from sync_journal where ack_at is null")"
echo "  ${G}queued${N}: unsent went from $QUEUED to $AFTER"
echo
echo "The worker ships these on its normal cycle. Watch it with:"
echo "  journalctl -u orm-sync -f"
