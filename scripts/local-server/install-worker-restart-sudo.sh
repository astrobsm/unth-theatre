#!/usr/bin/env bash
# =============================================================================
# Let the deploy restart the sync worker without a person present
# -----------------------------------------------------------------------------
#   sudo bash scripts/local-server/install-worker-restart-sudo.sh
#   sudo bash scripts/local-server/install-worker-restart-sudo.sh --remove
#
# RUN THIS ONCE. It is the only step in the whole deploy that needs root, and
# after it nothing does.
#
# THE PROBLEM IT SOLVES
#
# pm2 runs the app as the app user, so deploy.sh restarts it happily. The sync
# worker is systemd and belongs to root, so restarting it needs privileges the
# deploy does not have. Every deploy therefore ended with the app on new code
# and the worker on old code, and a warning that only helps somebody who is
# reading. On 19 August the worker sat on code from the previous evening
# through five separate deploys, because each one printed the warning to a
# terminal nobody was watching.
#
# WHY A SUDOERS RULE AND NOT A PASSWORD SOMEWHERE
#
# The alternatives are worse. A password in a script is a password on disk, in
# git, and in every backup. Running the whole deploy as root leaves .next and
# node_modules root-owned and breaks the next ordinary deploy. Giving the app
# user general sudo hands a web application's account the whole machine.
#
# This grants ONE command with NO arguments of the caller's choosing:
#
#     /usr/bin/systemctl restart orm-sync
#
# Not `systemctl` generally — that would allow stopping the firewall. Not
# `restart *` — that would allow restarting sshd. Exactly this unit, exactly
# this verb. The worst it can do is restart the thing the deploy was going to
# ask a human to restart anyway.
#
# THE FILE IS VALIDATED BEFORE IT IS INSTALLED. A malformed file in
# /etc/sudoers.d breaks sudo for EVERY user on the machine, including the one
# who would have to fix it, and the theatre server has no console anybody
# visits. It is written to a temporary file, checked with `visudo -c`, and only
# then moved into place.
# =============================================================================

set -euo pipefail

APP_USER="${ORM_APP_USER:-emmanuel}"
# Both services a deploy has to restart and cannot, because both are systemd
# and belong to root while the deploy runs as the app user. orm-radius joined
# the list after a deploy lengthened the network session in the source and
# staff went on being logged out on the old timing, because the process holding
# that number had never been restarted.
UNITS=("orm-sync" "orm-radius")
SYSTEMCTL="/usr/bin/systemctl"
SUDOERS_FILE="/etc/sudoers.d/orm-sync-restart"

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
else B=""; G=""; Y=""; R=""; N=""; fi
ok()   { echo "  ${G}ok${N}   $*"; }
warn() { echo "  ${Y}warn${N} $*"; }
die()  { echo; echo "${R}FAILED${N} $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || die "must be run as root:
        sudo bash scripts/local-server/install-worker-restart-sudo.sh"

if [[ "${1:-}" == "--remove" ]]; then
  rm -f "$SUDOERS_FILE"
  ok "removed $SUDOERS_FILE — the deploy will go back to asking a person"
  exit 0
fi

echo
echo "${B}Allowing $APP_USER to restart ${UNITS[*]}${N}"

id "$APP_USER" >/dev/null 2>&1 || die "no such user: $APP_USER"
[[ -x "$SYSTEMCTL" ]] || die "systemctl is not at $SYSTEMCTL on this machine"
for u in "${UNITS[@]}"; do
  $SYSTEMCTL list-unit-files "$u.service" >/dev/null 2>&1 \
    || warn "$u.service is not a known unit — installing its rule anyway, but check the name"
done

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

{
  echo "# Installed by scripts/local-server/install-worker-restart-sudo.sh"
  echo "#"
  echo "# Lets the ORM deploy restart its root-owned services unattended."
  echo "# Deliberately ONE LINE PER UNIT with fixed arguments: not systemctl"
  echo "# generally, not restart of any unit. See the script for why the"
  echo "# alternatives are worse."
  for u in "${UNITS[@]}"; do
    echo "$APP_USER ALL=(root) NOPASSWD: $SYSTEMCTL restart $u"
  done
} > "$TMP"

# The whole point. A broken file here breaks sudo for everybody, on a machine
# with no console anybody visits.
visudo -cf "$TMP" >/dev/null || die "the generated rule did not validate — nothing was installed"

install -m 0440 -o root -g root "$TMP" "$SUDOERS_FILE"
ok "installed $SUDOERS_FILE"

# Prove it from the app user's own shell rather than asserting it. `sudo -n` is
# non-interactive: if a password would be required this fails instead of
# hanging, which is exactly the condition being tested for.
failed=""
for u in "${UNITS[@]}"; do
  # A unit that is not installed on this machine is skipped rather than failed:
  # not every box runs the RADIUS bridge, and the rule is still correct for it.
  if ! $SYSTEMCTL list-unit-files "$u.service" >/dev/null 2>&1; then
    warn "$u is not installed here — rule written, nothing to prove"
    continue
  fi
  if su - "$APP_USER" -c "sudo -n $SYSTEMCTL restart $u" >/dev/null 2>&1; then
    ok "$APP_USER restarted $u without a password — the deploy can now do this itself"
    echo "       active since: $($SYSTEMCTL show "$u" -p ActiveEnterTimestamp --value)"
  else
    failed="$failed $u"
  fi
done

if [[ -n "$failed" ]]; then
  die "the rule installed but $APP_USER still cannot restart:$failed
        Check the unit names and that no later file in /etc/sudoers.d
        overrides this one."
fi

echo
echo "${B}Done.${N} deploy.sh will restart the worker from now on; nothing else needs root."
