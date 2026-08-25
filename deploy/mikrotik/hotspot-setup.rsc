# =============================================================================
# MikroTik hotspot -> ORM captive portal
# -----------------------------------------------------------------------------
# Applied by scripts/local-server/deploy-mikrotik-portal.sh, which fills in the
# RADIUS secret and imports this over SSH. It can also be pasted by hand into
# Winbox > New Terminal after replacing __RADIUS_SECRET__.
#
# IDEMPOTENT. Every section removes its own previous entries (matched by an ORM
# comment) before adding them back, so re-running produces the same state instead
# of "failure: entry already exists". Only entries this file created are touched —
# anything the hospital added by hand is left alone.
# =============================================================================

:local srv    "192.168.88.252"
:local secret "__RADIUS_SECRET__"
:local host   "unth-theatre.link"
:local alias  "unth-theatre.orm"

:put "ORM portal: configuring for $host -> $srv"

# --- 1. The portal must be reachable BEFORE the person logs in --------------
# The hotspot blocks everything until authentication, and the login page lives on
# the theatre server rather than the router. Without these the redirect points at
# something the device may not yet fetch, and no portal appears at all.
/ip hotspot walled-garden
:foreach i in=[find where comment~"^ORM"] do={ remove $i }
add dst-host=$host action=allow comment="ORM captive portal"
add dst-host=$alias action=allow comment="ORM captive portal (legacy name)"

/ip hotspot walled-garden ip
:foreach i in=[find where comment~"^ORM"] do={ remove $i }
# THIS is the rule that carries the load now the portal is HTTPS. MikroTik can
# read a hostname only in plain HTTP; inside TLS it sees an IP and nothing else,
# so the dst-host rules above would silently never match.
add dst-address=$srv action=accept comment="ORM app server (page assets, API)"

# --- 2. Name resolution before login ----------------------------------------
/ip dns static
:foreach i in=[find where comment~"^ORM"] do={ remove $i }
add name=$host address=$srv comment="ORM split-horizon - same name the cloud serves"
add name=$alias address=$srv comment="ORM legacy name"

# --- 3. RADIUS: the router asks the app who this person is ------------------
# The app is the only place staff credentials exist, so the router delegates.
/radius
:foreach i in=[find where comment~"^ORM"] do={ remove $i }
add service=hotspot address=$srv secret=$secret timeout=5s comment="ORM radius-bridge"

# --- 4. Hotspot profile ------------------------------------------------------
# login-by=http-pap is REQUIRED and is not the default.
#
# MikroTik prefers http-chap, which cannot work here: the app stores bcrypt
# hashes, and CHAP needs the plaintext server-side to compute the same digest.
# PAP sends the password to the RADIUS bridge, which bcrypt-compares it.
#
# PAP sends the password in the clear over the LAN. That is acceptable on a
# network the hotspot itself controls, and it is the only scheme that works
# against hashed credentials — which is also why RADIUS must point at the server
# by IP on the local subnet and never across the internet.
/ip hotspot profile
set [find where default=yes] use-radius=yes login-by=http-pap,mac-cookie html-directory=hotspot

# --- 4b. Roaming: stop asking the same device to log in again ----------------
# mac-cookie is what makes a second access point stop being a second login.
#
# Without it the portal is shown on RE-ASSOCIATION, not on expiry, and the
# RADIUS log shows exactly that: one user authenticated 14 times in three days
# and another twice 17 minutes apart, against a session that lasts hours. Walking
# from one theatre to the next is enough to trigger it. That is not a session
# ending — it is the router treating a device it has already authorised as a
# stranger because it arrived on a different AP.
#
# The cookie is issued after a successful login and presented on re-association,
# so the device is recognised instead of challenged. It is NOT a bypass: the
# cookie is only issued to a device that has already authenticated with real
# credentials, it expires with the timeout below, and RADIUS still authorises
# every new login.
#
# NOTE ON SHARED DEVICES. Ten staff share eight handsets here — one MAC
# authenticated as two different nurses five hours apart. A cookie is bound to
# the DEVICE, so whoever used it last keeps the NETWORK session. That is
# acceptable only because the two sessions are separate things: the ORM
# application still demands its own login and its own role. It must not be
# enabled on the assumption that network identity implies clinical identity.
/ip hotspot user profile
set [find where default=yes] mac-cookie-timeout=1d session-timeout=1d idle-timeout=none keepalive-timeout=none

# --- 5. Cache ---------------------------------------------------------------
# Devices hold DNS answers. Without this, a phone that looked the name up before
# the static entry existed keeps the old answer until its TTL expires.
/ip dns cache flush

:put "ORM portal: done. Check with /ip hotspot active print and /radius monitor 0"
