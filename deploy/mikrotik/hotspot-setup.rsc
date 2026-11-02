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
set [find where default=yes] use-radius=yes login-by=http-pap,cookie html-directory=hotspot

# --- 4b. Roaming: stop asking the same device to log in again ----------------
# THE VALUE IS `cookie`, NOT `mac-cookie`. The user profile's add-mac-cookie
# setting is what makes that cookie MAC-based; `mac-cookie` is not a login-by
# value and RouterOS 7.19 SILENTLY DROPS values it does not recognise. Setting
# login-by=http-pap,mac-cookie therefore reports success, changes nothing, and
# leaves the fault in place looking fixed. Verified on 7.19.6.
#
# What was actually wrong here, before this line existed: the router had
# add-mac-cookie=yes and a three-day cookie lifetime, so it was MINTING cookies
# and then refusing to accept them, because login-by listed only http-pap.
# Every re-association went back to the portal however long the RADIUS session
# was — one user authenticated 14 times in three days, another twice 17 minutes
# apart. That is not a session ending; it is a device the router has already
# authorised being treated as a stranger because it arrived on another AP.
#
# http-pap stays first: password login must keep working. The cookie is only
# issued to a device that has already authenticated with real credentials, and
# RADIUS still authorises every new session. This is recognition, not a bypass.
#
# NOTE ON SHARED DEVICES. Ten staff share eight handsets here — one MAC
# authenticated as two different nurses five hours apart. A cookie is bound to
# the DEVICE, so whoever used it last keeps the NETWORK session. That is
# acceptable only because the two are separate things: the ORM application
# still demands its own login and its own role. It must never be read as
# meaning network identity implies clinical identity.
/ip hotspot user profile
# mac-cookie-timeout ONLY. session-timeout is deliberately left alone — RADIUS
# returns Session-Timeout per login and that is the one place the rule should
# live; setting it here too would leave two numbers to disagree.
# keepalive-timeout is left at its existing 2m as well: with cookies accepted, a
# briefly-unreachable roaming client is re-recognised silently, so shortening
# the path by dropping keepalives buys nothing and risks stale sessions.
#
# add-mac-cookie is set EXPLICITLY. It was yes on this router because somebody
# typed it into Winbox once, and nothing recorded that. A router reset, a
# replacement unit, or a second site would have lost it silently — with the
# login-by=cookie line above still present and apparently correct.
set [find where default=yes] add-mac-cookie=yes mac-cookie-timeout=1d

# --- 4c. "Keep this phone signed in to the Wi-Fi" ---------------------------
# Staff asked to sign in to the network once and have the phone rejoin by
# itself from then on, rather than meeting the portal every morning. The
# default profile above already does that for ONE DAY, for everybody, with no
# say in it. Two things were wanted beyond that: longer, and a choice.
#
# mac-cookie-timeout is per-PROFILE, so a choice has to be two profiles. The
# RADIUS bridge names one of them in Mikrotik-Group on every Access-Accept,
# according to whether the person ticked the box on the portal. The names are
# constants in src/lib/hotspot/devices.ts and must match these exactly.
#
# A NAME THE ROUTER DOES NOT HAVE IS A REJECTED LOGIN, not an ignored
# attribute. That is why the bridge sends nothing at all until
# RADIUS_HOTSPOT_PROFILES=1 is set in /etc/orm-radius.env — run this file
# FIRST, then set it. install-radius-bridge.sh does both in that order.
#
# 90 days is what "permanently" can honestly mean on a hospital network: long
# enough that nobody on a rota meets the portal twice, short enough that a
# handset which left the building a term ago is a stranger again. The bridge
# pushes the matching row's expiry forward on every sign-in, so a phone in
# daily use is never asked.
#
# SET-OR-ADD, not remove-and-add like the sections above. A user profile that
# any session is currently on cannot be removed, so re-running this file in
# working hours would fail on the remove and leave the rest unapplied.
:if ([:len [/ip hotspot user profile find where name="orm-remembered"]] = 0) do={
  /ip hotspot user profile add name="orm-remembered" add-mac-cookie=yes mac-cookie-timeout=90d comment="ORM - staff who asked to stay signed in"
} else={
  /ip hotspot user profile set [find where name="orm-remembered"] add-mac-cookie=yes mac-cookie-timeout=90d comment="ORM - staff who asked to stay signed in"
}

# And the other half of the choice. A device here is authorised for this visit
# and forgotten afterwards — the shared handsets in theatre, and anybody who
# unticked the box. add-mac-cookie=no is the entire point of the profile.
:if ([:len [/ip hotspot user profile find where name="orm-one-visit"]] = 0) do={
  /ip hotspot user profile add name="orm-one-visit" add-mac-cookie=no comment="ORM - shared devices, not remembered"
} else={
  /ip hotspot user profile set [find where name="orm-one-visit"] add-mac-cookie=no comment="ORM - shared devices, not remembered"
}

# --- 5. Cache ---------------------------------------------------------------
# Devices hold DNS answers. Without this, a phone that looked the name up before
# the static entry existed keeps the old answer until its TTL expires.
/ip dns cache flush

:put "ORM portal: done. Check with /ip hotspot active print and /radius monitor 0"
