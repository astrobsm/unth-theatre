# Hybrid deployment — cloud and local server

How to run ORM from Vercel **and** from a server inside the hospital, in two
stages: LAN speed first, outage resilience second.

Written August 2026.

---

## Read this first: one origin per device

The two servers are two **origins**. A browser keeps its service-worker cache,
its IndexedDB and its offline mutation queue **per origin** — they are not
shared and cannot be.

The consequence that will bite you:

> Work saved offline on the LAN origin is stored in the LAN origin's
> IndexedDB. Opening the cloud origin will **not** find it, and will **not**
> sync it. It stays queued until that device returns to the LAN origin.

So decide, per device, which origin is its normal home, and treat the other as
a failover that is only used deliberately. A nurse who switches back and forth
during a network wobble can strand queued writes in whichever origin she is
not currently looking at.

Two smaller consequences of the same fact:

- **Push subscriptions are per-origin.** A user who signs in on both will hold
  two subscriptions and receive some notifications twice.
- **Offline login vaults are per-origin.** Enrolling for offline sign-in on the
  cloud origin does not enrol the LAN origin.

**▢ Hospital policy** — which theatres and devices default to the LAN origin,
and who tells staff to switch during an outage.

---

## HTTPS is not optional

Service workers, `crypto.subtle` and `navigator.geolocation` are all restricted
to **secure contexts**: HTTPS, or `localhost` exactly. Serve the local instance
over plain `http://192.168.x.x` and the app quietly loses

| Feature | What breaks |
| --- | --- |
| Service worker | No offline caching. The app stops working when the network drops — the entire point of the local server. |
| `crypto.subtle` | No encrypted offline login. Staff cannot sign in while offline. |
| `navigator.geolocation` | No staff check-in geofence, no location on availability. |
| Secure cookies | `NEXTAUTH_URL` on `https` issues a `secure` cookie, which a browser never sends over `http` → **401 on every authenticated request**. |

Three of those four have already been observed in this project. They are not
theoretical.

### The chosen approach: hostname + internal certificate

1. Give the local server a hostname on the hospital DNS, e.g.
   `theatre.unth.local`, resolving to its LAN address.
2. Issue a certificate for that hostname from the hospital's internal CA.
3. Install the CA root on every device that will use it — this is the step
   that has to reach phones and tablets, not just desktops, and it is the one
   people forget.
4. Terminate TLS in front of the app (nginx or Caddy) and proxy to Node on
   `127.0.0.1:3000`.

`localhost` on the server itself is already a secure context, so the app is
happy behind the proxy; the browser only ever sees the HTTPS hostname.

**Do not use a self-signed certificate without installing the CA.** A browser
that shows a certificate warning refuses to register a service worker even if
the user clicks through, so you get HTTPS with none of its benefits.

---

## Stage 1 — LAN server, cloud database

The local server runs the same code against the **same** Supabase database.
One source of truth, nothing to reconcile. It buys speed on the LAN and a
second way in when Vercel itself is unreachable; it does **not** survive the
hospital's internet going down, because the database is still in the cloud.

### What must be IDENTICAL on both

| Variable | Why |
| --- | --- |
| `NEXTAUTH_SECRET` | Sessions are signed with it. Different values mean a session issued by one server is rejected by the other, so every failover forces everybody to sign in again. |
| `DATABASE_URL`, `DIRECT_URL` | Same database. This is what makes stage 1 safe. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Either server must be able to push to a subscription the other created. |
| `FCM_SERVICE_ACCOUNT` | Same, for native app push. |
| `NEXT_PUBLIC_HOSPITAL_LAT` / `_LNG`, `HOSPITAL_SITE_RADIUS_M` | The geofence must agree, or a check-in reads "on site" on one and "off site" on the other. |
| `SMTP_*` | Same mail path. |
| `LOCATION_PING_RETENTION_DAYS` | Retention must not depend on which server pruned. |

### What must DIFFER

| Variable | Cloud | Local |
| --- | --- | --- |
| `NEXTAUTH_URL` | `https://unth-theatre-mai.vercel.app` | `https://theatre.unth.local` |
| `NEXT_PUBLIC_APP_URL` | same as above | same as above |

`NEXTAUTH_URL` must match the origin the browser actually used. This is the
single most common cause of "I cannot log in" on a second origin.

### What must exist on the CLOUD ONLY

| Variable | Why |
| --- | --- |
| `CRON_SECRET` | Scheduled jobs — preoperative alerts, delay detection, ping pruning — run on Vercel. |

Do **not** schedule the same jobs on the local server. They are idempotent
(every one is guarded by a unique constraint) so running twice would not
corrupt anything, but it doubles the database work for no gain and makes the
logs impossible to read.

### `NEXT_PUBLIC_*` is baked at BUILD time

Anything prefixed `NEXT_PUBLIC_` is compiled into the client bundle, not read
at runtime. The local server therefore needs its **own build** with its own
values — you cannot copy Vercel's build output and change the variables
afterwards.

### Set `TZ=UTC` on the local server

Vercel runs in UTC. If the local server runs in WAT, the two instances compute
different day boundaries for anything that still uses local-time day windows,
and "today's list" can differ between them by an hour at the edges.

Clinical times are already timezone-explicit (`lib/theatreOps/clock.ts` states
WAT once and never asks the host), so start times and lateness are safe either
way. Day windows are not, so match Vercel and set `TZ=UTC`.

### Standing it up

```bash
git clone https://github.com/astrobsm/unth-theatre.git
cd unth-theatre
npm ci

# .env.production.local — see the tables above
npm run build      # runs prisma generate + migrate deploy, then next build
npm start          # listens on 127.0.0.1:3000 behind the TLS proxy
```

Note that `npm run build` runs `prisma migrate deploy` against
`DATABASE_URL`. In stage 1 that is the **production** database. Build the local
server when you are ready for it to apply any pending migration, or run
`next build` alone and apply migrations deliberately from one place.

Run it under a supervisor that restarts on boot — `pm2`, a systemd unit, or
Windows Service via `nssm`.

---

## Stage 2 — surviving an internet outage

Be clear-eyed: this is a **project, not a configuration change.** Stage 1 is
env vars and a proxy. Stage 2 changes where the truth lives.

### What already protects you

The app is offline-first at the **device** level: a service worker serves the
shell, IndexedDB holds the data, and writes queue with idempotency keys and
replay when the network returns. A theatre whose internet drops for an hour
already keeps working on the devices that were already open.

That covers more than people expect. Do stage 1, then measure how often the
device-level offline mode is actually insufficient, before building stage 2.

### If you do need it

The honest options, worst trade last:

**A. Local Postgres as a read replica.** Logical replication cloud → local.
During an outage the local server serves reads; writes are refused and fall
back to the device queue. Simple, safe, no reconciliation — and no new writes
during the outage beyond what devices queue.

**B. Local Postgres as primary, cloud as replica.** Inverts stage 1. Right
answer if data must stay on the premises. The cloud becomes the read-only
public face and Vercel loses the ability to write.

**C. Bidirectional sync.** Both writable, changes merged. Do not do this
without a conflict policy written down first, per table, agreed clinically.
Two theatres editing one surgery in two databases is a patient-safety question
before it is an engineering one.

### What is scripted today, and what it is not

`scripts/local-server/setup-local-db.sh` puts a full copy of the database on the
local server and corrects `NEXTAUTH_URL`, which together are what make sign-in
work with the internet down. Run it once while online; it is idempotent.

Be clear about what that is: **an independent copy, not any of A, B or C above.**
It buys immediate offline operation at the cost of divergence — the local server
and the cloud both accept writes and neither learns of the other's. That is
acceptable while one of them is the only one actually in use. It is not
acceptable indefinitely, and `scripts/local-server/local-vs-cloud.sh` exists so
the drift is visible rather than assumed.

Choosing A, B or C is still the decision that has to be made.

### Whichever you choose

- **One writer for migrations.** Schema changes must be applied in one place
  and replicate, never applied twice.
- **Sequences and IDs are already safe** — every model uses UUIDs, so two
  databases cannot collide on primary keys.
- **The idempotency layer already exists** (`lib/idempotency.ts`) and is used
  by the write paths that matter, so replayed writes do not duplicate.
- **The unique constraints are your friend.** Preoperative alerts, unexplained
  delays, team check-ins, invoices and procedure names are all uniquely keyed,
  so a double-applied sync cannot create two of them.

**▢ Hospital policy** — who declares an outage, who switches staff to the
local origin, and who confirms reconciliation afterwards.

---

## Verifying a local install

Work down this list; each item fails independently.

| Check | Expected |
| --- | --- |
| `https://theatre.unth.local` loads with no certificate warning | Green padlock on a phone, not just a desktop |
| Sign in | Succeeds. A 401 loop means `NEXTAUTH_URL` does not match the origin. |
| DevTools → Application → Service Workers | One registered and activated. Absent means the context is not secure. |
| Turn off Wi-Fi, reload | App still opens. This is the whole point. |
| Staff availability → set Available | Location captured. Absent means geolocation is blocked by a non-secure context. |
| `/api/version` | Returns the commit the local server was built from |
| Scheduled jobs | Should run on the cloud only. Confirm the local server has no `CRON_SECRET` and no cron scheduler. |

---

## Quick reference

```
# ---- Cloud (Vercel project settings) ----
NEXTAUTH_URL=https://unth-theatre-mai.vercel.app
NEXT_PUBLIC_APP_URL=https://unth-theatre-mai.vercel.app
CRON_SECRET=<generate once, cloud only>
# + every shared value below

# ---- Local server (.env.production.local) ----
NEXTAUTH_URL=https://theatre.unth.local
NEXT_PUBLIC_APP_URL=https://theatre.unth.local
TZ=UTC
# no CRON_SECRET, no cron scheduler
# + every shared value below

# ---- Shared, byte-identical on both ----
NEXTAUTH_SECRET=
DATABASE_URL=
DIRECT_URL=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
FCM_SERVICE_ACCOUNT=
NEXT_PUBLIC_HOSPITAL_LAT=6.4025
NEXT_PUBLIC_HOSPITAL_LNG=7.5103
HOSPITAL_SITE_RADIUS_M=900
LOCATION_PING_RETENTION_DAYS=
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

`VERCEL_OIDC_TOKEN` is issued by Vercel's build environment. It has no meaning
on the local server; leave it out.
