# Google Document AI — setup

Handwriting OCR with per-word confidence and bounding boxes, which is what the
verification screen needs.

**This sends clinical documents to Google.** The provider stays switched off
until somebody at UNTH with the authority accepts that.

---

## 1. Create it

1. https://console.cloud.google.com — sign in.
2. **Create a project.** Name it `unth-theatre`. Note the **Project ID** (it is
   not the same as the name — it usually has digits appended).
3. Enable the API: https://console.cloud.google.com/apis/library/documentai.googleapis.com
   → **Enable**.
4. Create the processor: https://console.cloud.google.com/ai/document-ai/processors
   → **Create processor** → **Document OCR**.
   - **Region: EU** — this decides where documents are processed, and it is the
     first question any data-processing review will ask.
   - Copy the **Processor ID** from the processor's page.

## 2. A service account

https://console.cloud.google.com/iam-admin/serviceaccounts → **Create**.

- Name: `orm-ocr`
- Role: **Document AI API User** — that role only. Not Editor, not Owner. A key
  that can read documents should not also be able to delete the project.
- Then **Keys → Add key → Create new key → JSON**. It downloads once.

## 3. Configure

Three values plus the key. On Vercel and on the theatre server:

```
GOOGLE_DOCAI_PROJECT_ID=unth-theatre-123456
GOOGLE_DOCAI_LOCATION=eu
GOOGLE_DOCAI_PROCESSOR_ID=abc123def456
GOOGLE_DOCAI_CREDENTIALS=<the JSON file's contents, base64-encoded>
```

Base64 it, because a PEM private key pasted raw into an environment variable
loses its newlines and fails with an error that looks nothing like the cause:

```bash
base64 -w0 orm-ocr-key.json          # Linux
certutil -encodehex -f key.json out.txt 0x40000001   # Windows
```

Then, deliberately and separately:

```
OCR_PROVIDERS=googledocai,tesseract
OCR_EXTERNAL_PROCESSING_ACCEPTED=yes
```

**Both are required.** The registry refuses a provider that transmits documents
unless the second is exactly `yes` — not "true", not "1". A typo fails closed,
because the consequence of a false positive is a consent form leaving the
hospital.

## 4. Measure before trusting it

```bash
node ocr-benchmark/scripts/compare-engines.js --engine googledocai
```

Baselines on the same 62 documents:

| engine | numbers, doses, drug names |
|---|---|
| tesseract | 4.7% |
| CRAFT + TrOCR | 26.1% |
| **threshold to be usable** | **98%** |

If Document AI does not clear the bar it does not go in, whatever it costs and
whoever approved it.

## 5. Cost

Charged per page. The first 1,000 pages a month are free at the time of
writing; check current pricing for your region before this becomes routine.

The benchmark is 62 documents. A busy theatre is not.

## 6. What does not change

Every reading still goes to a clinician. Drug names, doses, routes, allergies,
identifiers and blood groups require confirmation regardless of confidence,
because a recogniser's confidence is a statement about pixels and not about
medicine.

A better engine means less correcting. It does not mean less checking.
