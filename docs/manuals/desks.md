# Per-role desks

Four summary screens, each answering one question: *what needs me today?*

They **aggregate what already exists**. Nothing on a desk is a new record, and
every figure links to the page that owns it. A desk is a way in, never a
second version of the truth — if a desk and a report disagree, the report is
right and the desk has a bug.

| Desk | Path | Who |
| --- | --- | --- |
| My Practice | `/dashboard/my-practice` | Surgeons and anaesthetists, both grades |
| Inventory Desk | `/dashboard/inventory-desk` | Store keeper, procurement, pharmacy, CSSD supervisor, pack provider |
| Vendor Accounts | `/dashboard/vendor-desk` | Procurement and management |
| Finance Desk | `/dashboard/finance-desk` | Management, procurement, imprest finance duty holders |

---

## My Practice

**Your** cases for the next seven days, and what is still missing from them:
consent, haemoglobin, bleeding-risk assessment, deposit, or a readiness block.
Cases needing something are listed first.

Each case shows its team check-in state, so you can see before you leave home
that the anaesthetist has not answered.

### Your punctuality

The desk shows **your own** on-time starts over 90 days and says so on the
page. Nobody else sees this figure, and it is not a ranking.

Where the milestones were not recorded, the case is **left out** of the figure
rather than counted as late — so a low assessable count means the theatre has
not been recording, not that you have been late.

---

## Inventory Desk

Covered in the [Theatre Supply Chain manual](./theatre-supply-chain.md).

Note that it does **not** open for surgeons. Clinical staff can see stock
levels through the supply pages; the desk is a work queue for the people who
physically move stock, not a second way to browse.

---

## Vendor Accounts and Finance Desk

Covered in the [Theatre Billing manual](./theatre-billing.md).

---

## Access

Two lists govern who sees a desk, and they must agree:

- the **sidebar** reads `src/lib/modules.ts`;
- the **API** reads `src/lib/dashboards/desks.ts`.

A divergence would show somebody a menu entry that fails when they tap it. The
regression suite `scripts/offline-tests/test-role-groups.js` pins the pairs
that matter.

The one deliberate asymmetry is the finance desk's imprest fallback: the API
admits an imprest finance duty holder, and the sidebar cannot see imprest
grants, so those users reach the desk by link.
