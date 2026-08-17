#!/usr/bin/env bash
# =============================================================================
# Seed rows the cloud has and the local server never received.
# -----------------------------------------------------------------------------
# Capture journals FUTURE changes only. Rows written before a table's trigger
# was attached were never journaled, so no amount of waiting will bring them
# down — they have to be copied once. That is what this does.
#
#   ./backfill-from-cloud.sh                 report what is missing, copy nothing
#   ./backfill-from-cloud.sh --apply         actually copy it
#   ./backfill-from-cloud.sh --apply patients surgeries
#
# It reports by default and requires --apply to write, because "run it and see"
# is not a thing to do to a theatre database.
#
# THREE RULES IT ENFORCES
#
#   Insert-only. Every statement is INSERT ... ON CONFLICT DO NOTHING, with no
#   conflict target, so a row that already exists — or that would collide on
#   any unique index — is skipped rather than overwritten. Nothing this script
#   does can change a row that is already here, and running it twice is a
#   no-op.
#
#   Capture stays off for the copy. These rows already exist in the cloud. With
#   the trigger live, seeding them would journal them straight back up and the
#   cloud would spend a cycle deciding what to do about news it already has.
#   The trigger is disabled and re-enabled inside the SAME transaction, so it
#   is never off for a moment that another connection can observe.
#
#   Column parity is checked first. A copy between tables whose columns have
#   drifted apart puts values in the wrong fields, and for `patients` that is a
#   blood group landing in an allergy column. It refuses rather than guesses.
#
# ORDER MATTERS. Tables are copied in the order given, and the default order is
# parents before children: a surgery whose patient is not here yet fails its
# foreign key. Keep patients ahead of surgeries.
# =============================================================================

set -euo pipefail
APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

APPLY=0
TABLES=()
for a in "$@"; do
  case "$a" in
    --apply) APPLY=1 ;;
    -*) echo "unknown option: $a" >&2; exit 2 ;;
    *) TABLES+=("$a") ;;
  esac
done

# Parents first. Deliberately excludes the log tables (audit_logs,
# notifications, radio_announcements): they are historical records of things
# that already happened, nobody reads a two-week-old notification, and copying
# hundreds of them only makes the next comparison harder to read.
if [[ ${#TABLES[@]} -eq 0 ]]; then
  TABLES=(patients surgeries theatre_allocations)
fi

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
else B=""; G=""; Y=""; R=""; N=""; fi

read_env_key() {
  local key="$1" file v
  for file in "$APP_DIR/.env.local" "$APP_DIR/.env"; do
    [[ -f "$file" ]] || continue
    v="$(grep -E "^${key}=" "$file" | tail -1 | sed -E "s/^${key}=//; s/^\"//; s/\"$//" || true)"
    [[ -n "$v" ]] && { printf '%s' "$v"; return 0; }
  done
  return 1
}

# Prisma URLs carry parameters libpq rejects; strip them or psql fails before
# it opens a socket and it reads as a database being down.
libpq_url() {
  printf '%s' "$1" \
    | sed -E 's/([?&])(schema|connection_limit|pgbouncer|pool_timeout|socket_timeout)=[^&]*/\1/g' \
    | sed -E 's/\?&+/?/; s/&&+/\&/g; s/[?&]$//'
}

LOCAL_URL="$(libpq_url "$(read_env_key DATABASE_URL || true)")"
CLOUD_URL="$(libpq_url "$(read_env_key CLOUD_DIRECT_URL || true)")"
[[ -n "$LOCAL_URL" ]] || { echo "no DATABASE_URL found — has setup-local-db.sh been run?" >&2; exit 1; }
[[ -n "$CLOUD_URL" ]] || { echo "no CLOUD_DIRECT_URL found — nothing to copy from." >&2; exit 1; }

case "$LOCAL_URL" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "${R}DATABASE_URL is not local.${N} This script writes to the LOCAL database;
   pointed at the cloud it would copy the cloud onto itself." >&2; exit 1 ;;
esac

# Exported rows are patient-identifying. Keep them unreadable to other users
# and destroy them on the way out, however this exits.
WORK="$(mktemp -d /tmp/.orm_backfill.XXXXXX)"; chmod 700 "$WORK"
cleanup() {
  if [[ -d "$WORK" ]]; then
    find "$WORK" -type f -exec shred -u {} + 2>/dev/null || true
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

count() { psql "$1" -tAX -c "select count(*) from \"$2\";" 2>/dev/null || echo "?"; }
columns() {
  psql "$1" -tAX -c \
    "select string_agg(column_name, ',' order by ordinal_position)
       from information_schema.columns
      where table_schema='public' and table_name='$2';" 2>/dev/null
}

echo
echo "${B}Backfilling the local server from the cloud${N}"
[[ $APPLY -eq 1 ]] || echo "${Y}Report only. Nothing will be written. Pass --apply to copy.${N}"
echo

TOTAL_SEEDED=0
for t in "${TABLES[@]}"; do
  L="$(count "$LOCAL_URL" "$t")"; C="$(count "$CLOUD_URL" "$t")"
  if [[ "$L" == "?" || "$C" == "?" ]]; then
    echo "${R}skip${N}  $t — not readable on one side"; continue
  fi

  printf '%-24s local %-8s cloud %-8s ' "$t" "$L" "$C"
  if [[ "$C" -le "$L" ]]; then echo "${G}nothing to bring down${N}"; continue; fi
  echo "${Y}$((C - L)) missing${N}"

  LC="$(columns "$LOCAL_URL" "$t")"; CC="$(columns "$CLOUD_URL" "$t")"
  if [[ "$LC" != "$CC" ]]; then
    echo "      ${R}REFUSED: the columns differ between the two databases.${N}"
    echo "      Copying between mismatched tables writes values into the wrong fields."
    continue
  fi

  [[ $APPLY -eq 1 ]] || continue

  CSV="$WORK/$t.csv"
  psql "$CLOUD_URL" -X -q -c "\copy (select * from \"$t\") to '$CSV' with (format csv)"

  # One transaction: capture off, copy in, capture on. ALTER TABLE is
  # transactional in Postgres, so the trigger is never observably absent.
  psql "$LOCAL_URL" -X -q -v ON_ERROR_STOP=1 <<SQL
begin;
do \$\$ begin
  if exists (select 1 from pg_trigger
              where tgname = 'zz_sync_capture' and tgrelid = '"$t"'::regclass) then
    execute 'alter table "$t" disable trigger zz_sync_capture';
  end if;
end \$\$;

create temporary table seed_rows (like "$t" including defaults) on commit drop;
\copy seed_rows from '$CSV' with (format csv)
insert into "$t" select * from seed_rows on conflict do nothing;

do \$\$ begin
  if exists (select 1 from pg_trigger
              where tgname = 'zz_sync_capture' and tgrelid = '"$t"'::regclass) then
    execute 'alter table "$t" enable trigger zz_sync_capture';
  end if;
end \$\$;
commit;
SQL

  AFTER="$(count "$LOCAL_URL" "$t")"
  GAINED=$((AFTER - L))
  TOTAL_SEEDED=$((TOTAL_SEEDED + GAINED))
  echo "      ${G}seeded $GAINED${N}  (local now $AFTER, cloud $C)"
  if [[ "$AFTER" -lt "$C" ]]; then
    echo "      ${Y}still $((C - AFTER)) short — those rows were skipped by a unique"
    echo "      constraint, which means they exist here under a different id.${N}"
  fi
done

echo
if [[ $APPLY -eq 1 ]]; then
  echo "${B}Seeded $TOTAL_SEEDED rows.${N}"
  echo "Run ./local-vs-cloud.sh to see what remains."
else
  echo "Re-run with ${B}--apply${N} to copy."
fi
