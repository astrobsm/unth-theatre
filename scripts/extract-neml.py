import sys
from pypdf import PdfReader

src = r"C:\Users\user\Pictures\Final-NEML-Adult-8th-Edition.pdf"
out = r"e:\THEATHRE CHAIR\unth-theatre\scripts\neml-raw.txt"

r = PdfReader(src)
print(f"Pages: {len(r.pages)}", file=sys.stderr)

with open(out, "w", encoding="utf-8") as f:
    for i, p in enumerate(r.pages):
        try:
            t = p.extract_text() or ""
        except Exception as e:
            t = f"[[extract error page {i}: {e}]]"
        f.write(f"\n===== PAGE {i+1} =====\n")
        f.write(t)
print(f"Wrote {out}", file=sys.stderr)
