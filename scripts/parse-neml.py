"""Parse the NEML PDF text into a structured JSON drug catalogue.

Output shape:
[
  {
    "section": "1",
    "title": "ANAESTHETICS, PREOPERATIVE MEDICINES, AND MEDICAL GASES",
    "subsections": [
      {
        "section": "1.1",
        "title": "General anaesthetics and oxygen",
        "subsections": [
          {
            "section": "1.1.1",
            "title": "Inhalational medicines",
            "drugs": [
              {"name": "Halothane", "forms": ["Inhalation (volatile liquid): 250-mL bottle."]}
            ]
          }
        ]
      }
    ]
  }
]
"""
import json
import re
from pathlib import Path

SRC = Path(r"e:\THEATHRE CHAIR\unth-theatre\scripts\neml-raw.txt")
DST_JSON = Path(r"e:\THEATHRE CHAIR\unth-theatre\scripts\neml-catalog.json")

# --- 1. Read & pre-clean ---------------------------------------------------
raw = SRC.read_text(encoding="utf-8")

# drop page markers and standalone page numbers
lines = []
for ln in raw.splitlines():
    if re.match(r"^=+\s*PAGE\s+\d+\s*=+$", ln):
        continue
    if re.match(r"^\s*\d{1,3}\s*$", ln):  # bare page number
        continue
    lines.append(ln.rstrip())

# --- 2. Locate the start of LIST OF MEDICINES and end (PRIMARY HEALTH CARE LIST) ---
start = end = None
for i, ln in enumerate(lines):
    s = ln.strip()
    if start is None and s == "LIST OF MEDICINES":
        start = i + 1
    elif start is not None and re.match(r"^THE PRIMARY HEALTH CARE LIST", s):
        end = i
        break
if start is None:
    raise SystemExit("Could not find 'LIST OF MEDICINES' anchor")
if end is None:
    end = len(lines)

body = lines[start:end]
print(f"Body lines: {len(body)}")

# --- 3. Tokenise ---------------------------------------------------------
# Patterns for headers (numbered section/subsection)
# Accept "1." or "1.1" or "1.1.1" as the leading token
HDR = re.compile(r"^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+([A-Z][A-Za-z][^;:]*?)\s*$")


def is_real_header(num: str, title: str) -> bool:
    # Reject anything that looks like a dosage continuation
    if re.search(r"\b(mg|mL|ml|mcg|units?|g|%|/mL|/mg)\b", title):
        return False
    if any(ch.isdigit() for ch in title):
        return False
    # Reject footnote-style "**For ..." lines
    if title.startswith("*"):
        return False
    # Top-level (single integer): require ALL CAPS title (allowing & , / - and spaces)
    if "." not in num:
        if not re.match(r"^[A-Z][A-Z ,/&\-()]+$", title):
            return False
        n = int(num)
        if n < 1 or n > 60:
            return False
    else:
        # Sub-section: title should be sentence case (first word title-case)
        if not title[0].isupper():
            return False
        # Reject lines that are just a single common word (likely drug name fragments)
        if len(title.split()) < 2 and not title.endswith("medicines"):
            return False
    return True
# Common sub-list labels we want to ignore as headers but still keep visible
SUBLABEL = re.compile(r"^(Complementary List|Complementary list|CoMplemenuuy List|"
                      r"Access group|Watch group|Reserve group|"
                      r"AWaRe Categorization|AWaRe Categorisation)\s*$",
                      re.IGNORECASE)

# Drug start: a line beginning with a Capitalised word that is NOT a formulation keyword
FORM_WORDS = (
    "Tablet", "Tablets", "Capsule", "Capsules", "Injection", "Powder", "Oral",
    "Suspension", "Solution", "Cream", "Ointment", "Gel", "Spray", "Drops",
    "Eye", "Ear", "Suppository", "Suppositories", "Pessary", "Pessaries",
    "Lozenges", "Lozenge", "Inhalation", "Inhaler", "Granules", "Vaginal",
    "Buffered", "Topical", "Sublingual", "Patch", "Lotion", "Mouthwash",
    "Syrup", "Effervescent", "Dental", "Nasal", "Implant", "Subcutaneous",
    "Intravenous", "Liquid", "Vial", "Ampoule", "Aerosol", "Enema", "Linctus",
    "Foam", "Pastille", "Mixture", "Pellet", "Tab", "Cap", "Pwd", "Inj",
    "**", "*", "†", "If", "Recommen", "DRV", "Genotyping",
)
FORM_LINE_RE = re.compile(
    r"^(Tablet|Tablets|Capsule|Capsules|Injection|Powder|Oral|Suspension|Solution|"
    r"Cream|Ointment|Gel|Spray|Drops|Eye|Ear|Suppository|Suppositories|Pessary|"
    r"Pessaries|Lozenges|Lozenge|Inhalation|Inhaler|Granules|Vaginal|Buffered|"
    r"Topical|Sublingual|Patch|Lotion|Mouthwash|Syrup|Effervescent|Dental|Nasal|"
    r"Implant|Subcutaneous|Intravenous|Liquid|Vial|Ampoule|Aerosol|Enema|Linctus|"
    r"Foam|Pastille|Mixture|Pellet|Powder for|Solution for|Injection for|"
    r"Tablet \(|Capsule \(|Powder \(|Cream \()"
)


def split_drug_line(ln: str):
    """Try to split 'Halothane Inhalation (volatile liquid): 250-mL bottle.' into (name, forms_text).

    Returns (name, form_text) or (None, None) if not a drug line.
    """
    s = ln.strip()
    if not s:
        return None, None
    # Skip obvious header-ish stand-alone phrases
    if HDR.match(s) or SUBLABEL.match(s):
        return None, None
    # Skip footnotes
    if s.startswith("**") or s.startswith("*"):
        return None, None
    # Find the first formulation keyword
    m = re.search(
        r"\b(Tablet|Tablets|Capsule|Capsules|Injection|Powder for|Oral liquid|"
        r"Oral suspension|Oral solution|Oral granules|Suspension|Solution|Cream|"
        r"Ointment|Gel|Spray|Drops|Eye drops|Ear drops|Suppository|Suppositories|"
        r"Pessary|Pessaries|Lozenges|Lozenge|Inhalation|Inhaler|Granules|"
        r"Vaginal|Topical|Sublingual|Patch|Lotion|Mouthwash|Syrup|Effervescent|"
        r"Dental|Nasal|Implant|Subcutaneous|Intravenous|Liquid|Vial|Ampoule|"
        r"Aerosol|Enema|Linctus|Foam|Pastille|Mixture|Pellet|Solution for|"
        r"Injection for|Powder/granules|Powder)\b",
        s,
    )
    if not m:
        return None, None
    name = s[: m.start()].strip(" :,-")
    rest = s[m.start():].strip()
    # Heuristic: drug name should start with an uppercase letter and not be empty
    if not name or not name[0].isalpha() or not name[0].isupper():
        return None, None
    # Drug names rarely exceed ~80 chars
    if len(name) > 90:
        return None, None
    return name, rest


# --- 4. Parser ------------------------------------------------------------
catalog = []  # list of top-level sections
stack = [(0, {"section": "", "title": "ROOT", "subsections": [], "drugs": []})]


def push_section(level: int, num: str, title: str):
    # Pop until we find a parent of higher level
    while stack and stack[-1][0] >= level:
        stack.pop()
    parent = stack[-1][1]
    node = {"section": num, "title": title, "subsections": [], "drugs": []}
    parent["subsections"].append(node)
    stack.append((level, node))


def current():
    return stack[-1][1]


i = 0
pending_drug = None  # currently-accumulating drug

def flush_drug():
    global pending_drug
    if pending_drug is not None:
        # Move into the deepest non-root section
        node = current()
        if node is stack[0][1]:
            # No section yet — create an Uncategorised holder
            push_section(1, "0", "UNCATEGORISED")
            node = current()
        node["drugs"].append(pending_drug)
        pending_drug = None


while i < len(body):
    ln = body[i]
    s = ln.strip()
    if not s:
        flush_drug()
        i += 1
        continue

    m = HDR.match(s)
    if m and is_real_header(m.group(1), m.group(2)):
        flush_drug()
        num = m.group(1)
        title = m.group(2).strip()
        # Strip trailing notes like "(see restricted medicines list)"
        title = re.sub(r"\s*\(see [^)]+\)\s*$", "", title, flags=re.IGNORECASE)
        level = len(num.split("."))
        push_section(level, num, title)
        i += 1
        continue

    if SUBLABEL.match(s):
        flush_drug()
        # Treat AWaRe / Complementary as a sub-grouping inside current section
        push_section(stack[-1][0] + 1, "", s)
        i += 1
        continue

    # Try to split as drug
    name, form = split_drug_line(s)
    if name is not None:
        flush_drug()
        pending_drug = {"name": name, "forms": [form]}
        i += 1
        continue

    # Continuation of previous drug? (formulation continuation or wrapped name)
    if pending_drug is not None:
        # Check if it is just additional formulation info or continuation of name
        if FORM_LINE_RE.match(s) or s[:1].islower() or s.startswith(("(", "*", "†", "**")):
            pending_drug["forms"].append(s)
        else:
            # Could be wrapped drug name (e.g. "Sodium valproate (Valproic" then "acid)")
            # If it ends with ')' and previous form list is empty-ish, append to name
            if pending_drug["name"].endswith("(") or pending_drug["name"].endswith("(Valproic"):
                pending_drug["name"] = (pending_drug["name"] + " " + s).strip()
            else:
                pending_drug["forms"].append(s)
    # else: drop noise lines
    i += 1

flush_drug()

# Drop the synthetic root
catalog = stack[0][1]["subsections"]


# --- 5. Post-process: clean form text -------------------------------------
def clean_forms(forms):
    joined = " ".join(forms)
    joined = re.sub(r"\s+", " ", joined).strip()
    # Split on '. ' boundaries that look like new formulations (followed by a Form keyword)
    # Simplest: just keep as a single string per drug
    return joined


def walk(node):
    drugs = node.get("drugs", [])
    for d in drugs:
        d["forms_text"] = clean_forms(d.pop("forms"))
    for sub in node.get("subsections", []):
        walk(sub)


for top in catalog:
    walk(top)


DST_JSON.write_text(json.dumps(catalog, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Wrote {DST_JSON}")

# Stats
def count_drugs(node):
    n = len(node.get("drugs", []))
    for sub in node.get("subsections", []):
        n += count_drugs(sub)
    return n

total = sum(count_drugs(t) for t in catalog)
print(f"Top-level sections: {len(catalog)}; total drugs parsed: {total}")
for t in catalog[:35]:
    print(f"  {t['section']:>6} {t['title'][:60]:60} drugs={count_drugs(t)}")
