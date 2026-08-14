# UNTH corpus — data governance

These are real patient documents. This file says what may be done with them and
what may not. It binds anyone assembling, storing or using the corpus.

---

## 1. De-identification is done BEFORE the photograph

Not afterwards. A photograph containing a patient's name exists from the moment
the shutter closes, on a phone that syncs, backs up and gets lent to colleagues.
Editing it later does not unmake the copies.

Before photographing, obscure:

- patient name
- hospital number
- folder number
- address
- telephone number
- date of birth
- next of kin details
- any other direct identifier

A strip of paper laid over the field is sufficient and takes seconds.

### When a number must stay readable

Reading folder numbers is part of what the benchmark measures, so a page with
every number covered tests less than it should. Where a number must remain
visible, **write an invented one on the strip** covering the real value. The
engine gets a realistic numeric field; nothing on the page belongs to a person.

Use obviously fake values that could not be a real UNTH folder number.

---

## 2. Where the corpus may live

| Location | Permitted |
|---|---|
| `ocr-benchmark/unth/` in this repository | **Only if de-identified** |
| The theatre server, inside the hospital | Yes |
| A personal phone, after transfer | **No — delete after transfer** |
| Personal laptops, email, WhatsApp | **No** |
| Any cloud OCR provider (Azure, Google, AWS) | **No** — see §4 |
| Any public dataset or publication | **No** |
| Any external AI system, including this one | **No** — see §4 |

The repository is the operative constraint most people will forget: **anyone
with access to the ORM source code can read anything committed to it**, now and
for the whole history of the project. A document committed once and deleted
later is still in the Git history.

### If a page cannot be de-identified

Some pages are worth having and cannot be cleaned — a consent form where the
identifiers are integral to what is being tested, for instance. Do not commit
it. Tell the maintainer, and it will be held on the theatre server outside the
repository, with the manifest referencing it by ID only.

---

## 3. Writer anonymity

Metadata records `WRITER-001`, `WRITER-002` and so on. **The mapping from writer
ID to a named member of staff is never written down in the repository.**

This is not bureaucratic. The benchmark will produce a table showing which
handwriting the engines read worst. Tied to names, that table is a document
ranking colleagues by how bad their handwriting is — which is a professional
embarrassment waiting to happen, would discourage the very people whose
documents are most valuable from contributing, and serves no technical purpose
whatsoever. The engine comparison needs to know that pages came from *different*
writers, never *which* writer.

If a mapping must exist so that more pages can be requested from a
under-represented writer, it is held by one named person at UNTH, outside this
repository, and is not shared.

---

## 4. Never send these documents to an external AI or OCR service

Including during development, including "just to test", including to the
assistant helping build this system.

Cloud OCR providers process what you send them on their infrastructure, may
retain it, and in some configurations may use it to improve their models. A
de-identified page is lower risk but is not zero risk: handwriting, hospital
letterhead and clinical detail are together often enough to identify a case.

The cloud provider abstraction in ORM ships **switched off** and stays off until
somebody at UNTH with the authority to do so accepts a data-processing
arrangement in writing. See `docs/ocr-platform-assessment.md` §4.

**Benchmarking a cloud engine means sending it the corpus.** That is a decision
for the hospital, not for whoever runs the script. The harness will not enable a
cloud engine without explicit configuration for exactly this reason.

---

## 5. The test set is locked

Once assembled, the UNTH corpus is the final evaluation set and nothing may tune
against it. Specifically, do not:

- train any model on UNTH test pages
- adjust an engine's settings by trying them against individual test pages
- correct OCR output by hand before scoring
- adjust ground truth to make an engine look better
- drop images that engines do badly on
- exclude the poor photographs
- exclude illegible handwriting
- report an external dataset score as evidence about UNTH

The poor photographs and the illegible pages are the most valuable things in the
corpus. They are what distinguishes an engine that says "I cannot read this"
from one that invents a plausible dose — and that distinction is the entire
clinical safety argument. Removing them to improve the numbers would destroy the
only test that matters.

If preprocessing or engine settings need tuning, tune against the **external**
datasets, then evaluate once on UNTH.

---

## 6. Retention

The corpus exists to choose an OCR engine and to recalibrate the capture quality
thresholds. When both are settled it should be reviewed: pages that are no
longer needed should be deleted, and the decision recorded.

De-identified clinical documents are still clinical documents. They do not
accumulate indefinitely on a developer's machine because nobody thought to stop.

---

## 7. Who to ask

Anything here that is unclear in a specific case — a page that seems borderline,
a request to share results outside the hospital, a proposal to enable a cloud
engine — is a question for UNTH, not a judgement call for whoever is holding the
file at the time.

The default when unsure is **do not**.
