# Administrator guide

For system administrators and theatre management. Covers the things that are
configured once and then govern everybody else's day.

---

## 1. Roles and module access

Two layers:

1. **Role** — one per user, from a fixed list. Set on the user record.
2. **Module grants** — per-user additions on top of the role.

`ADMIN`, `SYSTEM_ADMINISTRATOR`, `THEATRE_MANAGER` and `THEATRE_CHAIRMAN` see
every module and cannot have access revoked by a grant.

### Role inheritance

`CONSULTANT_SURGEON` inherits everything `SURGEON` has. Promoting a resident
can therefore never remove access — a regression suite asserts it across every
module and permission.

`CONSULTANT_ANAESTHETIST` does **not** inherit `ANAESTHETIST`. That predates
this work and was left alone deliberately; changing it would alter existing
access for people already using the system.

### Granting a desk or a screen

Users → the user → module access. The catalogue is `src/lib/modules.ts`.

Note the two governance screens that are narrower than the module around them:

- `/dashboard/theatre-ops/performance` — consultants and management
- `/dashboard/theatre-ops/review` — management and the CMD / CMAC / DC-MAC

Consultants do **not** sit on the QA review by default. Judging whether a
colleague's case was avoidable is a governance function, not a peer one. Grant
it per user if the hospital decides otherwise.

---

## 2. Scheduled jobs

Configured in `vercel.json`. All times are **UTC**; Nigeria is UTC+1.

| Job | Schedule (UTC) | What it does |
| --- | --- | --- |
| `/api/maintenance/preop-alerts` | every 5 min, 04:00–18:59 | 60-minute preoperative alerts |
| `/api/maintenance/detect-delays` | every 5 min, 05:00–18:59 | Flags unexplained delays |
| `/api/maintenance/prune-location-pings` | 02:30 daily | Deletes location history past retention |
| `/api/deadline-checker` | various | Imprest deadlines and reminders |

Each maintenance job authenticates with `CRON_SECRET` as a bearer token. An
administrator opening one in a browser gets a **dry run** — it reports what it
*would* do and sends nothing. Add `?send=1` to run it for real.

**If `CRON_SECRET` is not set**, the scheduler cannot authenticate and the
jobs will not run. There will be no error on any screen; alerts and flags will
simply never appear.

---

## 3. Site geofence

| Setting | Default | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_HOSPITAL_LAT` | 6.4025 | Site centre |
| `NEXT_PUBLIC_HOSPITAL_LNG` | 7.5103 | Site centre |
| `HOSPITAL_SITE_RADIUS_M` | 900 | How far still counts as on site |

The radius covers the campus, not the theatre block. A radius that hugged the
theatres would report staff who are demonstrably at work as off site, and a
board that is wrong about people at work is worse than no board.

The check-in geofence **validates and discards**: the position is compared to
the site and thrown away, leaving a verdict and a distance rounded to 10 m.
There are no coordinate columns on the check-in table.

---

## 4. Thresholds

Changing these means editing the code; they are constants rather than settings
because each one has a paragraph of reasoning attached that a settings screen
could not carry.

| Constant | Value | Where |
| --- | --- | --- |
| Preoperative alert lead | 60 min | `lib/theatreOps/preopAlert.ts` |
| Stage-one warning | 30 min | `lib/theatreOps/delays.ts` |
| Stage-two flag | 45 min | `lib/theatreOps/delays.ts` |
| Emergency threshold | 60 min | `lib/theatreOps/delays.ts` |
| Turnover between cases | 20 min | `lib/theatreOps/scheduling.ts` |
| Emergency response overdue | 20 min | `lib/theatreOps/emergencyResponse.ts` |
| Minimum sample for a ranking | 10 cases | `lib/theatreOps/analytics.ts` |

---

## 5. Imprest duty assignment

Users → the user → imprest duties. The statutory chain (Requester, Head of
Department, Chief Accountant, Internal Auditor, Chief Medical Director) is
assigned here, and each holder's designation is what prints on vouchers.

Assigning a **Chief Accountant, Cashier or Internal Auditor** duty also opens
the Finance Desk for that user — reached by link, since the sidebar cannot see
imprest grants.

---

## 6. Two things that must be true for the system to be useful

### Milestones must be recorded

The performance dashboard, the delay detector, the punctuality figures and
every turnover statistic are derived from `PatientMovement` timestamps. Where
those are absent, the case is excluded from the figures.

A theatre that does not record milestones will see an empty dashboard
indefinitely, and it will look like a broken screen rather than an unrecorded
process. **Record completeness is shown as the headline figure on the
performance dashboard for exactly this reason.**

### People must be named on cases

The preoperative alert reaches people who are assigned to a case *and* have an
ORM account. A surgeon typed in as free text has nowhere to receive a
notification and nobody to check in. Thin assignment produces thin alerts.

---

## 7. Offline behaviour

Most screens serve a cached copy while offline. A small list of endpoints is
marked **always live** and will fail rather than serve stale data — status
boards, auth, administrative catalogues, the team check-in board and the
emergency response clock.

The reasoning is uniform: for these, a stale answer is worse than an error. A
cached check-in board would show an anaesthetist as present minutes after they
marked themselves unavailable.

The list is `ALWAYS_LIVE` in `src/lib/globalFetchInterceptor.ts`.

---

## 8. Data retention

Staff location pings are pruned nightly. Everything else is retained; nothing
in the theatre-operations module deletes a clinical or governance record.

**▢ Hospital policy** — UNTH's retention period for perioperative records and
QA review decisions.
