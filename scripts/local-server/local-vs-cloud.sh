#!/usr/bin/env bash
# =============================================================================
# How far have the local server and the cloud drifted apart?
# -----------------------------------------------------------------------------
# Once the local server writes to its own database, the two copies diverge. This
# says by how much, per table, so somebody can see it rather than assume it.
#
# It compares ROW COUNTS. That is deliberately crude: it is cheap, it needs no
# schema knowledge, and it answers the only question that matters day to day —
# "is there work on one side that the other has never heard of?". It cannot tell
# you that the same row was EDITED differently in both places. Nothing short of
# a real sync design can, which is exactly why the manual treats bidirectional
# sync as a project rather than a setting.
#
#   ./local-vs-cloud.sh                     every table that differs
#   ./local-vs-cloud.sh --only-local-ahead  just what the cloud is missing
# =============================================================================

set -euo pipefail
APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ONLY_LOCAL_AHEAD=0
[[ "${1:-}" == "--only-local-ahead" ]] && ONLY_LOCAL_AHEAD=1

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; N=$'\e[0m'; else B=""; G=""; Y=""; N=""; fi

read_env_key() {
  local key="$1" file v
  for file in "$APP_DIR/.env.local" "$APP_DIR/.env"; do
    [[ -f "$file" ]] || continue
    v="$(grep -E "^${key}=" "$file" | tail -1 | sed -E "s/^${key}=//; s/^\"//; s/\"$//" || true)"
    [[ -n "$v" ]] && { printf '%s' "$v"; return 0; }
  done
  return 1
}

LOCAL_URL="$(read_env_key DIRECT_URL || true)"
CLOUD_URL="$(read_env_key CLOUD_DIRECT_URL || true)"
[[ -n "$LOCAL_URL" ]] || { echo "no DIRECT_URL found — has setup-local-db.sh been run?" >&2; exit 1; }
[[ -n "$CLOUD_URL" ]] || { echo "no CLOUD_DIRECT_URL found — nothing to compare against." >&2; exit 1; }

# Count every base table in one round trip per side, rather than 185 queries.
counts_sql="
select string_agg(
  format('select %L as t, count(*) as c from %I', table_name, table_name),
  ' union all ')
from information_schema.tables
where table_schema='public' and table_type='BASE TABLE' and table_name <> '_prisma_migrations';"

side_counts() {
  local url="$1" inner
  inner="$(psql "$url" -tAX -c "$counts_sql")" || return 1
  [[ -n "$inner" ]] || return 1
  psql "$url" -tAX -F'|' -c "$inner"
}

echo "${B}Comparing local against the cloud${N}"
LOCAL_OUT="$(side_counts "$LOCAL_URL")" || { echo "could not read the LOCAL database" >&2; exit 1; }
CLOUD_OUT="$(side_counts "$CLOUD_URL")" || {
  echo "${Y}could not read the CLOUD database — internet down?${N}" >&2; exit 1; }

# Join the two sides in awk: table -> local count, cloud count.
printf '%s\n' "$LOCAL_OUT" | sed 's/$/|L/' > /tmp/.orm_cmp_l
printf '%s\n' "$CLOUD_OUT" | sed 's/$/|C/' > /tmp/.orm_cmp_c

awk -F'|' -v only="$ONLY_LOCAL_AHEAD" -v b="$B" -v g="$G" -v y="$Y" -v n="$N" '
  FNR==NR { if ($1 != "") loc[$1]=$2; next }
  { if ($1 != "") cld[$1]=$2 }
  END {
    diff=0; localAhead=0; cloudAhead=0
    printf "%-42s %10s %10s %10s\n", "table", "local", "cloud", "delta"
    for (t in loc) {
      l=loc[t]+0; c=(t in cld ? cld[t]+0 : 0); d=l-c
      if (d == 0) continue
      diff++
      if (d > 0) localAhead++; else cloudAhead++
      if (only && d <= 0) continue
      col = (d > 0 ? y : g)
      printf "%-42s %10d %10d %s%+10d%s\n", t, l, c, col, d, n
    }
    for (t in cld) if (!(t in loc)) { printf "%-42s %10s %10d %s%s%s\n", t, "MISSING", cld[t]+0, y, " table!", n; diff++ }
    if (diff == 0) printf "%sIdentical row counts across every table.%s\n", g, n
    else {
      printf "\n%s%d tables differ%s", b, diff, n
      printf "  (%d ahead locally, %d ahead in the cloud)\n", localAhead, cloudAhead
      if (localAhead > 0) printf "%sRows entered on the local server that the cloud has never seen.%s\n", y, n
    }
  }
' /tmp/.orm_cmp_l /tmp/.orm_cmp_c

rm -f /tmp/.orm_cmp_l /tmp/.orm_cmp_c
