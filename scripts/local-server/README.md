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
