#!/usr/bin/env bash
# =============================================================================
# Close conflicts that a reclassification has already answered
# -----------------------------------------------------------------------------
#   ./clear-conflicts.sh --table radio_announcements
#   ./clear-conflicts.sh --table radio_announcements --apply
#
# A conflict sits OPEN until a person decides it. That is correct for clinical
# content and it is why quarantine exists. It is NOT correct for a conflict
# that was never a real disagreement — one raised because the table was
# classified wrongly, where there is nothing for a person to decide because
# both versions were valid and the question was malformed.
#
# 45 of those accumulated on radio_announcements. The table was declared
# APPEND_ONLY, so decide() saw every playback status update — PENDING to
# PLAYING to PLAYED to ACKNOWLEDGED, written by seven different routes — and
# quarantined each one as "classification looks wrong". Which it was. The
# classification was corrected to LWW on 17 August (3869a43, 17:56 +0100) and
# new ones stopped immediately — the newest conflict in the queue is from 16:03
# UTC that day, fifty-three minutes before the fix — but the existing queue does
# not clear itself.
#
# WHY THESE ARE CLOSED WITHOUT APPLYING THE INCOMING VERSION
#
# Applying a days-old playback status now would be worse than dropping it: it
# would mark an announcement as PLAYING that finished last week, or move one
# backwards from ACKNOWLEDGED. The value in those rows expired when the
# announcement did.
#
# Nothing is lost by closing them. The conflict row keeps BOTH versions
# permanently — incoming and local_snapshot are jsonb columns and this script
# does not touch them — and the record of who acknowledged an announcement
# lives in radio_acknowledgments, which is append-only and now replicates in
# its own right. Closing changes the status and writes a reason; it deletes
# nothing.
#
# DELIBERATELY NARROW. It refuses any table carrying clinical content, whatever
# is typed on the command line, because "clear the conflict queue" is a
# sentence somebody will one day say about prescriptions.
# =============================================================================

set -euo pipefail
APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

TABLE=""; APPLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --table) TABLE="${2:-}"; shift 2 ;;
    --apply) APPLY=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
else B=""; G=""; Y=""; R=""; N=""; fi

[[ -n "$TABLE" ]] || { echo "usage: $0 --table <name> [--apply]" >&2; exit 2; }

# The whole safety of this script. Only tables whose conflicts are operational
# noise from a known misclassification may be bulk-closed. Anything holding a
# clinical claim needs a person looking at the two versions, one at a time.
case "$TABLE" in
  radio_announcements|radio_acknowledgments|notifications|theatre_meals) ;;
  *)
    echo "${R}Refusing${N} to bulk-close conflicts on '$TABLE'."
    echo "  This script only clears queues left by a known misclassification on"
    echo "  operational tables. A conflict on clinical content — a prescription, an"
    echo "  assessment, a patient record — is a real disagreement between two"
    echo "  versions and needs a person to read both and choose. There is no safe"
    echo "  way to do that in bulk, and a script that offered one would eventually"
    echo "  be pointed at exactly the table it must never touch."
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

echo
echo "${B}Open conflicts on $TABLE${N}"
psql "$U" -X -c "
  select left(reason, 90) as reason, count(*) as n,
         min(created_at)::timestamp(0) as oldest,
         max(created_at)::timestamp(0) as newest
    from sync_conflicts
   where status = 'OPEN' and table_name = '$TABLE'
   group by left(reason, 90) order by n desc;"

TOTAL="$(psql "$U" -tAXc "select count(*) from sync_conflicts where status='OPEN' and table_name='$TABLE'")"
echo "  total open: ${B}${TOTAL}${N}"

if [[ "$TOTAL" -eq 0 ]]; then
  echo "  ${G}Nothing to clear.${N}"
  exit 0
fi

echo
echo "  Both versions of every row stay in sync_conflicts. This changes only the"
echo "  status and writes a reason; incoming and local_snapshot are untouched."

if [[ $APPLY -ne 1 ]]; then
  echo
  echo "Report only. Re-run with ${B}--apply${N} to close them."
  exit 0
fi

WHO="$(id -un)@$(hostname)"
NOTE="Closed in bulk after the table was reclassified from APPEND_ONLY to LWW on 2026-08-17 (3869a43). \
These were quarantined as 'classification looks wrong', which was true: playback status updates \
are not append-only inserts. The incoming version was NOT applied — a days-old playback status \
would move a finished announcement backwards. Both versions are retained on this row."

psql "$U" -X -v ON_ERROR_STOP=1 -q -c "
  update sync_conflicts
     set status = 'RESOLVED_KEEP_LOCAL',
         resolved_by = '$WHO',
         resolved_at = now(),
         resolution_note = '$NOTE'
   where status = 'OPEN' and table_name = '$TABLE';"

REMAIN="$(psql "$U" -tAXc "select count(*) from sync_conflicts where status='OPEN' and table_name='$TABLE'")"
echo
echo "  ${G}closed${N}: $TOTAL, remaining open on $TABLE: $REMAIN"
echo "  Across all tables:"
psql "$U" -X -c "select table_name, count(*) as still_open from sync_conflicts where status='OPEN' group by 1 order by 2 desc;"
