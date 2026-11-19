// The MANDATORY base consumable pack.
//
// Every booked surgery — elective, urgent or emergency — automatically wires
// this pack to the Consumable Pack Providers, regardless of what the surgeon
// selects. It is a version-controlled constant rather than a database row so it
// cannot be accidentally deleted or edited away, and so the exact clinical
// standard is auditable in git.
//
// REPLACED ON 15 NOVEMBER, by the list the theatre gave.
//
// WHAT THE PACK IS NOW. It is about access and prep, not dress and drape.
// Masks, caps, gowns, shoe covers, goggles, drapes, swabs, mops, cotton wool
// and the gauze bundle have gone; syringes, cannulae, water for injection and
// giving sets have come in. Those last four used to arrive only from the
// special-needs bundle in specialNeeds/bundle.ts, which is separate. Whatever
// a particular operation needs by way of drapes or swabs now comes from its
// family set in packs/standards.ts rather than from every case alike.
//
// HOW THE THREE COLUMNS WERE ARRIVED AT. The theatre gave ONE number per line.
// Those numbers are kept EXACTLY as given in the MAJOR column, so nothing
// anybody asked for is reduced for a big case. MINOR and INTERMEDIATE taper
// down from them, and nothing was scaled upwards beyond what was asked for.
//
// The taper is not applied to everything, and the exceptions are the point:
//
//   A BOTTLE IS A BOTTLE. Povidone-iodine, chlorhexidine, spirit and JIK are
//   issued as one container whatever the operation, so they do not scale. Nor
//   does the skin marker, and nor does the pack of examination gloves, which
//   is a room supply rather than a per-case count.
//
//   THE 18G AND 16G CANNULAE DO NOT TAPER. They are the resuscitation sizes.
//   A minor case that starts bleeding needs them at the moment nobody has
//   time to send out for one, and they cost very little to carry.
//
// SO MINOR AND INTERMEDIATE ARE THIS FILE'S SUGGESTION, NOT THE THEATRE'S
// INSTRUCTION. Only the MAJOR column is what was actually specified; the other
// two should be read and corrected.

export type SurgeryMagnitude = 'MAJOR' | 'INTERMEDIATE' | 'MINOR';

export const SURGERY_MAGNITUDES: SurgeryMagnitude[] = ['MINOR', 'INTERMEDIATE', 'MAJOR'];

export function isSurgeryMagnitude(v: unknown): v is SurgeryMagnitude {
  return v === 'MAJOR' || v === 'INTERMEDIATE' || v === 'MINOR';
}

/**
 * Collapse a booking magnitude onto the three the packs are sized for.
 *
 * SUPER_MAJOR is bookable and drives its own special-needs bundle, but the
 * pack standards here are defined at three sizes. It maps to MAJOR, the
 * largest — never downwards.
 *
 * THIS EXISTS BECAUSE THE FALLTHROUGHS WERE WRONG. Several call sites read
 * `magnitude === 'MAJOR' ? 1 : magnitude === 'INTERMEDIATE' ? 0.7 : 0.5`,
 * which silently handed a super-major case the MINOR pack — the largest
 * operation in the theatre getting the smallest set of sutures. Routing
 * every one of them through this makes the next value anybody adds fail
 * upwards instead.
 */
export function toPackMagnitude(v: string | null | undefined): SurgeryMagnitude {
  if (isSurgeryMagnitude(v)) return v;
  if (v === 'SUPER_MAJOR') return 'MAJOR';
  // Unknown or missing: MAJOR, because under-supplying a theatre is worse
  // than over-supplying it.
  return 'MAJOR';
}

// A base-pack line. `qty` is [minor, intermediate, major].
interface BasePackLine {
  name: string;
  category: string; // a SurgicalConsumableCategory value
  size?: string;
  unit: string;
  qty: [number, number, number];
}

const BASE_PACK_LINES: BasePackLine[] = [
  // Gloves. The examination pack is a room supply and does not scale. Sterile
  // gloves do: a major case is scrubbed by more people, and a glove is changed
  // when it is holed rather than at the end.
  { name: 'Examination gloves', category: 'GLOVES', unit: 'pack', qty: [1, 1, 1] },

  // Aprons. SIX ON EVERY CASE, flat, by the theatre's instruction of 19
  // November. They do not taper: the number is about how many people are at
  // the table and how many times one is changed, not how big the operation
  // is, and a minor case has a scrub nurse and a circulating nurse the same
  // as a major one.
  { name: 'Disposable apron', category: 'PPE', unit: 'piece', qty: [6, 6, 6] },
  { name: 'Surgical gloves, sterile', category: 'GLOVES', unit: 'pairs', qty: [4, 6, 8] },

  // Skin prep and antiseptics. One container whatever the operation, so these
  // are flat by intent rather than by omission.
  { name: 'Povidone-Iodine Solution (10%)', category: 'SKIN_PREP', size: '100 ml', unit: 'bottle', qty: [1, 1, 1] },
  { name: 'Chlorhexidine solution', category: 'SKIN_PREP', size: '500 ml', unit: 'bottle', qty: [1, 1, 1] },
  { name: 'Methylated spirit / 70% Isopropyl alcohol', category: 'SKIN_PREP', size: '100 ml', unit: 'bottle', qty: [1, 1, 1] },
  { name: 'Skin marker', category: 'OTHER', unit: 'piece', qty: [1, 1, 1] },
  { name: 'JIK (hypochlorite)', category: 'CLEANING_SOLUTION', unit: 'bottle', qty: [1, 1, 1] },
  { name: 'Zinc oxide tape', category: 'STERILE_DRESSINGS', unit: 'roll', qty: [1, 2, 2] },

  // Syringes. Drawing up, flushing and local infiltration all scale with how
  // long a case runs and how many drugs are given.
  { name: 'Syringe', category: 'SYRINGES_NEEDLES', size: '10ml', unit: 'piece', qty: [5, 8, 10] },
  { name: 'Syringe', category: 'SYRINGES_NEEDLES', size: '5ml', unit: 'piece', qty: [5, 8, 10] },
  { name: 'Syringe', category: 'SYRINGES_NEEDLES', size: '2ml', unit: 'piece', qty: [5, 8, 10] },

  // IV access. Colour leads the name and the gauge follows, the same
  // convention as IV_CANNULAE in specialNeeds/standardCatalogue.ts so the two
  // agree on the shelf. "Ash" is the grey one, 16G; both words are in the name
  // so the line is recognisable whichever the store says.
  //
  // The small sizes taper. The 18G and 16G do not, for the reason at the top
  // of this file.
  { name: 'IV cannula, yellow', category: 'CATHETERS_TUBING', size: '24G', unit: 'piece', qty: [1, 2, 2] },
  { name: 'IV cannula, blue', category: 'CATHETERS_TUBING', size: '22G', unit: 'piece', qty: [1, 2, 2] },
  { name: 'IV cannula, green', category: 'CATHETERS_TUBING', size: '18G', unit: 'piece', qty: [2, 2, 2] },
  { name: 'IV cannula, grey (ash)', category: 'CATHETERS_TUBING', size: '16G', unit: 'piece', qty: [2, 2, 2] },

  // Giving sets, and the water the drugs are made up with.
  { name: 'IV giving set', category: 'CATHETERS_TUBING', unit: 'set', qty: [1, 2, 2] },
  { name: 'Water for injection', category: 'OTHER', size: '10ml', unit: 'ampoule', qty: [5, 8, 10] },
];


export interface BasePackItem {
  name: string;
  category: string;
  size: string | null;
  unit: string;
  quantity: number;
}

const MAGNITUDE_INDEX: Record<SurgeryMagnitude, 0 | 1 | 2> = {
  MINOR: 0,
  INTERMEDIATE: 1,
  MAJOR: 2,
};

/**
 * Resolve the mandatory base pack into concrete line items for a given
 * magnitude. Defaults to MAJOR when magnitude is missing/invalid — the safest
 * choice, since under-supplying a theatre is worse than over-supplying.
 */
export function resolveBasePack(magnitude: string | null | undefined): BasePackItem[] {
  const mag: SurgeryMagnitude = isSurgeryMagnitude(magnitude) ? magnitude : 'MAJOR';
  const i = MAGNITUDE_INDEX[mag];

  const items: BasePackItem[] = BASE_PACK_LINES.map((l) => ({
    name: l.name,
    category: l.category,
    size: l.size ?? null,
    unit: l.unit,
    quantity: l.qty[i],
  }));


  return items;
}

// ============================================================
// What a case needs BECAUSE THE BOOKER SAID SO
// ------------------------------------------------------------
// Separate from the base pack above, which is what every case gets whatever
// it is. These lines appear only when the booking form was ticked, and they
// exist because the ticking was the only thing that happened: a booker said
// "diathermy" and the pack went out without a pad, because the tick drove a
// line on the theatre list and nothing in the store.
//
// ONE SOURCE, FOUR CALLERS. Booking, emergency booking, the pack preview and
// the regenerate button all add these from here. The alternative -- each
// route deciding for itself -- is how a case comes back from theatre with a
// diathermy pencil the preview never showed.
//
// DRUGS GO TO PHARMACY, NOT TO THE PACK PROVIDER. Hydrocortisone, calcium
// gluconate and tranexamic acid are returned on the `drugs` list rather than
// the consumable one, because the consumable pack provider does not stock
// drugs and a line they cannot fill is a line that delays the pack. The
// hardware -- giving set, syringe, pad, pencil, aprons -- is theirs.
// ============================================================

export interface CaseNeeds {
  needDiathermy?: boolean | null;
  needBloodTransfusion?: boolean | null;
  /** Units the booker expects to cross-match. Null where it was not asked. */
  bloodUnits?: number | null;
}

export interface NeedsDrivenDrug {
  name: string;
  type: string;
  dosage: string | null;
  route: string | null;
  quantity: number;
  unit: string;
}

export interface NeedsDrivenPack {
  consumables: BasePackItem[];
  drugs: NeedsDrivenDrug[];
  /** Why each block is there, for the line that tells the booker. */
  reasons: string[];
}

/**
 * How many units counts as a transfusion big enough to need the citrate and
 * fibrinolysis cover.
 *
 * Two. Calcium gluconate is there for citrate toxicity, which is a function of
 * how much stored blood goes in and how fast; tranexamic acid is there because
 * a case expected to need two units is a case expected to bleed. Below that,
 * the giving set and the hydrocortisone cover the reaction risk and the rest
 * would be stock sent out to come back.
 */
export const MULTI_UNIT_TRANSFUSION = 2;

/**
 * The lines a case earns from what the booker ticked.
 *
 * Quantities are flat, not tapered by magnitude. A diathermy pad is one pad
 * whether the operation is minor or super-major, and a patient having two
 * units of blood needs the same cover either way.
 */
export function needsDrivenPack(needs: CaseNeeds | null | undefined): NeedsDrivenPack {
  const consumables: BasePackItem[] = [];
  const drugs: NeedsDrivenDrug[] = [];
  const reasons: string[] = [];
  if (!needs) return { consumables, drugs, reasons };

  if (needs.needDiathermy) {
    consumables.push(
      { name: 'Diathermy pad (patient plate)', category: 'DIATHERMY', size: null, unit: 'piece', quantity: 1 },
      { name: 'Diathermy pencil', category: 'DIATHERMY', size: null, unit: 'piece', quantity: 1 },
    );
    reasons.push('diathermy was requested');
  }

  if (needs.needBloodTransfusion) {
    consumables.push(
      { name: 'Blood giving set', category: 'CATHETERS_TUBING', size: null, unit: 'set', quantity: 1 },
    );
    // Cover for a transfusion reaction. One dose, drawn up only if needed.
    drugs.push(
      { name: 'Inj. Hydrocortisone', type: 'ANAESTHETIC_ADJUNCT', dosage: '100 mg', route: 'IV', quantity: 1, unit: 'vial' },
    );
    reasons.push('blood transfusion was requested');

    const units = typeof needs.bloodUnits === 'number' ? needs.bloodUnits : 0;
    if (units >= MULTI_UNIT_TRANSFUSION) {
      consumables.push(
        { name: 'Syringe', category: 'SYRINGES_NEEDLES', size: '20ml', unit: 'piece', quantity: 1 },
      );
      drugs.push(
        { name: 'Inj. Calcium Gluconate', type: 'ANAESTHETIC_ADJUNCT', dosage: '10% 10 ml', route: 'IV', quantity: 1, unit: 'ampoule' },
        { name: 'Tranexamic acid', type: 'HAEMOSTATIC', dosage: '500 mg', route: 'IV', quantity: 3, unit: 'ampoule' },
      );
      reasons.push(`${units} units of blood were requested`);
    }
  }

  return { consumables, drugs, reasons };
}

/** Human label for the base pack, e.g. for UI headings. */
export const BASE_PACK_LABEL = 'Mandatory base theatre pack';

/** Where a needs-driven line came from, on the pack sheet. */
export const NEEDS_PACK_LABEL = 'Added from what this case was booked to need';
