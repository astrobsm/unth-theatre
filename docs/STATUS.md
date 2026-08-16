# Where ORM stands — 16 August 2026

Everything built recently, what works, what is waiting on somebody, and what to
do to deploy.

Run `node scripts/deploy-check.js` for the machine-checkable half of this.

---

## Ready to deploy — needs nothing from anybody

| Feature | State |
|---|---|
| **Dictation restart fix** | Done. Was losing a second of speech after every phrase on phones. **Needs testing on a real phone.** |
| **Bi-directional sync** | Working. 75 entries, 0 deferred. |
| **Booking lateness tagging** | Done. Elective bookings after 15:00 the day before are flagged LATE. |
| **Procedure → pack auto-attach** | Done, multi-procedure supported. |
| **Consent + labs mandatory** | Done, with recorded clinical override for emergencies. |
| **Theatre/nurse/anaesthetist assignment** | Done, with who-assigned tracking. |
| **Emergency board acknowledgement** | Done. |
| **Holding area / PACU pages** | Done. |
| **Estimates engine** | Done and tested. **PDF has never been opened in a browser** — verify before use. |
| **Imprest quarterly cycle** | Done. |
| **API errors now say what failed** | Done. Was returning bare "Internal server error". |
| **OCR provider architecture** | Done. Scan button uses whichever engine is configured. |

**Four migrations are pending on the theatre server**: procedure packs, conflict
resolver, communications, OCR documents. They are applied on the cloud.

---

## Waiting on somebody, not on code

### WhatsApp — code complete, account not started

Everything is built: provider, webhook with signature verification, send policy,
kill switch, templates, delivery tracking. **Nothing has ever been sent.**

Needs, in order, and mostly slow:
1. Meta Business account and **business verification** (days, not minutes)
2. A phone number not already on WhatsApp
3. A **System User** permanent token — not the 24-hour dashboard token, which
   works for a day and then stops for a reason nobody remembers
4. Template approval
5. `COMMUNICATION_DISABLED_CHANNELS=WHATSAPP` removed **deliberately**

See `docs/whatsapp-setup.md`. Also unresolved: **ORM does not record patient
consent to be messaged.** A phone number in a record is not consent. Decide how
that is captured before any patient template is enabled.

### OCR for handwriting — blocked on Google billing

| Engine | Numbers, doses, drug names |
|---|---|
| tesseract (live now) | **4.7%** |
| CRAFT + TrOCR | 26.1%, and 2–3 minutes per page |
| Google Document AI | **unmeasured — billing not enabled** |
| Needed | **98%** |

The Google configuration is correct — the service account authenticates and the
processor resolves. Google returns 403 until a billing account is attached at
`https://console.developers.google.com/billing/enable?project=theatre-orm`.
1,000 pages a month are free; the card is for verification.

**Until then, handwriting OCR does not work and should not be offered.** Printed
and typed pages read at about 98% of characters and are fine.

### Pricing — 361 consumables unpriced

`docs/pack-pricelist.csv` has a column waiting. Estimates cannot produce a real
figure until it is filled.

### Credentials still to rotate

Pasted into chat during earlier sessions and still valid: Supabase access token,
Supabase database password, MikroTik admin password, orm-deploy password, RADIUS
secret.

---

## Built but not connected to any screen

Honest about this because it looks finished in the repository and is not:

- **OCR verification screen** — the confidence engine decides which words need
  checking and which doses need confirming. Nothing renders it. A scan today
  returns plain text into a box.
- **Document storage** — `DocumentStore` and eight database tables exist. No
  route writes to them, so scans are not yet retained as evidence.
- **Capture quality and geometry** — measured and tested, called by nothing.
- **Estimates builder UI** — engine works, no screen.
- **Conflict Resolver** — schema and audit only; deferred deliberately.

None of it is wasted; all of it is waiting on the same next step, which is
screens rather than logic.

---

## Deploying to the theatre server

As `emmanuel`, not root, and one command at a time:

```bash
cd ~/unth-theatre
git pull --ff-only
npm run build          # applies the four pending migrations
pm2 restart orm --update-env
```

Then confirm:

```bash
node scripts/deploy-check.js
pm2 logs orm --lines 30
```

Notes for that box specifically:

- The app runs as **emmanuel** from `/home/emmanuel/unth-theatre`. There is no
  `orm` user; root's PM2 is empty and was created by accident — `pm2 kill` as
  root removes it.
- Python is **3.14**, which no PaddlePaddle wheel supports. Do not install
  Python 3.12 or Docker for it; TrOCR was measured and is too slow regardless.
- `npm run build` runs `prisma migrate deploy`. Take a database backup first if
  one is not automatic.

---

## What I would do next, in order

1. **Test dictation on a phone.** Costs nothing, already deployed, and dictation
   is the answer for handwriting whichever way Google goes.
2. **Enable Google billing** and let me measure. One hour to a real answer.
3. **Build the OCR verification screen** — the piece that makes scanning safe
   rather than merely better.
4. **Price the consumables**, which unblocks estimates end to end.
5. **Rotate the five credentials.**

WhatsApp can proceed in parallel at Meta's pace, since none of it depends on us.
