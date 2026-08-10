#!/usr/bin/env bash
# =============================================================================
# Put the ORM database on the local server, and make sign-in work there.
# -----------------------------------------------------------------------------
# Run this ON THE LOCAL SERVER (Ubuntu). It is idempotent: run it again after an
# outage, after a reboot, or to refresh the data, and it will do the right thing.
#
# THE TWO FAULTS THIS FIXES
#
#   1. The local server's DATABASE_URL points at Supabase. When the hospital
#      internet is down, Prisma cannot reach aws-1-eu-west-1.pooler.supabase.com
#      and every sign-in fails with "Can't reach database server". A local
#      database removes the dependency entirely and is far faster on the LAN.
#
#   2. NEXTAUTH_URL is set to the Vercel address. NextAuth builds its callback
#      and cookie against that value, so on http://<lan-ip>:3000 the credentials
#      callback returns 401 EVEN WITH A WORKING DATABASE. Both faults produce a
#      failed login, which is why fixing one alone looks like no progress.
#
# WHY IT CLONES RATHER THAN REPLAYS MIGRATIONS
#
# `prisma migrate deploy` would build a schema from the 67 migration folders.
# The live database has drifted from those folders (some columns differ in their
# defaults), and its migration history contains a migration that failed twice
# before succeeding. Replaying is therefore NOT guaranteed to reproduce what the
# application is actually running against.
#
# So this takes the live schema AND data with pg_dump. The public schema was
# checked and contains only tables — no functions, views, RLS policies,
# triggers, or extension-dependent column defaults — so the dump restores into
# a vanilla PostgreSQL with nothing Supabase-specific left behind.
#
# WHAT IT DELIBERATELY DOES NOT DO
#
# It does not sync local writes back to the cloud. From the moment the local
# server writes to its own database, the two databases DIVERGE. Deciding which
# one is authoritative is a hospital decision, not a script's — see
# docs/manuals/hybrid-deployment.md, "Stage 2". Use ./local-vs-cloud.sh to see
# how far apart they are.
# =============================================================================

set -euo pipefail

# ---- Settings ---------------------------------------------------------------
DB_NAME="${ORM_DB_NAME:-orm}"
DB_USER="${ORM_DB_USER:-orm}"
MIN_PG_MAJOR=17           # the cloud runs 17.6; pg_dump must be >= the server
APP_DIR_DEFAULT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="${ORM_APP_DIR:-$APP_DIR_DEFAULT}"

ORIGIN_URL=""             # --url http://192.168.88.252:3000
DRY_RUN=0
SKIP_DATA=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) ORIGIN_URL="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --skip-data) SKIP_DATA=1; shift ;;   # schema+env only, keep existing rows
    -h|--help)
      sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

# ---- Output -----------------------------------------------------------------
if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
else B=""; G=""; Y=""; R=""; N=""; fi
step() { echo; echo "${B}==> $*${N}"; }
ok()   { echo "  ${G}ok${N}   $*"; }
warn() { echo "  ${Y}note${N} $*"; }
die()  { echo; echo "${R}FAILED${N}  $*" >&2; exit 1; }
run()  { if [[ $DRY_RUN == 1 ]]; then echo "  would run: $*"; else "$@"; fi; }

# =============================================================================
step "Checking where we are"
# =============================================================================
[[ -f "$APP_DIR/package.json" ]] || die "no package.json in $APP_DIR — set ORM_APP_DIR to the app directory"
[[ -f "$APP_DIR/prisma/schema.prisma" ]] || die "no prisma/schema.prisma in $APP_DIR"
ok "app directory: $APP_DIR"

command -v sudo >/dev/null || die "sudo is required"
sudo -n true 2>/dev/null || warn "sudo may prompt for your password"

# The origin users actually type. NextAuth must agree with it exactly, or the
# credentials callback 401s no matter how healthy the database is.
if [[ -z "$ORIGIN_URL" ]]; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [[ -n "$LAN_IP" ]] || die "could not detect a LAN IP — pass --url http://<ip>:3000"
  ORIGIN_URL="http://${LAN_IP}:3000"
  warn "no --url given, using detected $ORIGIN_URL"
fi
[[ "$ORIGIN_URL" =~ ^https?://[^/]+$ ]] || die "--url must look like http://192.168.88.252:3000 (no trailing path)"
ok "app origin: $ORIGIN_URL"

# =============================================================================
step "Reading the current configuration"
# =============================================================================
# The cloud URLs may already have been moved to CLOUD_* by a previous run, so
# look there first and fall back to the originals. Never printed: they contain
# the database password.
# Prisma URLs may carry parameters libpq rejects — "?schema=public" makes any
# libpq tool fail with `invalid URI query parameter: "schema"` before it opens a
# socket. pg_dump is a libpq tool, so the cloud URL goes through this first.
# Only Prisma-only keys are removed; sslmode and friends are left alone.
libpq_url() {
  printf '%s' "$1" \
    | sed -E 's/([?&])(schema|connection_limit|pgbouncer|pool_timeout|socket_timeout)=[^&]*/\1/g' \
    | sed -E 's/\?&+/?/; s/&&+/\&/g; s/[?&]$//'
}

read_env_key() {
  local key="$1" file
  for file in "$APP_DIR/.env.local" "$APP_DIR/.env"; do
    [[ -f "$file" ]] || continue
    local v
    v="$(grep -E "^${key}=" "$file" | tail -1 | sed -E "s/^${key}=//; s/^\"//; s/\"$//" || true)"
    [[ -n "$v" ]] && { printf '%s' "$v"; return 0; }
  done
  return 1
}

CLOUD_DIRECT="$(read_env_key CLOUD_DIRECT_URL || read_env_key DIRECT_URL || true)"
CLOUD_POOLED="$(read_env_key CLOUD_DATABASE_URL || read_env_key DATABASE_URL || true)"
NEXTAUTH_SECRET_VAL="$(read_env_key NEXTAUTH_SECRET || true)"

# Only treat it as a cloud URL if it is not already pointing at this machine.
if [[ "$CLOUD_DIRECT" == *"localhost"* || "$CLOUD_DIRECT" == *"127.0.0.1"* ]]; then CLOUD_DIRECT=""; fi
if [[ "$CLOUD_POOLED" == *"localhost"* || "$CLOUD_POOLED" == *"127.0.0.1"* ]]; then CLOUD_POOLED=""; fi

[[ -n "$NEXTAUTH_SECRET_VAL" ]] || die "NEXTAUTH_SECRET not found in .env.local or .env — sign-in cannot work without it"
ok "NEXTAUTH_SECRET found"
if [[ -n "$CLOUD_DIRECT" ]]; then ok "cloud database URL found (kept for refreshes)"
else warn "no cloud URL found — can only work with data already held locally"; fi

# =============================================================================
step "Installing PostgreSQL if it is not here"
# =============================================================================
pg_major() { local v; v="$(${1} --version 2>/dev/null | grep -oE '[0-9]+' | head -1)"; echo "${v:-0}"; }

if ! command -v psql >/dev/null; then
  ok "installing postgresql (this is the only step that needs the internet for packages)"
  run sudo apt-get update -qq
  run sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-client
else
  ok "postgresql already installed"
fi

if [[ $DRY_RUN == 0 ]]; then
  DUMP_MAJOR="$(pg_major pg_dump)"
  if (( DUMP_MAJOR < MIN_PG_MAJOR )); then
    warn "pg_dump is major $DUMP_MAJOR but the cloud runs $MIN_PG_MAJOR — adding the PostgreSQL apt repository"
    run sudo apt-get install -y -qq curl ca-certificates gnupg lsb-release
    run sudo install -d /usr/share/postgresql-common/pgdg
    run sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      https://www.postgresql.org/media/keys/ACCC4CF8.asc
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
      | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
    run sudo apt-get update -qq
    run sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
      "postgresql-${MIN_PG_MAJOR}" "postgresql-client-${MIN_PG_MAJOR}"
    export PATH="/usr/lib/postgresql/${MIN_PG_MAJOR}/bin:$PATH"
    ok "using PostgreSQL ${MIN_PG_MAJOR} client from PGDG"
  else
    ok "pg_dump major $DUMP_MAJOR is new enough for the cloud's $MIN_PG_MAJOR"
  fi
fi

run sudo systemctl enable --now postgresql
if [[ $DRY_RUN == 0 ]]; then
  pg_isready -q || die "postgresql is installed but not accepting connections"
  ok "postgresql is accepting connections"
fi

# =============================================================================
step "Creating the database and its role"
# =============================================================================
psql_su() { sudo -u postgres psql -v ON_ERROR_STOP=1 -tAX "$@"; }

# Reuse the existing password on a re-run: regenerating it would silently
# invalidate the URL in a .env the operator may have copied elsewhere.
EXISTING_LOCAL_URL="$(read_env_key DATABASE_URL || true)"
DB_PASS=""
if [[ "$EXISTING_LOCAL_URL" == *"localhost"* ]]; then
  DB_PASS="$(printf '%s' "$EXISTING_LOCAL_URL" | sed -E 's#^postgresql://[^:]+:([^@]*)@.*#\1#')"
  [[ -n "$DB_PASS" ]] && ok "reusing the existing local database password"
fi
if [[ -z "$DB_PASS" ]]; then
  DB_PASS="$(openssl rand -hex 20)"
  ok "generated a new local database password"
fi

if [[ $DRY_RUN == 0 ]]; then
  if [[ "$(psql_su -c "select 1 from pg_roles where rolname='${DB_USER}'")" == "1" ]]; then
    psql_su -c "alter role ${DB_USER} with login password '${DB_PASS}'" >/dev/null
    ok "role ${DB_USER} updated"
  else
    psql_su -c "create role ${DB_USER} with login password '${DB_PASS}'" >/dev/null
    ok "role ${DB_USER} created"
  fi

  if [[ "$(psql_su -c "select 1 from pg_database where datname='${DB_NAME}'")" == "1" ]]; then
    ok "database ${DB_NAME} already exists"
  else
    psql_su -c "create database ${DB_NAME} owner ${DB_USER}" >/dev/null
    ok "database ${DB_NAME} created"
  fi
  # Prisma needs to create and drop objects in public, including during
  # `migrate deploy` for future schema changes.
  psql_su -d "$DB_NAME" -c "alter schema public owner to ${DB_USER}" >/dev/null
  psql_su -d "$DB_NAME" -c "grant all on schema public to ${DB_USER}" >/dev/null
  ok "public schema owned by ${DB_USER}"
fi

# Local connections go over the loopback interface, so no pgbouncer settings and
# no connection_limit=1 — that limit exists only because the cloud pooler needs
# it, and it throttles the local server for no reason.
LOCAL_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?schema=public&connection_limit=10"
LOCAL_DIRECT="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?schema=public"

# =============================================================================
step "Copying the live data down, if the internet is up"
# =============================================================================
existing_tables() {
  PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -tAX \
    -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'" 2>/dev/null || echo 0
}

CLOUD_UP=0
if [[ -n "$CLOUD_DIRECT" ]] && [[ $DRY_RUN == 0 ]]; then
  CLOUD_HOST="$(printf '%s' "$CLOUD_DIRECT" | sed -E 's#^postgresql://[^@]+@([^:/]+).*#\1#')"
  CLOUD_PORT="$(printf '%s' "$CLOUD_DIRECT" | sed -E 's#^.*:([0-9]+)/.*#\1#')"
  if timeout 12 bash -c "exec 3<>/dev/tcp/${CLOUD_HOST}/${CLOUD_PORT}" 2>/dev/null; then
    CLOUD_UP=1; ok "cloud database reachable at ${CLOUD_HOST}:${CLOUD_PORT}"
  else
    warn "cloud database NOT reachable — the internet appears to be down"
  fi
fi

TABLES_BEFORE="$([[ $DRY_RUN == 0 ]] && existing_tables || echo 0)"

if [[ $SKIP_DATA == 1 ]]; then
  warn "--skip-data given, leaving the local data alone"
elif [[ $CLOUD_UP == 1 ]]; then
  DUMP="/tmp/orm-clone-$(date +%Y%m%d-%H%M%S).dump"
  # Measured against the live database: 171 MB on disk compresses to about
  # 90 MB and took nearly nine minutes over an ordinary internet link. It is
  # not hanging; leave it alone.
  ok "dumping the live schema and data (~90 MB, expect 5-15 minutes)"
  # -Fc so the restore can run in parallel. Note that --no-owner has no effect
  # on a custom-format dump: the archive keeps the ownership entries either way
  # and they are stripped at RESTORE time, which is where it is passed below.
  run pg_dump "$(libpq_url "$CLOUD_DIRECT")" --schema=public --no-privileges \
      --no-comments --quote-all-identifiers -Fc -f "$DUMP"
  [[ -s "$DUMP" ]] || die "the dump came out empty — nothing was written to $DUMP"
  ok "dump written: $(du -h "$DUMP" | cut -f1)"

  # A refresh must not merge into old rows: drop the schema and restore whole,
  # so the result is exactly what the cloud holds and never a half-and-half.
  #
  # Dropped but NOT recreated. The dump contains its own `CREATE SCHEMA public`,
  # so pre-creating it makes --exit-on-error abort the entire restore on
  # "schema already exists". pg_restore connects as ${DB_USER}, so the schema it
  # creates is owned by ${DB_USER}, which is what we want anyway.
  ok "clearing the local public schema"
  PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -qX \
    -c "drop schema if exists public cascade;"

  ok "restoring into ${DB_NAME}"
  # --no-owner is essential here: every object is owned by "postgres" in the
  # cloud, and 320 ALTER ... OWNER TO statements would otherwise be attempted.
  PGPASSWORD="$DB_PASS" pg_restore --no-owner --no-privileges --exit-on-error \
    -j 4 -h localhost -U "$DB_USER" -d "$DB_NAME" "$DUMP"
  ok "restore finished"
  rm -f "$DUMP"

  # The clone carries the CLOUD's sync identity with it. Left alone, this
  # server would believe it IS the cloud node: every row it wrote would be
  # stamped origin=cloud, and the sync layer could never tell the two apart.
  # Capture is also forced off, so a refresh can never silently start
  # journalling on a node that was not deliberately switched on.
  if PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -tAXc \
       "select to_regclass('public.sync_node') is not null" 2>/dev/null | grep -q t; then
    PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -qX -c \
      "update sync_node set node_id = '${ORM_NODE_ID:-local-unth}', capture_enabled = false where id;" \
      >/dev/null
    # A journal cloned from the cloud describes the CLOUD's history, not ours.
    # Replaying it as if we had written it would send the cloud its own
    # changes back, attributed to us.
    PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -qX \
      -c "truncate sync_journal, sync_applied, sync_state;" >/dev/null 2>&1 || true
    ok "sync identity reset to '${ORM_NODE_ID:-local-unth}', capture off, journal cleared"
  fi

  # A clone carries whatever schema the cloud had AT THAT MOMENT, which is not
  # the same as both nodes running the same migrations. That skew is what broke
  # the radio queue: the local journal table was an older shape than the trigger
  # inserting into it, and every write to a captured table failed with a 500.
  if [[ -x "$APP_DIR/scripts/local-server/apply-migrations.sh" ]]; then
    ok "applying any migrations the clone did not include"
    "$APP_DIR/scripts/local-server/apply-migrations.sh" ||       warn "migrations did not all apply — run apply-migrations.sh and read the output"
  fi
elif [[ "$TABLES_BEFORE" -gt 0 ]]; then
  warn "using the ${TABLES_BEFORE} tables already held locally — run this again when online to refresh"
else
  die "the cloud is unreachable and this machine has no local data yet.
        Run this script once while the internet is up so it can copy the
        database down. Until then the local server has nothing to sign in against."
fi

# =============================================================================
step "Pointing the app at the local database"
# =============================================================================
ENV_FILE="$APP_DIR/.env.local"
# `next dev` reads .env.local, which is what this server is running. Everything
# not managed here is preserved exactly.
MANAGED="DATABASE_URL DIRECT_URL NEXTAUTH_URL CLOUD_DATABASE_URL CLOUD_DIRECT_URL TZ CRON_SECRET"

if [[ $DRY_RUN == 0 ]]; then
  if [[ -f "$ENV_FILE" ]]; then
    BACKUP="${ENV_FILE}.bak.$(date +%Y%m%d-%H%M%S)"
    cp "$ENV_FILE" "$BACKUP"
    ok "backed up the previous env to $(basename "$BACKUP")"
  fi

  TMP="$(mktemp)"
  if [[ -f "$ENV_FILE" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      key="$(printf '%s' "$line" | sed -nE 's/^([A-Za-z_][A-Za-z0-9_]*)=.*/\1/p')"
      if [[ -n "$key" ]] && [[ " $MANAGED " == *" $key "* ]]; then continue; fi
      printf '%s\n' "$line" >> "$TMP"
    done < "$ENV_FILE"
  fi

  {
    echo ""
    echo "# ---- Local server, written by scripts/local-server/setup-local-db.sh ----"
    echo "# Database lives on THIS machine, so sign-in works with the internet down."
    echo "DATABASE_URL=\"${LOCAL_URL}\""
    echo "DIRECT_URL=\"${LOCAL_DIRECT}\""
    echo "# NextAuth must match the origin staff actually type, or the credentials"
    echo "# callback returns 401 even when the database is healthy."
    echo "NEXTAUTH_URL=\"${ORIGIN_URL}\""
    echo "# Belt and braces only. Node fixes its timezone when the process starts,"
    echo "# which is BEFORE Next reads this file, so TZ here may be ignored."
    echo "# start-local.sh exports it properly — use that to launch the app."
    echo "TZ=\"UTC\""
    if [[ -n "$CLOUD_POOLED" ]]; then
      echo "# The cloud, kept so refresh-from-cloud.sh and local-vs-cloud.sh can reach it."
      echo "CLOUD_DATABASE_URL=\"${CLOUD_POOLED}\""
    fi
    [[ -n "$CLOUD_DIRECT" ]] && echo "CLOUD_DIRECT_URL=\"${CLOUD_DIRECT}\""
    echo "# No CRON_SECRET here on purpose: scheduled jobs run on the cloud only,"
    echo "# otherwise preoperative alerts would be raised twice."
  } >> "$TMP"

  mv "$TMP" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok "wrote $ENV_FILE (permissions 600 — it holds the database password)"
fi

# =============================================================================
step "Verifying"
# =============================================================================
if [[ $DRY_RUN == 1 ]]; then echo "  dry run: nothing was changed"; exit 0; fi

q() { PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -tAX -c "$1"; }

TABLES="$(q "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")"
[[ "$TABLES" -ge 150 ]] || die "only $TABLES tables in the local database — the restore did not complete"
ok "$TABLES tables present"

USERS="$(q "select count(*) from users where status='APPROVED'")"
[[ "$USERS" -gt 0 ]] || die "no APPROVED users in the local database — nobody would be able to sign in"
ok "$USERS approved users can sign in"

ADMINS="$(q "select count(*) from users where status='APPROVED' and role in ('ADMIN','SYSTEM_ADMINISTRATOR')")"
[[ "$ADMINS" -gt 0 ]] || warn "no approved administrator in the local database"
[[ "$ADMINS" -gt 0 ]] && ok "$ADMINS approved administrators"

MIG="$(q "select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null")"
ok "$MIG migrations recorded as applied (future 'prisma migrate deploy' will work)"

cat <<EOF

${B}Done.${N} The database is now on this machine.

${B}One thing left:${N}
  The running app still holds the OLD environment in memory and must be
  restarted. The launcher does it the right way round — it exports TZ=UTC
  (which an env file cannot reliably do), refuses to start against an
  unreachable database, and uses PM2 if PM2 is managing the app rather than
  starting a second process that fights it for the port:

    cd $APP_DIR
    ./scripts/local-server/start-local.sh

  ${Y}Do NOT run 'npm run dev' on this server if PM2 serves a production
  build.${N} 'next dev' overwrites .next, and 'next start' then fails with
  "Could not find a production build" and crash-loops.

  Then sign in at ${ORIGIN_URL} — with the network unplugged, if you want to
  prove the point.

${B}The other scripts here:${N}
  ./scripts/local-server/start-local.sh          start the app correctly
  ./scripts/local-server/refresh-from-cloud.sh   pull the cloud's data down again
  ./scripts/local-server/local-vs-cloud.sh       show how far the two have drifted

${Y}Read this part.${N} This server now writes to its own database. Anything
staff enter here does NOT appear in the cloud, and anything entered on the
Vercel site does NOT appear here. The two will drift apart from today. Decide
which one is authoritative before the hospital relies on both — see
docs/manuals/hybrid-deployment.md, "Stage 2".
EOF
