#!/usr/bin/env bash
# =============================================================================
# Do the two sides hold the same catalogue item under two different ids?
# -----------------------------------------------------------------------------
#   ./compare-catalogue-ids.sh            report. Writes nothing, ever.
#
# WHY THIS EXISTS
#
# local-vs-cloud.sh compares ROW COUNTS, which is cheap and answers "is there
# work one side has never heard of". It cannot answer the question that matters
# when a catalogue is loaded on one node: the two sides may hold the SAME item
# — same category, same name, same size, same brand — under two different
# primary keys. Counts look close. Nothing parks. And every child row that
# references the item by id is stranded, because the id it names exists on only
# one side.
#
# That is what strands surgery_special_needs and magnitude_bundle_items: they
# park on a foreign key whose parent travelled, but travelled as a different
# row.
#
# A row-count comparison cannot see it, a sync report cannot see it, and
# ON CONFLICT DO NOTHING hides it — a colliding row is skipped in silence, so
# the push looks clean and the divergence is permanent. Hence a script whose
# whole job is to count the overlap by NATURAL key rather than by id.
#
# IT IS READ ONLY. There is no --apply and there is no write path. It opens
# both databases, reads five columns from one table, and prints arithmetic.
# =============================================================================

set -euo pipefail
APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
# The natural key differs per table, so this knows the ones it knows and
# says so about the rest. The argument used to accept anything and then
# fail inside Postgres with "column i.category does not exist", which reads
# as a broken database rather than a question the script cannot answer.
TABLE="${1:-special_need_items}"
case "$TABLE" in
  special_need_items)
    KEY_SQL="lower(btrim(coalesce(i.category::text, ''))) || '|' ||
       lower(btrim(coalesce(i.name, '')))           || '|' ||
       lower(btrim(coalesce(i.size, '')))           || '|' ||
       lower(btrim(coalesce(i.brand, '')))" ;;
  magnitude_bundle_items)
    KEY_SQL="lower(btrim(coalesce(i.magnitude::text, ''))) || '|' ||
       lower(btrim(coalesce(i.\"itemId\", '')))" ;;
  *)
    echo "I do not know what makes a row of ${TABLE} the same thing twice." >&2
    echo "Known: special_need_items, magnitude_bundle_items." >&2
    echo "Add its natural key to this script rather than guessing one." >&2
    exit 2 ;;
esac

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
[[ -n "$LOCAL_URL" ]] || { echo "no DATABASE_URL found." >&2; exit 1; }
[[ -n "$CLOUD_URL" ]] || { echo "no CLOUD_DIRECT_URL found." >&2; exit 1; }

WORK="$(mktemp -d /tmp/.orm_keycmp.XXXXXX)"; chmod 700 "$WORK"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

# The natural key, spelled the same way on both sides: lower-cased, trimmed,
# nulls folded to empty so that NULL size and '' size are one thing rather
# than two. Tab separates the id from the key because a tab cannot occur in
# any of these columns.
read -r -d '' SQL <<SQL || true
select i.id || E'\t' || ${KEY_SQL}
  from "${TABLE}" i
SQL

echo
echo "${B}Same item, different id? — ${TABLE}${N}"
echo "${Y}Read only. Nothing is written.${N}"
echo

psql "$LOCAL_URL" -tAX -c "$SQL" | sort -t"$(printf '\t')" -k2 > "$WORK/local.tsv" \
  || { echo "${R}could not read the local database${N}" >&2; exit 1; }
psql "$CLOUD_URL" -tAX -c "$SQL" | sort -t"$(printf '\t')" -k2 > "$WORK/cloud.tsv" \
  || { echo "${R}could not read the cloud database${N}" >&2; exit 1; }

awk -F'\t' '
  NR == FNR { lid[$2] = $1; ln++; next }
  {
    cn++
    if ($2 in lid) {
      if (lid[$2] == $1) same++
      else {
        differ++
        if (differ <= 10) examples[differ] = $2
      }
      seen[$2] = 1
    } else cloudonly++
  }
  END {
    for (k in lid) if (!(k in seen)) localonly++
    printf "  rows here              : %d\n", ln
    printf "  rows in the cloud      : %d\n", cn
    printf "\n"
    printf "  same item, SAME id     : %d\n", same + 0
    printf "  same item, DIFFERENT id: %d   <-- the stranded ones\n", differ + 0
    printf "  only here              : %d\n", localonly + 0
    printf "  only in the cloud      : %d\n", cloudonly + 0
    if (differ > 0) {
      printf "\n  first few:\n"
      for (i = 1; i <= (differ < 10 ? differ : 10); i++) printf "    %s\n", examples[i]
    }
  }
' "$WORK/local.tsv" "$WORK/cloud.tsv"

echo
echo "How to read this"
echo "  DIFFERENT id > 0   the same item exists on both sides as two rows. Every"
echo "                     child row naming it by id can only apply on one side."
echo "                     Counts and sync reports both look healthy."
echo "  only here > 0      rows this node created that the cloud has not got, or"
echo "                     could not insert because they collided on a unique index."
echo
