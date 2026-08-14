# Engine comparison — first results

**14 August 2026. One engine measured. The UNTH corpus does not exist yet, so
nothing here is a deployment decision.**

---

## tesseract-fast on African Medical Records

62 documents, 15 contributors, 0 engine failures.
Dataset: African Medical Records (CC-BY-4.0), Nigerian handwritten clinical
documents with exact ground truth.

| | |
|---|---|
| Character error rate | **76.0%** |
| Word error rate | **140.8%** |
| **Numbers, doses, drug names** | **4.7%** — 29 correct of 622 |
| Order-of-magnitude errors | **21** |
| Documents under 30% CER | **0 of 62** |
| Best single document | 37% CER |
| Worst single document | 438% CER |

**Verdict: NOT SAFE.** Not marginal, not needing tuning. The engine currently in
production cannot read handwritten clinical documents.

A word error rate above 100% is not a reporting artefact. The engine emits more
wrong words than the page contains — it invents text.

### What the failure looks like

    Truth:  NURSING OBSERVATION CHART
    Read:   Nursing Coeeruat ven Chak        confidence 44

### The errors that matter

Twenty-one order-of-magnitude errors on numbers. A sample, with the ground-truth
context:

    "20"      read as "2"
    "80"      read as "/4g-"          in: 12/03/2026 20:00 36.9 80 18 120/78
    "24"      read as "(2026120:00"   in: 08:00 38.5 102 24 12/03/2026
    "1"       read as ">22lslec"      in: 500 mg — 1 tab every 8
    "36.5"    read as "3¢-5"          in: 21/03/2026 22:00 36.5 72 143 91
    "148370." read as "3t0:"          in: signature: doctors no: 148370.

These are observation charts and prescriptions. A pulse, a temperature, a tablet
count, a doctor's registration number.

### This was verified, not assumed

A catastrophic score can mean a broken harness. It was checked against the
image before being believed: the pairing is correct, the confidence the engine
itself reports is 44, and the output is visibly nonsense. The failure is real.

---

## What follows from this

**1. The provider abstraction is not optional.** It was specified (§8) as good
architecture. It is now the only route to a working feature: the engine we have
is adequate on printed text and useless on handwriting, and handwriting is what
clinical documents are.

**2. A handwriting-specialised engine is now evidence-led, not aspirational.**
§11 argued that ordinary printed-text OCR should not be the only solution for
handwriting. These numbers settle it.

**3. Preprocessing will not rescue this.** A 4.7% critical accuracy is not a
deskew away from usable. Phase 4's capture and geometry work remains worth
having — it will lift whatever engine comes next — but no amount of it turns
this engine into a clinical tool.

**4. The safety design is doing its job.** Every one of these documents would be
held for human verification: low confidence, high-risk categories, or both. The
system would refuse to place any of it in a record unreviewed. That is the
intended behaviour and it is worth noting that the pipeline fails safe rather
than confidently wrong.

**5. Nothing here says the browser OCR should be withdrawn today.** It is used
on typed and printed material, where it measured 98.1% of characters correct in
earlier tests. It should not be offered for handwritten notes, and the interface
should say which is which.

---

## What this is NOT

**It is not a measurement of UNTH.** Different hospital, different writers,
different forms, different phones, different photography. The UNTH corpus
remains empty and remains the only thing that can decide a deployment.

**It is not a verdict on OCR generally.** One engine, at its fast model, on one
external dataset. Azure, Google, PaddleOCR and the vision-language models are
unmeasured. The expectation is that they do considerably better on handwriting;
that expectation is exactly the kind of thing this harness exists to test rather
than assume.

---

## Next measurements

| Engine | Status | Blocker |
|---|---|---|
| tesseract-fast | **Measured** | — |
| PaddleOCR | Not measured | Python sidecar; theatre server only |
| Azure Document Intelligence | Not measured | Data-processing decision by UNTH (§4 of the assessment) |
| Google Document AI | Not measured | Same |
| Vision-language models | Not measured | Same, plus §27 — never the primary engine |

Reproduce with:

    node ocr-benchmark/scripts/run-african-benchmark.js --json reports/out.json

Full per-document results: `reports/african-medical-records-tesseract.json`
