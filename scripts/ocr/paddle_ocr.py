#!/usr/bin/env python3
"""
PaddleOCR sidecar for ORM.

    python3 scripts/ocr/paddle_ocr.py --probe        -> "ok" if usable
    python3 scripts/ocr/paddle_ocr.py /path/page.jpg -> JSON on stdout

Called by src/lib/ocr/providers/paddle.ts. Speaks JSON on stdout and nothing
else, so anything printed by a library must go to stderr or the parse fails.

Install: docs/paddleocr-setup.md
"""

import json
import sys

# The model is built once per process and reused. Construction loads the
# detection and recognition weights and costs several seconds; doing it per page
# would dominate the time and make PaddleOCR look far slower than it is.
_ocr = None


def get_ocr():
    global _ocr
    if _ocr is None:
        from paddleocr import PaddleOCR
        _ocr = PaddleOCR(
            use_angle_cls=True,   # pages photographed upside down do happen
            lang="en",
            show_log=False,
        )
    return _ocr


def probe():
    """Can this actually run? Imports and builds the model rather than guessing."""
    try:
        get_ocr()
        print("ok")
        return 0
    except Exception as err:                      # noqa: BLE001
        # stderr, so the Node side can report the real reason. A missing
        # dependency and a corrupt weights file need different fixes and
        # "unavailable" distinguishes neither.
        print(f"paddleocr unavailable: {err}", file=sys.stderr)
        return 1


def recognise(image_path):
    ocr = get_ocr()
    raw = ocr.ocr(image_path, cls=True)

    words = []
    lines = []

    # PaddleOCR returns [[ [box, (text, confidence)], ... ]] per page. A page
    # with nothing on it comes back as [None], which is not an error: a blank
    # or unreadable page is a real answer and must not be reported as a failure.
    for page in raw or []:
        for entry in page or []:
            try:
                box, (text, confidence) = entry[0], entry[1]
            except (TypeError, ValueError, IndexError):
                continue
            if not text:
                continue

            xs = [point[0] for point in box]
            ys = [point[1] for point in box]
            bbox = [
                int(min(xs)), int(min(ys)),
                int(max(xs) - min(xs)), int(max(ys) - min(ys)),
            ]

            lines.append(text)
            # One entry per detected line, split into words so the confidence
            # engine has something token-sized to reason about. The line's
            # confidence is carried to each of its words: PaddleOCR does not
            # report per-word scores, and inventing one would be worse than
            # repeating the honest figure.
            for token in text.split():
                words.append({
                    "text": token,
                    "confidence": float(confidence),
                    "bbox": bbox,
                })

    return {
        "text": "\n".join(lines),
        "words": words,
        "model": "PaddleOCR PP-OCRv4 en",
    }


def main():
    args = sys.argv[1:]
    if not args:
        print(json.dumps({"error": "no image given"}))
        return 1
    if args[0] == "--probe":
        return probe()

    try:
        print(json.dumps(recognise(args[0])))
        return 0
    except Exception as err:                      # noqa: BLE001
        print(json.dumps({"error": str(err)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
