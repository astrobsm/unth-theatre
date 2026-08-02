# Technical reference

For whoever maintains the software. Covers the Theatre Supply Chain, Theatre
Billing and Theatre Operations Intelligence work.

---

## 1. Shape of the codebase

```
src/lib/theatreOps/     pure logic — no database, no framework
  clock.ts              WAT-explicit time conversion
  durations.ts          milestone timings, on-time %, turnover, utilisation
  delays.ts             41 categories, thresholds, assessment
  scheduling.ts         20-minute turnover, list planning
  analytics.ts          aggregation by theatre / specialty / department
  preopAlert.ts         the 60-minute alert: when, who, what it says
  checkIn.ts            check-in statuses and team readiness
  geofence.ts           validate-and-discard site check
  emergencyResponse.ts  the response clock and board

src/lib/stock/          batch quantities, FEFO, rules, access, reports, import
src/lib/billing/        pricing, invoice building, revenue distribution
src/lib/dashboards/     desk access matrix and shared helpers
```

**The pattern throughout:** decisions live in `lib`, are pure, and are what the
tests exercise. Route handlers fetch, call the pure function, and persist. If
a route contains arithmetic or a threshold, that is a bug waiting to diverge
from its test.

---

## 2. Tests

```
npm run test:all           everything
npm run test:lib           src/lib pure logic
npm run test:offline       offline + role model
```

There is no vitest dependency. `scripts/*/run-all.js` supplies the slice of
the vitest API these suites use, transpiles the **real** `src/lib` module with
the project's own TypeScript, and runs it. The tests therefore exercise
shipped code, not a copy of it.

`scripts/lib-tests/run-all.js` resolves relative imports, the `@/` alias and
Node builtins.

### Suites worth knowing about

| Suite | Guards |
| --- | --- |
| `clock.test.ts` | Sets `TZ` to New York and asserts one answer across four timezones |
| `checkIn.test.ts` | That `assessFix` never returns coordinates |
| `desks.test.ts` | The desk access matrix, including the imprest fallback |
| `test-role-groups.js` | That promotion never removes access; that menu and API gating agree |
| `test-module-paths.js` | That every catalogued path is a real page, both directions |

---

## 3. Time

**`lib/theatreOps/clock.ts` is the only place that converts a booked date plus
`"HH:MM"` into an instant.** Use `scheduledInstant`; never `setHours`.

`setHours` reads the *host's* timezone. On a laptop in Enugu that is UTC+1 and
correct; on Vercel it is UTC and every case in the hospital is read an hour
late. That was a live bug, found by comparing a rehearsal against production
data, and it made the delay detector an hour lenient.

`CLINIC_UTC_OFFSET_MINUTES = 60`. Nigeria has never observed daylight saving,
so a fixed offset is correct rather than merely convenient.

Note that `scheduledDate` is a **day**, stored at midnight — not the moment
the case starts. Filtering it against a window of hours drops the whole list
once the clock passes midnight UTC.

---

## 4. Idempotency

Three scheduled jobs write records. Each is idempotent by a **unique
constraint**, not by a check-then-write:

| Table | Unique on | Why |
| --- | --- | --- |
| `theatre_preop_alerts` | `surgeryId` | The job runs every 5 min; without it, 12 announcements an hour |
| `theatre_unexplained_delays` | `surgeryId` | Same, and every report built on it would double-count |
| `surgery_team_check_ins` | `(surgeryId, userId)` | One current answer per person per case |

The preop-alert job **claims the row before sending anything**. A push
provider failing must not undo the claim, or one bad minute becomes an hour of
a corridor speaker repeating itself.

---

## 5. Money

Integer **kobo** throughout billing and stock pricing (`Int`), and **basis
points** for percentages. Legacy `Decimal(10,2)` columns remain on older
models; do not mix them.

`lib/billing/revenue.ts` uses **largest-remainder** allocation so shares sum
exactly to the amount distributed.

---

## 6. Migrations

Every migration in this programme is **additive**: new tables, new nullable
columns, new enums. No column has been dropped or retyped.

### The two traps

1. **Verify FK column types against the live database before writing a
   migration.** `surgeries.id` is `TEXT`; `vendors.id` is `@db.Uuid`. Guessing
   caused a rolled-back migration earlier in the project.

2. **`prisma migrate diff` emits pre-existing drift.** Four unrelated tables
   report `updatedAt DROP DEFAULT` on every diff. Strip it. Applying it would
   change behaviour on tables nothing in this work touches.

Generate with `migrate diff --from-schema-datasource`, then hand-edit down to
the intended change.

---

## 7. Access control

Two independent layers, both enforced server-side:

- `lib/modules.ts` — path-to-module mapping, **longest-prefix wins**. This is
  what lets `/dashboard/theatre-ops/review` be narrower than
  `/dashboard/theatre-ops`. It is subtle and it fails silently, so
  `test-role-groups.js` pins it.
- `lib/dashboards/desks.ts`, `lib/stock/access.ts` — per-feature matrices used
  by the routes.

`effectiveRoles()` expands a role through the inheritance layer. Always
compare against it rather than the raw role string.

---

## 8. Offline

`ALWAYS_LIVE` in `globalFetchInterceptor.ts` lists endpoints that must never
be served from cache while online. Add to it when a screen's whole purpose is
to be current.

`PREFIX_ONLY_PATHS` in `modules.ts` lists catalogue paths that are access
prefixes with no page. Missing an entry causes a 404 in the console on every
load, because the offline warm-up prefetches every catalogued path.

---

## 9. Rehearsing against live data

Several bugs in this programme were invisible to the typechecker and to the
tests, and were found by running the logic against the production database
read-only before shipping:

- the preop-alert window filtered a day against a window of hours, so a full
  list returned nothing;
- a completed emergency reported "Cannot start — no surgeon";
- the timezone bug above.

The pattern: a small `.mjs` script that transpiles the real `lib` module,
queries with Prisma, and prints what *would* happen. Worth doing for anything
that runs unattended.

---

## 10. Environment

| Variable | Needed for |
| --- | --- |
| `DATABASE_URL` | Everything |
| `CRON_SECRET` | Scheduled jobs. **Without it they silently never run.** |
| `NEXT_PUBLIC_HOSPITAL_LAT` / `_LNG` | Geofence centre (defaults to Ituku-Ozalla) |
| `HOSPITAL_SITE_RADIUS_M` | Geofence radius (default 900 m) |
| `FCM_SERVICE_ACCOUNT` | Native push |
| Web push keys | Browser/PWA push |

---

## 11. Deploy

```
npx prisma migrate deploy     apply migrations first
npx prisma generate
npm run test:all
npx next build
git push origin master        Vercel builds from master
```

Migrations are applied against the live database before the code that needs
them is deployed. All of them are additive, so the old code tolerates the new
schema during the window between.
