# The benchmark corpus — what UNTH needs to supply

Everything downstream depends on this and nothing else can substitute for it.

Until these pages exist, no statement about which OCR engine is best for this
hospital is worth anything. Handwriting is specific to the people who write it;
an engine that leads on published benchmarks may well be worse on the notes your
registrars actually produce. That is a measurable question, and this is how it
gets measured.

It takes about an hour to assemble.

---

## What to collect

**20–30 pages**, photographed with the phones people actually use in theatre —
not a scanner, not a good camera held carefully. The corpus should look like the
input the system will really get, including the bad ones.

Aim for roughly:

| How many | What |
|---|---|
| 5–6 | Anaesthetic charts, handwritten, with drugs and doses |
| 4–5 | Operative notes |
| 3–4 | Signed consent forms, signature included |
| 3–4 | Ward or nursing notes |
| 2–3 | Laboratory reports (printed) |
| 2–3 | Referral or consultation letters |
| 2–3 | Deliberately poor: dim light, glare, photographed at an angle, folded |

**Include the bad photographs.** An engine's behaviour on a page nobody can read
is exactly what needs measuring — the system must say "I cannot read this"
rather than invent something plausible, and only a genuinely unreadable page
proves it does.

Vary the handwriting. Six pages from one registrar measures that registrar.

---

## What to write down

For every image, a plain text file of the same name saying what the page
**actually says**:

    anaesthetic-chart-01.jpg
    anaesthetic-chart-01.txt

The text file is the thing the engines are marked against, so it has to be
right. Written by someone who can read the page — usually the person who wrote
it, or a colleague from the same unit.

### Rules for the text file

**Type what is on the page, not what it means.** If it says `Inj. Morphine 5mg
IM stat`, write that. Not "morphine 5 mg intramuscular immediately".

**Doses exactly as written.** `0.5` is not `.5`. `5mg` and `5 mg` are different
transcriptions and the difference matters.

**Keep the line breaks.** One line on the page is one line in the file.

**For anything genuinely illegible**, write:

    [illegible]

Do not guess. A guess in the ground truth marks a correct engine wrong and, far
worse, marks a hallucinating engine right.

**For a signature**, write:

    [signature]

Signatures are never transcribed — the system records that one is present and
where, and keeps the original as the authoritative document.

**Do not tidy anything.** Spelling mistakes, crossings-out and abbreviations
stay as they are. The engine has to cope with the real thing.

---

## Patient identifiers

These are real clinical documents, so treat them as such.

The corpus lives in the repository, which means anyone with access to the code
can read it. **Obscure patient names and folder numbers before photographing** —
a strip of paper over the identifiers is fine and takes seconds — or use
discarded or superseded forms where nothing identifies a person.

If a page cannot be de-identified and is still worth including, tell me and I
will set up a location outside the repository for it. Do not commit it.

An identifier that must stay legible for the test (because reading folder
numbers is part of what we are measuring) can be replaced with an invented one
written on the obscuring strip.

---

## Running it

    node scripts/ocr-benchmark.js

Output:

    ENGINE                 CER     WER  NUMBERS/DRUGS  DOSE ERRORS  FAILED      AVG
    tesseract-fast       12.4%   19.1%          94.2%            1       0   1840ms

    tesseract-fast: NOT SAFE — 1 order-of-magnitude error(s) on numbers,
    e.g. "0.5" read as "5".
        NUMBER  "0.5" read as "5"   ORDER OF MAGNITUDE
                in: inj morphine 0.5 mg im stat

Engines are ranked by **accuracy on numbers, doses and drug names**, not by CER.
A headline error rate cannot tell a misread dose from a harmless typo:

    "Morphine 5 mg"  read as  "Morphine 15 mg"   CER 2.1%  — trebles the dose
    "cholecystectomy" read as "cholecystectorny" CER 2.1%  — harmless

Both look excellent. One of them is a drug error. That is why the third column
exists and why it, not the first, decides which engine ships.
