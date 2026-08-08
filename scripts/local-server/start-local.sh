#!/usr/bin/env bash
# =============================================================================
# Start the ORM on the local server, correctly.
# -----------------------------------------------------------------------------
# Use this instead of `npm run dev` directly, for one reason that matters:
#
#   TZ MUST BE IN THE PROCESS ENVIRONMENT, NOT IN .env.local.
#
# Node fixes its timezone when the process starts, which happens BEFORE Next
# reads .env.local. A TZ written into an env file may therefore be ignored
# entirely. Vercel runs in UTC; if this server runs in WAT, the two compute
# different day boundaries and "today's list" can disagree between them at the
# edges of the day. Clinical times are safe either way — lib/theatreOps/clock.ts
# states the offset explicitly and never asks the host — but day windows are not.
#
# It also refuses to start if the database is unreachable, rather than letting
# every sign-in fail with a 500 that looks like a password problem.
#
#   ./start-local.sh            development mode (what this server runs today)
#   ./start-local.sh --prod     build once, then serve the production build
# =============================================================================

set -euo pipefail
APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$APP_DIR"

PROD=0
[[ "${1:-}" == "--prod" ]] && PROD=1

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; R=$'\e[31m'; N=$'\e[0m'; else B=""; G=""; R=""; N=""; fi

export TZ=UTC
echo "${B}TZ=UTC${N} (matches the cloud, so day boundaries agree)"

# ---- Refuse to start blind --------------------------------------------------
DB="$(grep -E '^DIRECT_URL=' .env.local 2>/dev/null | tail -1 | sed -E 's/^DIRECT_URL=//; s/^"//; s/"$//' || true)"
if [[ -z "$DB" ]]; then
  echo "${R}No DIRECT_URL in .env.local.${N} Run scripts/local-server/setup-local-db.sh first." >&2
  exit 1
fi

# Prisma's URLs carry parameters that libpq does not accept. Handed a URL
# ending in "?schema=public", psql fails with `invalid URI query parameter:
# "schema"` BEFORE it opens a socket — so an unmodified check reports a
# perfectly healthy database as unreachable. Strip only the Prisma-only keys
# and leave anything libpq understands, such as sslmode, alone.
libpq_url() {
  printf '%s' "$1" \
    | sed -E 's/([?&])(schema|connection_limit|pgbouncer|pool_timeout|socket_timeout)=[^&]*/\1/g' \
    | sed -E 's/\?&+/?/; s/&&+/\&/g; s/[?&]$//'
}

if command -v psql >/dev/null; then
  # Captured rather than discarded: guessing at a cause prints confident
  # nonsense, and the real message from psql is always more use.
  if ! PSQL_ERR="$(psql "$(libpq_url "$DB")" -tAXc 'select 1' 2>&1 >/dev/null)"; then
    echo "${R}The database is not reachable.${N}" >&2
    echo "  psql said: ${PSQL_ERR}" >&2
    case "$DB" in
      *localhost*|*127.0.0.1*)
        echo "  It is configured as local. Try: sudo systemctl start postgresql" >&2 ;;
      *)
        echo "  It still points at a REMOTE host, so sign-in will fail whenever the" >&2
        echo "  internet is down. Run scripts/local-server/setup-local-db.sh." >&2 ;;
    esac
    exit 1
  fi
  echo "${G}Database reachable.${N}"
else
  echo "psql not installed, skipping the database check"
fi

NEXTAUTH="$(grep -E '^NEXTAUTH_URL=' .env.local 2>/dev/null | tail -1 | sed -E 's/^NEXTAUTH_URL=//; s/^"//; s/"$//' || true)"
echo "Sign-in origin: ${B}${NEXTAUTH:-<unset>}${N}"
case "$NEXTAUTH" in
  *vercel.app*)
    echo "${R}NEXTAUTH_URL still points at the cloud.${N} Sign-in on this server will" >&2
    echo "return 401 regardless of the database. Run setup-local-db.sh." >&2
    exit 1 ;;
esac

if [[ $PROD == 1 ]]; then
  echo; echo "${B}Building${N} (a few minutes; much faster to serve afterwards)"
  npm run build
  exec npm run start
else
  exec npm run dev
fi
