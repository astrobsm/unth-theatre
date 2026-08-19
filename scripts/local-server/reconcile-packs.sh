#!/usr/bin/env bash
# =============================================================================
# Close the gap between what each side holds, after the list has finished
# -----------------------------------------------------------------------------
#   ./reconcile-packs.sh            report the gap, change nothing
#   ./reconcile-packs.sh --apply    close it
#
# Written to be run unattended by cron at night, so it is SILENT WHEN THERE IS
# NOTHING TO DO. A nightly job that prints a paragraph every night is a nightly
# job nobody reads by the end of the week.
#
# WHAT IT IS FOR
#
# Rows can end up on one side only, and then stay there. Nothing is parked in
# sync_deferred, no error is raised, and neither node will ever converge on its
# own — the entries either predate capture or were lost before the UNKNOWN_TABLE
# fix. On 19 August that was 230 consumable rows the cloud lacked and 58 drug
# rows the theatre server lacked. Both directions, silently, for weeks.
#
# The two directions need different tools and that is not an accident:
#
#   MISSING HERE   backfill-from-cloud.sh copies down. Cheap, direct, and it
#                  does not touch the uplink queue.
#   MISSING THERE  rejournal.sh re-queues local rows by touching them, which
#                  fires the capture trigger. That queue is shared with live
#                  theatre work, which is the whole reason this runs at night.
#
# THE CAP IS THE IMPORTANT PART. Re-journalling is throttled by the uplink at
# roughly ten wide rows a minute, so a few hundred is most of an hour and a few
# thousand is the whole night and most of the morning list behind it. Above the
# cap this refuses and says so rather than quietly starting something that will
# still be running when theatre opens. Somebody then scopes it by hand with
# --since, which is a decision a person should make.
# =============================================================================

set -uo pipefail

APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$APP_DIR" || exit 1

APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

# Above this many rows in one direction, stop and ask for a human. See above.
MAX_REJOURNAL="${ORM_MAX_REJOURNAL:-400}"

UP_TABLE="surgery_consumable_requests"     # we have them, the cloud does not
DOWN_TABLE="surgery_drug_dressing_requests" # the cloud has them, we do not

read_env_key() {
  local key="$1" file v
  for file in "$APP_DIR/.env.local" "$APP_DIR/.env"; do
    [[ -f "$file" ]] || continue
    v="$(grep -E "^${key}=" "$file" | tail -1 | sed -E "s/^${key}=//; s/^\"//; s/\"$//" || true)"
    [[ -n "$v" ]] && { printf '%s' "$v"; return 0; }
  done
  return 1
}
libpq() {
  printf '%s' "$1" \
    | sed -E 's/([?&])(schema|connection_limit|pgbouncer|pool_timeout|socket_timeout)=[^&]*/\1/g' \
    | sed -E 's/\?&+/?/; s/&&+/\&/g; s/[?&]$//'
}

L="$(libpq "$(read_env_key DATABASE_URL || true)")"; L="${L%%\?*}"
C="$(libpq "$(read_env_key CLOUD_DIRECT_URL || true)")"
[[ -n "$L" ]] || { echo "reconcile: no DATABASE_URL" >&2; exit 1; }
[[ -n "$C" ]] || { echo "reconcile: no CLOUD_DIRECT_URL — cannot compare" >&2; exit 1; }

count() { psql "$1" -X -tAc "select count(*) from \"$2\";" 2>/dev/null || echo ''; }

# Reading the CLOUD crosses the hospital uplink, which is exactly as reliable as
# hospital uplinks usually are. The very first scheduled run, at 20:00 on
# 19 August, found it unreadable and correctly refused to act — and in doing so
# lost the whole night to a blip that had cleared within the hour.
#
# So a failure is retried before it is believed. Three attempts a minute apart:
# long enough to ride out a reconnect, short enough that the job is finished
# well before anybody is back in theatre. The alternative — running the schedule
# more often — would mean the expensive upward half could start at a time
# nobody chose.
count_with_retry() {
  local url="$1" table="$2" tries="${3:-3}" n=1 v
  while :; do
    v="$(count "$url" "$table")"
    [[ -n "$v" ]] && { printf '%s' "$v"; return 0; }
    [[ $n -ge $tries ]] && return 1
    say "reconcile: could not read $table (attempt $n of $tries) — retrying in 60s"
    sleep 60
    n=$(( n + 1 ))
  done
}

stamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
say()   { echo "$(stamp) $*"; }

# The local reads are not retried — a local database that will not answer is a
# different and much larger problem than a flaky uplink, and retrying it would
# only delay saying so.
up_local="$(count "$L" "$UP_TABLE")"
dn_local="$(count "$L" "$DOWN_TABLE")"
up_cloud="$(count_with_retry "$C" "$UP_TABLE" || true)"
dn_cloud="$(count_with_retry "$C" "$DOWN_TABLE" || true)"

# An unreadable side is not "no difference". Saying nothing here would report a
# broken uplink as a healthy night.
if [[ -z "$up_local" || -z "$up_cloud" || -z "$dn_local" || -z "$dn_cloud" ]]; then
  say "reconcile: could not read both databases (uplink down?). Nothing attempted."
  exit 1
fi

owed_up=$(( up_local  > up_cloud ? up_local  - up_cloud : 0 ))
owed_dn=$(( dn_cloud  > dn_local ? dn_cloud  - dn_local : 0 ))

if [[ $owed_up -eq 0 && $owed_dn -eq 0 ]]; then
  # Silence is the point. Cron mails output; a nightly "all well" trains people
  # to filter the very mailbox the real warning will arrive in.
  exit 0
fi

say "reconcile: $UP_TABLE local=$up_local cloud=$up_cloud (owed up: $owed_up)"
say "reconcile: $DOWN_TABLE local=$dn_local cloud=$dn_cloud (owed down: $owed_dn)"

if [[ $APPLY -ne 1 ]]; then
  say "reconcile: report only. Re-run with --apply to close the gap."
  exit 0
fi

# ---- Downward first, deliberately -------------------------------------------
# It is the cheap direction and does not compete for the uplink, so if the night
# is cut short the half that got done is the half that costs nothing.
if [[ $owed_dn -gt 0 ]]; then
  say "reconcile: copying $owed_dn row(s) down from the cloud"
  if ./scripts/local-server/backfill-from-cloud.sh --apply "$DOWN_TABLE" >/dev/null 2>&1; then
    say "reconcile: downward copy finished ($(count "$L" "$DOWN_TABLE") rows here now)"
  else
    say "reconcile: downward copy FAILED — see backfill-from-cloud.sh output"
  fi
fi

# ---- Upward, capped ----------------------------------------------------------
if [[ $owed_up -gt 0 ]]; then
  if [[ $owed_up -gt $MAX_REJOURNAL ]]; then
    say "reconcile: REFUSING to re-journal $owed_up rows in one run (cap $MAX_REJOURNAL)."
    say "reconcile: that is more queue than one night, and live theatre work waits behind it."
    say "reconcile: scope it by hand, e.g."
    say "reconcile:   ./scripts/local-server/rejournal.sh --table $UP_TABLE --since <date> --apply"
  else
    say "reconcile: re-journalling $owed_up row(s) for the cloud"
    if ./scripts/local-server/rejournal.sh --table "$UP_TABLE" --apply >/dev/null 2>&1; then
      say "reconcile: queued. The uplink will drain it at roughly ten rows a minute."
    else
      say "reconcile: re-journal FAILED — see rejournal.sh output"
    fi
  fi
fi

say "reconcile: done"
