// ============================================================
// Procedures to packs, and several procedures in one case
// ------------------------------------------------------------
// A case can be more than one procedure — a tumour resection with a skin graft is
// one operation, one patient, one trip to theatre, and two procedures' worth of
// materials. So the packs for each are merged.
//
// The merge rule is the whole point of this file, and it is not addition.
// ============================================================

export interface PackItemLike {
  /** Free-text name as written in the pack. */
  name: string;
  quantity: number;
  unit?: string | null;
  category?: string | null;
  drugType?: string | null;
  dosage?: string | null;
  /** Route of administration, for drugs. Carried through the merge untouched. */
  route?: string | null;
  notes?: string | null;
  /** Which pack contributed it, kept so a merged list can be explained. */
  sourcePackId?: string | null;
  sourcePackName?: string | null;
}

export interface MergedPackItem extends PackItemLike {
  /** Every pack that asked for this item, and how many each wanted. */
  contributions: { packId: string | null; packName: string | null; quantity: number }[];
  /** True when more than one pack asked for it — the interesting rows on review. */
  shared: boolean;
}

/**
 * Normalise an item name for matching.
 *
 * Pack items are typed by different people over years: "Suture 2/0", "suture 2-0",
 * "Suture  2 / 0". Without this, a merge produces three rows for one thing and the
 * theatre is sent three sets.
 *
 * Dosage and size are deliberately part of the key: 500 mg and 1 g of the same
 * drug are not the same item, and merging them would be a prescribing error.
 */
export function packItemKey(item: PackItemLike): string {
  const base = `${item.name}|${item.dosage ?? ''}|${item.drugType ?? ''}`;
  return base
    .toUpperCase()
    .replace(/[^A-Z0-9|]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Merge the packs for several procedures into one list.
 *
 * Quantities take the MAXIMUM, not the sum.
 *
 * A combined case does not need two full sets of the same materials: the scrub
 * nurse opens one trolley, the same suture pack serves both parts of the
 * operation, and summing would send double and be wasted or returned. Where the
 * procedures genuinely need more — two separate instrument sets, say — the higher
 * of the two pack quantities is what the pack itself already states.
 *
 * Summing was the obvious implementation and it is wrong for consumables. It
 * would also be wrong for drugs in the opposite direction, which is why dosage is
 * part of the key: two different doses stay two rows and are not silently merged.
 */
export function mergePackItems(items: PackItemLike[]): MergedPackItem[] {
  const byKey = new Map<string, MergedPackItem>();

  for (const item of items) {
    const key = packItemKey(item);
    const qty = Number.isFinite(item.quantity) && item.quantity > 0 ? Math.trunc(item.quantity) : 1;
    const contribution = {
      packId: item.sourcePackId ?? null,
      packName: item.sourcePackName ?? null,
      quantity: qty,
    };

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...item, quantity: qty, contributions: [contribution], shared: false });
      continue;
    }

    existing.contributions.push(contribution);
    // The maximum. See the note above — this is the rule, not an optimisation.
    existing.quantity = Math.max(existing.quantity, qty);
    // Shared only when the packs genuinely differ. The same pack listing an item
    // twice is a fault in the pack, not two procedures needing it.
    existing.shared = new Set(
      existing.contributions.map((c) => c.packId ?? c.packName ?? '')
    ).size > 1;
  }

  return Array.from(byKey.values());
}

/** A procedure named on a case. The first is the principal one. */
export interface CaseProcedure {
  name: string;
  subspecialty?: string | null;
}

/**
 * Parse the procedure list stored on a case.
 *
 * Stored as a newline-separated string rather than a relation: it is display text
 * a surgeon typed, not a foreign key, and a join table would imply a catalogue
 * discipline this field has never had.
 */
export function parseProcedures(
  principal: string | null | undefined,
  additional?: string | null
): CaseProcedure[] {
  const out: CaseProcedure[] = [];
  const seen = new Set<string>();
  const push = (n: string) => {
    const name = n.trim();
    if (!name) return;
    const k = name.toUpperCase();
    if (seen.has(k)) return;   // the same procedure twice is a slip, not two procedures
    seen.add(k);
    out.push({ name });
  };
  push(principal ?? '');
  for (const line of (additional ?? '').split(/\r?\n|;/)) push(line);
  return out;
}

/** Store them back. The principal procedure stays in its own column. */
export function serialiseAdditional(procedures: CaseProcedure[] | string[]): string | null {
  const names = procedures
    .map((p) => (typeof p === 'string' ? p : p.name).trim())
    .filter(Boolean)
    .slice(1);
  return names.length ? names.join('\n') : null;
}

/** How a case's procedure list reads on a list or a document. */
export function describeProcedures(
  principal: string | null | undefined,
  additional?: string | null
): string {
  const list = parseProcedures(principal, additional);
  if (list.length === 0) return 'Not specified';
  if (list.length === 1) return list[0].name;
  // "+ 1 more" rather than a wall of text on a row; the full list is on the case.
  return `${list[0].name} + ${list.length - 1} more`;
}

export interface PackSuggestion {
  packId: string;
  packName: string;
  /** How the match was made, so an administrator can judge whether to trust it. */
  basis: 'EXACT_NAME' | 'PROCEDURE_WORD' | 'SUBSPECIALTY_DEFAULT';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Suggest packs for a procedure.
 *
 * SUGGEST, never apply. Which pack a hemicolectomy needs is a clinical judgement
 * and it is not reliably derivable from a name — auto-requesting the wrong pack is
 * worse than requesting none, because somebody opens it before noticing.
 *
 * So every match carries how it was made and how much to trust it, and an
 * administrator confirms it once. After that the mapping is stored and no
 * guessing happens at booking.
 */
export function suggestPacks(
  procedureName: string,
  packs: { id: string; name: string; subspecialty: string; kind?: string | null }[],
  subspecialty?: string | null
): PackSuggestion[] {
  const proc = procedureName.trim().toUpperCase();
  if (!proc) return [];

  const out: PackSuggestion[] = [];
  const taken = new Set<string>();

  const add = (p: { id: string; name: string }, basis: PackSuggestion['basis'],
               confidence: PackSuggestion['confidence']) => {
    if (taken.has(p.id)) return;
    taken.add(p.id);
    out.push({ packId: p.id, packName: p.name, basis, confidence });
  };

  for (const p of packs) {
    if (p.name.trim().toUpperCase() === proc) add(p, 'EXACT_NAME', 'HIGH');
  }

  // Significant words only. Matching on "of", "and" or "left" would suggest every
  // pack in the hospital and make the list worthless.
  const STOP = new Set(['OF', 'AND', 'THE', 'WITH', 'FOR', 'LEFT', 'RIGHT',
    'BILATERAL', 'TOTAL', 'PARTIAL', 'OPEN', 'EXPLORATORY', 'REPAIR', 'EXCISION']);
  const words = proc.split(/[^A-Z0-9]+/).filter((w) => w.length >= 5 && !STOP.has(w));

  for (const p of packs) {
    const pname = p.name.toUpperCase();
    if (words.some((w) => pname.includes(w))) add(p, 'PROCEDURE_WORD', 'MEDIUM');
  }

  if (subspecialty) {
    const sub = subspecialty.trim().toUpperCase();
    for (const p of packs) {
      if (p.subspecialty.trim().toUpperCase() === sub) add(p, 'SUBSPECIALTY_DEFAULT', 'LOW');
    }
  }

  return out;
}
