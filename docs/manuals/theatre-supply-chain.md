# Theatre Supply Chain — user manual

**Sidebar → Theatre Supply Unit, Supply Reports, Bulk Import.**

For store keepers, procurement, pharmacy, CSSD and the consumable pack
provider. Surgeons and theatre staff can see stock levels; they cannot move
stock.

---

## 1. The one idea that explains the rest: batches

The **catalogue** ("Vicryl 2/0") is one row: a name and a category. That is
what it has always been.

A **batch** is the physical reality underneath it — a specific lot, with its
own batch number, its own expiry date, its own owner and its own price.

Two boxes of the same suture can be two batches: one expiring in March and one
in September, one bought by the hospital and one held on consignment for a
vendor. They cannot be told apart in the catalogue, and everything that
matters about them lives on the batch.

## 2. The arithmetic every screen obeys

```
on hand  =  received + returned − issued − expired − disposed
issued   =  returned + used + damaged
```

The first line is what is physically on the shelf. The second says that every
unit issued to a case has to end up somewhere: back on the shelf, used on the
patient, or broken.

If the two disagree, something was not recorded. The reports show the
discrepancy rather than quietly balancing it.

## 3. Ownership: hospital and consignment

| Owner | Meaning |
| --- | --- |
| Hospital | Bought and paid for. The hospital carries the stock. |
| Vendor | Consignment. It becomes the hospital's only when it is used. |

Consignment stock generates a payable to the vendor **at the moment it is
consumed**, not when it is delivered. Until then it sits on the shelf as the
vendor's property, and the Vendor Accounts desk shows how much of it you are
holding.

**▢ Hospital policy** — what happens to consignment stock that expires on the
shelf. The system records the expiry and whose stock it was; who bears the
loss is a commercial matter between the hospital and the vendor.

## 4. FEFO — first expired, first out

When stock is allocated to a case, the system picks the batch that expires
soonest, then the next, and so on. You do not choose the batch; choosing by
hand is how the short-dated box stays at the back of the shelf until it is
worthless.

An expired batch is never allocated.

## 5. The daily jobs

### Receiving

Record the batch number, the quantity, the expiry date, the owner and the
prices. Everything downstream depends on the expiry date being right — it
drives FEFO, the expiry report and the Inventory Desk.

Bulk receipts can be loaded from a spreadsheet: **Theatre Supply → Bulk
Import**. The importer validates the whole file before writing anything, and
reports every bad row with its line number rather than importing half a file.

### Reserving against a case

Booking a case reserves what it needs. The reservation names the batches by
FEFO and holds them, so two theatres cannot both plan on the last box.

### Issuing, returning, using, wasting

When the case runs:

- **Used** — went into the patient. This is what gets billed.
- **Returned** — came back unopened. Not billed.
- **Damaged / wasted** — opened, dropped, contaminated. **Not billed to the
  patient.** The hospital carries a breakage; billing the patient for it would
  be indefensible.

Every unit issued must be accounted for under one of those three. A
reservation with unaccounted units stays outstanding and appears on the
reports until somebody closes it.

### Scanning

Barcodes are supported for receiving and issuing. **Theatre Supply → scan.**

## 6. Reports

**Sidebar → Supply Reports.** Eleven reports, each exportable to Excel:

| Report | Answers |
| --- | --- |
| Daily consumption | What was used, on whom, and what it was worth |
| Drug usage | Which drugs, in what quantity |
| Controlled drug register | The statutory register for controlled substances |
| Inventory valuation | What is on the shelf and what it is worth |
| Expiry | What has expired and what is about to |
| Stock-outs | What ran out, and when |
| Emergency usage | What emergencies consumed |
| Vendor settlement | What is owed to each vendor |
| Procedure cost | What a given procedure actually consumes |
| Revenue distribution | How billed revenue was apportioned |
| Outstanding invoices | What has not been paid |

The Excel export uses the same builders as the screen, so a spreadsheet and
the page can never disagree.

## 7. Vendors

Vendors are **editable records**, not hard-coded names. Add, edit and
deactivate them under vendor management. A vendor carries a name, phone,
address, TIN (encrypted at rest) and bank details.

Bank account numbers are shown in full **only** to the person making a
transfer, on the settlement screen. Summary screens show the last four digits.

## 8. The Inventory Desk

**Sidebar → Inventory Desk.** A work queue rather than another way to browse:

- **Expired, still on the shelf** — a disposal and a write-off.
- **Expiring within 30 days** — a decision about the operating list.
- **At or below reorder level** — an order to place.
- Stock value, consignment value, open reservations, movements today.

Expired stock is listed above stock expiring tomorrow, because they are
different jobs.

**▢ Hospital policy** — the hospital's disposal procedure for expired stock,
and who authorises a write-off.
