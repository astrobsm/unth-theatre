// ============================================================
// Checking the medicines a patient had to buy
// ------------------------------------------------------------
// Pharmacy cannot always supply. When it cannot, the item is marked out of
// stock, the patient is given a printed list, buys it outside the hospital and
// brings it back. Somebody then has to look at what came back.
//
// THAT CHECK WAS HAPPENING AND BEING RECORDED NOWHERE. A pharmacist eyeballed
// the box at the counter and handed it on, so a drug bought in a shop reached
// an anaesthetic trolley with nothing in the record saying anybody had
// confirmed the drug, the strength, the preparation or the expiry. The check
// is not new; writing it down is.
//
// The decisions live here rather than in the route because they are the part
// worth testing: which items still need checking, whether the prescription can
// be called verified, and what counts as a usable record of a rejection.
// ============================================================

export type PurchaseOutcome = 'ACCEPTED' | 'REJECTED';

/** One item the patient was asked to buy, as checked back in. */
export interface PurchaseCheck {
  drugName: string;
  outcome: PurchaseOutcome;
  /** What they actually brought — rarely the same brand as prescribed. */
  brand?: string | null;
  /** As printed on the pack. Free text: boxes write it every possible way. */
  expiry?: string | null;
  quantity?: string | null;
  note?: string | null;
}

export interface VerificationSummary {
  accepted: string[];
  rejected: string[];
  /** Out of stock, and nobody has checked what came back. */
  outstanding: string[];
  /** Checked, and every one of them accepted. */
  complete: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * The out-of-stock item names on a prescription.
 *
 * Tolerant on the way in because the column has held two shapes over its life:
 * a JSON array of names, and a JSON array of objects with a drugName. A parse
 * failure returns nothing rather than throwing — a malformed column must not
 * take the pharmacy page down.
 */
export function outOfStockNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: string[] = [];
  parsed.forEach((v) => {
    const name =
      typeof v === 'string'
        ? v
        : v && typeof v === 'object' && typeof (v as { drugName?: unknown }).drugName === 'string'
          ? (v as { drugName: string }).drugName
          : null;
    const t = (name ?? '').trim();
    if (t && out.indexOf(t) === -1) out.push(t);
  });
  return out;
}

/** Previously recorded checks, read back from the column. */
export function parseChecks(raw: string | null | undefined): PurchaseCheck[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: PurchaseCheck[] = [];
  parsed.forEach((v) => {
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const drugName = typeof o.drugName === 'string' ? o.drugName.trim() : '';
    if (!drugName) return;
    out.push({
      drugName,
      outcome: o.outcome === 'REJECTED' ? 'REJECTED' : 'ACCEPTED',
      brand: typeof o.brand === 'string' ? o.brand : null,
      expiry: typeof o.expiry === 'string' ? o.expiry : null,
      quantity: typeof o.quantity === 'string' ? o.quantity : null,
      note: typeof o.note === 'string' ? o.note : null,
    });
  });
  return out;
}

/**
 * Where the prescription stands on the medicines the patient had to buy.
 *
 * `complete` IS DELIBERATELY STRICT: every out-of-stock item must have been
 * checked AND accepted. A rejection is not a finished verification — it is a
 * patient who was sent back to the shop, and calling that prescription
 * verified would put a green tick on a case still missing a drug.
 */
export function summariseVerification(
  expected: readonly string[],
  checks: readonly PurchaseCheck[],
): VerificationSummary {
  const byName = new Map<string, PurchaseCheck>();
  checks.forEach((c) => byName.set(norm(c.drugName), c));

  const accepted: string[] = [];
  const rejected: string[] = [];
  const outstanding: string[] = [];

  expected.forEach((name) => {
    const c = byName.get(norm(name));
    if (!c) outstanding.push(name);
    else if (c.outcome === 'REJECTED') rejected.push(name);
    else accepted.push(name);
  });

  return {
    accepted,
    rejected,
    outstanding,
    complete: expected.length > 0 && outstanding.length === 0 && rejected.length === 0,
  };
}

/**
 * Why a submitted check cannot be accepted, or null if it can.
 *
 * A REJECTION WITHOUT A REASON IS REFUSED. "The patient brought the wrong
 * thing" is the single most useful line in this record — it is what a later
 * query, a refund, or an argument about a delayed case turns on — and a
 * rejection with an empty note is a record that answers none of those.
 */
export function rejectReason(checks: readonly PurchaseCheck[]): string | null {
  if (checks.length === 0) return 'Nothing was checked.';
  for (let i = 0; i < checks.length; i += 1) {
    const c = checks[i];
    if (!c.drugName.trim()) return 'One of the items has no name.';
    if (c.outcome === 'REJECTED' && !(c.note ?? '').trim()) {
      return `Say what was wrong with ${c.drugName} — a rejection with no reason cannot be `
        + 'acted on later.';
    }
  }
  return null;
}

/** "2 accepted, 1 sent back, 1 still to check" */
export function describeVerification(s: VerificationSummary): string {
  const parts: string[] = [];
  if (s.accepted.length) parts.push(`${s.accepted.length} accepted`);
  if (s.rejected.length) parts.push(`${s.rejected.length} sent back`);
  if (s.outstanding.length) parts.push(`${s.outstanding.length} still to check`);
  return parts.length ? parts.join(', ') : 'nothing to check';
}
