// ============================================================
// Revenue distribution — splitting an invoice without losing a kobo
// ------------------------------------------------------------
// The whole difficulty of this module is one sentence: the shares of an integer
// must sum back to that integer, exactly, always.
//
// Three accounts splitting ₦100.00 at a third each is 3,333.33 kobo apiece.
// Rounding each share independently gives 3,333 × 3 = 9,999 — a kobo short, on
// every invoice, for ever. Rounding up instead over-distributes. Either way the
// hospital's ledger and the sum of its settlements disagree, and somebody
// spends a week finding out why.
//
// So shares are allocated by LARGEST REMAINDER: floor every share, then hand
// the leftover kobo out one at a time to whoever was rounded down hardest. The
// result sums exactly, and the account that lost most to rounding is the one
// compensated first, which is also the fairest reading.
//
// Percentages are BASIS POINTS (1% = 100bp, 100% = 10,000bp) — integers, for
// the same reason the money is.
// ============================================================

export const BASIS_POINTS_TOTAL = 10_000;

export interface ShareRule {
  accountId: string;
  shareBasisPoints: number;
  /** Carried through so the distribution row can record what produced it. */
  kind?: string;
}

export interface Share {
  accountId: string;
  amount: number;
  shareBasisPoints: number;
  kind?: string;
}

/**
 * Split `total` kobo across rules by basis points, exactly.
 *
 * The rules need not sum to 10,000bp: they are treated as proportions of
 * whatever they do sum to, so a partially configured split still distributes
 * the whole amount rather than quietly leaving some unallocated. Whether that
 * is what the hospital intended is a question for `validateRules`.
 */
export function distribute(total: number, rules: ShareRule[]): Share[] {
  if (!Number.isInteger(total)) {
    throw new Error('An amount to distribute must be an integer number of kobo.');
  }
  if (rules.length === 0) return [];
  if (total === 0) {
    return rules.map((r) => ({ accountId: r.accountId, amount: 0, shareBasisPoints: r.shareBasisPoints, kind: r.kind }));
  }

  const totalBp = rules.reduce((s, r) => s + r.shareBasisPoints, 0);
  if (totalBp <= 0) return rules.map((r) => ({ accountId: r.accountId, amount: 0, shareBasisPoints: r.shareBasisPoints, kind: r.kind }));

  const negative = total < 0;
  const magnitude = Math.abs(total);

  // Floor each share and remember how much each lost to the flooring.
  const provisional = rules.map((r) => {
    const exact = (magnitude * r.shareBasisPoints) / totalBp;
    const floored = Math.floor(exact);
    return { rule: r, amount: floored, remainder: exact - floored };
  });

  let allocated = provisional.reduce((s, p) => s + p.amount, 0);
  let leftover = magnitude - allocated;

  // Hand the leftover kobo to the largest remainders first. Ties break on
  // accountId so the same invoice always splits the same way.
  const order = [...provisional].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.rule.accountId < b.rule.accountId ? -1 : 1;
  });

  let i = 0;
  while (leftover > 0) {
    order[i % order.length].amount += 1;
    leftover -= 1;
    i += 1;
  }

  return provisional.map((p) => ({
    accountId: p.rule.accountId,
    amount: negative ? -p.amount : p.amount,
    shareBasisPoints: p.rule.shareBasisPoints,
    kind: p.rule.kind,
  }));
}

/**
 * Split a whole invoice, charge kind by charge kind.
 *
 * Each kind is distributed separately — consumables may go mostly to the
 * vendor while theatre fees go to the hospital — and each kind's split is exact
 * in itself, so the total is exact too.
 */
export interface InvoiceLineForSplit {
  kind: string;
  lineTotal: number;
  /** Set for consignment lines: the vendor owed for this specific line. */
  vendorAccountId?: string | null;
}

export function distributeInvoice(params: {
  lines: InvoiceLineForSplit[];
  /** Rules keyed by charge kind. */
  rulesByKind: Record<string, ShareRule[]>;
  /** Where anything with no rule goes. Without it, unruled money vanishes. */
  fallbackAccountId: string;
}): Share[] {
  const { lines, rulesByKind, fallbackAccountId } = params;

  const byKind = new Map<string, number>();
  const vendorDirect = new Map<string, number>();

  for (const line of lines) {
    // A consignment line is owed to the vendor that supplied it, not to
    // whatever the generic rule for consumables says.
    if (line.vendorAccountId) {
      vendorDirect.set(line.vendorAccountId, (vendorDirect.get(line.vendorAccountId) ?? 0) + line.lineTotal);
      continue;
    }
    byKind.set(line.kind, (byKind.get(line.kind) ?? 0) + line.lineTotal);
  }

  const shares: Share[] = [];

  // Array.from rather than iterating the Map directly: this app's tsconfig
  // sets no explicit `target`, so for..of over a Map needs downlevelIteration.
  for (const [kind, amount] of Array.from(byKind.entries())) {
    const rules = rulesByKind[kind];
    if (!rules || rules.length === 0) {
      // No rule configured: the money goes to the hospital rather than nowhere.
      shares.push({ accountId: fallbackAccountId, amount, shareBasisPoints: BASIS_POINTS_TOTAL, kind });
      continue;
    }
    shares.push(...distribute(amount, rules.map((r) => ({ ...r, kind }))));
  }

  for (const [accountId, amount] of Array.from(vendorDirect.entries())) {
    shares.push({ accountId, amount, shareBasisPoints: BASIS_POINTS_TOTAL, kind: 'CONSUMABLE' });
  }

  return mergeShares(shares);
}

/** One row per account per kind — the same account appearing twice reads as a duplicate. */
export function mergeShares(shares: Share[]): Share[] {
  const merged = new Map<string, Share>();
  for (const s of shares) {
    const key = `${s.accountId}::${s.kind ?? ''}`;
    const existing = merged.get(key);
    if (existing) existing.amount += s.amount;
    else merged.set(key, { ...s });
  }
  return Array.from(merged.values());
}

/** Total of a set of shares — used to assert the split is exact. */
export function sumShares(shares: Share[]): number {
  return shares.reduce((s, x) => s + x.amount, 0);
}

export interface RuleValidation {
  valid: boolean;
  totalBasisPoints: number;
  message?: string;
}

/**
 * Do the rules for one charge kind add up to 100%?
 *
 * Deliberately a warning rather than an error at distribution time: a split
 * that adds to 90% still needs to pay out the whole invoice, and refusing to
 * distribute would strand the money. This is what the settings screen shows so
 * the gap is fixed on purpose rather than discovered in a settlement run.
 */
export function validateRules(rules: ShareRule[]): RuleValidation {
  const total = rules.reduce((s, r) => s + r.shareBasisPoints, 0);
  if (total === BASIS_POINTS_TOTAL) return { valid: true, totalBasisPoints: total };
  const pct = (total / 100).toFixed(2);
  return {
    valid: false,
    totalBasisPoints: total,
    message:
      total < BASIS_POINTS_TOTAL
        ? `These shares total ${pct}%, not 100%. The remainder will still be distributed in proportion, but the split is probably incomplete.`
        : `These shares total ${pct}%, more than 100%. Each account will receive proportionally less than its stated share.`,
  };
}

/** Percentage for display, to two places. */
export function basisPointsToPercent(bp: number): number {
  return Math.round((bp / 100) * 100) / 100;
}

export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}
