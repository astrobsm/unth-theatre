#!/usr/bin/env bash
# =============================================================================
# One address for home and hospital — the theatre server's half
# -----------------------------------------------------------------------------
#   sudo ./setup-tls.sh unth-theatre.link
#
# Gives the LOCAL server a genuinely valid certificate for the SAME hostname the
# cloud serves publicly. Staff then use one address everywhere: at home DNS
# sends them to Vercel, at the hospital the MikroTik answers with this machine,
# and neither the browser nor the person notices the difference.
#
# The certificate is issued by DNS-01 challenge: Let's Encrypt proves ownership
# by reading a TXT record rather than by connecting here. That matters, because
# this server has no public address and never should. It also means the name is
# allowed to resolve to 192.168.88.252 — a certificate says nothing about where
# a host lives.
#
# Needs outbound internet (Let's Encrypt + the deSEC API). Nothing inbound.
#
# DNS is at deSEC (desec.io), not Cloudflare. The domain is registered through
# Canva, which registers via Cloudflare, and Cloudflare will not serve a zone
# whose registration sits in a different Cloudflare account — it rejects the
# nameservers outright. deSEC is free, has a real API, and is run by a German
# non-profit.
#
# certbot --manual with hooks rather than a DNS plugin: Ubuntu packages no
# certbot plugin for deSEC, and a hook calling the REST API directly has no
# dependency that can rot. certbot stores the hook paths in the renewal config,
# so `certbot renew` re-runs them unattended.
#
# Before running, create a token at desec.io > Token management.
# =============================================================================

set -euo pipefail

HOST="${1:-}"
[[ -n "$HOST" ]] || { echo "Usage: sudo $0 <hostname>   e.g. unth-theatre.link" >&2; exit 1; }
[[ $EUID -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }

DESEC_INI="/etc/letsencrypt/desec.ini"
AUTH_HOOK="/etc/letsencrypt/desec-auth.sh"
CLEAN_HOOK="/etc/letsencrypt/desec-cleanup.sh"
APP_PORT="${ORM_PORT:-3000}"
EMAIL="${ORM_ADMIN_EMAIL:-sylvia4douglas@gmail.com}"
SERVER_IP="${ORM_SERVER_IP:-192.168.88.252}"

# The zone deSEC actually hosts. For a bare domain that is the host itself; for
# theatre.unth-theatre.link it is still unth-theatre.link.
ZONE="$(echo "$HOST" | awk -F. '{ if (NF>=2) print $(NF-1)"."$NF; else print $0 }')"

echo "==> Installing certbot and nginx"
apt-get update -qq
apt-get install -y -qq certbot nginx curl dnsutils

if [[ ! -f "$DESEC_INI" ]]; then
  echo
  echo "Paste the deSEC API token (desec.io > Token management):"
  read -rs TOKEN
  echo
  [[ -n "$TOKEN" ]] || { echo "No token given." >&2; exit 1; }
  # 0600 before anything is written, not after: a token must never exist on
  # disk world-readable, not even for the moment between create and chmod.
  install -m 600 /dev/null "$DESEC_INI"
  printf 'DESEC_TOKEN=%s\nDESEC_ZONE=%s\n' "$TOKEN" "$ZONE" > "$DESEC_INI"
  echo "  saved to $DESEC_INI (0600)"
else
  echo "  using existing $DESEC_INI"
fi

echo "==> Writing the DNS challenge hooks"
# Let's Encrypt asks for a TXT record at _acme-challenge.<host>. certbot runs
# the auth hook to publish it, verifies, then runs the cleanup hook.

install -m 700 /dev/null "$AUTH_HOOK"
cat > "$AUTH_HOOK" <<'AUTHEOF'
#!/usr/bin/env bash
set -euo pipefail
. /etc/letsencrypt/desec.ini

# The record sits under _acme-challenge, named relative to the hosted zone.
SUB="_acme-challenge"
if [ "$CERTBOT_DOMAIN" != "$DESEC_ZONE" ]; then
  SUB="_acme-challenge.${CERTBOT_DOMAIN%.$DESEC_ZONE}"
fi

# PUT replaces the whole rrset, so a stale value left by a failed run cannot
# linger and make the next validation ambiguous. deSEC takes TXT records in DNS
# presentation format, so the value carries its own quotes.
curl -sS --fail -X PUT "https://desec.io/api/v1/domains/$DESEC_ZONE/rrsets/" \
  -H "Authorization: Token $DESEC_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @- >/dev/null <<JSON
[{"subname":"$SUB","type":"TXT","ttl":3600,"records":["\"$CERTBOT_VALIDATION\""]}]
JSON

# Do NOT just sleep. A fixed wait is a guess, and the guess was wrong: with 45s
# Let's Encrypt's PRIMARY vantage point saw the record while its SECONDARY still
# got NXDOMAIN, which fails the whole request.
#
# So poll until BOTH of deSEC's authoritative nameservers actually serve the
# value, then allow a short margin for Let's Encrypt's own resolvers. This
# replaces "hope 45 seconds is enough" with "confirm it is there".
for attempt in $(seq 1 40); do
  ok=1
  for ns in ns1.desec.io ns2.desec.org; do
    if ! dig +short +time=3 +tries=1 TXT "$SUB.$DESEC_ZONE" "@$ns" 2>/dev/null          | grep -qF "$CERTBOT_VALIDATION"; then
      ok=0
    fi
  done
  if [ "$ok" = "1" ]; then
    echo "  challenge visible on both nameservers after ${attempt} check(s)"
    # Let's Encrypt uses several resolvers from several networks; a short margin
    # after the authoritative servers agree costs 15s and removes the remaining
    # race.
    sleep 15
    break
  fi
  sleep 5
done
AUTHEOF

install -m 700 /dev/null "$CLEAN_HOOK"
cat > "$CLEAN_HOOK" <<'CLEANEOF'
#!/usr/bin/env bash
set -euo pipefail
. /etc/letsencrypt/desec.ini

SUB="_acme-challenge"
if [ "$CERTBOT_DOMAIN" != "$DESEC_ZONE" ]; then
  SUB="_acme-challenge.${CERTBOT_DOMAIN%.$DESEC_ZONE}"
fi

# An empty record list removes the rrset. Left behind, a spent challenge TXT
# serves no purpose. Never fatal — the certificate is already issued by now.
curl -sS -X PUT "https://desec.io/api/v1/domains/$DESEC_ZONE/rrsets/" \
  -H "Authorization: Token $DESEC_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @- >/dev/null <<JSON || true
[{"subname":"$SUB","type":"TXT","ttl":3600,"records":[]}]
JSON
CLEANEOF

echo "==> Requesting a certificate for $HOST"
certbot certonly \
  --manual --preferred-challenges dns \
  --manual-auth-hook "$AUTH_HOOK" \
  --manual-cleanup-hook "$CLEAN_HOOK" \
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
    # unth-theatre.orm stays an alias so existing bookmarks and the captive
    # portal keep working through the changeover.
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $HOST unth-theatre.orm;

    ssl_certificate     /etc/letsencrypt/live/$HOST/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$HOST/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Theatre uploads: consent scans and signed paper forms are photographed on
    # phones and arrive large.
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

        # Server-sent events (theatre board, radio queue) must not buffer, or
        # updates arrive in clumps minutes late.
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

echo "==> Renewal"
# certbot's packaged timer runs twice daily and acts only inside the last 30
# days, so a few days offline across a renewal window is survivable.
systemctl enable --now certbot.timer >/dev/null 2>&1 || true
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/bin/sh
# A renewed certificate is not served until nginx re-reads it.
systemctl reload nginx
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# Proves the hooks work now, rather than discovering they do not in 60 days.
certbot renew --dry-run 2>&1 | tail -5

cat <<DONE

  Done on this machine. https://$HOST is served here.

  Three things remain, and the app WILL misbehave without the second one:

  1. MikroTik — answer this name with this server:
       /ip dns static add name=$HOST address=$SERVER_IP comment="ORM split-horizon"

  2. NEXTAUTH_SECRET must be IDENTICAL here and on Vercel.
     Sessions are signed JWTs. One address with two different secrets means a
     staff member signed in at home is silently signed out on arrival, with no
     error that explains it. Compare
       grep NEXTAUTH_SECRET ~/unth-theatre/.env.local
     against the Vercel project's environment variable.

  3. Set NEXTAUTH_URL=https://$HOST in ~/unth-theatre/.env.local, then
       pm2 restart orm --update-env

DONE
