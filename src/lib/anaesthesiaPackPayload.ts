/**
 * What a set of chosen anaesthesia packs contributes to a pre-operative review:
 * drugs to Pharmacy, consumables to the Consumable Pack Provider.
 *
 * WHY THIS IS PURE, AND WHY THAT MATTERS
 *
 * This logic used to live inside the pack picker and END BY CALLING THE
 * PARENT'S setState. Worse, it was invoked from inside setSelected/setEdits
 * updater functions — which React runs during the render phase. Updating a
 * different component mid-render makes React re-invoke the updater, which calls
 * it again, and the escalation ends in "Too many re-renders": an error thrown
 * from render, which unmounts the entire review. Pressing a pack card made the
 * whole pre-operative review disappear.
 *
 * Keeping the derivation pure and separate means the component can only
 * *publish* it in an effect, after the render — and it means what reaches
 * Pharmacy can be tested, which it could not be while it was a side effect.
 */

export interface AnaesMedication {
  id: string; category: string; name: string; dose: string; unit: string; route: string; timing: string; notes?: string;
}
export interface AnaesConsumableRequest {
  name: string; category: string; size?: string | null; unit: string; quantity: number; notes?: string;
}
export interface AnaesPackPayload {
  medications: AnaesMedication[];
  consumableRequests: AnaesConsumableRequest[];
}

/** Only the fields the payload needs, so the picker's richer types still fit. */
export interface PayloadItem {
  name?: string | null;
  quantity: number | '' | null;
  unit?: string | null;
  category?: string | null;
  size?: string | null;
  dosage?: string | null;
  route?: string | null;
  notes?: string | null;
  removed?: boolean;
}
export interface PayloadPack {
  id: string;
  name: string;
  kind: 'CONSUMABLE' | 'PHARMACY';
  items: PayloadItem[];
}

export interface BuildArgs {
  packs: readonly PayloadPack[];
  /** Ids of the packs the anaesthetist has applied. */
  selected: ReadonlySet<string>;
  /** Per-pack edits, keyed by pack id. Absent means "as seeded". */
  edits: ReadonlyMap<string, PayloadItem[]>;
  /** Injected so the output is deterministic under test. */
  makeId?: (n: number) => string;
}

const defaultMakeId = (n: number) => `anpk-${n}`;

export function buildAnaesPackPayload({
  packs, selected, edits, makeId = defaultMakeId,
}: BuildArgs): AnaesPackPayload {
  const medications: AnaesMedication[] = [];
  const consumableRequests: AnaesConsumableRequest[] = [];
  let n = 0;

  for (const p of packs) {
    if (!selected.has(p.id)) continue;
    const items = edits.get(p.id) ?? p.items;
    for (const it of items) {
      const qty = Number(it.quantity) || 0;
      // A row somebody has just added carries no name yet. Skipping it beats
      // trusting every item to have one — an unguarded .trim() here is how a
      // single blank row would take the review down.
      const name = (it.name ?? '').trim();
      if (it.removed || !name || qty < 1) continue;

      if (p.kind === 'PHARMACY') {
        medications.push({
          id: makeId(n++),
          category: `Anaesthesia: ${p.name}`,
          name,
          dose: it.dosage ?? '',
          unit: it.unit || 'vial',
          // The prescription requires a route; an em dash reads as "not stated"
          // rather than silently claiming one.
          route: it.route ?? '—',
          timing: 'Theatre (intra-operative)',
          notes: it.notes ?? '',
        });
      } else {
        consumableRequests.push({
          name,
          category: it.category ?? 'ANAESTHESIA_AIRWAY',
          size: it.size ?? null,
          unit: it.unit || 'piece',
          quantity: qty,
          notes: `Anaesthesia pack: ${p.name}`,
        });
      }
    }
  }

  return { medications, consumableRequests };
}
