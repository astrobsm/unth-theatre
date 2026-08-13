# Staff activity → meal eligibility — Phase 1 assessment

Required by §58 and §61 before any code. Written after reading the existing meal,
roster, duty and activity paths.

---

## A. How ORM handles this today

| Concern | Where it lives |
|---|---|
| Staff / users | `User` + `UserRole` enum, plus a role-inheritance layer for `CONSULTANT_SURGEON` |
| Roster | `Roster` — `userId`, `date`, `shift`, `staffCategory`, `location`, `subRole` |
| Case participation | `SurgicalTeamMember` (userId + surgery + role); `Surgery.scrubNurseId`, `anesthetistId`, `surgeonId` |
| Theatre team | `TheatreAllocation`, and `TheatreTeamAssignment` (added this week — many people per role, each attributed) |
| Duty start/stop | `POST /api/duties/start`, `/api/duties/end` |
| Meals | `TheatreMeal`, `MealOrder`, `/api/meals/{eligibility,menu,orders}`, `/dashboard/theatre-meals` |
| Audit | `AuditLog` |
| Offline | Service Worker + IndexedDB, global offline queue with idempotency keys |
| Real-time | SSE — `/api/notifications/stream`, `/api/radio/events` |

**Eligibility is already computed server-side** in
`src/app/api/meals/eligibility/route.ts`, and it already looks at four things:
the roster, `SurgicalTeamMember`, porter transport recorded on
`HoldingAreaAssessment`, and porter/cleaner work on `TheatreCaseFlow`.

So the idea in the specification is not absent. It is half-built.

---

## B. Gap analysis — the one that matters

```ts
if (roster) {
  return NextResponse.json({ eligible: true, ... });
}
```

**Being rostered grants a meal today.** That single branch is the rule §3 asks to
remove, and it short-circuits the activity checks written directly beneath it —
the porter and cleaner logic below only ever runs for people who are NOT rostered.
So the activity evidence the hospital already collects is being computed and then
skipped for exactly the people most likely to be rostered.

Everything else follows from that:

1. **No activity record.** Activity is inferred by querying four tables at request
   time. There is nothing to audit, nothing to weigh, no "why was this person
   eligible" answer after the fact, and no way to add a fifth source without
   editing the endpoint.
2. **Only four sources.** A CSSD technician, biomedical engineer, pharmacist,
   anaesthetic technician or recovery nurse has NO pathway — §24's requirement
   that every legitimate worker has a realistic way to demonstrate activity is
   not met.
3. **Eligibility is not separated from dispensing.** `MealOrder` records an order;
   there is no eligibility snapshot proving why it was allowed (§34).
4. **No override with a reason** (§31), and no unverified/linked distinction
   carried through to eligibility (§30).
5. **Nothing is configurable** (§22, §45). The rule is code.

---

## C. Proposed data model — 3 new tables, not the spec's implied many

```
StaffActivity        append-only. userId, activityCode, activityDate, weight,
                     sourceType, sourceId, surgeryId?, theatreId?, roleAtTime,
                     idempotencyKey (unique), createdAt
                     @@unique([userId, activityCode, sourceType, sourceId, activityDate])
                        -- opening the same case 50 times is one activity

ActivityRule         roleCategory, activityCode, weight, countsTowardEligibility,
                     maxPerDay, isActive
                     -- so the hospital changes rules without a deploy (§45)

MealEligibilitySnapshot  taken AT DISPENSE. userId, date, service, ruleUsed,
                     activityCount, activityScore, qualifyingActivityIds,
                     override, overrideReason, overrideById, dispensedById
                     -- answers "why did this person get lunch" a year later (§49)
```

`Roster`, `SurgicalTeamMember`, `TheatreAllocation`, `TheatreTeamAssignment`,
`MealOrder`, `AuditLog` and `User` are all reused unchanged. No new staff, role,
roster or booking entity — §51.

**Sync classification:** `StaffActivity` must be `APPEND_ONLY`; an activity
recorded on either node happened. Snapshots are `CLOUD_AUTHORITATIVE`.

---

## D. Activity matrix — where the work is already observable

The important column is the third: almost everything is already recorded, so §15
and §59 are satisfied by hooking existing writes rather than adding buttons.

| Role | Activity | Existing source in ORM | Auto | Weight |
|---|---|---|---|---|
| Surgeon | Case completed | `POST /api/surgeries/[id]/complete` | yes | 3 |
| Surgeon | Post-op notes signed | `/api/surgeries/[id]/post-op-notes` | yes | 3 |
| Surgeon | Case booked | `POST /api/surgeries` | yes | 1 |
| Anaesthetist | Pre-anaesthetic review | `/api/preop-reviews` | yes | 3 |
| Anaesthetist | Anaesthesia record | `/api/surgeries/[id]/anesthesia` | yes | 3 |
| Anaesthetic technician | Machine/equipment check | `/api/anesthesia-setup/equipment-check` | yes | 2 |
| Anaesthetic technician | Theatre setup | `/api/anesthesia-setup/start` | yes | 2 |
| Scrub / circulating nurse | Count performed | `/api/surgeries/[id]/count` | yes | 2 |
| Theatre nurse | Holding-area assessment | `/api/holding-area` | yes | 2 |
| Theatre nurse | Theatre setup | `/api/theatre-setup` | yes | 2 |
| Recovery nurse | PACU admission / vitals | `/api/pacu`, `/api/pacu/[id]/vitals` | yes | 2 |
| Pharmacist | Prescription packed | `/api/prescriptions/[id]/pack` | yes | 2 |
| Pharmacist | Medication issued | `/api/medication-tracking/collect` | yes | 2 |
| Porter | Patient transported | `/api/transport/start` + `/end` | yes | 2 |
| Porter | Called-up patient delivered | `PatientCallUp` / `TheatreCaseFlow` | yes | 2 |
| Cleaner | Cleaning completed | `/api/cleaning/start` + `/end` | yes | 2 |
| CSSD | Set sterilised / issued | `/api/cssd-sterilization`, `/api/cssd-inventory/[id]/issue` | yes | 2 |
| Blood bank | Request acknowledged | `/api/blood-requests/[id]/acknowledge` | yes | 2 |
| Lab | Investigation result entered | `/api/investigations` | yes | 2 |
| Biomedical | Fault resolved | `/api/fault-alerts/[id]/resolve` | yes | 2 |
| Power / oxygen / plumbing | Readiness or fault entry | `/api/power-readiness`, `/api/oxygen/readiness`, `/api/plumbing-water-supply` | yes | 2 |
| Any | Duty started | `/api/duties/start` | yes | **0** |
| Any | Login | NextAuth | n/a | **0** |

Login and duty-start are recorded at weight 0 deliberately: they show intent and
are useful in the exception report, and they must never qualify anyone (§26, §60).

**Every category in §4 has at least one pathway.** That was the test the current
implementation fails.

---

## E. Eligibility algorithm

```
expected  = rostered OR on a surgical team OR named in TheatreTeamAssignment
            OR allocated to a theatre today
if !expected and no activity -> NOT_ELIGIBLE

activities = StaffActivity for (user, date) where countsTowardEligibility
score      = sum(weight), each activityCode capped at its maxPerDay
policy     = ActivityRule for the person's role, else the default

if activities.length < policy.minimumActivities -> NOT_ELIGIBLE (with reason)
if score < policy.minimumScore                  -> NOT_ELIGIBLE (with reason)
if alreadyDispensed(user, date, service)        -> ALREADY_DISPENSED
-> ELIGIBLE
```

Being rostered makes someone **expected**, never eligible. That is the whole
change in one line.

The reason for refusal is returned, not just the verdict — §28's "no qualifying
theatre activity recorded today" plus the list of activities that would count for
that role. A staff member told only "not eligible" will argue with the nurse
serving lunch; one told what is missing goes and does it.

---

## F. Implementation plan

1. `src/lib/activity/rules.ts` — pure: weights, dedup key, scoring, eligibility.
   **Tested first**, as with the pre-op and pack rules.
2. Migration for the three tables + sync classification.
3. `recordStaffActivity()` service — validate, dedup on the unique key, weigh,
   write, all in the caller's transaction.
4. Hook the ~22 existing endpoints in the matrix. One line each, voided so it can
   never fail the clinical action it observes — the pattern already used for the
   draft estimate and procedure statistics.
5. Rewrite `/api/meals/eligibility` over the engine; keep the response shape.
6. Upgrade `/dashboard/theatre-meals` — badges, counts, last activity, reason,
   dispense, override.
7. Offline: reuse the existing queue and idempotency keys. No second mechanism.

---

## G. Migration plan

Additive only. Three new tables, no column dropped, no existing row touched.
Indexes on `(userId, activityDate)`, `(activityDate, activityCode)`, and the
unique dedup key. Reversible: dropping the tables restores today's behaviour,
since the current endpoint queries source tables directly.

---

## H. Testing plan

Pure-function tests first: dedup, capping, scoring, role rules, date boundaries,
already-dispensed, override. Then integration: roster→activity→eligibility,
booking→activity→eligibility, task→activity→eligibility, offline→sync→eligibility
with no duplicate. Security: activity submitted for another user, override without
permission, double dispense.

---

## The honest part

This is a fortnight of work — 22 endpoint hooks, three tables, an engine, a UI and
an offline path — and it sits behind an unfinished estimate module, the Conflict
Resolver, the music module and the captive portal.

But **the single most valuable line is small**: deleting `if (roster) return
eligible` and requiring one qualifying activity. The four activity sources that
already exist are computed and then skipped. Fixing that alone converts the
current "rostered = fed" into "rostered and did something = fed" for surgeons,
porters and cleaners, today, with no new tables.

I would ship that first, then build the engine underneath it — rather than have
the hospital wait a fortnight for a rule that can be corrected this afternoon.
