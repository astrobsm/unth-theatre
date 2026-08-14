# External dataset licences — audit and decisions

Audited 14 August 2026. Every entry says how it was established, because a
licence recalled from training data is a guess and this decision has legal
consequences for a public hospital.

**Verified** means the page was fetched on that date and the terms read.
**Unverified** means the entry is from documentation and must be checked before
anything is downloaded. Nothing unverified has been downloaded.

---

## Decisions at a glance

| Dataset | Licence | Status | Download? |
|---|---|---|---|
| African Medical Records | CC-BY-4.0 | **Verified** | **Yes — highest priority** |
| Doctor's Handwritten Prescription BD (via lance-format) | ODbL v1.0 | **Verified** | Yes, with share-alike care |
| IAM (Teklia/IAM-line) | See conflict below | **Verified** | Comparison only, no redistribution |
| MedDocBench | "other", non-commercial | **Verified** | **No — gated, do not bypass** |
| Doctor Handwriting Recognition (Kaggle) | Unverified | Unverified | Not yet |
| NIST SD19 | Unverified | Unverified | Not yet |
| FUNSD | Unverified | Unverified | Not yet |
| DocVQA | Unverified | Unverified | Not yet |
| CORD | Unverified | Unverified | Not yet |
| SROIE | Unverified | Unverified | Not yet |
| Bentham | Unverified | Unverified | Not yet |
| MIMIC-IV-Note | Unverified (credentialed) | Unverified | **No — see below** |

---

## Verified

### African Medical Records — the one that matters most

`https://huggingface.co/datasets/Nigeria-Health-data-OCR-pipeline/African-Medical-Records`

- Licence tag: **`cc-by-4.0`** — free to share and adapt with attribution
- 62 verified handwritten/ground-truth pairs; PNG images, TXT truth, CSV metadata
- Visit notes, prescriptions, nursing observation charts, laboratory request
  forms, clinical case scenarios
- Not gated

**Download: yes.** This is the closest external proxy to UNTH's own documents —
Nigerian clinical handwriting, the same document types, real ground truth. It is
the only external set that can say anything useful about African clinical
handwriting before the UNTH corpus exists.

**It is still not a substitute.** Different hospital, different writers,
different forms, different phones. It goes in `external/`, never in `unth/`.

### Doctor's Handwritten Prescription BD — drug names

`https://huggingface.co/datasets/lance-format/handwriting-ocr`

- Licence: **ODbL v1.0** (Open Database License)
- 4,680 cropped PNGs of handwritten medicine names from Bangladesh
- 78 medicine names across 15 generic categories; 3,120 / 780 / 780 split
- Converted from Kaggle `mamun1113/doctors-handwritten-prescription-bd-dataset`
- Not gated

**Download: yes**, with one condition. ODbL carries **share-alike obligations on
derived databases**. Using it to measure engines internally is fine. If we ever
publish a database derived from it, that derivative must be ODbL too. It must
never be mixed into a UNTH corpus we might publish under different terms.

Directly relevant to drug-name recognition, which §19 ranks first.

### IAM — a licence conflict worth recording

`https://huggingface.co/datasets/Teklia/IAM-line` is tagged **MIT**.

The underlying **IAM Handwriting Database** (FKI, HES-SO Fribourg) is
**CC BY-NC-SA 4.0 — non-commercial research only, registration requested**.

**A re-upload's tag does not override the original terms.** The MIT tag on the
HuggingFace mirror appears to be a downstream mislabel, and relying on it would
put the hospital in the wrong.

**Use: engine comparison only.** Do not redistribute. Do not train any model we
ship on it. Do not publish derived data. If a shipped model is ever trained on
handwriting data, IAM must be excluded unless the position is cleared properly.

Also, and separately: IAM is modern English prose by European writers. Good
performance on it says nothing about Nigerian clinical handwriting and must
never be reported as if it did.

### MedDocBench — gated, and staying that way

`https://huggingface.co/datasets/Owenhku/meddocbench-full`

- Licence tag: **`other`**
- **Gated** — requires manual approval from the corresponding authors
- ~100 images; 55 with transcription annotations, 50 with structured extraction
- Terms explicitly prohibit **commercial use, re-identification, and
  redistribution**, and require secure storage

**Download: no.** §2 says do not bypass access restrictions and this is exactly
that case. If the full set is wanted, someone at UNTH should request access from
the authors in their own name, and the non-commercial and no-redistribution
terms must be honoured. Any public sample may be used, recorded as a sample.

---

## Unverified — not downloaded

The following were listed for investigation but their pages have not been
fetched, so no licence claim is made here. Each needs its terms read before any
download. Recording them as unknown is the honest state; asserting a licence
from memory is how a hospital ends up using data it has no right to.

- **Doctor Handwriting Recognition** (Kaggle, `mrdude20`) — Kaggle datasets carry
  per-dataset licences that vary widely and are often unspecified. Requires a
  Kaggle account. Check before download.
- **NIST Special Database 19** — US Government work, historically distributed
  freely, but the current distribution terms need reading.
- **FUNSD** — noted in its own documentation as carrying restrictions inherited
  from the RVL-CDIP/IIT-CDIP tobacco litigation corpus. Verify before use.
- **DocVQA** — check the licence on the specific HuggingFace mirror and the
  original challenge terms, which are not necessarily the same.
- **CORD** — receipts; check the stated licence.
- **SROIE** — ICDAR 2019 competition data; competition terms usually restrict
  redistribution.
- **Bentham** — historical manuscripts (transcribe-bentham). Check terms.

### MIMIC-IV-Note — do not download

`https://physionet.org/content/mimic-iv-note/2.2/`

PhysioNet credentialed access: requires a named individual to complete training
and sign a data use agreement in their own name. It is **de-identified patient
text, not photographed handwritten documents**, so it cannot serve the purpose
this corpus exists for.

**Recommendation: skip entirely.** Its only use here would be as a source of
clinical vocabulary for the terminology dictionary, and that can be met from
ordinary drug formularies without anyone signing a DUA. Taking on credentialed
patient data for a word list is a poor trade.

---

## Rules that apply to all of them

1. **No external dataset decides the deployment.** They test the harness and
   rank engines provisionally. The UNTH corpus decides. (§1)
2. **Never mixed.** External data stays in `external/<name>/`, UNTH data in
   `unth/`. Nothing merges the two.
3. **Never uploaded onward.** Non-commercial and no-redistribution terms mean
   these files do not go into the Git repository, into a cloud OCR provider's
   training pipeline, or anywhere public.
4. **Provenance kept.** Every external result is reported with its dataset
   named, so no one can later mistake an IAM score for evidence about UNTH.
