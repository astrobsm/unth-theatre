# OCR benchmark

Answers one question:

> Which OCR pipeline performs most safely and accurately on real documents
> photographed by UNTH theatre staff under real operating conditions?

Not "which engine has the best published score". Those are different questions
and only the first one decides what gets deployed.

---

## State, as of 14 August 2026

| | |
|---|---|
| Harness | Built — `scripts/ocr-benchmark.js` in the repository root |
| Metrics | Built — CER, WER, and accuracy on numbers, doses and drug names |
| External datasets | African Medical Records downloaded, 140/140 files |
| **Working corpus** | **African Medical Records** — 62 documents, 15 writers |
| **UNTH corpus** | Empty. Still the definitive benchmark when it exists |

## Working corpus

Engine selection proceeds against **African Medical Records** rather than
waiting for UNTH pages. It is Nigerian handwritten clinical documentation with
exact ground truth, which makes it the closest available stand-in, and waiting
would stall the whole module.

Split writer-disjoint into `unth/splits/tune.txt` (42 documents, 10 writers) and
`unth/splits/test-locked.txt` (20 documents, 5 writers). **Tune against the
first, measure once against the second.** Splitting by document instead would
let tuning fit one person's hand and then be tested on that same hand, which
reports memorisation as accuracy.

Results are labelled as African Medical Records results. Not caution for its own
sake: the first engine measured scores 4.7% on numbers here, and when UNTH pages
arrive the difference between the two numbers is itself information about how
far a proxy carries.

---

## Layout

```
external/     One directory per external dataset. Never mixed with unth/.
unth/
  images/original/    The photograph as taken. NEVER overwritten.
  images/processed/   Derivatives from preprocessing experiments.
  ground-truth/       One .txt per image, saying what the page actually says.
  metadata/           One .json per image: document type, writer ID, conditions.
  manifests/          UNTH-CORPUS-MANIFEST.csv — the index.
  splits/             Writer-disjoint splits. The test set is locked.
reports/      Benchmark output.
```

Images and transcriptions are **gitignored**. That is deliberate and is the
enforcement of `UNTH-DATA-GOVERNANCE.md`, not an oversight.

---

## Before you add anything

Read **`UNTH-DATA-GOVERNANCE.md`**. The parts people get wrong:

- **De-identify before photographing**, not after. The photograph exists from
  the moment the shutter closes, on a phone that backs itself up.
- **Writer IDs are anonymous.** `WRITER-001`, never a name. The benchmark will
  produce a table showing whose handwriting reads worst; tied to names that is a
  document nobody should create.
- **Never send these pages to a cloud OCR service**, including to test one.
  Benchmarking a cloud engine means sending it the corpus, and that is the
  hospital's decision, not the operator's.

---

## What the corpus needs

20–30 pages, photographed on the phones actually used in theatre. Roughly:

| Count | Type |
|---|---|
| 5–6 | Anaesthetic charts |
| 4–5 | Operative notes |
| 3–4 | Signed consent forms |
| 3–4 | Ward / nursing notes |
| 2–3 | Laboratory reports |
| 2–3 | Referral / consultation letters |
| 2–3 | **Deliberately poor photographs** |

**Multiple writers** — surgeons, anaesthetists, nurses, house officers,
registrars, laboratory staff. Six pages from one registrar measures that
registrar, not the hospital.

**Include the bad photographs.** Dim light, glare, a fold, an angle. These are
the most valuable pages in the corpus: they are what separates an engine that
says "I cannot read this" from one that confidently invents a dose. Removing
them would improve the numbers and destroy the only test that matters.

## Transcribing

One `.txt` per image, same name. Type **exactly what is on the page**.

    Inj. Morphine 5mg IM stat

Not "Morphine 5 mg intramuscular immediately". Keep the capitalisation, the
punctuation, the abbreviations, the spacing, the spelling mistakes and the line
breaks. Do not expand, correct, convert units or interpret.

- Cannot read it? `[illegible]` — **never a guess.** A guess in the ground truth
  marks a correct engine wrong and, far worse, marks a hallucinating engine
  right.
- A signature? `[signature]`. Signatures are never transcribed.

---

## Running it

    node scripts/ocr-benchmark.js --corpus ocr-benchmark/unth/images/original

Engines are ranked by **accuracy on numbers, doses and drug names first**, then
general accuracy. A headline error rate cannot tell these apart:

    "Morphine 5 mg"   read as "Morphine 15 mg"     CER 2.1%  — trebles a dose
    "cholecystectomy" read as "cholecystectorny"   CER 2.1%  — harmless

Both look excellent. One is a drug error.

---

## Files

| File | What it settles |
|---|---|
| `DATASET-LICENCES.md` | What may legally be downloaded, and what may not |
| `DATASET-CATALOGUE.csv` | Every external dataset, with verification status |
| `UNTH-DATA-GOVERNANCE.md` | De-identification, storage, writer anonymity, the locked test set |
| `../docs/ocr-platform-assessment.md` | Why the architecture is what it is |
