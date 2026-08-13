# ORM backlog

Refreshed 2026-08-13. Ordered by consequence, and split by who can act — half of
what is left needs a person at the hospital, not more code.

---

## 1. Needs you

### 1.1 Deploy to the theatre server — FOUR migrations pending
```bash
su - emmanuel                       # not root: pm2 is per-user
cd ~/unth-theatre && git pull --ff-only
bash scripts/local-server/apply-migrations.sh
npm run build && pm2 restart orm --update-env
```
`preop_override`, `theatre_team_assignments`, `procedure_pack_maps`,
`conflict_resolver`. Everything below assumes this has happened.

### 1.2 Finish the captive portal
The router has been power-cycled. Remaining:
```
/system/device-mode/print          # expect fetch: yes
/tool fetch url=".../login.html"  dst-path="hotspot/login.html"  check-certificate=no
/tool fetch url=".../alogin.html" dst-path="hotspot/alogin.html" check-certificate=no
```
then paste the walled-garden / RADIUS / profile block with the secret from
`.env.local`, and `sudo systemctl restart orm-radius`.

**Until this is done, staff passwords cross the LAN in clear text.** Tell people
not to use the Wi-Fi sign-in page.

### 1.3 Price the 361 pack items
`docs/pack-pricelist.csv` → fill the `amount` column → Settings → Price Master.
Sorted by how many packs use each item; the first fifty cover most of the
complex. **Estimates produce nothing until this is done.**

Re-run with `--unpriced-only` to see what is left; empty means finished.

### 1.4 Confirm procedure → pack mappings
Admin Board → Procedure Packs. **None are confirmed, so bookings attach no packs
yet** — by design, since a wrong pack gets opened before anyone notices. The top
twenty by booking count is an afternoon.

### 1.5 Rotate three credentials
All appeared in a chat log:
- Supabase **access token** — still valid, used twice on 12 Aug
- Supabase **database password**
- MikroTik **admin password**

### 1.6 Verify NEXTAUTH_SECRET matches Vercel
Server fingerprint `0412d2e901e5` (sha256, first 12). One address with two signing
secrets silently signs staff out when they change building.

### 1.7 Vercel environment
`NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` → `https://unth-theatre.link`, then
redeploy. `NEXT_PUBLIC_APP_URL` builds the link in the WhatsApp estimate message.

---

## 2. Needs me — ordered

### 2.1 Meals screen: render the tri-state **[do first]**
`/api/meals/eligibility` now returns `verified: false` + `requiresVerification`
for roster-only, but `/dashboard/theatre-meals` does not show it. **A rule nobody
can see is worse than no rule** — it currently neither enforces nor informs.
Smallest remaining change with real consequence.

### 2.2 Verify the estimate PDF renders in a browser
Never done. The node-side render hung, and jsPDF is a browser library. The
watermark uses graphics-state opacity and text `angle`, neither seen working here.
It is the patient-facing artefact and it is unproven.

### 2.3 Conflict Resolver — everything past the schema
Schema, migration and sync classification are committed (`bd0b74c`). Remaining:
- State machine as one pure tested function (13 statuses, illegal transitions)
- Statistical engine — consensus, disagreement clusters, minority positions
- Decision wizard and survey builder
- Response capture, offline-tolerant (idempotency key already on the model)
- Review, approval chain, publication
- Institutional PDF export, reusing `institutionalPdf.ts`

### 2.4 Estimates builder UI
List, PDF, approve and WhatsApp all work. Costing lines BY HAND does not — there
is no screen to add or edit a line, only autofill from packs.

### 2.5 Meal activity engine
Per `docs/meal-activity-assessment.md`: `StaffActivity`, `ActivityRule`,
`MealEligibilitySnapshot`, and ~22 endpoint hooks. Gives pharmacy, CSSD,
biomedical and recovery a pathway — they have none today, which is exactly why
2.1 is tri-state rather than a block.

### 2.6 Music module
`docs/music-module-assessment.md`. Not started. Autoplay is now fixed, but nginx
still caps uploads at 25 MB, and ORM has no filesystem storage at all — this
module would introduce the first, with the backup consequences that brings.

### 2.7 Infrastructure
- **`npm run build` on the server migrates the CLOUD.** Prisma reads `.env`, Next
  reads `.env.local`. Bit us twice on 13 Aug — once applying a migration early,
  once failing a build when the network dropped.
- `sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target`
- `pm2 startup && pm2 save`
- Tailscale subnet routing (`--advertise-routes=192.168.88.0/24`) so the MikroTik
  is reachable from home — would already have saved a trip.

---

## 3. Loose ends

- **Pre-capture rows never synced.** Capture journals future changes only. One
  patient was seeded by hand; no general backfill was done.
- **10 anaesthetist placeholder accounts** still need real names.
- **Phase-2 clinical sync classifications** need a clinician to confirm.
- **Same-origin cache risk.** One address now serves two databases, so the service
  worker and offline vault are shared between hospital and cloud. If a stale list
  is reported after moving between them, the fix is a cache key that includes
  which node served the data.

---

## Done — 12–13 Aug 2026

**Sync** — bi-directional sync fixed and verified (75 entries, 0 deferred). Three
faults, each hiding the next: an error handler that destroyed its own diagnostics,
JSON values bound as native types, and a missing parent table with head-of-line
blocking.

**Single address** — `unth-theatre.link` live in both buildings, DNS-01
certificate with a working renewal simulation. Tailscale remote access.

**Safety** — radio audio no longer fails silently; emergency alerts can be shrunk
but never dismissed, and reopen on each new alert; milestones announce at the
moment they are recorded.

**Booking** — booking-time column and LATE BOOKING flag; list grouped by unit with
per-unit theatre assignment; theatre choice removed from both booking forms;
emergency team from the roster; consent mandatory with a recorded override for
emergencies, shown in the holding area.

**Team** — scrub, circulating, consultant anaesthetist, anaesthetist and
technicians, several per role, each assigned by their own service and attributed;
visible on the readiness board.

**Estimates** — engine, pricing, pack loader, institutional PDF layer, WhatsApp
share, auto-draft at booking, and the screen they are given out from. 69 tests.

**Packs** — merge by the maximum not the sum, mapping confirmed once by a person,
review screen, multi-procedure booking, automatic requests. 27 tests.

**Holding area / PACU** — today's called-up patients only, search, completion
tick, admitted patients removed.

**Meals** — `if (roster) return eligible` removed; activity decides, with a
tri-state for roles that have no pathway yet.

**Also** — the naira sign was corrupting every money figure in existing PDFs, and
`prisma migrate diff` twice proposed destroying the sync layer and was caught both
times.
