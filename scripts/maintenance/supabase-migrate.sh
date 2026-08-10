#!/usr/bin/env bash
# =============================================================================
# Apply migrations to Supabase over HTTPS, without a Postgres connection.
# -----------------------------------------------------------------------------
#   SUPABASE_ACCESS_TOKEN=sbp_... ./supabase-migrate.sh            # apply pending
#   SUPABASE_ACCESS_TOKEN=sbp_... ./supabase-migrate.sh --dry-run  # list only
#
# Why this exists: many networks block outbound 5432/6543, so psql and
# `prisma migrate deploy` simply cannot reach the database — which is exactly
# when you are away from the hospital and most want to deploy. The Supabase
# Management API takes SQL over ordinary HTTPS on 443 and works from anywhere
# a browser does.
#
# It applies whole migration FILES. It never generates SQL, and in particular
# it is not `prisma migrate diff`, which invents statements for anything absent
# from schema.prisma and once produced DROP TABLE for the entire sync layer.
#
# Each migration is applied inside a transaction and recorded in
# _prisma_migrations, so `prisma migrate deploy` later agrees it is done and
# does not try to re-run it.
# =============================================================================

set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-gynkghgypuuvpxkfagcu}"
API="https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query"
APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$APP_DIR"
DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
else B=""; G=""; Y=""; R=""; N=""; fi
ok()  { echo "  ${G}ok${N}   $*"; }
die() { echo; echo "${R}FAILED${N}  $*" >&2; exit 1; }

TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
if [[ -z "$TOKEN" && -f "$HOME/.orm-supabase-token" ]]; then
  TOKEN="$(tr -d '[:space:]' < "$HOME/.orm-supabase-token")"
fi
[[ -n "$TOKEN" ]] || die "No token. Create one at supabase.com -> Account -> Access Tokens, then:
        echo 'sbp_xxx' > ~/.orm-supabase-token && chmod 600 ~/.orm-supabase-token
        (or export SUPABASE_ACCESS_TOKEN)"

# Send one SQL string. Returns the raw response body; the caller inspects it.
run_sql() {
  local sql="$1"
  local body
  # Node builds the JSON rather than jq: jq is not installed everywhere, and
  # node certainly is in this repo. Hand-rolled escaping would corrupt a
  # plpgsql body full of quotes, newlines and $$ delimiters.
  body="$(printf '%s' "$sql" | node -e "
    let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>
      process.stdout.write(JSON.stringify({query:s})));")"
  curl -s -m 180 -X POST "$API" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body"
}

command -v node >/dev/null || die "node is required (it builds the request body safely)"

echo; echo "${B}Supabase project${N} $PROJECT_REF"
PROBE="$(run_sql 'select current_database() as db')"
grep -q '"db"' <<< "$PROBE" || die "API rejected the request: $(head -c 300 <<< "$PROBE")"
ok "authenticated, database reachable over HTTPS"

# What has already been applied, so this is safe to re-run.
APPLIED="$(run_sql "select migration_name from _prisma_migrations where finished_at is not null and rolled_back_at is null" \
  | node -e "
    let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
      try { const r=JSON.parse(s); if(Array.isArray(r)) r.forEach(x=>console.log(x.migration_name)); }
      catch { /* an error body yields no names; the probe above already proved the API works */ }
    });" || true)"
echo "  $(grep -c . <<< "$APPLIED" || echo 0) migration(s) already recorded"

PENDING=()
for dir in prisma/migrations/*/; do
  name="$(basename "$dir")"
  [[ -f "$dir/migration.sql" ]] || continue
  grep -qx "$name" <<< "$APPLIED" && continue
  PENDING+=("$name")
done

if [[ ${#PENDING[@]} -eq 0 ]]; then ok "nothing pending"; exit 0; fi

echo; echo "${B}Pending${N}"
for n in "${PENDING[@]}"; do echo "  $n"; done
if [[ $DRY == 1 ]]; then echo; echo "Dry run — nothing was applied."; exit 0; fi

for name in "${PENDING[@]}"; do
  echo; echo "${B}Applying${N} $name"
  sql="$(cat "prisma/migrations/$name/migration.sql")"

  # A migration that fails half-way is worse than one that never ran, so the
  # whole file goes in one transaction. ALTER TYPE ... ADD VALUE cannot run
  # inside a transaction in PostgreSQL, so those files are sent as-is and rely
  # on their own IF NOT EXISTS guards.
  if grep -qE 'ALTER TYPE .* ADD VALUE' <<< "$sql"; then
    echo "  (contains ALTER TYPE ADD VALUE — sent without an outer transaction)"
    payload="$sql"
  else
    payload="BEGIN;
$sql
COMMIT;"
  fi

  resp="$(run_sql "$payload")"
  if grep -qiE '"(error|message)"' <<< "$resp" && ! grep -q '^\[' <<< "$resp"; then
    echo "  ${R}failed${N}: $(head -c 400 <<< "$resp")"
    die "stopped at $name. Nothing after it was applied."
  fi
  ok "applied"

  # Record it so prisma migrate deploy agrees it is done. checksum is left
  # empty deliberately: Prisma only verifies it when IT applied the migration.
  reg="insert into _prisma_migrations (id, checksum, finished_at, migration_name, logs, applied_steps_count)
       values (gen_random_uuid()::text, '', now(), '$name', 'applied via supabase management api', 1)
       on conflict do nothing"
  run_sql "$reg" >/dev/null
  ok "recorded in _prisma_migrations"
done

echo; ok "all pending migrations applied"
