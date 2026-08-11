# Next hospital visit — step by step

Everything that needs to be done standing next to the server, in an order where
each step can be checked before the next one depends on it. If a check fails,
stop there: every later step assumes the earlier ones worked.

Allow about an hour. Steps 2 and 3 briefly interrupt Wi-Fi, so avoid a running
list if you can.

---

## 0. Before you leave home

Confirm the public half is live:

```bash
nslookup unth-theatre.link 8.8.8.8      # expect 216.150.1.1
```

and that `https://unth-theatre.link` loads the app in a browser.

**Do not start step 4 until this works.** The certificate request needs deSEC
answering publicly, and Let's Encrypt rate-limits failed attempts — a premature
try costs an hour, not a minute.

Bring: the **deSEC API token**, and the Vercel **NEXTAUTH_SECRET** (Vercel →
Settings → Environment Variables).

---

## 1. Tailscale — do this first

Not because it is urgent, but because everything after it becomes retryable
from home instead of needing another trip.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh
```

It prints a URL — open it, sign in, done. Then:

```bash
sudo systemctl enable tailscaled
tailscale ip -4
```

**Check:** install Tailscale on your laptop, sign in with the same account, and
from the laptop:

```bash
ssh emmanuel@unth-theatre-server
```

If that works, the rest of this runbook can be finished from home if you run
out of time.

---

## 2. TP-Link → Access Point mode

Nothing about the captive portal works until this is done. In router mode the
TP-Link NATs staff onto 192.168.0.x, where the MikroTik hotspot never sees them.

1. Connect a laptop by **Ethernet** to one of its LAN ports (not via the
   MikroTik — in router mode it is a separate network).
2. Browse to `http://192.168.0.1` or `http://tplinkwifi.net`.
3. `Advanced` → `System Tools` → `Operation Mode` → **Access Point** → Save.
   It reboots, about two minutes.
4. Wireless settings: SSID **`UNTH-THEATRE-ORM`**, security **None / Open**.

Open is deliberate. The captive portal *is* the authentication — a WPA password
on top means two secrets for one door, and the one you would print on a wall is
the weaker of the two.

**Check:** connect a phone to `UNTH-THEATRE-ORM` and look at its IP.

- `192.168.88.x` → correct, carry on
- `192.168.0.x` → still routing; the mode change did not take

Then find the TP-Link's new address in the MikroTik (`IP → DHCP Server →
Leases`) and write it down — in AP mode it becomes a DHCP client and
`192.168.0.1` no longer reaches it.

---

## 3. Pull the latest code

```bash
cd ~/unth-theatre
git pull --ff-only
bash scripts/local-server/apply-migrations.sh   # LOCAL db — npm run build targets the CLOUD
npm run build
pm2 restart orm --update-env
```

**Check:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/auth/login   # expect 200
```

---

## 4. Certificate for the shared hostname

```bash
sudo bash scripts/local-server/setup-tls.sh unth-theatre.link
```

Prompts once for the deSEC token. It takes a couple of minutes — most of it is
a deliberate 45-second wait for DNS propagation, twice (once for the
certificate, once for the renewal dry-run that proves renewals will work
unattended).

**Check:** the script ends with a dry-run result. It must say the renewal
simulation succeeded. If it does not, renewals will fail silently in 60 days
and the site will go down on a random morning — fix it now, not then.

---

## 5. Point the hospital at the local server

On the MikroTik (Winbox → New Terminal):

```
/ip dns static add name=unth-theatre.link address=192.168.88.252 comment="ORM split-horizon"
```

**Check:** from a phone on the hospital Wi-Fi, open `https://unth-theatre.link`.
It must load **with a valid padlock and no warning**. Any certificate warning
means step 4 did not complete — do not tell staff to "continue anyway", that
teaches exactly the wrong habit.

To be sure you are hitting the local server and not the cloud:

```bash
curl -s https://unth-theatre.link/api/version
```

---

## 6. NEXTAUTH_SECRET — the one that will bite

```bash
grep NEXTAUTH_SECRET ~/unth-theatre/.env.local
```

Compare with Vercel's value. **They must be identical.**

Sessions are signed JWTs. One address with two different signing secrets means
a staff member who signed in at home is silently signed out on arrival at the
hospital, with nothing in the interface explaining why. It reads as "the app
keeps logging me out" and is miserable to diagnose after the fact.

If they differ, copy **Vercel's value into the server** — not the other way
round, which would log out every cloud user at once.

While you are in that file:

```
NEXTAUTH_URL=https://unth-theatre.link
```

then:

```bash
pm2 restart orm --update-env
```

The cookie code keys on the URL scheme, so moving to https makes it issue
`__Secure-` cookies by itself.

---

## 7. Captive portal

Get the RADIUS secret:

```bash
grep RADIUS_SECRET ~/unth-theatre/.env.local
```

Then on the MikroTik:

1. Open `deploy/mikrotik/hotspot-setup.rsc`, put that secret into `$secret`,
   and paste the whole file into Winbox → New Terminal.
2. Winbox → **Files** → drag in `login.html` and `alogin.html` from
   `deploy/mikrotik/`, into the `hotspot` directory.

**Check:** forget the network on a phone, rejoin `UNTH-THEATRE-ORM`. The sign-in
page should appear by itself. Log in with a phone number and password as they
appear in the staff profile. **The dashboard should open on its own, already
signed in** — no address typed.

If it authenticates but no app appears, `alogin.html` is not in place. If no
portal appears at all, it is the walled garden — see the notes below.

---

## 8. Confirm sync is still healthy

```bash
DB=$(grep -E '^DATABASE_URL=' ~/unth-theatre/.env.local | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//'); DB=${DB%%\?*}
psql "$DB" -c "select consecutive_errors, last_pull_ok_at, last_push_ok_at from sync_state;"
psql "$DB" -c "select count(*) from sync_deferred where resolved_at is null;"
```

Expect `consecutive_errors = 0`, recent timestamps, and `0` deferred.

---

## How the automatic launch works

Worth understanding, because if it breaks, the fault is always in one of three
places.

1. Phone joins the open network and probes a plain-HTTP address to test for
   internet. The MikroTik intercepts it and serves **`login.html`**.
2. `login.html` bounces the browser to the app's own portal page at
   `https://unth-theatre.link/hotspot/login`, passing `link-login-only` — the
   URL the router's form must be posted to.
3. The staff member enters phone number and password. The page does **two**
   things with one submission: signs them into ORM (setting the session
   cookie), then posts to the router with `dst` set to
   `https://unth-theatre.link/dashboard`.
4. The router authenticates against the app over RADIUS, grants network access,
   and serves **`alogin.html`**, which redirects to `dst`.
5. The dashboard opens, already signed in.

The three things that each break it, silently and differently:

- **No walled-garden IP rule** → no portal at all. Now that the portal is HTTPS
  this is the rule that matters: MikroTik can read a hostname only in plain
  HTTP, and inside TLS it sees an IP and nothing else, so the `dst-host` rules
  never match.
- **`login-by` left at the default** → portal appears, login always fails.
  MikroTik prefers CHAP, which cannot work against bcrypt hashes: CHAP needs
  the plaintext server-side to compute its digest. Must be `http-pap`.
- **`alogin.html` missing** → login succeeds and nothing opens. The router falls
  back to the *originally requested* URL, which on a phone is a
  connectivity-check address, so the mini-browser decides the internet works
  and closes.

## Known limitation, worth telling staff once

On iPhones the portal runs in a restricted mini-browser rather than Safari. The
dashboard opens there and works, but if someone dismisses it and opens Safari,
that is a separate browser with separate cookies and they may have to sign in
again. Android usually hands off to Chrome cleanly.

If that turns out to irritate people, the fix is a one-time handoff token in the
redirect so the real browser adopts the session — worth doing only if it
actually bites.
