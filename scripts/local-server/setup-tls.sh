#!/usr/bin/env bash
# =============================================================================
# One address for home and hospital — the theatre server's half
# -----------------------------------------------------------------------------
#   sudo ./setup-tls.sh theatre.unthorm.com
#
# Gives the LOCAL server a genuinely valid certificate for the SAME hostname
# the cloud serves publicly. Staff then use one address everywhere: at home DNS
# sends them to Vercel, at the hospital the MikroTik answers with this machine,
# and neither the browser nor the person notices the difference.
#
# The certificate is issued by DNS-01 challenge: Let's Encrypt proves ownership
# by reading a TXT record rather than by connecting here. That matters, because
# this server has no public address and never should. It also means the name is
# allowed to resolve to 192.168.88.252 — a certificate says nothing about where
# a host lives.
#
# Needs: outbound internet (Let's Encrypt + Cloudflare API). Nothing inbound.
#
# Before running, create a Cloudflare API token scoped to exactly one thing —
#   Zone : DNS : Edit,  limited to this one zone
# — at dash.cloudflare.com > My Profile > API Tokens. A global key would let
# this machine edit every domain in the account; there is no reason for that.
# =============================================================================

set -euo pipefail

HOST="${1:-}"
[[ -n "$HOST" ]] || { echo "Usage: sudo $0 <hostname>   e.g. theatre.unthorm.com" >&2; exit 1; }
[[ $EUID -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }

CF_INI="/etc/letsencrypt/cloudflare.ini"
APP_PORT="${ORM_PORT:-3000}"
EMAIL="${ORM_ADMIN_EMAIL:-sylvia4douglas@gmail.com}"

echo "==> Installing certbot with the Cloudflare DNS plugin"
apt-get update -qq
apt-get install -y -qq certbot python3-certbot-dns-cloudflare nginx

if [[ ! -f "$CF_INI" ]]; then
  echo
  echo "Paste the Cloudflare API token (Zone:DNS:Edit for this zone only):"
  read -rs TOKEN
  echo
  [[ -n "$TOKEN" ]] || { echo "No token given." >&2; exit 1; }
  install -m 600 /dev/null "$CF_INI"
  printf 'dns_cloudflare_api_token = %s\n' "$TOKEN" > "$CF_INI"
  # 600 before it is written, not after: a token must never exist on disk
  # world-readable, not even for the moment between create and chmod.
  echo "  saved to $CF_INI (0600)"
else
  echo "  using existing $CF_INI"
fi

echo "==> Requesting a certificate for $HOST"
# --dns-cloudflare-propagation-seconds: Cloudflare is fast but Let's Encrypt
# checks authoritative servers, and 10s default fails often enough to be
# annoying. 30 costs nothing on a job that runs twice a year.
certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials "$CF_INI" \
  --dns-cloudflare-propagation-seconds 30 \
  -d "$HOST" \
  --non-interactive --agree-tos --email "$EMAIL" \
  --keep-until-expiring

echo "==> Writing the nginx site"
cat > "/etc/nginx/sites-available/orm" <<NGINX
# UNTH Theatre ORM — local server.
# Serves the same hostname as the cloud, so one address works in both places.

server {
    listen 80;
    server_name $HOST unth-theatre.orm;
    # unth-theatre.orm stays as an alias so anything already bookmarked, and
    # the captive portal, keep working through the changeover.
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $HOST unth-theatre.orm;

    ssl_certificate     /etc/letsencrypt/live/$HOST/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$HOST/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Theatre uploads: consent scans and signed paper forms are photographed
    # on phones and arrive large.
    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        # Tells the app it is behind TLS, so it issues __Secure- cookies and
        # builds absolute URLs as https.
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_bypass \$http_upgrade;

        # Server-sent events (the theatre board, radio queue) must not buffer,
        # or updates arrive in clumps minutes late.
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/orm /etc/nginx/sites-enabled/orm
rm -f /etc/nginx/sites-enabled/default

echo "==> Checking the nginx config before reloading"
nginx -t
systemctl reload nginx

# Renewal: certbot's packaged timer runs twice daily and only acts inside the
# last 30 days, so a few days offline over a renewal window is survivable.
echo "==> Renewal"
systemctl enable --now certbot.timer >/dev/null 2>&1 || true
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/bin/sh
# A renewed certificate is not served until nginx re-reads it.
systemctl reload nginx
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
certbot renew --dry-run 2>&1 | tail -3

cat <<DONE

  Done on this machine. https://$HOST now works here.

  Three things remain, and the app WILL misbehave without the second one:

  1. MikroTik — answer this name with this server:
       /ip dns static add name=$HOST address=192.168.88.252 comment="ORM split-horizon"

  2. NEXTAUTH_SECRET must be IDENTICAL here and on Vercel.
     Sessions are signed JWTs. Same address plus different secrets means a
     staff member signed in at home is silently signed out on arrival, and
     cannot tell why. Compare:
       grep NEXTAUTH_SECRET ~/unth-theatre/.env.local
     against the Vercel project's environment variable.

  3. Set NEXTAUTH_URL=https://$HOST in ~/unth-theatre/.env.local, then
       pm2 restart orm --update-env

DONE
