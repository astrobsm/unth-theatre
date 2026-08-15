# Handwriting OCR — install

CRAFT detection (EasyOCR) + TrOCR reading. Runs locally; no document leaves the
hospital, no per-page charge.

## Install

```bash
pip install easyocr sentencepiece "transformers>=4.40,<5"
python3 scripts/ocr/trocr_ocr.py --probe        # expect: ok
```

**The transformers version constraint is load-bearing.** On transformers 5.x the
TrOCR tokenizer cannot be built at all:

    ValueError: Couldn't instantiate the backend tokenizer from one of:
    (1) a `tokenizers` library serialization file, (2) a slow tokenizer
    instance to convert or (3) an equivalent slow tokenizer class...

It fails identically with `use_fast=True`, `use_fast=False` and the default, and
installing sentencepiece, tiktoken or protobuf does not fix it — the message
names those but they are not the cause. 4.x reads the model's vocab.json and
merges.txt; 5.x does not. Pin it.

First `--probe` downloads ~1.3 GB of model weights and needs internet once.

## Why not PaddleOCR

PaddlePaddle publishes no wheel for Python 3.14, which is what both the theatre
server and the development machine run — `pip install paddlepaddle` returns
"from versions: none" on each. It would need an older Python (not packaged on
this Ubuntu) or Docker.

Separately: PaddleOCR and EasyOCR are scene-text engines that ATTEMPT
handwriting. TrOCR is the only local option trained on it, which is why the
pairing is worth the extra dependency.

## Speed

TrOCR runs one transformer pass per detected line, so a dense chart is dozens of
passes. Expect seconds per page rather than the sub-second tesseract manages.
That is acceptable for a scan a clinician then verifies; it would not be for a
live camera preview.

## Enabling it

    OCR_PROVIDERS=trocr,tesseract

Order matters: handwriting engine first, tesseract as fallback. A missing
sidecar degrades to today's behaviour rather than breaking scanning.

**Measure before enabling.** Baseline to beat is tesseract at 4.7% on numbers
and drug names across the 62-document corpus:

    node ocr-benchmark/scripts/compare-engines.js --engine trocr
