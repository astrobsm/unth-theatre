# Local server — database on the premises

Scripts for the LAN server (Ubuntu) that runs ORM inside the hospital, so it
keeps working when the internet does not.

## The problem these solve

The local server was configured with the **cloud** database URL. When the
internet drops, Prisma cannot reach `aws-1-eu-west-1.pooler.supabase.com` and
every sign-in fails with:

```
Invalid `prisma.user.findFirst()` invocation:
Can't reach database server at `aws-1-eu-west-1.pooler.supabase.com:6543`
```

There is a **second, independent** fault behind the same symptom:
`NEXTAUTH_URL` was still the Vercel address. NextAuth builds its callback and
cookie from that value, so on `http://<lan-ip>:3000` the credentials callback
returns **401 even with a perfectly healthy database**. Fixing one alone looks
like no progress at all, which is why both are fixed together.

## Do this once, while the internet is up

```bash
cd /path/to/unth-theatre
git pull
chmod +x scripts/local-server/*.sh
./scripts/local-server/setup-local-db.sh --url http://192.168.88.252:3000
```

Then restart the app with the launcher:

```bash
./scripts/local-server/start-local.sh
```

Sign in. Unplug the network and sign in again — that is the whole point.

### This server runs a production build under PM2

Not `next dev`. That matters more than it sounds:

**`next dev` overwrites `.next` with development artifacts.** `next start` then
fails with *"Could not find a production build in the '.next' directory"* and PM2
restarts it forever — it reached 452 restarts here, and the only visible symptom
was a dead website. So never run `npm run dev` on this machine while PM2 serves
it. `start-local.sh` defaults to production, uses PM2 when PM2 owns the app, and
refuses `--dev` outright while PM2 is running.

If the build is missing, rebuild and restart:

```bash
./scripts/local-server/start-local.sh --rebuild
```

`ecosystem.config.cjs` in the repository root is the PM2 definition to use, and
fixes two faults in the ad-hoc setup it replaces: `TZ` was never `UTC`, and a
crashing app restarted without limit instead of stopping and being noticed.

```bash
pm2 delete orm 2>/dev/null; pm2 start ecosystem.config.cjs && pm2 save
```

It deliberately sets **no** database or auth variables. Next does not overwrite
variables already in `process.env`, so a stale `DATABASE_URL` there would
silently defeat the correct one in `.env.local` — and be very hard to find.

`--url` must be **exactly** the address staff type, including the port and with
no trailing slash. If you omit it the script uses the machine's first LAN IP.

## What the setup script does

1. Installs PostgreSQL if absent, adding the PGDG repository only if the
   distribution's version is older than 17 (the cloud runs 17.6, and `pg_dump`
   cannot be older than the server it reads).
2. Creates the `orm` role and database, reusing the existing password on a
   re-run so a copied `.env` does not silently stop working.
3. Copies the live schema **and data** down with `pg_dump`/`pg_restore`.
4. Rewrites `.env.local`: local `DATABASE_URL`/`DIRECT_URL`, a correct
   `NEXTAUTH_URL`, and the cloud URLs preserved as `CLOUD_*` for refreshes.
   Everything else in the file is kept, and the original is backed up.
5. Verifies: table count, that approved users exist, that an administrator
   exists, and that the migration history is intact.

It is idempotent. Run it again after a reboot or to refresh the data.

### Why it copies rather than replaying migrations

`prisma migrate deploy` would build the schema from the 67 migration folders.
The live database has drifted from those folders, and its migration history
contains a migration that failed twice before succeeding. Replaying is
therefore not guaranteed to reproduce what the application actually runs
against — so the live schema is copied instead.

This was rehearsed against the live database before shipping: the dump restores
into a vanilla PostgreSQL 18 with **zero errors**, producing 185 tables, 313
foreign keys, 134 enum types, 561 approved users, and 67 migrations recorded as
applied. The public schema contains no functions, views, triggers, RLS policies
or extension-dependent defaults, which is why nothing Supabase-specific comes
with it.

### Expected timings

| Step | Time |
| --- | --- |
| `pg_dump` from Supabase | 5–15 minutes (measured: 8m53s, 90 MB compressed) |
| `pg_restore` locally | under a minute (measured: 35s) |

The dump is not hanging. Leave it.

## Reaching it by name instead of by IP

```bash
./scripts/local-server/setup-hostname.sh --name unth-theatre.orm
```

That puts nginx in front on port 80 **and moves `NEXTAUTH_URL` to the new
origin**. The second half is the part people miss: a DNS entry added at the
router while `NEXTAUTH_URL` still names the IP produces a 401 on every sign-in,
because NextAuth builds its callback and cookie from that value.

Then, on the MikroTik:

```
/ip dns static add name=unth-theatre.orm address=<server-ip> ttl=1d comment="UNTH ORM"
/ip dns set allow-remote-requests=yes
/ip dns cache flush
```

Clients must be using the router for DNS. If DHCP hands out `8.8.8.8`, the name
will never resolve:

```
/ip dhcp-server network print
/ip dhcp-server network set [find] dns-server=<router-lan-ip>
```

### Then everybody uses the name

A session cookie belongs to the host it was set on. Once `NEXTAUTH_URL` is the
hostname, `http://<ip>:3000` will sign in and then behave as though signed out,
because the browser will not send that cookie to a different host. Keep the IP
and port for troubleshooting, not for staff.

### Two things the nginx config handles that a generic proxy snippet would not

- **`client_max_body_size 64m`.** Consent forms and imprest documents are stored
  as base64 data URLs, so bodies far exceed nginx's 1 MB default. The failure is
  a 413 that reads as the app rejecting an upload.
- **Buffering off for `/api/emergency-display/stream`.** That endpoint is
  Server-Sent Events. nginx buffers proxied responses by default, which would
  withhold each announcement until a buffer filled — the emergency board would
  connect, look healthy, and display nothing.

### `.orm` is not a real top-level domain

It works with a router DNS entry, and it is what was asked for. Be aware that
`.internal` is the TLD formally reserved for private networks, and `.local` is
reserved for mDNS and can behave oddly. Pass `--name` if you would rather avoid
any chance of a future collision.

## Wi-Fi captive portal — one sign-in for the network and the app

Staff join `UNTH-THEATRE-ORM`, are redirected to an ORM-branded page, enter
their ORM username (or phone number) and password once, and get **both** the
network and the application.

```bash
./scripts/local-server/install-radius-bridge.sh --nas 192.168.88.1
```

That installs `orm-radius.service`, which answers the hotspot's authentication
requests from the ORM database. **No password is ever copied into the router** —
the router holds only a shared secret, and every check is a bcrypt comparison
against the same `users` table the application uses.

The script prints the RouterOS commands to paste, including the generated
secret. Three of them are load-bearing:

| Setting | Why it is not optional |
| --- | --- |
| `login-by=http-pap` | The default is CHAP, which requires the server to hold **plaintext** passwords. We hold bcrypt hashes, so CHAP can never succeed. |
| `timeout=5s` on the RADIUS entry | bcrypt takes ~100–300ms by design. MikroTik's 300ms default is too tight, and a timeout looks exactly like a wrong password. |
| Walled-garden entries for the server | Before authenticating, a client can reach nothing — including the portal. Without these it is redirected to a page it is not yet allowed to fetch. |

Finally, upload `deploy/mikrotik/login.html` to the router's `hotspot` directory
(WebFig → Files) so its stock page hands over to the ORM portal.

Watch it work: `sudo journalctl -u orm-radius -f` — each attempt logs ACCEPT or
REJECT with the reason and the resolved account.

### Keep WPA2 on the SSID

Most captive portals sit on open Wi-Fi. This one must not. Because CHAP is
impossible, the portal password crosses the LAN in clear, and **WPA2 is what
protects it** in the absence of a TLS certificate. Turn on client isolation too,
so one phone cannot intercept another's traffic.

### Duplicate accounts limit phone-number sign-in

Measured against the live database: of 561 approved users, **20 have no phone
number** and **111 are on accounts sharing a number with another approved
account** — duplicate registrations of the same person, not shared handsets.

Sign-in handles this without guessing: a number resolving to one person works;
where duplicates share it, the account whose password matches is admitted; if
several match, it refuses and asks for the username rather than risk signing
somebody into a stale duplicate with a different role. Clearing the duplicates
under **Users → clean-up** would make phone sign-in work for nearly everyone.

## The part that is now your decision

**From the moment the local server writes to its own database, the two
databases diverge.** Work entered in theatre does not appear on the Vercel site,
and work entered there does not appear in theatre. Nothing here syncs them.

```bash
./scripts/local-server/local-vs-cloud.sh      # how far apart are they?
```

That compares row counts per table. It is deliberately crude — it cannot detect
the same record being *edited* differently in both places. Only a real sync
design can, which is exactly why `docs/manuals/hybrid-deployment.md` treats
that as a project rather than a setting.

So decide which copy is authoritative, and read Stage 2 of that manual before
the hospital relies on both. The three honest designs are set out there:
cloud-primary with a local read replica, local-primary with the cloud as a
read-only face, or bidirectional sync — which needs a written per-table
conflict policy agreed clinically, because two theatres editing one surgery in
two databases is a patient-safety question before it is an engineering one.

```bash
./scripts/local-server/refresh-from-cloud.sh  # DESTROYS local-only rows
```

That one replaces the local copy with the cloud's. It shows you what you would
lose and makes you type `REPLACE`.

## Still outstanding

Sign-in works over plain HTTP, but **service workers, `crypto.subtle` and
geolocation do not** — browsers restrict them to secure contexts, and
`http://192.168.88.252:3000` is not one. So on the LAN origin you lose
device-level offline caching, the encrypted offline login vault, and staff
location capture. That needs a hostname and an internal certificate; see
"HTTPS is not optional" in the hybrid deployment manual.
