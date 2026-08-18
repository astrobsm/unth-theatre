#!/usr/bin/env bash
# =============================================================================
# Bring the theatre server up to date, correctly, in one command
# -----------------------------------------------------------------------------
#   ./deploy.sh            pull, migrate, build, restart, verify
#   ./deploy.sh --check    say what would happen, change nothing
#
# This exists because the manual sequence has three traps, and on 18 August all
# three were hit in one evening:
#
#   RUN AS ROOT. git refuses a repository owned by somebody else — "detected
#   dubious ownership" — which broke an && chain at the first command, so the
#   pull, the build and both restarts silently did not happen. The failure
#   looked like one line of git noise scrolling past.
#
#   THE WRONG BUILD SCRIPT. `npm run build` runs `prisma migrate deploy`, and
#   the prisma CLI reads .env, which on this box points at the CLOUD. It
#   therefore tries to migrate the production cloud database from the theatre
#   server, and fails — or worse, succeeds. `build:server` is the correct one
#   here; migrations are apply-migrations.sh's job.
#
#   FORGETTING THE WORKER. pm2 restarts the app. The sync worker is systemd and
#   is a separate thing entirely, so a deploy that restarts only pm2 leaves the
#   worker running yesterday's code with none of the reason visible.
#
# Ordering is deliberate: migrations before the build, because the build
# generates a Prisma client from the schema and a client ahead of its database
# fails at runtime rather than at deploy time.
# =============================================================================

set -euo pipefail

APP_USER="${ORM_APP_USER:-emmanuel}"
APP_DIR="${ORM_APP_DIR:-/home/$APP_USER/unth-theatre}"
CHECK=0
[[ "${1:-}" == "--check" ]] && CHECK=1

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
else B=""; G=""; Y=""; R=""; N=""; fi
step() { echo; echo "${B}==> $*${N}"; }
ok()   { echo "  ${G}ok${N}   $*"; }
warn() { echo "  ${Y}warn${N} $*"; }
die()  { echo; echo "${R}FAILED${N} $*" >&2; exit 1; }

[[ -d "$APP_DIR" ]] || die "no app directory at $APP_DIR"

# Everything touching the repo, node_modules or .next runs AS THE APP USER.
# Building as root leaves .next and node_modules owned by root, and the next
# ordinary deploy fails on permissions in a way that reads as a broken repo.
as_app() {
  if [[ "$(id -un)" == "$APP_USER" ]]; then
    bash -lc "cd '$APP_DIR' && $*"
  else
    su - "$APP_USER" -c "cd '$APP_DIR' && $*"
  fi
}

echo
echo "${B}ORM theatre server deploy${N}"
echo "  app dir : $APP_DIR"
echo "  as user : $APP_USER"
echo "  running : $(id -un)"
[[ $CHECK -eq 1 ]] && warn "check only — nothing will be changed"

step "1/6  Current state"
as_app "git log --oneline -1" || die "cannot read the repository as $APP_USER"
as_app "git status --porcelain | head -5" || true

step "2/6  Fetching"
if [[ $CHECK -eq 1 ]]; then
  as_app "git fetch --quiet && git log --oneline HEAD..@{u} | head -20" || true
  echo "  (the commits above would be applied)"
else
  as_app "git pull --ff-only" || die "pull failed. If it mentions 'dubious ownership' you are running
        git as the wrong user — this script uses $APP_USER for exactly that reason."
  ok "up to date"
fi

step "3/6  Migrations (local database, from .env.local)"
if [[ $CHECK -eq 1 ]]; then
  as_app "./scripts/local-server/apply-migrations.sh --dry-run" || true
else
  as_app "./scripts/local-server/apply-migrations.sh" || die "migrations failed — stopping before the build"
fi

step "4/6  Building"
if [[ $CHECK -eq 1 ]]; then
  echo "  would run: npm run build:server   (generate + next build, NO migrate)"
else
  # Explicitly build:server. `build` would target the cloud through .env.
  as_app "npm run build:server" || die "build failed — the app has NOT been restarted, so the
        previous build is still serving. Fix the build and run this again."
  ok "built"
fi

step "5/6  Restarting both services"
if [[ $CHECK -eq 1 ]]; then
  echo "  would run: pm2 restart orm   (as $APP_USER)"
  echo "  would run: systemctl restart orm-sync   (as root)"
else
  as_app "pm2 restart orm" || warn "pm2 restart failed — is the app running under a different user?"
  ok "app restarted"

  # The worker is systemd, and separate. Restarting it needs root; say so
  # plainly rather than failing with a permissions error.
  if [[ "$(id -u)" -eq 0 ]]; then
    systemctl restart orm-sync && ok "sync worker restarted"
  elif command -v sudo >/dev/null 2>&1; then
    sudo systemctl restart orm-sync && ok "sync worker restarted"
  else
    warn "not root and no sudo — the SYNC WORKER is still running the old code."
    echo "         Run as root:  systemctl restart orm-sync"
  fi
fi

step "6/6  Verifying"
if [[ $CHECK -eq 1 ]]; then
  echo "  would run: ./scripts/local-server/why-not-syncing.sh"
else
  sleep 3
  systemctl is-active --quiet orm-sync && ok "orm-sync active" || warn "orm-sync is NOT active"
  as_app "pm2 describe orm | grep -E 'status|uptime' | head -2" || true
  echo
  echo "  Sync health:"
  as_app "./scripts/local-server/why-not-syncing.sh" 2>/dev/null | sed -n '/2. Push/,/Link state/p' || true
fi

echo
echo "${B}Done.${N} Full sync report: ./scripts/local-server/why-not-syncing.sh"
