#!/usr/bin/env bash
# =============================================================================
# Install the RADIUS -> ORM bridge as a service, and print the router commands.
# -----------------------------------------------------------------------------
# Run on the local server after setup-local-db.sh. Idempotent: re-running keeps
# the existing shared secret, because changing it silently breaks the hotspot
# until the router is updated to match.
#
#   ./install-radius-bridge.sh                  router defaults to the gateway
#   ./install-radius-bridge.sh --nas 192.168.88.1
# =============================================================================

set -euo pipefail

APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ENV_FILE="/etc/orm-radius.env"
UNIT="/etc/systemd/system/orm-radius.service"
NAS=""
# 24 hours: a full working day plus the changeover either side. Twelve put the
# expiry in the middle of a long list — authenticate at seven in the morning, be
# challenged again at seven in the evening, still in theatre.
#
# THIS is the value that actually takes effect. This script writes
# /etc/orm-radius.env, and the systemd unit loads it as an EnvironmentFile, so
# the default in radius-bridge.ts is consulted only when the variable is absent
# — and here it never is. Changing the code default alone left the bridge still
# reporting 43200s after a restart, which reads exactly like a failed change.
SESSION_TIMEOUT="${RADIUS_SESSION_TIMEOUT:-86400}"   # 24 hours

while [[ $# -gt 0 ]]; do
  case "$1" in
    --nas) NAS="$2"; shift 2 ;;
    -h|--help) sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
else B=""; G=""; Y=""; R=""; N=""; fi
step() { echo; echo "${B}==> $*${N}"; }
ok()   { echo "  ${G}ok${N}   $*"; }
die()  { echo; echo "${R}FAILED${N}  $*" >&2; exit 1; }

step "Checking the app"
[[ -f "$APP_DIR/.env.local" ]] || die "no .env.local — run setup-local-db.sh first"
TSX="$APP_DIR/node_modules/.bin/tsx"
# Use the installed binary, not npx: npx may try to fetch, and this server is
# expected to work during an internet outage.
[[ -x "$TSX" ]] || die "tsx not found at $TSX — run 'npm install' in $APP_DIR"
ok "app: $APP_DIR"

# Prisma's client reads DATABASE_URL from the PROCESS environment. Next loads
# .env.local for the web app, but a standalone script gets nothing, so the
# value is copied into the service's environment file explicitly.
DB_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env.local" | tail -1 | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')"
[[ -n "$DB_URL" ]] || die "no DATABASE_URL in .env.local"
case "$DB_URL" in
  *localhost*|*127.0.0.1*) ok "database: local" ;;
  *) echo "  ${Y}note${N} DATABASE_URL is not local — Wi-Fi sign-in will fail during an outage" ;;
esac

[[ -n "$NAS" ]] || NAS="$(ip route | awk '/^default/ {print $3; exit}')"
[[ -n "$NAS" ]] || die "could not detect the router address — pass --nas"
ok "router (NAS): $NAS"

step "Shared secret"
# Reuse whatever is already installed. Regenerating would leave the router
# using the old secret, and the only symptom is silent authentication failure.
SECRET=""
if [[ -f "$ENV_FILE" ]]; then
  SECRET="$(sudo grep -E '^RADIUS_SECRET=' "$ENV_FILE" | tail -1 | sed -E 's/^RADIUS_SECRET=//' || true)"
fi
if [[ -n "$SECRET" ]]; then
  ok "reusing the existing secret (the router keeps working)"
  SECRET_IS_NEW=0
else
  SECRET="$(openssl rand -hex 24)"
  ok "generated a new secret"
  SECRET_IS_NEW=1
fi

step "Writing the service"
sudo tee "$ENV_FILE" >/dev/null <<EOF
# Written by scripts/local-server/install-radius-bridge.sh
RADIUS_SECRET=${SECRET}
RADIUS_NAS=${NAS}
RADIUS_PORT=1812
RADIUS_SESSION_TIMEOUT=${SESSION_TIMEOUT}
DATABASE_URL=${DB_URL}
EOF
sudo chmod 600 "$ENV_FILE"
ok "$ENV_FILE (0600 — it holds the secret and the database password)"

sudo tee "$UNIT" >/dev/null <<EOF
[Unit]
Description=ORM RADIUS bridge (Wi-Fi captive portal authentication)
After=network-online.target postgresql.service
Wants=postgresql.service
# These belong in [Unit], not [Service]. Put in [Service] systemd ignores them
# with a warning most people never read, and Restart=always then means an
# unstartable service restarts forever — the failure that once reached 452
# restarts here, with a dead website as the only visible symptom.
StartLimitIntervalSec=60
StartLimitBurst=10

[Service]
Type=simple
User=$(id -un)
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${TSX} ${APP_DIR}/scripts/local-server/radius-bridge.ts
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
ok "$UNIT"

sudo systemctl daemon-reload
sudo systemctl enable --now orm-radius >/dev/null 2>&1 || sudo systemctl restart orm-radius
sleep 2

step "Verifying"
if systemctl is-active --quiet orm-radius; then
  ok "orm-radius is running"
else
  echo "  ${R}not running${N}. Recent log:"
  sudo journalctl -u orm-radius -n 20 --no-pager | sed 's/^/    /'
  die "the bridge did not start"
fi

if command -v ss >/dev/null && sudo ss -lunH "sport = :1812" 2>/dev/null | grep -q .; then
  ok "listening on udp/1812"
else
  echo "  ${Y}note${N} nothing appears to be listening on udp/1812 yet"
fi

cat <<EOF

${B}Now configure the MikroTik.${N} WebFig -> Terminal, one line at a time.

${B}1. Point the hotspot at this RADIUS server${N}
  /radius add service=hotspot address=$(hostname -I | awk '{print $1}') secret=${SECRET} timeout=5s
  /ip hotspot profile set [find name=orm] use-radius=yes login-by=http-pap

  ${Y}timeout=5s is not optional.${N} Passwords are checked with bcrypt, which
  takes about 100ms by design, and MikroTik's default RADIUS timeout of 300ms
  is too tight once the network is busy. Too short a timeout looks exactly
  like a wrong password.

  ${Y}login-by=http-pap is not optional either.${N} The default is CHAP, which
  requires the server to hold plaintext passwords. We hold bcrypt hashes, so
  CHAP can never succeed. See src/lib/radius/packet.ts.

${B}2. Let the portal load before anyone has logged in${N}
  /ip hotspot walled-garden ip add dst-address=$(hostname -I | awk '{print $1}') action=accept comment="ORM server"
  /ip hotspot walled-garden add dst-host=unth-theatre.orm action=allow comment="ORM portal"

  Without this, staff are redirected to a page they are not yet allowed to
  fetch — a portal that cannot load the portal.

${B}3. Hand over to the ORM sign-in page${N}
  Upload deploy/mikrotik/login.html to the router's "hotspot" directory
  (WebFig -> Files), replacing the stock login page.

${B}4. Watch it work${N}
  sudo journalctl -u orm-radius -f

  Each attempt logs ACCEPT or REJECT with the reason.
EOF

if [[ "$SECRET_IS_NEW" == "1" ]]; then
  echo
  echo "${Y}The secret above is new.${N} The router must be updated with it or"
  echo "authentication will fail silently. It is stored in $ENV_FILE."
fi
