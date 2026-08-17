# ORM REVENUE — Phase 1: Architecture & Integration Map

Status: **design, pending decisions in §D.** No schema or code changed yet.
Baseline established: `npm run test:billing` → **73 passed, 0 failed**.

---

## A. What already exists

The master prompt describes a system that is roughly **40% already built** in this
repository, and built well. Phase 1's most useful output is therefore not a
greenfield design but an honest map of what to keep, what to extend, and what is
genuinely missing.

Stack: Next.js 14 (App Router) · Prisma 5 · PostgreSQL · NextAuth · TypeScript.
Money is **integer kobo** throughout — never float, never `Decimal`. Keep this.

### Already implemented, to standard

| Spec section | Requirement | Existing implementation |
|---|---|---|
| §5, §40 | Service catalogue, price versioning | `Tariff` — effective-dated (`effectiveFrom`/`effectiveTo`), superseded by writing `effectiveTo` on the old row, never edited in place. `reason` field on price change. |
| §7 | Consolidated itemised bill | `Invoice` + `InvoiceLine`, assembled by `lib/billing/invoice.ts` |
| §40 | Historical invoices immune to price change | `InvoiceLine.unitPrice` captured at billing time; stock priced at `unitPriceAtReservation` |
| §12, §13 | Allocation engine, percentage splits | `lib/billing/revenue.ts` — `distributeInvoice()` |
| §53 | Rounding differences | **Largest-remainder allocation.** Shares of an integer sum back to it exactly. This is the correct algorithm and is already tested (23 cases). |
| §14 | Revenue account directory | `RevenueAccount` (+ `RevenueAccountKind`) |
| §41 | Allocation rule versioning | `RevenueRule` — effective-dated, basis points (1% = 100bp) |
| §12 | Computed split, recorded as applied | `RevenueDistribution` — stores `shareBasisPoints` so the figure can be re-derived |
| §34, §35 | Idempotency | `IdempotencyKey` model + `lib/idempotency.ts`, applied to payment POST |
| §23, §44 | Invoice lock after payment | `isInvoiceLocked()` — enforced on invoice PATCH |
| §18 (partial) | Reversal not deletion | `Payment.reversedAt` + `reversalReason`; distributions cancelled, not deleted |
| §39 | Provisional bill from care pathway | `SurgeryEstimate` + `SurgeryEstimateLine` + `lib/estimates/` (autoDraft, fromPacks) |
| §38 | ORM integration | Already wired: `StockReservation` → billing consumes `quantityUsed`; `ProcedurePackMap`; `Vendor` consignment routing |

Two existing design rules are better than the master prompt's defaults and
should be preserved explicitly:

1. **The patient is billed for what was `quantityUsed`, never what was reserved,
   issued or wasted.** A dropped vial is the hospital's loss. (`lib/billing/invoice.ts`)
2. **Consignment stock pays the vendor that supplied that specific line**, not
   the generic consumables rule. Ownership transfers at consumption.

---

## B. The central architectural conflict

`src/app/api/billing/payments/route.ts` states its design decision in its header:

> *"This is a LEDGER. No money moves through the application. ORM computes what
> each account is owed, records it, and Finance executes the transfers — which is
> why there is no payment gateway here and no credentials to protect."*

The master prompt (§9, §11, §16, §35) requires the opposite: a payment-gateway
integration with server-side verification, signed webhooks, and — where supported
— **native provider split settlement**.

These are not reconcilable by compromise; they are two different trust models.

| | Existing: **manual ledger** | Master prompt: **gateway** |
|---|---|---|
| Money path | Patient → cash desk → hospital bank, outside the app | Patient → gateway → hospital settlement account |
| Payment truth | A cashier's entry + evidence image | Provider's server-to-server verification |
| Settlement | Finance transfers in the bank; app records the reference | Provider split, or transfer API |
| Attack surface | None. No credentials. | Gateway secrets, webhook endpoint, replay risk |
| Works offline | Yes — this matters on the on-site box | No — needs outbound internet |

**Recommendation: keep both rails, with different trust levels — do not replace
the ledger.**

The reason is not conservatism. §2 forbids trusting a *client's claim* of payment.
It does not, and cannot, forbid a cashier recording genuine cash — at a Nigerian
teaching-hospital revenue desk, cash and POS are a large share of collections, and
a human entry is the only possible source of truth for them. The correct design
distinguishes them structurally rather than pretending they are the same:

```
Payment.trustBasis:
  GATEWAY_VERIFIED   server-to-server verified — auto-allocates
  BANK_CONFIRMED     matched against a bank statement import — auto-allocates
  ATTESTED           a cashier's entry + evidence — allocates, but flagged
                     for reconciliation and counted in the exceptions report
```

An `ATTESTED` payment is honest about what it is: someone's word plus a teller
slip. It is allowed (care must not stop), it is allocated, and it is *visibly
unreconciled* until a bank statement confirms it. That satisfies §51's demand
that the system never create the illusion that money has arrived when it has not,
without breaking a working cash desk.

---

## C. Genuine gaps — what Phases 2–8 must build

Ordered by financial risk, highest first.

### C1. No separation of duties — **highest risk** (§24, §25)

`UserRole` contains **no finance role at all**: no cashier, revenue officer,
finance officer, or auditor. All three billing endpoints — invoice create/update,
payment, *and* settlement — are guarded by the single permission
`requireStock('receive')`, whose holders are:

```
ADMIN, SYSTEM_ADMINISTRATOR, THEATRE_MANAGER, THEATRE_CHAIRMAN,
THEATRE_STORE_KEEPER, PROCUREMENT_OFFICER, PHARMACIST
```

So today **one store keeper can raise an invoice, set an override price, take the
payment, and record the bank settlement** — the exact concentration §25 forbids.
A pharmacist can mark money as transferred to a vendor account.

The fix should **not** invent a third permission system. The imprest module has
already solved this: `ImprestRole` (CASHIER, CHIEF_ACCOUNTANT, ACCOUNT_OFFICER,
INTERNAL_AUDITOR, VIEW_ONLY_AUDITOR, FINANCE…) assigned through
`ImprestRoleAssignment`, with a `resource:action` permission matrix in
`lib/imprest/permissions.ts` and a documented rule that *the API check is the
security boundary and the UI check is a courtesy*. Extend that layer.

### C2. No audit trail on any financial action (§33)

`grep` for audit writes across `src/app/api/billing/` and `src/lib/billing/`
returns **nothing**. `AuditLog` and `ImprestAuditLog` models exist and are used
elsewhere; billing writes to neither. Every price override, discount, payment,
reversal and settlement is currently unlogged.

### C3. `Payment` has no status — no state machine (§10)

`Payment` has `amount`, `method`, `reference`, `reversedAt` — and no status
field. A payment exists or it does not; there is no
`PENDING → PROCESSING → SUCCESSFUL` progression, which a gateway requires and
which §10 mandates. Needs a `PaymentStatus` enum plus a guarded transition
function (the `statusAfterPayment` pattern in `lib/billing/invoice.ts` is the
model to follow).

### C4. Deposits are booked as revenue, not liability (§21)

`ChargeKind.ADMISSION` is an ordinary invoice line, so an admission deposit is
distributed to revenue accounts the moment the invoice is paid. §21 requires it
held as a **deposit/liability** and drawn down as services are consumed. This is
a real accounting defect, not a cosmetic one: it overstates earned revenue.
Needs `Deposit` + `DepositApplication`.

### C5. Settled allocations cannot be recovered on reversal (§19)

On payment reversal the route cancels distributions `where status: 'PENDING'`.
Distributions already `SETTLED` — money that has genuinely left the building —
are silently left in place with no recovery record. §19 requires
*Settlement Reversal / Recovery* as its own transaction.

### C6. Entities that do not exist at all

`Refund` (§19) · `Adjustment`/credit note (§23) · `LedgerEntry` (§18 double-entry)
· `Settlement`/`SettlementItem` as first-class objects with a lifecycle (§16 —
today settlement is only two nullable columns on `RevenueDistribution`) ·
`Reconciliation` (§31, §32) · `PaymentProvider`/`PaymentTransaction` (§9) ·
receipt + verification code (§26) · patient portal (§27).

### C7. Allocation timing is hard-coded (§20)

Distribution happens **only on full settlement** — a deliberate, well-reasoned
choice (documented: a split computed twice against a moving balance must be
unwound if a payment is reversed). But §20 requires Option A / Option B to be
*configurable*. Option B needs the reversal recovery of C5 to exist first.

---

## D. Decisions needed before Phase 2

These change the schema, so migrations should not be written until they are settled.

1. **Gateway rail — build it, and with which provider?** Adds an
   outbound-internet dependency and secrets to an on-site box. Paystack and
   Flutterwave both support native split settlement; Interswitch and Moniepoint
   differ. The alternative is to defer the gateway and first close C1–C6, which
   carry more financial risk than the gateway adds convenience.
2. **Invoice scope.** `Invoice.surgeryId` is `@unique` — strictly one invoice per
   surgery. §7's consolidated bill spanning admission, investigations and ward
   stay needs either an encounter-scoped invoice (migration, touches everything)
   or an invoice-group wrapper over surgery-scoped invoices (additive, safer).
3. **Deposit policy.** Confirm deposits become liabilities drawn down by charge
   (C4). This is the correct accounting and I recommend it, but it changes how
   admission money is reported.
4. **Allocation timing default** — keep Option A as the default (recommended) and
   add Option B as opt-in configuration.
5. **Finance RBAC** — extend the existing `ImprestRole`/`ImprestRoleAssignment`
   layer (recommended: one finance identity across imprest and revenue) versus a
   parallel `RevenueRole`.

---

## E. Proposed phase order (revised from §52)

§52's order assumes a greenfield build. Given what exists, this order retires
risk faster:

| Phase | Content | Blocked by |
|---|---|---|
| 2 | Finance RBAC + separation-of-duties rules + audit trail on every billing action (C1, C2) | D5 |
| 3 | `PaymentStatus` state machine; `Refund`, `Adjustment`, `LedgerEntry` (C3, C6) | — |
| 4 | Deposits as liability (C4); settlement as first-class object with recovery (C5) | D3 |
| 5 | Reconciliation engine + exceptions report (§31, §32) | — |
| 6 | Receipt, verification code/QR, patient portal (§26–§28) | D2 |
| 7 | Gateway abstraction + one provider + signed idempotent webhook (§9, §35) | D1 |
| 8 | Dashboards and reports (§29, §30, §46, §47) | — |
| 9 | Security review, load, deployment (§42, §53) | — |

Phase 2 comes first because C1 and C2 are exploitable **today**, with no gateway
involved.
