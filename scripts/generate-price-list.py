#!/usr/bin/env python3
"""
Turn the hospital's price list CSV into a typed TS seed module.

Run it after editing prisma/data/unth-consumable-prices.csv:

    python scripts/generate-price-list.py

then commit the CSV and the regenerated
src/lib/specialNeeds/unthPriceList.ts together.

The CSV is a real export and has real defects. This script refuses to paper
over the ones that would cost money:

  * Four syringe rows share the name "Assorted syringes (2/5/10/20 ml)" but
    carry four different prices. Keyed on name they collapse to one row and
    three prices are lost, so the sizes are split out of the code.
  * Suture rows list several gauges in one code at one price. Expanded, so a
    surgeon can pick the gauge they are actually using.
  * Round body and cutting needle are different prices for the same gauge.
    The needle geometry goes into `size`, which is part of the unique key;
    putting it only in `needleType` would collide and lose the dearer price.
  * One row has the wrong name against its code.
  * One code appears twice.

Anything it cannot key uniquely is reported and the run fails.
"""
import csv
import re
import sys
from collections import defaultdict

import os

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO = os.path.dirname(_HERE)
SRC = os.path.join(_REPO, "prisma", "data", "unth-consumable-prices.csv")
OUT = os.path.join(_REPO, "src", "lib", "specialNeeds", "unthPriceList.ts")

notes = []

# ── Rows whose name column is wrong in the source ────────────────────────
NAME_CORRECTIONS = {
    # Coded as soluble insulin, unit "vial", kind DRUG — the name column has
    # "yankauer suction" pasted into it. Importing that would put a suction
    # handle in the pharmacy's drug list.
    "SOLUBLE-INSULIN-SLIDING-SCALE": "Soluble insulin (sliding scale)",
}

# ── Suture families priced by gauge and needle geometry ──────────────────
SUTURE_FAMILIES = {
    "SURGICRYL": dict(name="Surgicryl suture", material="polyglactin 910", absorbable=True),
    "PROLENE": dict(name="Prolene suture", material="polypropylene", absorbable=False),
}

GAUGE_RE = re.compile(r"\d+/0|\b[0-9]\b")


def humanise(code: str) -> str:
    """A readable name from a code, for rows whose name column is empty."""
    words = code.replace("-", " ").strip().lower()
    return words[:1].upper() + words[1:]


def parse_price(raw: str):
    raw = (raw or "").strip().replace(",", "").replace("\u20a6", "")
    if not raw:
        return None
    try:
        return f"{float(raw):.2f}"
    except ValueError:
        notes.append(f"unreadable price {raw!r}")
        return None


def category_for(name: str, code: str, unit: str, is_drug: bool) -> str:
    t = f"{name} {code}".lower()

    def has(*words):
        return any(w in t for w in words)

    # Sutures and ties first: several of them also mention drains or skin.
    if has("suture", "vicryl", "prolene", "monocryl", "surgicryl", "pds ",
           "pds-", "pds/", "silk", "nylon", "cerclage wire", "sternal wire",
           "staples", "chromic"):
        return "SUTURE"
    if has("tracheostomy tube"):
        return "TRACHEOSTOMY_TUBE"
    if has("underwater-seal", "underwater seal"):
        return "CHEST_DRAIN_BOTTLE"
    if has("chest drain", "intercostal"):
        return "CHEST_TUBE"
    if has("foley", "urethral catheter", "suprapubic catheter"):
        return "URETHRAL_CATHETER"
    if has("drain"):
        return "DRAIN"
    if has("surgicel", "gelfoam", "haemostat", "bone wax", "tranexamic"):
        return "HAEMOSTATIC_AGENT"
    if "mesher" not in t and has("mesh"):
        return "MESH"
    if has("ceftriaxone", "cefazolin", "cefuroxime", "co-amoxiclav",
            "augmentin", "metronidazole", "gentamicin", "ciprofloxacin",
            "topical antibiotic", "antibiotic ointment"):
        return "ANTIBIOTIC"
    if has("syringe"):
        return "SYRINGE"
    if has("iv cannula", "cannula (22g", "iv-cannula"):
        return "IV_CANNULA"
    if has("giving set"):
        return "GIVING_SET"
    if has("plaster of paris", "cast + wool", "synthetic cast", "splint"):
        return "CASTING"
    if has("bandage", "crepe", "velband"):
        return "BANDAGE"
    if has("gloves"):
        return "GLOVES"
    if has("water for injection"):
        return "WATER_FOR_INJECTION"
    if has("lignocaine", "lidocaine", "bupivacaine", "ropivacaine",
            "proparacaine", "tetracaine", "xylocaine"):
        return "LOCAL_ANAESTHETIC"
    if has("hydrocortisone", "calcium gluconate", "promethazine",
            "chlorphenamine", "frusemide", "furosemide"):
        return "TRANSFUSION_ADJUNCT"
    return "OTHER"


def expand_suture(code: str, price):
    """One suture code listing several gauges becomes one row per gauge."""
    upper = code.upper()
    family = next((f for f in SUTURE_FAMILIES if upper.startswith(f)), None)
    if not family:
        return None
    spec = SUTURE_FAMILIES[family]

    needle = "cutting needle" if "CUTTING" in upper else (
        "round body" if "ROUND" in upper else None)
    if needle is None:
        notes.append(f"{code}: no needle geometry, left unsplit")
        return None

    # "SURGICRYL 2ROUND BODY" has no space before ROUND; strip the words
    # before hunting gauges so "2" is still found and "0" of "BODY" is not.
    body = re.sub(r"ROUND\s*BODY|CUTTING\s*NEEDLE|[()]", " ", upper)
    body = body.replace(family, " ")
    gauges = GAUGE_RE.findall(body)
    if not gauges:
        notes.append(f"{code}: no gauge found")
        return None

    seen, ordered = set(), []
    for g in gauges:
        if g not in seen:
            seen.add(g)
            ordered.append(g)

    return [
        dict(
            category="SUTURE",
            name=spec["name"],
            size=f"{g} {needle}",
            material=spec["material"],
            needleType=needle,
            absorbable=spec["absorbable"],
            dispensedByPharmacy=False,
            unitPrice=price,
            unit="piece",
            code=_suture_code(code, g, needle),
            specialties="",
            maxQtyPerPack=2,
        )
        for g in ordered
    ]


def _suture_code(code: str, gauge: str, needle: str) -> str:
    """One CSV row lists several gauges; each needs a code of its own.

    sourceCode is unique in the catalogue, so seven gauges sharing the
    original code would insert one row and silently skip six — six gauges a
    surgeon could no longer order, and six prices gone from every deposit.
    """
    return f"{code.strip()} :: {gauge} {needle}"


def expand_syringe(code: str, price):
    """ASSORTED-SYRINGES- 10ML -> Syringe, size 10 ml, at its own price."""
    m = re.search(r"(\d+)\s*ML", code.upper())
    if not m:
        return None
    return [
        dict(
            category="SYRINGE",
            name="Syringe",
            size=f"{m.group(1)} ml",
            material=None,
            needleType=None,
            absorbable=None,
            dispensedByPharmacy=False,
            unitPrice=price,
            unit="piece",
            code=code,
            specialties="",
            maxQtyPerPack=6,
        )
    ]


rows = []
seen_codes = {}

with open(SRC, newline="", encoding="utf-8") as fh:
    for raw in csv.DictReader(fh):
        code = (raw.get("code") or "").strip()
        if not code:
            continue

        price = parse_price(raw.get(" PRICE ") or raw.get("PRICE") or "")
        kind = (raw.get("kind") or "").strip().upper()
        unit = (raw.get("unit") or "piece").strip() or "piece"
        specialties = (raw.get("specialties") or "").strip()
        try:
            max_qty = int((raw.get("max qty per pack") or "1").strip() or 1)
        except ValueError:
            max_qty = 1

        if code in seen_codes:
            notes.append(
                f"{code}: appears twice (kept the {seen_codes[code]} row, "
                f"dropped the {kind or 'blank'} one)"
            )
            continue
        seen_codes[code] = kind or "blank"

        # Families priced per gauge or per size expand into several rows.
        expanded = expand_suture(code, price) or expand_syringe(code, price)
        if expanded:
            rows.extend(expanded)
            continue

        name = NAME_CORRECTIONS.get(code) or (raw.get("name") or "").strip()
        if not name:
            name = humanise(code)
            notes.append(f"{code}: name column empty, named from the code")
        if code in NAME_CORRECTIONS:
            notes.append(
                f"{code}: source name was "
                f"{(raw.get('name') or '').strip()!r}, corrected"
            )

        is_drug = kind == "DRUG"
        if not kind:
            notes.append(f"{code}: kind column blank, treated as a consumable")

        rows.append(
            dict(
                category=category_for(name, code, unit, is_drug),
                name=name,
                size=None,
                material=None,
                needleType=None,
                absorbable=None,
                dispensedByPharmacy=is_drug,
                unitPrice=price,
                unit=unit,
                code=code,
                specialties=specialties,
                maxQtyPerPack=max_qty,
            )
        )

# ── The check that matters: nothing may share a unique key ───────────────
by_key = defaultdict(list)
for r in rows:
    by_key[(r["category"], r["name"], r["size"] or "")].append(r)

fatal = []
for key, group in by_key.items():
    if len(group) == 1:
        continue
    prices = {g["unitPrice"] for g in group}
    codes = ", ".join(g["code"] for g in group)
    if len(prices) > 1:
        fatal.append(f"{key} shares a key across {len(group)} rows with "
                     f"DIFFERENT prices {sorted(prices)}: {codes}")
    else:
        notes.append(f"{key}: {len(group)} identical rows merged ({codes})")

# Drop exact-duplicate keys, keeping the first.
deduped, keys = [], set()
for r in rows:
    k = (r["category"], r["name"], r["size"] or "")
    if k in keys:
        continue
    keys.add(k)
    deduped.append(r)

code_counts = defaultdict(list)
for r in deduped:
    code_counts[r["code"]].append(r["name"] + " " + (r["size"] or ""))
for c, names in code_counts.items():
    if len(names) > 1:
        fatal.append(f"code {c!r} used by {len(names)} rows: {names}")

if fatal:
    print("REFUSING TO GENERATE — prices would be lost:", file=sys.stderr)
    for f in fatal:
        print("  " + f, file=sys.stderr)
    sys.exit(1)


def ts(v):
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("\\", "\\\\").replace("'", "\\'") + "'"


priced = [r for r in deduped if r["unitPrice"]]
drugs = [r for r in deduped if r["dispensedByPharmacy"]]

lines = []
lines.append("// ============================================================")
lines.append("// UNTH Ituku-Ozalla consumable and drug price list")
lines.append("// ------------------------------------------------------------")
lines.append("// GENERATED from prisma/data/unth-consumable-prices.csv.")
lines.append("// Do not hand-edit: edit the CSV and re-run the generator, or")
lines.append("// change prices in the app, which is where they are meant to")
lines.append("// be changed once the list is loaded.")
lines.append("//")
lines.append(f"// {len(deduped)} items, of which {len(priced)} carry a price.")
lines.append("// The rest are deliberately left unpriced: the hospital had not")
lines.append("// set a price, and a guessed one would be charged to a patient.")
lines.append("// A case using an unpriced item is quoted as incomplete rather")
lines.append("// than quoted low.")
lines.append("//")
lines.append("// Prices are naira strings, not numbers. Decimal money through")
lines.append("// a float loses kobo.")
lines.append("// ============================================================")
lines.append("")
lines.append("import type { SeedItem } from './standardCatalogue';")
lines.append("")
lines.append("export type PricedSeedItem = SeedItem & {")
lines.append("  /** The hospital's own code for this line, kept for traceability. */")
lines.append("  code: string;")
lines.append("  /** Unit price in naira, or undefined where nobody has priced it. */")
lines.append("  unitPrice?: string;")
lines.append("  /** How it is issued: piece, pair, vial, set. */")
lines.append("  unit: string;")
lines.append("  /** Most that would reasonably go into one pack. */")
lines.append("  maxQtyPerPack: number;")
lines.append("};")
lines.append("")
lines.append("export const UNTH_PRICE_LIST: PricedSeedItem[] = [")

for r in sorted(deduped, key=lambda x: (x["category"], x["name"], x["size"] or "")):
    bits = [
        f"category: {ts(r['category'])}",
        f"name: {ts(r['name'])}",
    ]
    if r["size"]:
        bits.append(f"size: {ts(r['size'])}")
    if r["material"]:
        bits.append(f"material: {ts(r['material'])}")
    if r["needleType"]:
        bits.append(f"needleType: {ts(r['needleType'])}")
    if r["absorbable"] is not None:
        bits.append(f"absorbable: {ts(r['absorbable'])}")
    if r["dispensedByPharmacy"]:
        bits.append("dispensedByPharmacy: true")
    if r["unitPrice"]:
        bits.append(f"unitPrice: {ts(r['unitPrice'])}")
    bits.append(f"unit: {ts(r['unit'])}")
    bits.append(f"maxQtyPerPack: {r['maxQtyPerPack']}")
    bits.append(f"code: {ts(r['code'])}")
    if r["specialties"]:
        bits.append(f"specification: {ts(r['specialties'])}")
    lines.append("  { " + ", ".join(bits) + " },")

lines.append("];")
lines.append("")
lines.append("/** How much of the list carries a price. Shown before importing. */")
lines.append("export function priceListSummary() {")
lines.append("  let priced = 0;")
lines.append("  let drugs = 0;")
lines.append("  UNTH_PRICE_LIST.forEach((i) => {")
lines.append("    if (i.unitPrice) priced += 1;")
lines.append("    if (i.dispensedByPharmacy) drugs += 1;")
lines.append("  });")
lines.append("  return {")
lines.append("    total: UNTH_PRICE_LIST.length,")
lines.append("    priced,")
lines.append("    unpriced: UNTH_PRICE_LIST.length - priced,")
lines.append("    drugs,")
lines.append("    consumables: UNTH_PRICE_LIST.length - drugs,")
lines.append("  };")
lines.append("}")
lines.append("")

with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
    fh.write("\n".join(lines))

print(f"wrote {OUT}")
print(f"  {len(deduped)} items   {len(priced)} priced   "
      f"{len(deduped) - len(priced)} unpriced   {len(drugs)} pharmacy")
by_cat = defaultdict(int)
for r in deduped:
    by_cat[r["category"]] += 1
for c in sorted(by_cat):
    print(f"    {c:22} {by_cat[c]}")
if notes:
    print("\nnotes:")
    for n in notes:
        print("  - " + n)
