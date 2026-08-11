# =============================================================================
# MikroTik hotspot -> ORM captive portal
# -----------------------------------------------------------------------------
# Paste into the MikroTik terminal (Winbox > New Terminal), or upload and run:
#   /import hotspot-setup.rsc
#
# Written down because this was configured by hand once and nobody could say
# afterwards what had been set. Every line here is reversible and idempotent.
#
# EDIT THESE TWO before running:
#   $srv    the theatre server's LAN address
#   $secret the RADIUS shared secret, same value as RADIUS_SECRET in
#           the server's .env.local
# =============================================================================

:local srv    "192.168.88.252"
:local secret "CHANGE-ME-same-as-RADIUS_SECRET"
:local host   "unth-theatre.orm"

# --- 1. The portal must be reachable BEFORE the person logs in --------------
# The hotspot blocks everything until authentication. The login page lives on
# the theatre server, not on the router, so without these the redirect points
# at something the device is not yet allowed to fetch and no portal appears.
# This is the step that is invariably missed.
/ip hotspot walled-garden
add dst-host=$host action=allow comment="ORM captive portal"
/ip hotspot walled-garden ip
add dst-address=$srv action=accept comment="ORM app server (page assets, API)"

# --- 2. Name resolution before login ----------------------------------------
# The device must resolve unth-theatre.orm while still unauthenticated.
/ip dns static
add name=$host address=$srv comment="ORM"

# --- 3. RADIUS: the router asks the app who this person is ------------------
# The app is the only place staff credentials exist, so the router delegates.
/radius
add service=hotspot address=$srv secret=$secret timeout=5s comment="ORM radius-bridge"

# --- 4. Hotspot profile ------------------------------------------------------
# login-by=http-pap is REQUIRED and is not the default.
#
# MikroTik prefers http-chap, which hashes the password with a challenge before
# sending it. That cannot work here: the app stores bcrypt hashes, and CHAP
# needs the plaintext on the server side to compute the same digest. PAP sends
# the password to the RADIUS bridge, which can then bcrypt-compare it.
#
# PAP sends the password in the clear over the LAN. That is acceptable on a
# hospital network the hotspot itself controls, and it is the only option that
# works against hashed credentials. It is also why RADIUS must point at the
# server by IP on the local subnet and never across the internet.
/ip hotspot profile
set [find default=yes] use-radius=yes login-by=http-pap html-directory=hotspot

# --- 5. Files ---------------------------------------------------------------
# Upload login.html and alogin.html (this folder) into the router's
# /hotspot directory with Winbox > Files, dragging them onto the file list.
#
#   login.html   bounces the browser to the app's portal page
#   alogin.html  runs after a SUCCESSFUL login and honours dst, which the app
#                sets to http://unth-theatre.orm/dashboard
#
# Without alogin.html the router falls back to its own page and the phone's
# mini-browser closes on the connectivity-check URL instead of opening ORM.

# --- 6. Check ---------------------------------------------------------------
#   /ip hotspot print
#   /ip hotspot active print          who is logged in right now
#   /radius monitor 0                 requests going out, replies coming back
#   /log print where topics~"radius"  authentication failures with a reason
