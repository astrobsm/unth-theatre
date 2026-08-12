# ORM backlog — everything outstanding

Compiled 2026-08-12 from the full working session. Kept in the repo rather than a
chat so it survives, and so anyone can see what was asked for and what is left.

Ordered by consequence, not by when it was asked. Items marked **[safety]** affect
clinical communication or patient records and should not be queued behind
paperwork features.

---

## 1. Now — patient-safety communication

### 1.1 Radio announcements play silently **[safety]**
`src/components/RadioPlayer.tsx:382`

```ts
a.play().catch(() => { emitRadioIdle(); onDone?.(); });
```

Browsers reject `play()` with `NotAllowedError` until the page has had a user
gesture. That `catch` discards the rejection and marks the announcement **done**,
so the visual alert appears, no audio plays, and nothing records that it did not.
On a wall display nobody has tapped since boot, that is every announcement.

- Distinguish `NotAllowedError` from real playback failure
- One-tap "Enable theatre audio" prompt; remember the unlock; replay the queue
- An announcement that was never heard must NOT be marked completed — leave it
  pending or log it unheard, so the rate of this is measurable
- Interim for staff: tap each display once after it loads

### 1.2 Emergency alert layout obstructs the view **[safety]**
Buttons and overlays cover the case detail underneath. Staff work around
obstructions by ignoring them, which is the opposite of the intent.

- Bounded banner rather than a floating overlay
- Dismissible without losing access to the case
- Critical information legible at distance (theatre display, not a phone)

### 1.3 Milestone announcements are late **[safety]**
Trace the trigger path — likely polling where an event-driven push would be
immediate. Milestones that arrive late are worse than absent, because people stop
trusting the timing.

---

## 2. Next — requested and half-built

### 2.1 Group the day's list by unit, with a per-unit assign button
The API is done (`POST /api/theatres/assign-unit`, commit `0d87dc8`) and the
booking form no longer offers a theatre. What is missing is the screen: the
scheduled list still groups by theatre, so there is nowhere to press.

- Group `groupedSchedule` in `src/app/dashboard/surgeries/page.tsx` by unit
- Prominent assign-theatre control against each unit's group
- Show the currently assigned theatre per unit

**Until this lands, the feature is unreachable from the UI.**

### 2.2 Emergency booking: no theatre or team selection
The surgeon or house officer should book the case and nothing else.

- Remove theatre and anaesthetic-team pickers from the emergency form
- Auto-assign the anaesthetic team from the duty roster
- Where no roster is uploaded, the resident anaesthetist assigns the team —
  and **the booking must still submit** in the meantime
- Never block an emergency booking on an administrative gap

### 2.3 Consent and laboratory results mandatory **[safety]**
- **Elective:** hard block. No consent or labs, no submission.
- **Emergency:** same requirement, with a **recorded clinical override** —
  the booker states why (unconscious, next of kin absent, life-threatening
  delay), stamped with their name, and the case carries a prominent
  CONSENT OUTSTANDING flag on the board and in the holding area until resolved.

Agreed explicitly: a hard block on an emergency would mean theatre never hears
about the case, and the safest place for an unconsented emergency patient is a
booked theatre with a team on the way.

### 2.4 Procedure → pack mapping, and multi-procedure booking
- Attach a consumable pack and a pharmacy pack to every procedure in the catalogue
- On selection, auto-request to the pack provider and prescribe to pharmacy
- Allow **several procedures per case** (e.g. tumour resection + skin grafting)
- Overlapping packs merge on the **higher** quantity, not the sum — a combined
  case does not need two full sets of the same sutures
- The mapping itself is a clinical judgement: build a best-effort match by
  subspecialty and name, then have an admin confirm it. Auto-requesting the wrong
  pack is worse than requesting none, because someone opens it before noticing.

---

## 3. Then — modules in progress

### 3.1 Surgery estimate — finish the user-facing half
Done: calculation engine, price resolution, pack loader, service layer, create /
detail / share / PDF routes, institutional PDF layer, WhatsApp message builder,
auto-draft at booking. 69 tests.

Remaining:
- Estimate list and detail pages, and the builder UI
- Wire `buildEstimatePdf` to a download button
- WhatsApp share UI over the existing endpoint
- Approval flow on screen
- Sidebar entries (`layout.tsx` is hardcoded — `modules.ts` alone does nothing)
- **Verify the PDF renders in a browser.** Never confirmed: the node-side render
  hung, and jsPDF is a browser library. The watermark uses graphics-state opacity
  and `angle`, neither of which has been seen working here.

### 3.2 Conflict Resolver — everything past Phase 1
Assessment committed (`docs/conflict-resolver-assessment.md`). Decisions settled:
statistical engine, no LLM; 9 models, not the spec's 17.

- Schema + migration, and **classify every new table in `syncPolicy.ts`** or it
  will not cross between nodes — responses must be `APPEND_ONLY`
- Settle the §13 anonymity vs §30 audit rule BEFORE any response exists: an
  anonymous decision stores `responded=true` and never a link from answer to
  user. It cannot be retrofitted.
- State machine as one pure tested function
- Wizard, survey builder, response capture, statistical analysis, review,
  approval, publication, institutional PDF export

---

## 4. Infrastructure and security

### 4.1 Captive portal — finish it
Blocked on RouterOS **device-mode**, which needs a physical button press:

```
/system/device-mode/update fetch=yes     # then press reset / power-cycle
```

Then `scripts/local-server/deploy-mikrotik-portal.sh` does the rest.

- Router SSH credentials are unknown — create a dedicated `orm-deploy` user
  (`/user add name=orm-deploy password="..." group=full`)
- **Until the portal serves HTTPS, staff passwords cross the LAN in clear text.**
  Interim options: disable the hotspot and put a WPA2 key on the TP-Link, or tell
  staff not to use the Wi-Fi sign-in page.

### 4.2 Server housekeeping
```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
pm2 startup && pm2 save
```
Plus Tailscale subnet routing, so the router is reachable from home:
```bash
echo 'net.ipv4.ip_forward=1' | sudo tee /etc/sysctl.d/99-tailscale.conf
sudo sysctl -p /etc/sysctl.d/99-tailscale.conf
sudo tailscale up --ssh --advertise-routes=192.168.88.0/24
```
then approve the route in the Tailscale admin console.

### 4.3 `npm run build` on the server migrates the CLOUD
Prisma reads `.env` (cloud) while Next reads `.env.local` (local). A build on the
theatre server touches the cloud's migration state. Worked around by calling
`apply-migrations.sh` separately; it should be fixed properly.

### 4.4 Credentials to rotate
All of these appeared in a chat log:
- Supabase **access token** (still valid — used twice on 12 Aug)
- Supabase **database password**
- MikroTik **admin password**
- RADIUS shared secret — regenerated 12 Aug, verify both sides match

### 4.5 Verify `NEXTAUTH_SECRET` matches
Server fingerprint `0412d2e901e5` (sha256, first 12). Compare with Vercel. One
address with two signing secrets silently signs staff out when they change
building, with no error explaining it.

### 4.6 Vercel environment
- `NEXTAUTH_URL` → `https://unth-theatre.link`
- `NEXT_PUBLIC_APP_URL` → `https://unth-theatre.link` (builds the WhatsApp link)
- Redeploy afterwards; env changes need a new deployment

---

## 5. Data and follow-ups

- **Pre-capture rows never synced.** Capture journals future changes only, so
  rows created before it was enabled do not cross. One patient was seeded by
  hand; a general backfill was never done.
- **10 anaesthetist placeholder accounts** still need real names.
- **Phase-2 clinical sync classifications** need a clinician to confirm.
- **Same-origin cache risk:** one address now serves two databases, so the
  service worker and offline vault are shared between hospital and cloud. If
  anyone reports a stale list after moving between them, the fix is a cache key
  that includes which node served the data.

---

## Done on 12 Aug 2026, for reference

- Bi-directional sync fixed and verified — 75 entries, 0 deferred
- `unth-theatre.link` live in both buildings; DNS-01 certificate with working
  renewal simulation
- Tailscale remote access to the server
- Booking-time column + LATE BOOKING flag (elective, after 15:00 the day before)
- Holding area: today's called-up patients only, with search
- PACU: today's list, search, completion tick, admitted patients removed
- Estimate engine, pricing, pack loader, service, routes, institutional PDF layer
- Emergency board: assign theatre = acknowledge + radio announcement
- Elective booking: theatre choice removed; per-unit assignment API
- Captive portal deployment automated
- Naira sign corrupting every money figure in existing PDFs — fixed
