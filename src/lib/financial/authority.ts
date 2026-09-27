// ============================================================
// Which node may do what with money
// ------------------------------------------------------------
// ORM runs on two databases: the theatre server at Ituku-Ozalla and the cloud.
// A classified set of tables replicates between them. The billing tables are
// NOT among them — invoices, invoice_lines, invoice_payments,
// revenue_distributions, tariffs, stock_reservations and surgery_estimates
// appear in no sync policy at all.
//
// That was never written down as a decision. It is the default for a table
// nobody classified, and the audit of 27 September 2026 found it by checking
// rather than by reading, which is the definition of an invisible rule.
//
// WHY IT MATTERS. `surgeries` replicates and `invoices` does not, while
// Invoice.surgeryId is unique and one-to-one with a surgery. So the same case
// can carry a different invoice on each node, indefinitely, and nothing in the
// system would ever notice. Payments taken on the theatre server are invisible
// to the cloud; payments taken on the cloud are invisible to the theatre.
//
// AND REPLICATING IT WOULD BE WORSE, which is the part that makes this a
// decision rather than a bug. Two databases holding the same payment row could
// each act on it, and an idempotency key cannot prevent that because it is
// unique per database. The same reasoning deliberately keeps
// communication_messages unreplicated so two nodes cannot both send the same
// WhatsApp message. Money deserves at least that much care.
//
// So the rule is: ONE NODE IS AUTHORITATIVE FOR EACH FINANCIAL OPERATION, and
// this file is where that is stated, in one place, with the reason attached.
//
// ── WHAT THIS FILE DOES AND DOES NOT DO ─────────────────────────────────────
//
// It DECLARES the rule and makes it checkable. It ENFORCES only where enforcing
// cannot break a theatre in the middle of a list:
//
//   SETTLE is enforced. It moves money outward to a supplier's bank, a
//   double-settlement is not recoverable by editing a row, and there is no
//   legitimate reason to settle from the theatre server. It is also a rare,
//   deliberate, administrative act — blocking it on the wrong node cannot
//   interrupt clinical work.
//
//   Everything else REPORTS. Invoicing and taking a manual payment may well be
//   happening on the theatre server today as part of somebody's actual
//   workflow. Blocking those without first looking at the data would break a
//   working hospital to satisfy an architectural preference, which is the wrong
//   order. `describeAuthority()` exists so an operator can see what is
//   mis-placed before anything starts refusing.
//
// Turning an operation from reporting to enforcing is a one-word change below,
// and should be made per operation, once the data has been looked at.
// ============================================================

import prisma from '@/lib/prisma';

/** The node this code is running on. */
export type NodeKind = 'CLOUD' | 'LOCAL' | 'UNKNOWN';

/** Where an operation is allowed to happen. */
export type AuthorityScope = 'CLOUD_ONLY' | 'LOCAL_ONLY' | 'EITHER';

/** Whether a breach is refused or merely recorded. See the header. */
export type Enforcement = 'ENFORCED' | 'REPORTED';

export type FinancialOperation =
  | 'ISSUE_INVOICE'
  | 'RECORD_MANUAL_PAYMENT'
  | 'CONFIRM_GATEWAY_PAYMENT'
  | 'ALLOCATE_REVENUE'
  | 'SETTLE_DISTRIBUTION'
  | 'SET_TARIFF'
  | 'RESERVE_STOCK'
  | 'RECORD_CONSUMPTION';

export interface AuthorityRule {
  scope: AuthorityScope;
  enforcement: Enforcement;
  /** The table this operation writes, for the guardrail that checks sync. */
  table: string;
  /** Why the scope is what it is. Read by a person, not by code. */
  why: string;
}

/**
 * The rule.
 *
 * Every financial write ORM performs should appear here. A new one that does
 * not is caught by scripts/lib-tests/financialAuthority.test.ts.
 */
export const FINANCIAL_AUTHORITY: Record<FinancialOperation, AuthorityRule> = {
  SETTLE_DISTRIBUTION: {
    scope: 'CLOUD_ONLY',
    enforcement: 'ENFORCED',
    table: 'revenue_distributions',
    why: 'Moves money outward to a supplier. A double settlement cannot be undone by '
      + 'editing a row, and settling from a node that cannot see the other node\'s '
      + 'distributions is how it happens. Rare and administrative, so refusing it here '
      + 'cannot interrupt a theatre list.',
  },

  CONFIRM_GATEWAY_PAYMENT: {
    scope: 'CLOUD_ONLY',
    enforcement: 'ENFORCED',
    table: 'invoice_payments',
    why: 'A gateway webhook can only reach a public address, so only the cloud can ever '
      + 'receive one. Enforced rather than assumed: a confirmation arriving anywhere else '
      + 'is not a payment, it is something pretending to be one.',
  },

  ISSUE_INVOICE: {
    scope: 'CLOUD_ONLY',
    enforcement: 'REPORTED',
    table: 'invoices',
    why: 'Invoice numbers must be unique across the hospital and the table does not '
      + 'replicate, so two nodes can mint the same number for different patients. '
      + 'Reported rather than enforced until the theatre server can be inspected — it '
      + 'may be issuing invoices today as part of a working routine.',
  },

  RECORD_MANUAL_PAYMENT: {
    scope: 'CLOUD_ONLY',
    enforcement: 'REPORTED',
    table: 'invoice_payments',
    why: 'Cash and POS receipts taken at the theatre are real money and must not be '
      + 'refused because a link is down — the theatre server was offline for three days '
      + 'this month. This stays REPORTED until local receipts can be captured and '
      + 'reconciled upward, which is Phase 2 work, not a flag change.',
  },

  ALLOCATE_REVENUE: {
    scope: 'CLOUD_ONLY',
    enforcement: 'REPORTED',
    table: 'revenue_distributions',
    why: 'Allocation follows the payment it divides, so it belongs wherever payments are '
      + 'confirmed. Reported while RECORD_MANUAL_PAYMENT still is.',
  },

  SET_TARIFF: {
    scope: 'CLOUD_ONLY',
    enforcement: 'REPORTED',
    table: 'tariffs',
    why: 'Two nodes pricing the same item differently produces two defensible bills for '
      + 'one operation, and no way to say which was right. Prices should be set once and '
      + 'read everywhere.',
  },

  RESERVE_STOCK: {
    scope: 'EITHER',
    enforcement: 'REPORTED',
    table: 'stock_reservations',
    why: 'Stock is physical and lives in the theatre. Reserving it where it actually is, '
      + 'while the link is down, is correct behaviour rather than a violation. The '
      + 'quantities travel as stock_movements, which is already APPEND_ONLY and does '
      + 'replicate.',
  },

  RECORD_CONSUMPTION: {
    scope: 'EITHER',
    enforcement: 'REPORTED',
    table: 'stock_reservations',
    why: 'What was used in an operation is recorded in the operating theatre, by the '
      + 'people who used it, at the time. Requiring a network for that would mean it is '
      + 'written down later from memory, which is worse for both the bill and the count.',
  },
};

/**
 * Which node is this?
 *
 * Cached for the life of the process: node identity is written once at
 * provisioning and never changes, so re-reading it per request would be a query
 * per call to prove something that cannot vary.
 */
let cachedNode: NodeKind | null = null;

export async function thisNodeKind(): Promise<NodeKind> {
  if (cachedNode) return cachedNode;
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ node_id: string }>>(
      'select node_id from sync_node where id limit 1');
    const id = (rows[0]?.node_id ?? '').trim().toLowerCase();
    if (!id || id === 'unset') return 'UNKNOWN';   // not cached: it may be set later
    cachedNode = id === 'cloud' ? 'CLOUD' : 'LOCAL';
    return cachedNode;
  } catch {
    // Before the sync migration, or on a database that has lost the row. Not
    // knowing is its own answer and must not be mistaken for either node.
    return 'UNKNOWN';
  }
}

/** Only for tests, which need to exercise both nodes in one process. */
export function __resetNodeCache() { cachedNode = null; }

export interface AuthorityDecision {
  /** May the caller proceed? False only when the rule is ENFORCED and breached. */
  allowed: boolean;
  /** Is this node the right place for it, regardless of enforcement? */
  correctNode: boolean;
  node: NodeKind;
  rule: AuthorityRule;
  /** Present whenever correctNode is false, whether or not it was refused. */
  reason?: string;
}

/**
 * May this node perform this operation?
 *
 * Returns rather than throws, and separates "wrong place" from "refused", so a
 * caller can record a breach it has been told to allow. A rule that is being
 * reported rather than enforced is still a rule, and an operation that quietly
 * happens in the wrong place while nobody counts it is how this situation arose
 * in the first place.
 */
export async function checkAuthority(op: FinancialOperation): Promise<AuthorityDecision> {
  const rule = FINANCIAL_AUTHORITY[op];
  const node = await thisNodeKind();

  const correctNode =
    rule.scope === 'EITHER' ? true
    : rule.scope === 'CLOUD_ONLY' ? node === 'CLOUD'
    : node === 'LOCAL';

  if (correctNode) return { allowed: true, correctNode: true, node, rule };

  // UNKNOWN is treated as the wrong node for anything scoped, deliberately. A
  // database that cannot say which node it is has no business settling money.
  const where = rule.scope === 'CLOUD_ONLY' ? 'the cloud' : 'the theatre server';
  const reason = node === 'UNKNOWN'
    ? `This database does not know which node it is, so it cannot be trusted with ${op}. `
      + 'Set sync_node.node_id.'
    : `${op} belongs on ${where}. ${rule.why}`;

  return {
    allowed: rule.enforcement !== 'ENFORCED',
    correctNode: false,
    node,
    rule,
    reason,
  };
}

/**
 * How much unreplicated financial data this node is holding.
 *
 * The billing tables exist independently on each node, so these counts are
 * per-node by definition. Run the same report on both and compare: a non-zero
 * count on the theatre server is money the cloud has never heard of.
 *
 * This is the evidence needed before any REPORTED operation can sensibly
 * become ENFORCED. Enforcing first and looking afterwards would refuse work
 * the hospital is currently relying on.
 *
 * Never throws. A node that cannot count its invoices should still be able to
 * report the rest of its health.
 */
export async function financialFootprint(): Promise<{
  node: NodeKind;
  /** True when this node holds billing data the other node cannot see. */
  holdsUnreplicatedMoney: boolean;
  counts: Record<string, number>;
  note: string;
}> {
  const node = await thisNodeKind();
  const counts: Record<string, number> = {};

  const tally = async (key: string, sql: string) => {
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(sql);
      counts[key] = Number(rows[0]?.n ?? 0);
    } catch {
      // The table may not exist on an older node. Absent is not zero, and
      // saying so is more honest than reporting a count that was never taken.
      counts[key] = -1;
    }
  };

  await tally('invoices', 'select count(*)::bigint as n from invoices');
  await tally('payments', 'select count(*)::bigint as n from invoice_payments');
  await tally('distributionsPending',
    "select count(*)::bigint as n from revenue_distributions where status = 'PENDING'");
  await tally('distributionsSettled',
    "select count(*)::bigint as n from revenue_distributions where status = 'SETTLED'");
  await tally('tariffs', 'select count(*)::bigint as n from tariffs');
  await tally('estimates', 'select count(*)::bigint as n from surgery_estimates');

  const holdsUnreplicatedMoney = Object.values(counts).some((n) => n > 0);

  return {
    node,
    holdsUnreplicatedMoney,
    counts,
    note: node === 'CLOUD'
      ? 'These are the cloud\'s figures. Compare against the theatre server: anything it '
        + 'holds is invisible here.'
      : 'These are this node\'s figures and the cloud cannot see them. Compare against the '
        + 'cloud before enabling enforcement on any reported operation.',
  };
}

/**
 * The whole rule, as it applies on this node right now.
 *
 * For an operator deciding whether an operation is safe to start enforcing:
 * it shows what is misplaced before anything begins refusing.
 */
export async function describeAuthority(): Promise<{
  node: NodeKind;
  operations: Array<{
    operation: FinancialOperation;
    table: string;
    scope: AuthorityScope;
    enforcement: Enforcement;
    permittedHere: boolean;
    why: string;
  }>;
}> {
  const node = await thisNodeKind();
  const operations = (Object.keys(FINANCIAL_AUTHORITY) as FinancialOperation[]).map((op) => {
    const rule = FINANCIAL_AUTHORITY[op];
    const permittedHere =
      rule.scope === 'EITHER' ? true
      : rule.scope === 'CLOUD_ONLY' ? node === 'CLOUD'
      : node === 'LOCAL';
    return {
      operation: op,
      table: rule.table,
      scope: rule.scope,
      enforcement: rule.enforcement,
      permittedHere,
      why: rule.why,
    };
  });
  return { node, operations };
}
