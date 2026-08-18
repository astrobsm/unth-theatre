#!/usr/bin/env bash
# =============================================================================
# Apply pending migrations to a database, safely.
# -----------------------------------------------------------------------------
#   ./apply-migrations.sh                 # the LOCAL database, from .env.local
#   ./apply-migrations.sh --dry-run       # say what would happen, change nothing
#
# Uses `prisma migrate deploy`, which applies the migration FILES in
# prisma/migrations and nothing else.
#
# It is NOT `prisma migrate diff`. That command compares the database against
# schema.prisma and invents statements for anything it cannot see — and it
# generated DROP TABLE for all seven sync tables plus DROP COLUMN for the sync
# metadata on 27 tables, because those are created in SQL. Never pipe the
# output of migrate diff anywhere without reading it.
#
# Migrations applied by hand with psql are not recorded in _prisma_migrations,
# so deploy would try them again and fail on "already exists". Those are marked
# resolved first, which records them without re-running them.
# =============================================================================

set -euo pipefail

APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$APP_DIR"
DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
else B=""; G=""; Y=""; R=""; N=""; fi
ok()  { echo "  ${G}ok${N}   $*"; }
die() { echo; echo "${R}FAILED${N}  $*" >&2; exit 1; }

DB="$(grep -E '^DATABASE_URL=' .env.local 2>/dev/null | tail -1 | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')"
[[ -n "$DB" ]] || die "no DATABASE_URL in .env.local"
PSQL_DB="${DB%%\?*}"

case "$DB" in
  *localhost*|*127.0.0.1*) ok "target: local database" ;;
  *) if [[ "${ORM_CONFIRM_REMOTE:-}" != "yes" ]]; then
       die "DATABASE_URL is REMOTE. Migrating the cloud from this machine is
        probably not what you meant. Set ORM_CONFIRM_REMOTE=yes if it is."
     fi
     echo "  ${Y}note${N} target is REMOTE, confirmed by ORM_CONFIRM_REMOTE" ;;
esac

# ---------------------------------------------------------------------------
# The .env / .env.local trap
# ---------------------------------------------------------------------------
# This script reads .env.local and correctly targets the theatre database. The
# PRISMA CLI does not: it reads .env. On 18 August that difference meant
# `npm run build` on the theatre server ran `prisma migrate deploy` against
# Supabase — the production cloud — and was stopped only by the network being
# unable to reach the pooler. `build:local` would have been worse still, since
# it runs `prisma db push --accept-data-loss`.
#
# So it is said out loud here, where somebody about to run migrations will see
# it, rather than left to be discovered by whichever command succeeds first.
if [[ -f "$APP_DIR/.env" ]]; then
  ENV_DB="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | tail -1 | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//' || true)"
  case "$ENV_DB" in
    ''|*localhost*|*127.0.0.1*) ;;
    *)
      echo
      echo "  ${R}WARNING${N} .env points DATABASE_URL at a REMOTE database, .env.local at the local one."
      echo "          Every prisma CLI command on this box reads .env, so it targets the CLOUD:"
      echo "            npm run build        runs 'prisma migrate deploy' against the cloud"
      echo "            npm run build:local  runs 'prisma db push --accept-data-loss' against it"
      echo "          On this server build with:  ${B}npm run build:server${N}  (generate + next build, no migrations)"
      echo "          Migrations here are this script's job, and it uses .env.local."
      echo
      ;;
  esac
fi

command -v psql >/dev/null || die "psql not found"
psql "$PSQL_DB" -tAXc 'select 1' >/dev/null 2>&1 || die "cannot reach the database"

echo; echo "${B}Migrations already recorded${N}"
RECORDED="$(psql "$PSQL_DB" -tAXc \
  "select migration_name from _prisma_migrations where finished_at is not null and rolled_back_at is null" \
  2>/dev/null | tr -d '\r' || true)"
echo "  $(printf '%s\n' "$RECORDED" | grep -c . || echo 0) recorded"

# A migration whose objects are already present, because it was applied by
# hand. Marking it resolved records it WITHOUT running it, which is the only
# way deploy can proceed past it.
echo; echo "${B}Checking for migrations applied by hand${N}"
declare -a RESOLVE=()
for dir in prisma/migrations/*/; do
  name="$(basename "$dir")"
  [[ "$name" == "migration_lock.toml" ]] && continue
  [[ -f "$dir/migration.sql" ]] || continue
  printf '%s\n' "$RECORDED" | grep -qx "$name" && continue

  # Probe: does something this migration creates already exist? Only tables are
  # checked, which is enough to tell "applied by hand" from "never applied".
  first_table="$(grep -oE 'CREATE TABLE (IF NOT EXISTS )?"?[a-z_]+"?' "$dir/migration.sql" \
                  | head -1 | grep -oE '[a-z_]+$' || true)"
  if [[ -n "$first_table" ]]; then
    exists="$(psql "$PSQL_DB" -tAXc "select to_regclass('public.$first_table') is not null" 2>/dev/null | tr -d '[:space:]')"
    if [[ "$exists" == "t" ]]; then
      echo "  ${Y}already present${N}  $name  (creates \"$first_table\")"
      RESOLVE+=("$name")
      continue
    fi
  fi
  echo "  pending          $name"
done

if [[ $DRY == 1 ]]; then
  echo; echo "Dry run. ${#RESOLVE[@]} would be marked resolved, then 'prisma migrate deploy' would run."
  exit 0
fi

for name in "${RESOLVE[@]:-}"; do
  [[ -n "$name" ]] || continue
  DATABASE_URL="$DB" DIRECT_URL="$DB" npx prisma migrate resolve --applied "$name" >/dev/null \
    && ok "recorded as applied (not re-run): $name"
done

echo; echo "${B}Applying pending migrations${N}"
DATABASE_URL="$DB" DIRECT_URL="$DB" npx prisma migrate deploy 2>&1 | sed 's/^/  /'

echo; echo "${B}Verifying${N}"
FAILED="$(psql "$PSQL_DB" -tAXc \
  "select count(*) from _prisma_migrations where finished_at is null" | tr -d '[:space:]')"
[[ "$FAILED" == "0" ]] || echo "  ${Y}note${N} $FAILED migration(s) recorded as unfinished; check _prisma_migrations"

# The sync layer is the thing most likely to have been damaged if something
# went wrong, and the thing whose absence is least obvious.
SYNC="$(psql "$PSQL_DB" -tAXc \
  "select count(*) from information_schema.tables where table_schema='public' and table_name like 'sync\\_%'" \
  | tr -d '[:space:]')"
if [[ "$SYNC" -ge 7 ]]; then ok "sync layer intact ($SYNC tables)"
else echo "  ${R}sync layer has $SYNC tables, expected 7 or more.${N} Check before starting the worker."; fi

ok "done"
