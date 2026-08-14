# PaddleOCR on the theatre server

Handwriting recognition that runs **inside the hospital**. No document leaves
the building, no per-page charge, works with the internet down.

Theatre server only. It cannot run on Vercel — PaddleOCR is Python, and a
serverless function cannot hold it.

---

## Why bother

The engine in production reads **4.7%** of numbers and drug names correctly on
real African clinical handwriting, with 21 order-of-magnitude errors across 62
documents. It is fine on printed text and useless on handwritten notes, which
is most of what a theatre produces.

The engines that read handwriting well are otherwise all cloud services, and
every one of them means sending a signed consent form to a third party — which
needs a decision from UNTH before a single page moves.

**Whether PaddleOCR is actually better here is not yet known.** It has not been
run against the corpus, because it is not installed anywhere I can reach. The
benchmark will say. If it does not beat 4.7% on numbers and drug names it does
not go in, however good its reputation.

---

## What it costs

| | |
|---|---|
| Disk | ~1 GB (PaddlePaddle, PaddleOCR, models) |
| Memory | ~1 GB resident while a page is being read |
| First run | Downloads models, needs internet once |
| Per page | Seconds on CPU |

That is a real burden on a machine also running the hospital's theatre system.
Check the server has the room before starting.

---

## Install

On the theatre server, as the `orm` user:

```bash
cd ~/unth-theatre
python3 -m venv .venv-ocr
source .venv-ocr/bin/activate

pip install --upgrade pip
pip install paddlepaddle          # CPU build
pip install paddleocr
```

Then fetch the models once, while there is internet:

```bash
python3 scripts/ocr/paddle_ocr.py --probe
```

`ok` means it is ready. Anything else prints the real reason on stderr — a
missing system library is the usual one:

```bash
sudo apt install -y libgl1 libglib2.0-0
```

---

## Enable it

In the theatre server's `.env`:

```
PADDLE_PYTHON=/home/orm/unth-theatre/.venv-ocr/bin/python3
OCR_PROVIDERS=paddleocr,tesseract
```

Order matters and is deliberate: PaddleOCR first, tesseract as the fallback
when the sidecar is missing or dies. Nothing else changes — the registry skips
a provider that is not available, so a broken install degrades to today's
behaviour rather than breaking scanning.

Restart:

```bash
pm2 restart orm --update-env
```

**Do not set this on Vercel.** The sidecar is not there, the probe fails, and
every scan pays a pointless process spawn before falling back.

---

## Measure it before trusting it

```bash
node ocr-benchmark/scripts/run-african-benchmark.js --json reports/paddle.json
```

Compare against `reports/african-medical-records-tesseract.json`:

    tesseract-fast   CER 76.0%   numbers/drugs 4.7%   21 order-of-magnitude errors

The harness ranks by accuracy on numbers, doses and drug names, not by
character error rate — a headline rate cannot tell a misread dose from a
harmless typo.

**Tune against `unth/splits/tune.txt` only.** Measure once against
`test-locked.txt`. Anything else turns the benchmark into a description of
itself.

---

## What it does not change

Every reading still goes to a clinician for verification. Drug names, doses,
routes, allergies, identifiers and blood groups require confirmation regardless
of confidence, because an engine's confidence is a statement about pixels and
not about medicine.

A better engine means less correcting. It does not mean less checking.
