#!/usr/bin/env bash
# =============================================================================
# Deploy the captive portal to the MikroTik, without Winbox
# -----------------------------------------------------------------------------
#   ./deploy-mikrotik-portal.sh                      # defaults below
#   ./deploy-mikrotik-portal.sh 192.168.88.1 admin
#
# Uploads login.html and alogin.html to the router's hotspot directory, fills the
# RADIUS secret into hotspot-setup.rsc, imports it, and then VERIFIES the result.
#
# Written because the manual version — drag two files into Winbox, paste a script
# after editing a secret into it — gets done slightly differently each time, and
# nobody can afterwards say what the router is actually running. This script is
# the record of what was applied.
#
# Safe to re-run. The .rsc removes its own previous entries before adding them,
# so a second run produces the same state rather than "entry already exists".
# =============================================================================

set -euo pipefail

ROUTER="${1:-${MIKROTIK_HOST:-192.168.88.1}}"
RUSER="${2:-${MIKROTIK_USER:-admin}}"

APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$APP_DIR"
DEPLOY="deploy/mikrotik"
ENV_FILE="${ORM_ENV_FILE:-$APP_DIR/.env.local}"

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
else B=""; G=""; Y=""; R=""; N=""; fi
ok()   { echo "  ${G}ok${N}   $*"; }
warn() { echo "  ${Y}note${N} $*"; }
die()  { echo; echo "${R}FAILED${N}  $*" >&2; exit 1; }

for f in login.html alogin.html hotspot-setup.rsc; do
  [[ -f "$DEPLOY/$f" ]] || die "missing $DEPLOY/$f — run this from a checkout of the repo"
done

# --- The RADIUS secret ------------------------------------------------------
# Read from .env.local rather than asked for or passed on the command line: a
# secret in an argument shows up in ps output and in shell history.
SECRET="$(grep -E '^RADIUS_SECRET=' "$ENV_FILE" 2>/dev/null | tail -1 \
  | sed -E 's/^RADIUS_SECRET=//; s/^"//; s/"$//' || true)"
if [[ -z "$SECRET" ]]; then
  die "No RADIUS_SECRET in $ENV_FILE.
        The RADIUS bridge and the router must share one. Generate and store it:
          echo \"RADIUS_SECRET=\$(openssl rand -hex 24)\" >> $ENV_FILE
          sudo systemctl restart orm-radius
        then re-run this."
fi

echo
echo "${B}MikroTik${N} $RUSER@$ROUTER"
echo "${B}Portal${N}   $(grep -o 'https\?://[a-z0-9.-]*' "$DEPLOY/login.html" | head -1)"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)

# RouterOS runs a restricted SSH server: no shell, and each command is a RouterOS
# command. It also does not support connection multiplexing, so each step
# authenticates separately. sshpass avoids typing the password four times; if it
# is not installed the prompts are simply repeated, which is fine.
RUN_SSH() { ssh "${SSH_OPTS[@]}" "$RUSER@$ROUTER" "$@"; }
RUN_SCP() { scp "${SSH_OPTS[@]}" "$@"; }
if [[ -n "${MIKROTIK_PASSWORD:-}" ]] && command -v sshpass >/dev/null; then
  RUN_SSH() { sshpass -p "$MIKROTIK_PASSWORD" ssh "${SSH_OPTS[@]}" "$RUSER@$ROUTER" "$@"; }
  RUN_SCP() { sshpass -p "$MIKROTIK_PASSWORD" scp "${SSH_OPTS[@]}" "$@"; }
  ok "using MIKROTIK_PASSWORD (sshpass)"
elif [[ -n "${MIKROTIK_PASSWORD:-}" ]]; then
  warn "MIKROTIK_PASSWORD set but sshpass is not installed — you will be prompted."
  warn "  sudo apt-get install -y sshpass    (optional)"
else
  warn "you will be prompted for the router password a few times"
  warn "  export MIKROTIK_PASSWORD=... and install sshpass to avoid that"
fi

echo
echo "${B}1. Reachable?${N}"
# stderr is NOT discarded here. An earlier version swallowed it and printed a
# guess instead of the reason — the same mistake that left a sync failure
# unreadable for two days. Whatever the router says, the operator sees.
if ! RUN_SSH "/system identity print" >/dev/null; then
  die "cannot log in to $RUSER@$ROUTER over SSH — the router's own message is above.
        Common causes:
          wrong password              confirm it works in Winbox
          ssh service disabled        /ip service enable ssh
          user lacks the ssh policy   /user print detail
          wrong address or username   pass them: $0 <router-ip> <user>"
fi
ok "SSH works"

echo
echo "${B}2. Uploading the portal pages${N}"
# The hotspot html-directory is 'hotspot'. Uploading straight into it matters:
# RouterOS has no way to move a file afterwards, so a file landing in the root
# would have to be deleted and re-sent.
for f in login.html alogin.html; do
  RUN_SCP "$DEPLOY/$f" "$RUSER@$ROUTER:hotspot/$f" >/dev/null \
    || die "could not upload $f into hotspot/.
        If this router is older, its scp may not accept a directory. Then upload
        the two files by hand in Winbox > Files and re-run with --skip-upload."
  ok "$f"
done

echo
echo "${B}3. Applying the configuration${N}"
TMP_RSC="$(mktemp -t orm-hotspot-XXXXXX.rsc)"
# Delete on ANY exit, including failure: this file holds the RADIUS secret.
trap 'rm -f "$TMP_RSC"' EXIT
# The secret may contain / and & — awk, not sed, so no character needs escaping.
awk -v s="$SECRET" '{ gsub(/__RADIUS_SECRET__/, s); print }' \
  "$DEPLOY/hotspot-setup.rsc" > "$TMP_RSC"
grep -q '__RADIUS_SECRET__' "$TMP_RSC" && die "secret substitution failed"
chmod 600 "$TMP_RSC"

RUN_SCP "$TMP_RSC" "$RUSER@$ROUTER:orm-hotspot.rsc" >/dev/null \
  || die "could not upload the configuration script"
ok "uploaded"

RUN_SSH "/import file-name=orm-hotspot.rsc" || die "/import reported an error (above)"
ok "imported"

# Removed from the router immediately — it contains the shared secret and there
# is no reason for it to sit in the router's file list afterwards.
RUN_SSH "/file remove [find where name=\"orm-hotspot.rsc\"]" >/dev/null 2>&1 || true
ok "removed the uploaded script from the router"

echo
echo "${B}4. Verifying${N}"
# Verified rather than assumed. Each of these three is a silent failure mode:
# the wrong login-by makes every login fail, a missing walled-garden IP rule
# makes the portal never appear, and no RADIUS entry makes it fail closed.
PROFILE="$(RUN_SSH '/ip hotspot profile print terse where default=yes' 2>/dev/null || true)"
if grep -q 'login-by=.*http-pap' <<<"$PROFILE"; then
  ok "login-by includes http-pap"
else
  echo "  ${R}wrong${N} login-by is not http-pap — every login will fail"
  echo "         $PROFILE"
fi
grep -q 'use-radius=yes' <<<"$PROFILE" && ok "use-radius=yes" \
  || echo "  ${R}wrong${N} use-radius is not enabled"

WG="$(RUN_SSH '/ip hotspot walled-garden ip print terse' 2>/dev/null || true)"
grep -q '192.168.88.252' <<<"$WG" && ok "walled-garden IP rule present (needed for HTTPS)" \
  || echo "  ${R}missing${N} walled-garden IP rule — the portal will not load"

DNSOK="$(RUN_SSH '/ip dns static print terse where name~"unth-theatre"' 2>/dev/null || true)"
grep -q '192.168.88.252' <<<"$DNSOK" && ok "DNS points the name at the server" \
  || echo "  ${R}missing${N} static DNS entry"

FILES="$(RUN_SSH '/file print terse where name~"hotspot/"' 2>/dev/null || true)"
grep -q 'hotspot/login.html'  <<<"$FILES" && ok "login.html in place"  || warn "login.html not listed"
grep -q 'hotspot/alogin.html' <<<"$FILES" && ok "alogin.html in place" || warn "alogin.html not listed"

cat <<DONE

${B}Now test it properly${N}
  1. On a phone, forget the UNTH-THEATRE-ORM network, then rejoin it.
  2. The sign-in page should appear by itself, over HTTPS, with no
     "not secure" warning.
  3. Sign in with a phone number and password as they appear in the staff
     profile.
  4. The dashboard should open on its own, already signed in.

If it fails, the symptom says which piece:
  no portal at all          -> walled garden (the IP rule, since the page is HTTPS)
  portal shows, login fails -> RADIUS: is orm-radius running on the server?
                                 sudo systemctl status orm-radius
                                 ssh $RUSER@$ROUTER '/radius monitor 0'
  login works, nothing opens-> alogin.html missing or not honoured

DONE
