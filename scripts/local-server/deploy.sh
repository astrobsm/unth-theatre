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
  # A dirty working tree stops --ff-only dead, and git's message names the file
  # without saying why it is dirty or what may be done about it. On this box the
  # answer is almost always package-lock.json: npm rewrites the "dev" and
  # "optional" flags on platform-specific dependencies whenever it installs, so
  # a server that has ever run `npm install` is holding a lockfile change that
  # nobody made and nobody wants.
  #
  # That file is generated, and the pull restores it exactly, so it is
  # discarded. ANYTHING ELSE stops the deploy: an uncommitted edit made directly
  # on the server is the one thing in this directory that exists in no other
  # copy, and overwriting it to save a step would be destroying the only version.
  MODIFIED="$(as_app "git status --porcelain --untracked-files=no" | awk '{print $NF}' || true)"
  if [[ -n "$MODIFIED" ]]; then
    OTHER="$(printf '%s\n' "$MODIFIED" | grep -v '^package-lock\.json$' || true)"
    if [[ -n "$OTHER" ]]; then
      echo "  tracked files modified on this server:"
      printf '%s\n' "$OTHER" | sed 's/^/    /'
      die "the working tree has changes that are not in git. They exist ONLY on this
        box, so this script will not discard them. Commit them, or drop them with
        'git checkout -- <file>', then run this again."
    fi
    warn "package-lock.json modified by npm — discarding (generated; the pull restores it)"
    as_app "git checkout -- package-lock.json"
  fi

  as_app "git pull --ff-only" || die "pull failed — git's own reason is printed above. Two that recur:
        'dubious ownership'  git is running as the wrong user; this script uses
                             $APP_USER for exactly that reason.
        'local changes'      something in the tree was edited on this server."
  ok "up to date"
fi

step "3/6  Migrations (local database, from .env.local)"
if [[ $CHECK -eq 1 ]]; then
  as_app "./scripts/local-server/apply-migrations.sh --dry-run" || true
else
  # A migration that UPDATEs rows fires the sync capture trigger on every row it
  # touches, exactly as an ordinary edit would — that is how the change reaches
  # the other node at all, and it is the same mechanism rejournal.sh uses on
  # purpose. But it means a BACKFILL enqueues itself: one ALTER and two UPDATEs
  # on 19 August put 563 surgeries into the outbound queue, which at the uplink's
  # real throughput on rows that wide is the better part of an hour sitting
  # ahead of live theatre work.
  #
  # Nothing is broken when that happens. It must simply be VISIBLE, because an
  # hour of queue nobody announced looks exactly like an hour of queue caused by
  # a failing link. Step 6 prints the depth; this is the warning to read it.
  as_app "./scripts/local-server/apply-migrations.sh" || die "migrations failed — stopping before the build"
  echo "  note: a migration that backfills rows also QUEUES them for the peer."
  echo "        Check the push depth at step 6 before assuming the link is idle."
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
  #
  # `sudo -n` — non-interactive — and the RESULT IS CHECKED. Testing that sudo
  # exists is not the same as testing that it works: on a box where sudo prompts
  # for a password, `sudo systemctl restart` fails with "a terminal is required
  # to authenticate", and because the old code hung the success message off &&
  # with no else, the script printed nothing at all and carried on to report a
  # healthy deploy. Forgetting the worker is the third trap named in this file's
  # header; a silent sudo failure is that same trap wearing a different hat, and
  # it happened on 19 August.
  worker_restarted=0
  if [[ "$(id -u)" -eq 0 ]]; then
    systemctl restart orm-sync && worker_restarted=1
  elif sudo -n true 2>/dev/null; then
    sudo -n systemctl restart orm-sync && worker_restarted=1
  fi
  if [[ $worker_restarted -eq 1 ]]; then
    ok "sync worker restarted"
  else
    warn "the SYNC WORKER was NOT restarted — it is still running the PREVIOUS code."
    echo "         It needs root, and this shell has neither root nor passwordless sudo."
    echo "         Run:  sudo systemctl restart orm-sync"
  fi
fi

step "6/6  Verifying"
if [[ $CHECK -eq 1 ]]; then
  echo "  would run: ./scripts/local-server/why-not-syncing.sh"
else
  sleep 3
  # "active" is not "current". A worker that has been running since yesterday is
  # active and is also stale, and a bare green tick beside it says the opposite
  # of what the operator needs to know — so the start time is printed and they
  # can see for themselves whether it predates this deploy.
  if systemctl is-active --quiet orm-sync; then
    ok "orm-sync active since $(systemctl show orm-sync -p ActiveEnterTimestamp --value)"
  else
    warn "orm-sync is NOT active"
  fi
  as_app "pm2 describe orm | grep -E 'status|uptime' | head -2" || true
  echo
  echo "  Sync health:"
  as_app "./scripts/local-server/why-not-syncing.sh" 2>/dev/null | sed -n '/2. Push/,/Link state/p' || true
fi

echo
echo "${B}Done.${N} Full sync report: ./scripts/local-server/why-not-syncing.sh"
