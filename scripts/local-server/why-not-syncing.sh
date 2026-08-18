#!/usr/bin/env bash
# =============================================================================
# Why is this not reaching the other side?
# -----------------------------------------------------------------------------
#   ./why-not-syncing.sh
#
# Answers one question, in the order the answer is usually found: a row was
# entered on one node and cannot be seen on the other — where did it stop?
#
# There are only five places it can stop, and this walks them in order, because
# checking them out of order is how an afternoon disappears:
#
#   1. Capture      the change was never recorded for sending
#   2. Push         it was recorded but never left this node
#   3. Apply        it arrived and the far side refused it
#   4. Policy       the table is not classified, so it never syncs at all
#   5. Backfill     it predates capture and will never travel on its own
#
# Read only. It changes nothing on either database.
# =============================================================================

set -uo pipefail
APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
else B=""; G=""; Y=""; R=""; N=""; fi
ok()   { echo "  ${G}ok${N}    $*"; }
warn() { echo "  ${Y}warn${N}  $*"; }
bad()  { echo "  ${R}FAIL${N}  $*"; }

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

U="$(libpq "$(read_env_key DATABASE_URL || true)")"
C="$(libpq "$(read_env_key CLOUD_DIRECT_URL || true)")"
[[ -n "$U" ]] || { echo "no DATABASE_URL found." >&2; exit 1; }

echo
echo "${B}0. Is the worker even running?${N}"
if systemctl is-active --quiet orm-sync 2>/dev/null; then
  ok "orm-sync is active since $(systemctl show orm-sync -p ActiveEnterTimestamp --value 2>/dev/null)"
else
  bad "orm-sync is NOT running. Nothing moves in either direction until it is."
  echo "        sudo systemctl start orm-sync"
fi

echo
echo "${B}1. Capture — are local changes being recorded to send?${N}"
psql "$U" -X -tAc "select node_id || '  capture_enabled=' || capture_enabled from sync_node;" 2>/dev/null \
  | sed 's/^/  /' || bad "sync tables missing — has the migration been applied?"

echo "  Tables WITH capture attached:"
psql "$U" -X -tAc "
  select count(*) from pg_trigger where tgname = 'zz_sync_capture' and not tgisinternal;" 2>/dev/null | sed 's/^/    /'

echo "  Booking-critical tables, and whether they capture here:"
psql "$U" -X -c "
  select t.name as table_name,
         case when exists (
           select 1 from pg_trigger g
            where g.tgname = 'zz_sync_capture' and g.tgrelid = to_regclass(t.name)
         ) then 'yes' else 'NO — will never sync' end as captures
    from (values ('surgeries'),('patients'),('users'),
                 ('surgery_consumable_requests'),('surgery_drug_dressing_requests'),
                 ('surgical_consumable_templates'),('surgical_drug_dressing_templates')
         ) as t(name);" 2>/dev/null

echo
echo "${B}2. Push — is anything stuck in the outbound queue?${N}"
psql "$U" -X -c "
  select count(*) as total,
         count(*) filter (where ack_at is null) as unsent,
         min(created_at) filter (where ack_at is null) as oldest_unsent
    from sync_journal;" 2>/dev/null

echo "  What is waiting, by table:"
psql "$U" -X -c "
  select table_name, count(*) as waiting
    from sync_journal where ack_at is null
   group by table_name order by 2 desc limit 10;" 2>/dev/null

echo "  Link state:"
psql "$U" -X -x -c "
  select peer_node, last_push_ok_at, last_pull_ok_at, consecutive_errors,
         left(coalesce(last_error,'(none)'),200) as last_error
    from sync_state;" 2>/dev/null

echo
echo "${B}3. Apply — is the far side refusing what we send?${N}"
if [[ -n "$C" ]]; then
  echo "  Parked on the CLOUD (rows we sent that it could not insert):"
  psql "$C" -X -c "
    select table_name, count(*) as parked, left(last_error, 140) as reason
      from sync_deferred where resolved_at is null
     group by table_name, left(last_error,140) order by 2 desc limit 10;" 2>/dev/null \
    || warn "could not read the cloud — no internet from this box?"

  echo "  Parked LOCALLY (rows the cloud sent that we could not insert):"
  psql "$U" -X -c "
    select table_name, count(*) as parked, left(last_error, 140) as reason
      from sync_deferred where resolved_at is null
     group by table_name, left(last_error,140) order by 2 desc limit 10;" 2>/dev/null
else
  warn "no CLOUD_DIRECT_URL, so the far side cannot be inspected from here."
fi

echo
echo "${B}4. Divergence — what each side holds${N}"
if [[ -n "$C" ]]; then
  for t in surgeries patients users surgery_consumable_requests surgery_drug_dressing_requests; do
    l="$(psql "$U" -X -tAc "select count(*) from \"$t\";" 2>/dev/null || echo '?')"
    c="$(psql "$C" -X -tAc "select count(*) from \"$t\";" 2>/dev/null || echo '?')"
    printf '  %-34s local %-8s cloud %-8s' "$t" "$l" "$c"
    if [[ "$l" == "$c" ]]; then echo "${G}same${N}"
    elif [[ "$l" == "?" || "$c" == "?" ]]; then echo "${Y}unreadable${N}"
    elif [[ "$l" -gt "$c" ]]; then echo "${Y}$((l - c)) here that the cloud has not got${N}"
    else echo "${Y}$((c - l)) in the cloud that we have not got${N}"
    fi
  done
fi

echo
echo "${B}5. Conflicts waiting for a person${N}"
psql "$U" -X -c "select status, count(*) from sync_conflicts group by status;" 2>/dev/null

echo
echo "${B}How to read this${N}"
echo "  'NO — will never sync' at step 1   the table is not captured. Apply migrations."
echo "  a large, OLD unsent count at 2     the link is down, or the token is rejected."
echo "  rows parked at step 3              the far side refused them; the reason names"
echo "                                     the constraint, and it is almost always a"
echo "                                     parent row that never travelled."
echo "  counts differ but nothing parked   those rows predate capture. Backfill them."
echo
