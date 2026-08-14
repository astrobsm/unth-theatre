# Clinical OCR & Document Intelligence — architecture assessment

Written against the codebase on 14 Aug 2026, before any of it is built. Section
48 of the specification asks for this first, and it changes several decisions.

The clinical safety principles in §2, §14, §27–29 are right and are not
negotiated below. Everything here is about how to reach them in *this* system.

---

## 1. What the specification assumes that is not true here

| Assumed | Actually |
|---|---|
| Dexie for offline storage (§52) | Raw IndexedDB, hand-written, plus a custom `public/sw.js`. No Dexie anywhere. |
| BullMQ / Redis job queue (§32) | Neither exists. No Redis, no worker process, no queue package. |
| Object or file storage exists (§33, §52) | **None.** Every uploaded artefact in ORM is a base64 data URL in a Postgres `@db.Text` column — consent files, signatures, incident photos, imprest receipts, issued PDFs. |
| Cloud OCR can run server-side | `/api/ocr` returns **504 on Vercel**, proven this week. Serverless cannot hold the recogniser. |
| PaddleOCR is a drop-in local engine (§9) | PaddleOCR is Python. It cannot run on Vercel at all, and on the theatre server it means a Python runtime plus ~1 GB of dependencies alongside the Node app. |

None of these are reasons to abandon the design. They change what has to be
built first, and two of them change it a great deal.

---

## 2. The storage decision is the real blocker

This is the one place where §52's "unless the existing architecture is
genuinely inadequate" applies, so here is the reasoning rather than an
assertion.

The database is **210 MB today**. ORM's established convention would store a
scanned page as base64 in a text column. Base64 adds 33%, so a 2 MB scan
becomes ~2.7 MB of row data. The specification requires that we keep, per
document: the original, the processed image, and every version — realistically
3–4 images per document.

    1,000 scanned documents  ≈  8–11 GB in Postgres

That is forty times the current database, in a table that every backup, every
`pg_dump`, and the **entire local↔cloud sync journal** has to carry. The sync
worker moves row payloads as JSON through a journal table; pushing multi-megabyte
base64 blobs through it would be the end of sync working at all, and sync is
already the most fragile part of this system.

So scanned documents must not follow the base64 convention. That is a genuine
architectural change and it should be made deliberately, once, before anything
is written that depends on it.

**Recommendation: Supabase Storage for the cloud, a filesystem path on the
theatre server, behind one `DocumentStore` interface.** Supabase is already the
database provider, so it adds no vendor and no new credential. The theatre
server keeps its own copy on disk so that scanning works with the internet down,
which is the case that matters most in a Nigerian theatre. Postgres stores only
metadata, OCR text, confidence and a reference — exactly as §33 asks.

The cost of getting this wrong is not aesthetic. It is a database that cannot be
backed up and a sync channel that stops moving surgical cases.

---

## 3. Where OCR can actually run

| Location | Verdict |
|---|---|
| Browser (tesseract.js) | Works today. Slow on a phone, modest accuracy, no dependency on anything. Keep as the floor. |
| Vercel serverless | **Cannot.** Proven 504. Do not build the pipeline here. |
| Theatre server (PM2, Ubuntu, long-running) | The right home for heavy OCR. Holds a warm worker, reads models from disk, no per-request cost, works with the hospital's internet down. |
| Cloud provider (Azure/Google) | Highest accuracy on handwriting, but see §47 below. |

This has a consequence the specification does not anticipate: **the high-quality
OCR path is only available inside the hospital**, because the theatre server has
no public inbound address. A surgeon scanning a document from home gets the
browser engine. That is acceptable — but it must be visible in the UI, not a
silent quality difference nobody can explain.

---

## 4. Sending patient documents to Microsoft or Google

§47 already requires deliberate configuration. Two things to add before anyone
enables it:

1. **A signed consent form scanned to Azure is patient-identifiable data leaving
   the hospital.** That needs a data-processing agreement and, realistically, a
   decision by UNTH management rather than by whoever administers ORM.
2. **Cost is per page and recurring.** At Azure's handwriting tier, a busy
   theatre scanning 40 documents a day is a monthly bill somebody must own.

The provider abstraction (§8) should be built so this is *possible*. It should
ship **switched off**, exactly like the WhatsApp kill switch, and it should be
impossible to enable by accident.

---

## 5. What I would change about the phase order

The specification runs local OCR (Phase 5) and cloud providers (Phase 6) long
before benchmarking (Phase 13). **I would move benchmarking to the front.**

The reason is direct evidence from today. Trying to improve extraction quality,
I swapped in Tesseract's accurate language model — the obvious fix. Measured
against known text, clean and deliberately degraded, it scored *identically* to
the fast model, 98.1% of characters in every run. Then it aborted outright on
the server, because the float model needs SIMD entry points our WASM core does
not export. A 12.8 MB download that would have replaced imperfect OCR with none.

My first comparison had also reported the two models identical **because
tesseract caches training data by language code and silently reused the first
model for both arms.** The test agreed with my expectation for the wrong reason,
and I nearly shipped on it.

Every provider claim in §43 is exactly this kind of guess until measured against
real UNTH handwriting. Building the benchmark harness first costs days and tells
us which engine is worth integrating; building it last means integrating three
engines to discover two were unnecessary.

**It also needs something only the hospital can supply: a set of real theatre
documents with known correct text.** Twenty to thirty pages — anaesthetic charts,
consent forms, ward notes, in the handwriting of people who actually work there
— is enough to rank engines honestly. Nothing downstream is trustworthy without
it.

Second change: **image capture (Phases 3–4) before any new engine.** Today's
measurements support the specification's own §5 — the failures I could reproduce
came from image degradation, not from the recogniser. The console error that
started this, `Image too small to scale!! (1x36)`, was a preprocessing fault.
Better capture will outperform a better engine, and it works offline, costs
nothing per page, and sends no patient data anywhere.

---

## 6. Recommended order

| | Phase | Why here |
|---|---|---|
| 1 | **Document storage** (`DocumentStore`, Supabase + local disk) | Everything else writes through it. Changing it later means migrating clinical records. |
| 2 | **Schema + audit + RBAC** | `ocr_documents`, `ocr_pages`, `ocr_tokens`, versions, verification. Reuses the existing `AuditLog`. |
| 3 | **Benchmark harness + real UNTH documents** | Makes every later engine decision evidence, not preference. Needs the hospital's documents. |
| 4 | **Capture & preprocessing** (quality gate, edge detection, deskew) | Largest accuracy gain available without a new dependency or a bill. |
| 5 | **Verification UI** (side-by-side, uncertainty, editor) | This is where clinical safety actually lives. Useful even with today's engine. |
| 6 | **Provider abstraction + engines** | Ranked by phase 3, not by assumption. |
| 7 | **Handwriting specialisation** | Depends on 3 and 6. |
| 8 | **Offline queue + sync** | Extends the existing IndexedDB/SW queue; must not go through the row-sync journal. |
| 9 | **Search, benchmarking UI, admin config, cost dashboard** | |

Phases 1, 2, 4 and 5 need nothing from outside the hospital and no new
per-page cost. Phase 3 needs documents from UNTH. Phase 6 needs a procurement
decision.

---

## 7. New dependencies, per §52

Nothing is installed yet. Candidates, with the disclosure the specification asks
for:

| Package | Does | Offline | Sends data out | Licence | Cost to app |
|---|---|---|---|---|---|
| `@supabase/storage-js` | Object storage for scans | No (cloud side only) | To Supabase, already our processor | MIT | Small |
| `sharp` | Server-side deskew, crop, enhance | Yes | No | Apache-2.0 | Already present via Next.js |
| `jscanify` or bespoke edge detection | Document boundary in-browser | Yes | No | MIT | ~50 KB, vs ~8 MB for full opencv.js |
| `tesseract.js` | Current engine | Yes | No | Apache-2.0 | Already present |
| PaddleOCR sidecar | Local handwriting | Yes | No | Apache-2.0 | **Python runtime + ~1 GB, theatre server only.** Defer until phase 3 says it is worth it |
| Azure Document Intelligence | Cloud handwriting | No | **Yes — patient documents to Microsoft** | Commercial | Per page, recurring |

---

## 8. What must not be compromised

Independently of engine choice:

- An uncertain word is shown as uncertain. Clinical context may propose
  candidates; it may never select one. (§2)
- Drug names, doses, routes, allergies, blood group, identifiers, dates and
  laboratory values require explicit human confirmation regardless of
  confidence. (§14, §29)
- The original scan is kept permanently and stays reachable. The signed consent
  document, not its transcription, remains the authoritative artefact. (§17, §24)
- Raw OCR output and the verified transcription are stored separately, never
  overwriting one another. (§17, §20)
- A signature is recorded as a signature, never transcribed into clinical text.
  (§24)
