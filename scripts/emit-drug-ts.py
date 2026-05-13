"""Generate src/lib/drug-catalog.data.ts from neml-catalog.json."""
import json
from pathlib import Path

ROOT = Path(r"e:\THEATHRE CHAIR\unth-theatre")
data = json.load(open(ROOT / "scripts/neml-catalog.json", encoding="utf-8"))
js = json.dumps(data, ensure_ascii=False)
out = (ROOT / "src/lib/drug-catalog.data.ts")
out.write_text(
    "// AUTO-GENERATED from Nigeria Essential Medicines List (NEML) Adult 8th Ed 2024.\n"
    "// Source: scripts/neml-catalog.json. Do not edit by hand; re-run scripts/parse-neml.py.\n"
    'import type { CatalogSection } from "./drug-catalog";\n'
    f"export const DRUG_CATALOG_DATA: CatalogSection[] = {js};\n",
    encoding="utf-8",
)
print(f"Wrote {out} ({len(js)} bytes JSON)")
