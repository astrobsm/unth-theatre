#!/usr/bin/env bash
# =============================================================================
# Serve ORM by name on the hospital LAN, so staff stop typing an IP address.
# -----------------------------------------------------------------------------
# Run this ON THE LOCAL SERVER, after setup-local-db.sh. It is idempotent.
#
# It puts nginx in front of the app on port 80 and, crucially, moves
# NEXTAUTH_URL to the new origin. That second half is not optional: NextAuth
# builds its callback and cookie from NEXTAUTH_URL, so a hostname added at the
# router while NEXTAUTH_URL still names the IP gives a 401 on every sign-in.
#
# THE ONE RULE AFTERWARDS: EVERYBODY USES THE NAME.
#
# The session cookie belongs to the host it was set on. Once this is done,
# http://<ip>:3000 will authenticate and then immediately behave as though
# signed out, because the browser will not send a cookie set for the hostname to
# a different host. Keep :3000 for troubleshooting, not for staff.
#
#   ./setup-hostname.sh                              uses unth-theatre.orm
#   ./setup-hostname.sh --name theatre.unth.internal
#   ./setup-hostname.sh --dry-run
# =============================================================================

set -euo pipefail

SERVER_NAME="${ORM_SERVER_NAME:-unth-theatre.orm}"
UPSTREAM_PORT="${ORM_UPSTREAM_PORT:-3000}"
APP_DIR="${ORM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) SERVER_NAME="$2"; shift 2 ;;
    --port) UPSTREAM_PORT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
else B=""; G=""; Y=""; R=""; N=""; fi
step() { echo; echo "${B}==> $*${N}"; }
ok()   { echo "  ${G}ok${N}   $*"; }
warn() { echo "  ${Y}note${N} $*"; }
die()  { echo; echo "${R}FAILED${N}  $*" >&2; exit 1; }

TEMPLATE="$APP_DIR/deploy/nginx/orm.conf.template"
[[ -f "$TEMPLATE" ]] || die "template not found: $TEMPLATE"
[[ "$SERVER_NAME" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] \
  || die "'$SERVER_NAME' is not a valid hostname"

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

step "Checking prerequisites"
command -v nginx >/dev/null || die "nginx is not installed: sudo apt-get install -y nginx"
ok "nginx present"
[[ -f "$APP_DIR/.env.local" ]] || die "no .env.local — run setup-local-db.sh first"
ok "app directory: $APP_DIR"
ok "hostname: ${SERVER_NAME}  ->  ${LAN_IP:-<unknown>}:${UPSTREAM_PORT}"

case "$SERVER_NAME" in
  *.orm|*.local)
    warn "'.orm' is not a delegated top-level domain, and '.local' is reserved"
    warn "for mDNS. Both work with a router DNS entry today. '.internal' is the"
    warn "TLD formally reserved for private networks if you would rather not"
    warn "risk a future collision — pass --name to choose." ;;
esac

step "Writing the nginx site"
CONF_BODY="$(sed -e "s/__SERVER_NAME__/${SERVER_NAME}/g" \
                 -e "s/__UPSTREAM_PORT__/${UPSTREAM_PORT}/g" "$TEMPLATE")"

if [[ -d /etc/nginx/sites-available ]]; then
  TARGET="/etc/nginx/sites-available/${SERVER_NAME}.conf"
  LINK="/etc/nginx/sites-enabled/${SERVER_NAME}.conf"
else
  TARGET="/etc/nginx/conf.d/${SERVER_NAME}.conf"
  LINK=""
fi

if [[ $DRY_RUN == 1 ]]; then
  echo "  would write $TARGET:"
  printf '%s\n' "$CONF_BODY" | sed 's/^/    /'
else
  printf '%s\n' "$CONF_BODY" | sudo tee "$TARGET" >/dev/null
  ok "wrote $TARGET"
  if [[ -n "$LINK" ]]; then
    sudo ln -sfn "$TARGET" "$LINK"
    ok "enabled via $LINK"
  fi

  # nginx -t before reload: a bad config takes the whole web server down, and
  # this box may be serving other things.
  sudo nginx -t 2>&1 | sed 's/^/  /' || die "nginx rejected the configuration — nothing was reloaded"
  sudo systemctl reload nginx
  ok "nginx reloaded"
fi

step "Moving NEXTAUTH_URL to the new origin"
# nginx listens on 80, so the origin staff type carries no port. The app's own
# port stays internal and must NOT appear in NEXTAUTH_URL.
NEW_URL="http://${SERVER_NAME}"
CURRENT="$(grep -E '^NEXTAUTH_URL=' "$APP_DIR/.env.local" | tail -1 | sed -E 's/^NEXTAUTH_URL=//; s/^"//; s/"$//' || true)"
ok "was: ${CURRENT:-<unset>}"
ok "now: ${NEW_URL}"

if [[ $DRY_RUN == 0 ]]; then
  cp "$APP_DIR/.env.local" "$APP_DIR/.env.local.bak.$(date +%Y%m%d-%H%M%S)"
  TMP="$(mktemp)"
  grep -vE '^NEXTAUTH_URL=' "$APP_DIR/.env.local" > "$TMP" || true
  {
    echo "# Staff reach the server by name; this MUST match the origin they type,"
    echo "# or the credentials callback returns 401 however healthy the database is."
    echo "NEXTAUTH_URL=\"${NEW_URL}\""
  } >> "$TMP"
  mv "$TMP" "$APP_DIR/.env.local"
  chmod 600 "$APP_DIR/.env.local"
  ok "updated .env.local (previous copy kept alongside)"
fi

step "Restarting the app"
if [[ $DRY_RUN == 1 ]]; then
  echo "  would run: pm2 restart orm --update-env"
elif command -v pm2 >/dev/null && pm2 jlist 2>/dev/null | grep -q '"name":"orm"'; then
  pm2 restart orm --update-env >/dev/null
  ok "pm2 restarted orm"
  sleep 6
else
  warn "PM2 is not managing 'orm' — restart the app yourself so it re-reads .env.local"
fi

step "Verifying"
if [[ $DRY_RUN == 0 ]]; then
  # Test through nginx by sending the Host header, which works before DNS exists.
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 20 \
           -H "Host: ${SERVER_NAME}" "http://127.0.0.1/auth/login" || echo 000)"
  if [[ "$CODE" == "200" ]]; then
    ok "nginx -> app -> login page: HTTP $CODE"
  else
    warn "login page returned HTTP $CODE via nginx"
    warn "check: pm2 logs orm --lines 30 --nostream   and   sudo tail /var/log/nginx/error.log"
  fi
fi

cat <<EOF

${B}Now point the MikroTik at it.${N} On the router (Winbox terminal, or SSH):

  /ip dns static add name=${SERVER_NAME} address=${LAN_IP:-<server-ip>} ttl=1d comment="UNTH ORM"
  /ip dns set allow-remote-requests=yes
  /ip dns cache flush

Then make sure clients ask the router for DNS. If DHCP already hands out the
router as the DNS server, nothing more is needed. If it hands out 8.8.8.8 or
similar, that must change or the name will never resolve:

  /ip dhcp-server network print
  /ip dhcp-server network set [find] dns-server=<router-lan-ip>

${B}Check from a staff device:${N}
  nslookup ${SERVER_NAME}
  then browse to  ${B}http://${SERVER_NAME}${N}

${Y}One rule from here on: everybody uses the name.${N}
The session cookie belongs to the host it was set on, so
http://${LAN_IP:-<ip>}:${UPSTREAM_PORT} will now sign in and then behave as
though signed out. Keep the IP and port for troubleshooting only.

${Y}Two things a hostname alone does not fix.${N}
  * Phones with "Private DNS" or a browser using DNS-over-HTTPS bypass the
    router entirely and will not resolve ${SERVER_NAME}. Turn that off on the
    devices that need it.
  * This is still plain http, so service workers, the encrypted offline login
    vault and staff geolocation stay unavailable — browsers restrict those to
    secure contexts. The name is the prerequisite for fixing that: an internal
    certificate can now be issued for ${SERVER_NAME}, which was never possible
    for a bare IP address. See docs/manuals/hybrid-deployment.md.
EOF
