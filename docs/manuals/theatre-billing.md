# Theatre Billing — user manual

**Sidebar → Theatre Billing, Finance Desk, Vendor Accounts.**

For finance, procurement and management.

---

## 1. One invoice per surgery

A surgery has **exactly one** invoice. Not one per item, not one per
department, not a fresh one because something was added late — one invoice,
which is amended as the case develops.

This is enforced in the database, not merely by convention. Two invoices for
one operation is how a patient ends up paying twice for the same theatre.

## 2. Money is held in kobo

Every amount in the billing system is a whole number of **kobo**. Nothing is
stored as a decimal fraction of a naira.

This is not fussiness. Decimal arithmetic on money loses fractions, and a
system that apportions one payment across five accounts loses them five times
over. Whole kobo cannot drift.

Percentages are held as **basis points** — 12.5% is stored as 1250 — for the
same reason.

## 3. Prices are effective-dated

A tariff has a start date and an end date. Changing a price does not overwrite
the old one: it ends the old row and starts a new one.

An invoice raised in July is therefore still priced at July's tariff when you
look at it in December, and a price correction never silently rewrites
history. When somebody asks why a case cost what it did, the answer is
retrievable.

The same applies to revenue-sharing rules.

## 4. What goes on an invoice

- **Consumables actually used**, at the batch's selling price. Not what was
  reserved — what was recorded as used. Returned stock is not billed;
  **damaged or wasted stock is not billed to the patient.**
- **Procedure and professional fees**, from the effective tariff.

## 5. Payments

Record the amount, the method and a reference. Overpayment is refused rather
than absorbed. A payment can be reversed with a reason; it is never deleted.

## 6. Revenue distribution

When an invoice is paid, the amount is apportioned across the revenue accounts
by the rules in force **on the invoice's date**.

The apportionment uses **largest-remainder** allocation, which guarantees the
shares add back to exactly the amount paid. Simple rounding does not: five
accounts each rounded to the nearest kobo can add up to a kobo more or less
than what came in, every single time, forever.

**▢ Hospital policy — action required.** The seeded revenue percentages came
from the project specification. **Nobody at UNTH has yet confirmed they match
what was actually agreed.** Because the rules are effective-dated, a correction
supersedes cleanly rather than rewriting history — but the sooner it is done,
the fewer invoices there are to explain.

## 7. Settlement

Distribution says what an account is **owed**. Settlement records that it was
**paid**.

**No money moves through ORM.** Finance makes the transfer in the bank; the
settlement is the ledger entry saying they did, and the bank reference is what
ties the two together when somebody asks six months later.

A reference is **required**, not optional. "Marked settled by somebody, at
some point, no reference" is worse than leaving it pending: it looks
reconciled and cannot be checked.

## 8. The Finance Desk

**Sidebar → Finance Desk.**

Outstanding, overdue, taken today, taken this month, awaiting settlement, and
the collection rate. Below that: overdue invoices, and the settlement queue by
account.

Open to management and procurement, and to anyone holding a finance duty in
the imprest system — Chief Accountant, Cashier, Internal Auditor. ORM has no
FINANCE role of its own, and inventing one would leave two lists of finance
staff to keep in step.

Finance staff who hold an imprest duty but not one of those ORM roles reach
the desk **by link** (`/dashboard/finance-desk`), not from the sidebar. The
sidebar cannot see imprest grants.

## 9. Vendor Accounts

**Sidebar → Vendor Accounts.** The hospital's view of what it owes outside
parties: consignment stock held, expired units, amounts owed, recent
settlements.

This is not a vendor login. **Vendors do not have ORM accounts.**

The desk also shows a **"not attributed to a vendor"** figure — pending
distributions to accounts with no vendor attached. That covers hospital shares
and anything mis-configured. A silent remainder is how a reconciliation goes
wrong, so it is shown rather than hidden.
