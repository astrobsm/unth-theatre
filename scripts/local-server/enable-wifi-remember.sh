#!/usr/bin/env bash
# =============================================================================
# Switch on "Keep this phone signed in to the Wi-Fi"
# -----------------------------------------------------------------------------
#   ./scripts/local-server/enable-wifi-remember.sh
#   ./scripts/local-server/enable-wifi-remember.sh 192.168.88.1 admin
#
# Staff tick a box on the captive portal and their handset rejoins the theatre
# network silently from then on instead of meeting the portal every morning.
# Two halves have to be switched on, ON THE ROUTER FIRST, and this does them in
# that order and refuses to do the second without the first.
#
#   1. The router gets two hotspot user profiles, orm-remembered (MAC cookie,
#      90 days) and orm-one-visit (no cookie, for shared handsets).
#   2. The RADIUS bridge is allowed to name one of them in Mikrotik-Group on
#      every Access-Accept, according to what the person ticked.
#
# WHY THE ORDER IS NOT A PREFERENCE. A Mikrotik-Group naming a profile the
# router does not have is not an ignored attribute — RouterOS REFUSES THE
# LOGIN. Switching the bridge on first therefore takes the entire theatre off
# the Wi-Fi at once, including the staff already working, and the symptom
# ("wrong password" for everybody) points nowhere near the cause.
#
# So step 2 runs only if step 1 is verified present on the router, by reading
# it back rather than by assuming the import worked.
#
# SAFE TO RE-RUN. Both halves are idempotent, and rolling back is one line,
# printed at the end.
#
# TWO PASSWORDS ARE YOURS TO TYPE: the router's, and sudo on this server. This
# script never stores either. Export MIKROTIK_PASSWORD and install sshpass if
# you would rather not type the first one four times.
# =============================================================================

set -euo pipefail

ROUTER="${1:-${MIKROTIK_HOST:-192.168.88.1}}"
RUSER="${2:-${MIKROTIK_USER:-admin}}"

APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$APP_DIR"

RADIUS_ENV="${ORM_RADIUS_ENV:-/etc/orm-radius.env}"

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
else B=""; G=""; Y=""; R=""; N=""; fi
ok()   { echo "  ${G}ok${N}   $*"; }
warn() { echo "  ${Y}note${N} $*"; }
die()  { echo; echo "${R}STOPPED${N}  $*" >&2; exit 1; }

echo
echo "${B}Keep this phone signed in to the Wi-Fi${N}"
echo "  router  $RUSER@$ROUTER"
echo "  bridge  $RADIUS_ENV"

# --- 0. Is the code that reads any of this actually deployed? ---------------
# Checked first because the failure is otherwise baffling: the router would be
# configured correctly, the flag would be set, and nothing would happen —
# because the bridge running in memory predates the feature.
if ! grep -q 'RADIUS_HOTSPOT_PROFILES' scripts/local-server/radius-bridge.ts; then
  die "this checkout predates the feature.
        git pull, then bash scripts/local-server/self-update.sh --force"
fi
ok "the bridge in this checkout understands the setting"

# ---------------------------------------------------------------------------
echo
echo "${B}Step 1 of 2 — the router${N}"
echo "  You will be asked for the router password."
echo

bash scripts/local-server/deploy-mikrotik-portal.sh "$ROUTER" "$RUSER" \
  || die "the router step failed — nothing on the bridge has been changed.
        The output above says which part. Fix that and re-run this."

# --- 1b. Read it back ourselves ---------------------------------------------
# The deploy script prints its own verification, but this script must not rely
# on having READ that output. The decision to touch the bridge is made from a
# fresh query, here, because that decision is the one that can take the
# theatre offline.
echo
echo "${B}Checking the router has both profiles${N}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
if [[ -n "${MIKROTIK_PASSWORD:-}" ]] && command -v sshpass >/dev/null; then
  ASK() { sshpass -p "$MIKROTIK_PASSWORD" ssh "${SSH_OPTS[@]}" "$RUSER@$ROUTER" "$@"; }
else
  ASK() { ssh "${SSH_OPTS[@]}" "$RUSER@$ROUTER" "$@"; }
fi

PROFILES="$(ASK '/ip hotspot user profile print terse where name~"orm-"' 2>/dev/null || true)"
grep -q 'name=orm-remembered' <<<"$PROFILES" || die "orm-remembered is not on the router.
        The import did not take. Nothing on the bridge has been changed, so the
        Wi-Fi is exactly as it was. Re-run and read step 3 of the output above."
grep -q 'name=orm-one-visit' <<<"$PROFILES" || die "orm-one-visit is not on the router.
        Nothing on the bridge has been changed. See above."
ok "orm-remembered and orm-one-visit are both present"

# ---------------------------------------------------------------------------
echo
echo "${B}Step 2 of 2 — the bridge${N}"
echo "  You will be asked for your sudo password on this server."
echo

[[ -f "$RADIUS_ENV" ]] || die "$RADIUS_ENV does not exist.
        The RADIUS bridge has not been installed on this machine. Run:
          sudo ./scripts/local-server/install-radius-bridge.sh --nas $ROUTER"

# Rewritten in place rather than appended to. An appended duplicate would win
# on the next systemd load and then confuse anybody reading the file for why
# the setting "does not work" when it plainly says 1 three lines above.
sudo sh -c "
  tmp=\$(mktemp)
  grep -v '^RADIUS_HOTSPOT_PROFILES=' '$RADIUS_ENV' > \"\$tmp\"
  echo 'RADIUS_HOTSPOT_PROFILES=1' >> \"\$tmp\"
  cat \"\$tmp\" > '$RADIUS_ENV'
  rm -f \"\$tmp\"
  chmod 600 '$RADIUS_ENV'
" || die "could not write $RADIUS_ENV. Nothing was changed on the bridge."
ok "RADIUS_HOTSPOT_PROFILES=1"

sudo -n systemctl restart orm-radius || sudo systemctl restart orm-radius \
  || die "could not restart orm-radius. The setting is written but not loaded:
          sudo systemctl restart orm-radius"
ok "orm-radius restarted"

# --- 2b. Did it come back, and did it read the setting? ---------------------
# A bridge that failed to start is a Wi-Fi outage, so this is checked rather
# than hoped for, and the rollback is printed if it is not right.
sleep 2
if ! systemctl is-active --quiet orm-radius; then
  echo
  echo "${R}The bridge did not come back up.${N} Roll back now:"
  echo "  sudo sed -i 's/^RADIUS_HOTSPOT_PROFILES=.*/RADIUS_HOTSPOT_PROFILES=0/' $RADIUS_ENV"
  echo "  sudo systemctl restart orm-radius"
  echo
  journalctl -u orm-radius -n 20 --no-pager 2>/dev/null || true
  exit 1
fi
ok "orm-radius is running"

if journalctl -u orm-radius -n 40 --no-pager 2>/dev/null | grep -q 'remembered devices: ON'; then
  ok "the bridge reports: remembered devices ON"
else
  warn "could not read the bridge's startup line from the journal."
  warn "  Check it yourself: journalctl -u orm-radius -n 20"
fi

cat <<DONE

${B}Done. Now test it on a real phone${N}
  1. Forget UNTH-THEATRE-ORM on the handset, then rejoin.
  2. Sign in on the portal with the box ticked.
  3. Watch the bridge see it:
       sudo journalctl -u orm-radius -f
     The ACCEPT line should end with [kept signed in].
  4. Walk out of range, come back, and the portal should not appear.
     Check the phone's own Auto-join setting if it does not rejoin at all —
     no website can set that, and it is the usual reason.

${B}To undo all of it${N}
  sudo sed -i 's/^RADIUS_HOTSPOT_PROFILES=.*/RADIUS_HOTSPOT_PROFILES=0/' $RADIUS_ENV
  sudo systemctl restart orm-radius

  That one line is enough: with the flag off the bridge names no profile and
  every session behaves exactly as it did before any of this. The two profiles
  can be left on the router harmlessly — nothing is sent to them.

DONE
