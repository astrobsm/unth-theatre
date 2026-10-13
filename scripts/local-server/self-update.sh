#!/usr/bin/env bash
# ============================================================
# Bring the theatre server up to date, safely, on its own
# ------------------------------------------------------------
# WHY THIS EXISTS. The theatre server has run a stale build three times:
# four days behind in September, then three weeks behind by October, each time
# discovered only because somebody said "I can't see the changes". The code
# reaches the machine — `git pull` has been run — but `next start` reads the
# build once at boot, so nothing appears until it is rebuilt and restarted,
# and that step kept being the one nobody did.
#
# Run it by hand, or on a timer. It is safe to run when there is nothing to do:
# with no new commits it does nothing at all and says so.
#
#   bash scripts/local-server/self-update.sh            # update if behind
#   bash scripts/local-server/self-update.sh --check    # say only, change nothing
#   bash scripts/local-server/self-update.sh --force    # rebuild even if current
#
# ── WHAT IT WILL NOT DO ─────────────────────────────────────────────────────
#
# It never restarts the app on a FAILED build. A theatre running yesterday's
# working code is in a far better position than one running nothing, and a
# build that fails at 2am must not take the list down with it.
#
# It never runs twice at once. A second copy starting mid-build would race the
# first over node_modules and .next, and the loser corrupts the output.
#
# It stops if the working tree has local edits, rather than discarding them.
# Somebody changed something on that box for a reason.
# ============================================================

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCK="/tmp/orm-self-update.lock"
LOG="${REPO}/logs/self-update.log"
MODE="${1:-}"

mkdir -p "$(dirname "$LOG")"

say() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

# One at a time. flock releases automatically if this process dies, so a
# machine that lost power mid-update is not locked out for ever.
exec 9>"$LOCK"
if ! flock -n 9; then
  say "another update is already running; leaving it alone"
  exit 0
fi

cd "$REPO" || { say "FAILED: cannot enter $REPO"; exit 1; }

# Local edits are somebody's work. Refuse rather than discard.
if ! git diff --quiet || ! git diff --cached --quiet; then
  say "FAILED: the working tree has uncommitted changes. Someone edited this box."
  say "        Resolve them, then run this again."
  exit 1
fi

BEFORE="$(git rev-parse --short HEAD)"
say "on ${BEFORE}; fetching"

if ! git fetch --quiet origin 2>>"$LOG"; then
  say "FAILED: could not reach the git remote. Nothing changed."
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
REMOTE="$(git rev-parse --short "origin/${BRANCH}")"

if [ "$BEFORE" = "$REMOTE" ] && [ "$MODE" != "--force" ]; then
  say "already current at ${BEFORE}; nothing to do"
  exit 0
fi

if [ "$MODE" = "--check" ]; then
  say "behind: ${BEFORE} -> ${REMOTE} ($(git rev-list --count "HEAD..origin/${BRANCH}") commits). Nothing changed."
  exit 0
fi

say "updating ${BEFORE} -> ${REMOTE}"
if ! git merge --ff-only "origin/${BRANCH}" >>"$LOG" 2>&1; then
  say "FAILED: cannot fast-forward. The local branch has diverged."
  exit 1
fi

say "installing dependencies"
npm install --no-audit --no-fund >>"$LOG" 2>&1 || { say "FAILED: npm install"; exit 1; }

# THE BUILD IS THE RISKY STEP, so the app is left alone until it succeeds.
# npm run build also applies migrations to this node's own database — see
# scripts/migrate-node-db.js — so a migration failure stops here too, with the
# old build still serving.
say "building (this takes a few minutes)"
if ! npm run build >>"$LOG" 2>&1; then
  say "FAILED: the build did not succeed. The app was NOT restarted and is"
  say "        still serving ${BEFORE}. See ${LOG} for why."
  exit 1
fi

say "build succeeded; restarting"
pm2 restart orm >>"$LOG" 2>&1 || { say "WARNING: pm2 restart orm failed"; }
sudo -n systemctl restart orm-sync >>"$LOG" 2>&1 \
  || say "note: could not restart orm-sync (needs sudo); it will pick up changes on its next restart"

AFTER="$(git rev-parse --short HEAD)"
say "now on ${AFTER}"

# Prove it is actually serving, rather than assuming the restart worked.
sleep 8
CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 20 http://127.0.0.1:3000/ || echo 000)"
if [ "$CODE" = "200" ] || [ "$CODE" = "307" ] || [ "$CODE" = "302" ]; then
  say "OK: the app is answering (${CODE}) on ${AFTER}"
else
  say "WARNING: the app answered ${CODE} after restart. Check: pm2 logs orm"
  exit 1
fi
