import { generatePacks, type DraftItem } from '@/lib/packs/generate';

/**
 * What to send when nobody has authored a pack for this operation.
 *
 * buildPackRequests only uses ProcedurePackMap rows a person has CONFIRMED, and
 * that is right: a suggestion must never reach a theatre trolley on its own.
 * But the consequence was that a procedure with no confirmed mapping produced
 * nothing at all — which is what "Pharmacy pack: nothing requested" meant on a
 * thoracotomy. Silence looks identical to "this operation needs no drugs".
 *
 * There are 588 procedures in the catalogue and more added at booking, so most
 * of them will never have a hand-authored mapping. This fills the gap with the
 * composed standard: base pack, approach, family, Ethicon sutures, guideline
 * prophylaxis — every line labelled with where it came from, so a reviewer can
 * tell a generated line from one a pharmacist authored.
 *
 * IT DOES NOT CHANGE WHAT A CONFIRMED MAPPING DOES. Where somebody has authored
 * a pack, that pack is used and this is not consulted. This is the floor, not
 * an override.
 */

export interface FallbackRow {
  name: string;
  quantity: number;
  unit?: string | null;
  category?: string | null;
  size?: string | null;
  dosage?: string | null;
  route?: string | null;
  drugType?: string | null;
  notes?: string | null;
}

export interface FallbackResult {
  consumables: FallbackRow[];
  drugs: FallbackRow[];
  /** Shown to whoever is about to submit. Never suppressed. */
  warnings: string[];
  basis: string[];
  familyLabel: string;
  /** True when this was used, so the screen can say the pack is generated. */
  generated: boolean;
}

const EMPTY: FallbackResult = {
  consumables: [], drugs: [], warnings: [], basis: [], familyLabel: '', generated: false,
};

const toRow = (d: DraftItem): FallbackRow => ({
  name: d.name,
  quantity: d.quantity,
  unit: d.unit,
  category: d.category ?? null,
  size: d.size ?? null,
  dosage: d.dosage ?? null,
  route: d.route ?? null,
  drugType: d.drugType ?? null,
  // The provenance travels with the line. A pack provider looking at a list
  // needs to know which items a person chose and which a standard supplied.
  notes: [d.source, d.note].filter(Boolean).join(' — ') || null,
});

export interface FallbackInput {
  procedureName: string;
  subspecialty?: string | null;
  magnitude?: string | null;
  surgeryType?: string | null;
  additionalProcedures?: string | null;
  patientAge?: number | null;
  patientAgeUnit?: string | null;
  betaLactamAllergy?: boolean;
  /** What the confirmed mapping already produced. */
  haveConsumables: number;
  haveDrugs: number;
}

/**
 * Fill whichever list a confirmed mapping left empty.
 *
 * Each side is decided on its own: a procedure can have an authored consumable
 * pack and no pharmacy pack, which is the common case and exactly what was
 * happening.
 */
export function fallbackPacks(input: FallbackInput): FallbackResult {
  const needConsumables = input.haveConsumables === 0;
  const needDrugs = input.haveDrugs === 0;
  if (!needConsumables && !needDrugs) return EMPTY;
  if (!input.procedureName?.trim()) return EMPTY;

  const packs = generatePacks({
    procedureName: input.procedureName,
    subspecialty: input.subspecialty,
    magnitude: input.magnitude,
    surgeryType: input.surgeryType,
    additionalProcedures: input.additionalProcedures,
    patientAge: input.patientAge,
    patientAgeUnit: input.patientAgeUnit,
    betaLactamAllergy: input.betaLactamAllergy,
  });

  return {
    consumables: needConsumables ? packs.consumables.map(toRow) : [],
    drugs: needDrugs ? packs.pharmacy.map(toRow) : [],
    warnings: packs.warnings,
    basis: packs.basis,
    familyLabel: packs.familyLabel,
    generated: true,
  };
}
