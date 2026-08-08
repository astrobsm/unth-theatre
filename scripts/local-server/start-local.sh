#!/usr/bin/env bash
# =============================================================================
# Start (or restart) the ORM on the local server, correctly.
# -----------------------------------------------------------------------------
# THE MISTAKE THIS SCRIPT NOW PREVENTS
#
# The first version of this script ran `npm run dev`. On this server that was
# actively destructive: the app is served by PM2 running `next start`, and
# `next dev` OVERWRITES .next with development artifacts. `next start` then
# fails with "Could not find a production build in the '.next' directory" and
# PM2 restarts it forever — it reached 452 restarts, and the only visible
# symptom was a dead website.
#
# So: production is the default, dev must be asked for explicitly, and if PM2
# is managing the app, PM2 is used rather than a competing foreground process.
#
# It also refuses to start when the database is unreachable or the port is
# already taken, because both produce failures that look like something else.
#
#   ./start-local.sh              build if needed, then serve (via PM2 if present)
#   ./start-local.sh --rebuild    force a fresh production build first
#   ./start-local.sh --dev        development mode — DESTROYS the production build
# =============================================================================

set -euo pipefail
APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$APP_DIR"

MODE="prod"
REBUILD=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev) MODE="dev"; shift ;;
    --rebuild) REBUILD=1; shift ;;
    --prod) shift ;;                  # accepted: it is the default
    -h|--help) sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
else B=""; G=""; Y=""; R=""; N=""; fi

# TZ must be exported into the environment, not written to an env file: Node
# fixes its timezone before Next reads .env.local, so a TZ there may be ignored.
# Vercel runs UTC; a server on WAT computes different day boundaries, and
# "today's list" then differs between the two at the edges of the day.
export TZ=UTC
echo "${B}TZ=UTC${N} (matches the cloud, so day boundaries agree)"

# ---- Configuration sanity ---------------------------------------------------
# Prisma URLs carry parameters libpq rejects. Given "?schema=public", psql fails
# with `invalid URI query parameter: "schema"` before it opens a socket, which
# reads as a database being down when it is perfectly healthy.
libpq_url() {
  printf '%s' "$1" \
    | sed -E 's/([?&])(schema|connection_limit|pgbouncer|pool_timeout|socket_timeout)=[^&]*/\1/g' \
    | sed -E 's/\?&+/?/; s/&&+/\&/g; s/[?&]$//'
}
env_key() {
  grep -E "^$1=" .env.local 2>/dev/null | tail -1 | sed -E "s/^$1=//; s/^\"//; s/\"$//" || true
}

DB="$(env_key DIRECT_URL)"
if [[ -z "$DB" ]]; then
  echo "${R}No DIRECT_URL in .env.local.${N} Run scripts/local-server/setup-local-db.sh first." >&2
  exit 1
fi

if command -v psql >/dev/null; then
  # Captured rather than discarded: guessing at a cause prints confident
  # nonsense, and psql's own message is always more use.
  if ! PSQL_ERR="$(psql "$(libpq_url "$DB")" -tAXc 'select 1' 2>&1 >/dev/null)"; then
    echo "${R}The database is not reachable.${N}" >&2
    echo "  psql said: ${PSQL_ERR}" >&2
    case "$DB" in
      *localhost*|*127.0.0.1*) echo "  Configured as local. Try: sudo systemctl start postgresql" >&2 ;;
      *) echo "  Still points at a REMOTE host, so sign-in fails whenever the" >&2
         echo "  internet is down. Run scripts/local-server/setup-local-db.sh." >&2 ;;
    esac
    exit 1
  fi
  echo "${G}Database reachable.${N}"
fi

NEXTAUTH="$(env_key NEXTAUTH_URL)"
echo "Sign-in origin: ${B}${NEXTAUTH:-<unset>}${N}"
case "$NEXTAUTH" in
  *vercel.app*)
    echo "${R}NEXTAUTH_URL still points at the cloud.${N} Sign-in here returns 401" >&2
    echo "regardless of the database. Run setup-local-db.sh." >&2
    exit 1 ;;
esac

PORT="$(printf '%s' "$NEXTAUTH" | sed -E 's#^https?://[^:/]+##; s#^:##; s#/.*##')"
[[ "$PORT" =~ ^[0-9]+$ ]] || PORT=3000
export PORT
echo "Port: ${B}${PORT}${N}"

# ---- Is PM2 in charge? ------------------------------------------------------
PM2_APP=""
if command -v pm2 >/dev/null && pm2 jlist 2>/dev/null | grep -q '"name":"orm"'; then
  PM2_APP="orm"
  echo "PM2 manages ${B}orm${N} — using PM2 rather than a competing process."
fi

# ---- Dev mode is destructive here, so make it deliberate --------------------
if [[ "$MODE" == "dev" ]]; then
  echo
  echo "${Y}Development mode overwrites .next with dev artifacts.${N}"
  if [[ -n "$PM2_APP" ]]; then
    echo "${R}PM2 is serving a PRODUCTION build from that same directory.${N}" >&2
    echo "Running dev here breaks it with:" >&2
    echo "    Could not find a production build in the '.next' directory" >&2
    echo >&2
    echo "Stop PM2 first if you really mean to develop on this machine:" >&2
    echo "    pm2 stop ${PM2_APP}" >&2
    echo "and afterwards rebuild before starting it again:" >&2
    echo "    ./scripts/local-server/start-local.sh --rebuild" >&2
    exit 1
  fi
  if command -v ss >/dev/null && ss -ltnH "sport = :$PORT" 2>/dev/null | grep -q .; then
    echo "${R}Port ${PORT} is already in use.${N} Free it first: sudo ss -ltnp 'sport = :${PORT}'" >&2
    exit 1
  fi
  exec npm run dev
fi

# ---- Production -------------------------------------------------------------
NEEDS_BUILD=0
[[ $REBUILD == 1 ]] && NEEDS_BUILD=1
# BUILD_ID is what `next start` looks for; .next existing is not enough, since a
# dev run leaves the directory present but without it.
[[ -f .next/BUILD_ID ]] || NEEDS_BUILD=1

if [[ $NEEDS_BUILD == 1 ]]; then
  if [[ ! -f .next/BUILD_ID && $REBUILD == 0 ]]; then
    echo "${Y}No production build found${N} (.next/BUILD_ID missing) — building."
    echo "A previous 'next dev' run is the usual reason."
  fi
  echo "${B}Generating the Prisma client${N}"
  npx prisma generate
  echo "${B}Building${N} (5-15 minutes)"
  npm run build
  echo "${G}Build complete.${N}"
fi

if [[ -n "$PM2_APP" ]]; then
  echo "${B}Restarting via PM2${N} (--update-env so it picks up TZ and PORT)"
  pm2 restart "$PM2_APP" --update-env
  sleep 6
  pm2 list
  echo
  echo "Recent output:"
  pm2 logs "$PM2_APP" --lines 15 --nostream 2>/dev/null || true
  echo
  echo "If the restart count is climbing, the app is crash-looping — read the log above."
  exit 0
fi

if command -v ss >/dev/null && ss -ltnH "sport = :$PORT" 2>/dev/null | grep -q .; then
  echo "${R}Port ${PORT} is already in use${N} and PM2 does not own it." >&2
  echo "  sudo ss -ltnp 'sport = :${PORT}'" >&2
  echo "Starting elsewhere would not help: NEXTAUTH_URL names ${PORT}, and" >&2
  echo "sign-in returns 401 whenever the two disagree." >&2
  exit 1
fi

exec npm run start
