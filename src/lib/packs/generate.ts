// ============================================================
// Building a case's draft packs
// ------------------------------------------------------------
// Base theatre pack + approach + family + sutures + magnitude, composed into
// two lists the surgeon edits and submits. Deterministic: the same case
// produces the same draft every time, and every line can be traced to the
// block that put it there.
//
// WHAT THIS IS AND IS NOT. It is a stores list and a starting point. It is not
// a prescription, not a protocol, and not a substitute for the surgeon deciding
// what this patient needs. Three things follow from that, and they are enforced
// here rather than left to the screen:
//
//   The antibiotic is offered as the guideline's options with the choice left
//   open. Nothing picks an agent silently.
//
//   No dose is ever put on a child's pack. Paediatric prophylaxis is weight-
//   based, and an adult dose printed on a pack for a four-year-old is exactly
//   the kind of error a system should make impossible rather than convenient.
//
//   A pack is a DRAFT until a person submits it. Nothing here reaches a
//   pharmacy or a pack provider on its own.
// ============================================================

import { resolveBasePack, type SurgeryMagnitude } from '@/lib/baseConsumablePack';
import {
  APPROACH_ITEMS, FAMILY_ITEMS, FAMILY_LABEL, PROPHYLAXIS, THEATRE_PHARMACY,
  approachOf, familyOf, suturesFor,
  type Approach, type ProcedureFamily, type StandardItem,
} from '@/lib/packs/standards';

export interface DraftItem {
  name: string;
  quantity: number;
  unit: string;
  category?: string | null;
  size?: string | null;
  /** For pharmacy lines. */
  dosage?: string | null;
  route?: string | null;
  drugType?: string | null;
  /** Which block put it here, so a reviewer can see why. */
  source: string;
  note?: string | null;
  /**
   * True where the line is a choice the surgeon must make, not a quantity to
   * pick. The screen shows these differently and the pack cannot be submitted
   * with one unresolved.
   */
  needsChoice?: boolean;
  /** The options, where it is a choice. */
  options?: string[];
}

export interface GeneratedPacks {
  consumables: DraftItem[];
  pharmacy: DraftItem[];
  family: ProcedureFamily;
  familyLabel: string;
  approach: Approach;
  magnitude: SurgeryMagnitude;
  /** What it was built from, for the reviewer and the audit trail. */
  basis: string[];
  /** Things the person submitting must look at. Never silently resolved. */
  warnings: string[];
}

const qtyFor = (item: StandardItem, m: SurgeryMagnitude): number =>
  item.qty[m === 'MINOR' ? 0 : m === 'INTERMEDIATE' ? 1 : 2];

const toDraft = (item: StandardItem, m: SurgeryMagnitude, source: string): DraftItem | null => {
  const quantity = qtyFor(item, m);
  // A zero at this magnitude means the item does not belong on this pack. It is
  // dropped rather than listed as "0 ×", which reads as an omission somebody
  // should correct.
  if (quantity <= 0) return null;
  return {
    name: item.name,
    quantity,
    unit: item.unit,
    category: item.category,
    size: item.size ?? null,
    source,
    note: item.note ?? null,
  };
};

/** Is this a child, for dosing purposes? */
function isPaediatric(age?: number | null, ageUnit?: string | null): boolean {
  if (age === null || age === undefined) return false;
  const unit = (ageUnit ?? 'YEARS').toUpperCase();
  if (unit.startsWith('YEAR')) return age < 16;
  // Months, weeks, days — all children.
  return true;
}

export interface GenerateInput {
  procedureName: string;
  subspecialty?: string | null;
  magnitude?: string | null;
  surgeryType?: string | null;
  /** Additional procedures in the same operation, newline-separated. */
  additionalProcedures?: string | null;
  patientAge?: number | null;
  patientAgeUnit?: string | null;
  /** A documented beta-lactam allergy changes which options are offered. */
  betaLactamAllergy?: boolean;
}

/**
 * The draft packs for a case.
 *
 * Additional procedures contribute their own family items and sutures, merged
 * by taking the HIGHER quantity rather than the sum — a tumour resection with a
 * skin graft is one trip to theatre and one set of drapes, not two.
 */
export function generatePacks(input: GenerateInput): GeneratedPacks {
  const magnitude: SurgeryMagnitude =
    input.magnitude === 'MINOR' || input.magnitude === 'INTERMEDIATE' || input.magnitude === 'MAJOR'
      ? input.magnitude
      : 'INTERMEDIATE';

  const family = familyOf(input.procedureName, input.subspecialty);
  const approach = approachOf(input.procedureName, family);
  const basis: string[] = [];
  const warnings: string[] = [];

  // ── Consumables ──
  const consumables: DraftItem[] = [];

  resolveBasePack(magnitude).forEach((b) => {
    consumables.push({
      name: b.name,
      quantity: b.quantity,
      unit: b.unit,
      category: b.category,
      size: b.size ?? null,
      source: 'Mandatory base theatre pack',
    });
  });
  basis.push('Mandatory base theatre pack (WHO essential surgical care supply lists), scaled to magnitude');

  (APPROACH_ITEMS[approach] ?? []).forEach((i) => {
    const d = toDraft(i, magnitude, `${approach.toLowerCase()} approach`);
    if (d) consumables.push(d);
  });
  basis.push(`${approach.charAt(0) + approach.slice(1).toLowerCase()} approach items`);

  // Every family in the case, principal first.
  const families = new Set<ProcedureFamily>([family]);
  (input.additionalProcedures ?? '')
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .forEach((extra) => families.add(familyOf(extra, input.subspecialty)));

  families.forEach((f) => {
    (FAMILY_ITEMS[f] ?? []).forEach((i) => {
      const d = toDraft(i, magnitude, `${FAMILY_LABEL[f]} standard`);
      if (d) consumables.push(d);
    });
    suturesFor(f, magnitude).forEach(({ line, quantity }) => {
      consumables.push({
        name: `${line.brand} ${line.gauge}`,
        quantity,
        unit: 'packet',
        category: 'SUTURES',
        size: line.gauge,
        source: `${FAMILY_LABEL[f]} suture set`,
        // Ethicon by hospital standard. Naming the product rather than "suture
        // 2/0" is what stops the theatre being sent something else.
        note: `${line.material}${line.needle ? `, ${line.needle} needle` : ''} — ${line.use}`,
      });
    });
  });
  basis.push(`Procedure family: ${Array.from(families).map((f) => FAMILY_LABEL[f]).join(', ')}`);
  basis.push('Sutures: Ethicon wound closure range (hospital standard)');

  if (families.size > 1) {
    warnings.push(
      `This case has ${families.size} procedure families. Quantities are merged by taking the higher, not by adding — check the totals are right for one trip to theatre.`,
    );
  }

  // ── Pharmacy ──
  const pharmacy: DraftItem[] = [];

  THEATRE_PHARMACY.forEach((i) => {
    const d = toDraft(i, magnitude, 'Theatre drugs');
    if (d) pharmacy.push({ ...d, drugType: i.category, dosage: i.size ?? null });
  });

  const advice = PROPHYLAXIS[family];
  const paediatric = isPaediatric(input.patientAge, input.patientAgeUnit);

  if (advice.routineNotIndicated) {
    // Said, not omitted. A pack with no antibiotic and no explanation reads as
    // an oversight, and somebody adds one "to be safe".
    warnings.push(
      `The guideline does not recommend routine antibiotic prophylaxis for ${FAMILY_LABEL[family].toLowerCase()} procedures. `
      + 'Nothing has been added. If this patient needs one, add it and say why.',
    );
    basis.push(advice.basis);
  } else {
    const options = input.betaLactamAllergy ? advice.betaLactamAllergy : advice.firstLine;

    if (input.betaLactamAllergy) {
      warnings.push('A beta-lactam allergy is recorded, so the alternative regimen is offered. Confirm the allergy and the choice.');
    }

    options.forEach((opt) => {
      pharmacy.push({
        name: opt.agent,
        quantity: 1,
        unit: 'dose',
        category: 'ANTIBIOTIC',
        drugType: 'ANTIBIOTIC',
        // The dose is omitted entirely for a child rather than guessed.
        dosage: paediatric ? null : opt.adultDose,
        route: opt.route,
        source: 'Surgical antimicrobial prophylaxis',
        note: paediatric
          ? 'Paediatric dose — the prescriber calculates it by weight. No adult dose has been filled in.'
          : (opt.note ?? 'Standard adult prophylactic dose. Confirm weight, renal function and allergy.'),
        needsChoice: true,
        options: [],
      });
    });

    basis.push(advice.basis);

    if (!input.betaLactamAllergy) {
      // Said every time an antibiotic is proposed. Allergy is recorded on the
      // pre-operative assessment rather than against the patient, so this
      // cannot check it — and silence would be read as "no allergy", which is
      // the dangerous direction to be wrong in.
      warnings.push('Confirm the patient has no penicillin or cephalosporin allergy before this is given. The pack cannot check it.');
    }

    if (paediatric) {
      warnings.push(
        'This is a child. No antibiotic dose has been filled in — paediatric prophylaxis is weight-based and the prescriber must calculate it.',
      );
    }
  }

  if ((input.surgeryType ?? '').toUpperCase() === 'EMERGENCY') {
    warnings.push('Emergency case: the pack is drafted from the standard for this procedure. Check it against what is actually available before the patient is sent for.');
  }

  warnings.push('This is a draft. Nothing reaches the pharmacy or the pack provider until you submit it.');

  return {
    consumables: mergeByName(consumables),
    pharmacy,
    family,
    familyLabel: FAMILY_LABEL[family],
    approach,
    magnitude,
    basis,
    warnings,
  };
}

/**
 * One line per item, taking the HIGHER quantity where blocks overlap.
 *
 * Not the sum. Two procedures in one operation share the drapes, the gowns and
 * the suction; adding them sends the theatre twice what it needs and the
 * surplus is never returned. The same rule the existing pack merge uses.
 */
function mergeByName(items: DraftItem[]): DraftItem[] {
  const out = new Map<string, DraftItem>();
  items.forEach((i) => {
    const key = `${i.name}|${i.size ?? ''}`.toUpperCase();
    const seen = out.get(key);
    if (!seen) {
      out.set(key, { ...i });
      return;
    }
    if (i.quantity > seen.quantity) {
      seen.quantity = i.quantity;
      seen.source = i.source;
    }
  });
  return Array.from(out.values());
}
