#!/usr/bin/env python3
"""
Handwriting recognition for ORM: CRAFT detection + TrOCR reading.

    python3 scripts/ocr/trocr_ocr.py --probe        -> "ok" if usable
    python3 scripts/ocr/trocr_ocr.py page.jpg       -> JSON on stdout
    python3 scripts/ocr/trocr_ocr.py page.jpg --easyocr-only

Why two models rather than one:

  TrOCR is the strongest handwriting recogniser that runs offline, but it reads
  a CROPPED LINE and cannot find lines on a page. EasyOCR's CRAFT detector
  finds them and cannot read cursive nearly as well. Neither alone is a page
  reader; together they are.

  This matters for the document type that defeated tesseract, which scored 4.7%
  on numbers and drug names across 62 real African clinical documents. Both
  EasyOCR and PaddleOCR are scene-text engines that attempt handwriting; TrOCR
  is the only local option actually TRAINED on it.

Speaks JSON on stdout and nothing else — libraries here print progress bars, so
everything else must go to stderr or the parse fails.

Everything runs on this machine. No document leaves the hospital.
"""

import json
import os
import sys

# Keep every library's chatter off stdout, which carries the JSON.
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

_detector = None
_processor = None
_model = None

# Handwritten, not printed: this is the whole point of choosing TrOCR. The
# "-str" and "-printed" variants are trained on scene text and typed documents
# and would give away the only advantage this pipeline has.
TROCR_MODEL = os.environ.get("TROCR_MODEL", "microsoft/trocr-base-handwritten")


def get_detector():
    """EasyOCR, used ONLY to locate text lines."""
    global _detector
    if _detector is None:
        import easyocr
        _detector = easyocr.Reader(["en"], gpu=False, verbose=False)
    return _detector


def get_reader():
    global _processor, _model
    if _processor is None:
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel
        _processor = TrOCRProcessor.from_pretrained(TROCR_MODEL)
        _model = VisionEncoderDecoderModel.from_pretrained(TROCR_MODEL)
        _model.eval()
    return _processor, _model


def probe():
    try:
        get_detector()
        get_reader()
        print("ok")
        return 0
    except Exception as err:                                  # noqa: BLE001
        # The real reason on stderr. A missing package, a failed model download
        # and an out-of-memory kill need different fixes, and "unavailable"
        # distinguishes none of them.
        print(f"trocr unavailable: {type(err).__name__}: {err}", file=sys.stderr)
        return 1


def recognise(image_path, easyocr_only=False):
    import numpy as np
    from PIL import Image

    detector = get_detector()
    page = Image.open(image_path).convert("RGB")

    # detail=1 gives boxes and EasyOCR's own reading, which is kept when running
    # in comparison mode and otherwise used only for its geometry.
    detections = detector.readtext(np.array(page), detail=1, paragraph=False)

    words = []
    lines = []

    if not easyocr_only:
        processor, model = get_reader()

    import torch

    for box, easy_text, easy_conf in detections:
        xs = [int(p[0]) for p in box]
        ys = [int(p[1]) for p in box]
        left, top = max(0, min(xs)), max(0, min(ys))
        right, bottom = min(page.width, max(xs)), min(page.height, max(ys))
        if right - left < 4 or bottom - top < 4:
            # A sliver is not a line. Tesseract's failure on this corpus began
            # with one-pixel "lines" being handed to a recogniser.
            continue

        if easyocr_only:
            text, confidence = easy_text, float(easy_conf)
        else:
            # A little padding: TrOCR was trained on lines with margins, and a
            # tight crop clips ascenders and descenders.
            pad = max(2, (bottom - top) // 8)
            crop = page.crop((
                max(0, left - pad), max(0, top - pad),
                min(page.width, right + pad), min(page.height, bottom + pad),
            ))
            pixel_values = processor(images=crop, return_tensors="pt").pixel_values
            with torch.no_grad():
                ids = model.generate(pixel_values, max_new_tokens=64)
            text = processor.batch_decode(ids, skip_special_tokens=True)[0].strip()
            # TrOCR does not report a confidence. Reporting EasyOCR's DETECTION
            # confidence as if it were a reading confidence would be a lie the
            # whole safety layer then acts on, so this is null and the
            # confidence engine treats null as LOW.
            confidence = None

        if not text:
            continue

        lines.append(text)
        bbox = [left, top, right - left, bottom - top]
        for token in text.split():
            words.append({"text": token, "confidence": confidence, "bbox": bbox})

    return {
        "text": "\n".join(lines),
        "words": words,
        "model": "easyocr-craft" if easyocr_only else f"easyocr-craft + {TROCR_MODEL}",
    }


def main():
    args = [a for a in sys.argv[1:]]
    if not args:
        print(json.dumps({"error": "no image given"}))
        return 1
    if args[0] == "--probe":
        return probe()

    easyocr_only = "--easyocr-only" in args
    image = next((a for a in args if not a.startswith("--")), None)
    if not image:
        print(json.dumps({"error": "no image given"}))
        return 1

    try:
        print(json.dumps(recognise(image, easyocr_only)))
        return 0
    except Exception as err:                                  # noqa: BLE001
        print(json.dumps({"error": f"{type(err).__name__}: {err}"}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
