#!/usr/bin/env bash
# =============================================================================
# Install the sync worker as a service.
# -----------------------------------------------------------------------------
#   ./install-sync-worker.sh
#
# Asks for the service token in the console, checks it against the cloud BEFORE
# installing anything, and refuses to proceed if the cloud rejects it — a
# worker installed with the wrong token looks healthy and moves nothing.
# =============================================================================

set -euo pipefail

APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ENV_FILE="/etc/orm-sync.env"
UNIT="/etc/systemd/system/orm-sync.service"
PEER="${SYNC_PEER_URL:-https://unth-theatre-mai.vercel.app}"

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
else B=""; G=""; Y=""; R=""; N=""; fi
ok()  { echo "  ${G}ok${N}   $*"; }
die() { echo; echo "${R}FAILED${N}  $*" >&2; exit 1; }

echo; echo "${B}Sync worker install${N}"; echo

TSX="$APP_DIR/node_modules/.bin/tsx"
[[ -x "$TSX" ]] || die "tsx not found — run 'npm install' in $APP_DIR"
[[ -f "$APP_DIR/.env.local" ]] || die "no .env.local — run setup-local-db.sh first"

DB_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env.local" | tail -1 | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')"
[[ -n "$DB_URL" ]] || die "no DATABASE_URL in .env.local"
case "$DB_URL" in
  *localhost*|*127.0.0.1*) ok "database: local" ;;
  *) die "DATABASE_URL is not local. The worker must run against the LOCAL database;
        pointed at the cloud it would sync the cloud to itself." ;;
esac

NODE_ID="$(psql "${DB_URL%%\?*}" -tAXc 'select node_id from sync_node where id' 2>/dev/null | tr -d '[:space:]' || true)"
[[ -n "$NODE_ID" ]] || die "sync tables not found — apply the sync migration first"
[[ "$NODE_ID" != "unset" ]] || die "node id is 'unset'. Set it before syncing:
        psql \"${DB_URL%%\\?*}\" -c \"update sync_node set node_id='local-unth' where id;\""
ok "node id: $NODE_ID"
ok "peer: $PEER"

# Reuse the installed token on a re-run: retyping 64 characters invites a typo,
# and a wrong one stops sync silently until somebody reads the log.
TOKEN=""
if [[ -f "$ENV_FILE" ]]; then
  TOKEN="$(sudo grep -E '^SYNC_SERVICE_TOKEN=' "$ENV_FILE" | tail -1 | sed -E 's/^SYNC_SERVICE_TOKEN=//' || true)"
  [[ -n "$TOKEN" ]] && ok "reusing the token already installed"
fi
if [[ -z "$TOKEN" ]]; then
  echo
  read -r -s -p "Paste the SYNC_SERVICE_TOKEN (the same one set in Vercel): " TOKEN
  echo
fi
[[ ${#TOKEN} -ge 32 ]] || die "that token is ${#TOKEN} characters; it must be at least 32"

# Prove it before installing. An unverified token produces a worker that runs,
# logs a 403 once a minute, and moves nothing.
echo; echo "${B}Checking the token against the cloud${N}"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 30 -X POST "$PEER/api/sync/push" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d "{\"protocol\":1,\"fromNode\":\"$NODE_ID\",\"entries\":[]}" || echo 000)"
case "$CODE" in
  200) ok "the cloud accepted it" ;;
  403) die "the cloud rejected that token (403). It does not match the one in Vercel." ;;
  401) die "the cloud wants a token it did not get (401). Check for stray spaces when pasting." ;;
  503) die "the cloud has no SYNC_SERVICE_TOKEN set, or has not been redeployed since it was added." ;;
  409) die "the cloud says that node id is its own. This server must not be called 'cloud'." ;;
  000) echo "  ${Y}note${N} could not reach $PEER — the internet may be down."
       read -r -p "  Install anyway and let the worker retry? [y/N] " a
       [[ "$a" == "y" || "$a" == "Y" ]] || die "stopped" ;;
  *)   die "unexpected response from the cloud: HTTP $CODE" ;;
esac

sudo tee "$ENV_FILE" >/dev/null <<EOF
# Written by scripts/local-server/install-sync-worker.sh
SYNC_SERVICE_TOKEN=${TOKEN}
SYNC_PEER_URL=${PEER}
SYNC_INTERVAL_MS=60000
DATABASE_URL=${DB_URL}
EOF
sudo chmod 600 "$ENV_FILE"
ok "$ENV_FILE (0600 — it holds the token and the database password)"

sudo tee "$UNIT" >/dev/null <<EOF
[Unit]
Description=ORM sync worker (local <-> cloud)
After=network-online.target postgresql.service
Wants=postgresql.service
# In [Unit], not [Service]: systemd ignores them in [Service] with a warning
# nobody reads, and Restart=always then loops forever on an unstartable service.
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=$(id -un)
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${TSX} ${APP_DIR}/scripts/local-server/sync-worker.ts
Restart=always
RestartSec=30
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
ok "$UNIT"

sudo systemctl daemon-reload
sudo systemctl enable --now orm-sync >/dev/null 2>&1 || sudo systemctl restart orm-sync
sleep 4

if systemctl is-active --quiet orm-sync; then
  ok "orm-sync is running"
else
  echo "  ${R}not running.${N} Recent log:"
  sudo journalctl -u orm-sync -n 20 --no-pager | sed 's/^/    /'
  die "the worker did not start"
fi

cat <<EOF

${B}Watch it work${N}
  sudo journalctl -u orm-sync -f

${B}Where things stand${N}
  psql "${DB_URL%%\?*}" -c "select count(*) filter (where ack_at is null) as waiting, count(*) as total from sync_journal;"
  psql "${DB_URL%%\?*}" -c "select * from sync_state;"

${B}Conflicts a person must resolve${N}
  psql "${DB_URL%%\?*}" -c "select table_name, row_id, reason, created_at from sync_conflicts where status='OPEN' order by created_at;"

${Y}Data now moves between the two databases.${N} Nothing is deleted by sync and
nothing is overwritten in the clinical tables, but administrative rows will
converge, and a growing OPEN conflict count is a queue waiting for a human.
Stop it at any time with:  sudo systemctl stop orm-sync
EOF
