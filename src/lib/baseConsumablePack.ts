// The MANDATORY base consumable pack.
//
// Every booked surgery — elective, urgent or emergency — automatically wires
// this pack to the Consumable Pack Providers, regardless of what the surgeon
// selects. It is a version-controlled constant rather than a database row so it
// cannot be accidentally deleted or edited away, and so the exact clinical
// standard is auditable in git.
//
// Quantities scale with operative magnitude (the surgeon picks MAJOR /
// INTERMEDIATE / MINOR at booking). Where the source standard gives a single
// number, all three magnitudes carry it; where it gives a range (e.g. 6–8
// gowns), MINOR takes the low end and MAJOR the high end. The gauze bundle is
// itself magnitude-specific, per theatre practice.

export type SurgeryMagnitude = 'MAJOR' | 'INTERMEDIATE' | 'MINOR';

export const SURGERY_MAGNITUDES: SurgeryMagnitude[] = ['MINOR', 'INTERMEDIATE', 'MAJOR'];

export function isSurgeryMagnitude(v: unknown): v is SurgeryMagnitude {
  return v === 'MAJOR' || v === 'INTERMEDIATE' || v === 'MINOR';
}

// A base-pack line. `qty` is [minor, intermediate, major].
interface BasePackLine {
  name: string;
  category: string; // a SurgicalConsumableCategory value
  size?: string;
  unit: string;
  qty: [number, number, number];
}

// A gauze bundle whose *item* changes with magnitude (not just its count).
interface GauzeBundle {
  category: string;
  unit: string;
  nameByMagnitude: Record<SurgeryMagnitude, string>;
}

const BASE_PACK_LINES: BasePackLine[] = [
  // PPE
  { name: 'Surgical face masks', category: 'PPE', unit: 'piece', qty: [20, 20, 20] },
  { name: 'Surgical caps', category: 'PPE', unit: 'piece', qty: [10, 10, 10] },
  { name: 'Sterile surgical gowns', category: 'GOWNS_DRAPES', unit: 'piece', qty: [6, 7, 8] },
  { name: 'Non-sterile disposable gowns', category: 'PPE', unit: 'piece', qty: [2, 3, 4] },
  { name: 'Sterile latex/nitrile gloves', category: 'GLOVES', unit: 'pairs', qty: [20, 25, 30] },
  { name: 'Examination gloves', category: 'GLOVES', unit: 'pairs', qty: [20, 20, 20] },
  { name: 'Protective shoe covers', category: 'PPE', unit: 'pairs', qty: [10, 10, 10] },
  { name: 'Protective goggles/face shields', category: 'PPE', unit: 'piece', qty: [4, 5, 6] },
  // Skin prep / antiseptics
  { name: 'Povidone-Iodine Solution (10%)', category: 'SKIN_PREP', size: '100 ml', unit: 'bottle', qty: [1, 1, 1] },
  { name: 'Chlorhexidine solution', category: 'SKIN_PREP', size: '500 ml', unit: 'bottle', qty: [1, 1, 1] },
  { name: 'Methylated spirit / 70% Isopropyl alcohol', category: 'SKIN_PREP', size: '100 ml', unit: 'bottle', qty: [1, 1, 1] },
  { name: 'Sterile water for irrigation', category: 'IRRIGATION', size: '2 litres', unit: 'pack', qty: [1, 1, 1] },
  { name: 'Skin marker', category: 'OTHER', unit: 'piece', qty: [1, 1, 2] },
  { name: 'JIK (hypochlorite)', category: 'CLEANING_SOLUTION', unit: 'bottle', qty: [1, 1, 1] },
  // Drapes
  { name: 'Sterile drapes', category: 'GOWNS_DRAPES', unit: 'piece', qty: [4, 6, 8] },
  { name: 'Fenestrated drapes', category: 'GOWNS_DRAPES', unit: 'piece', qty: [1, 1, 2] },
  { name: 'Mayo stand cover', category: 'GOWNS_DRAPES', unit: 'piece', qty: [1, 1, 1] },
  { name: 'Instrument table cover', category: 'GOWNS_DRAPES', unit: 'piece', qty: [2, 2, 2] },
  // Swabs / dressings
  { name: 'Gauze swabs (10 × 10 cm)', category: 'STERILE_DRESSINGS', unit: 'piece', qty: [100, 150, 200] },
  { name: 'Abdominal mops/laparotomy pads', category: 'STERILE_DRESSINGS', unit: 'piece', qty: [10, 15, 20] },
  { name: 'Cotton wool', category: 'STERILE_DRESSINGS', size: '500 g', unit: 'pack', qty: [1, 1, 1] },
  { name: 'Combine dressing pads', category: 'STERILE_DRESSINGS', unit: 'piece', qty: [5, 5, 5] },
  { name: 'Sterile dressing packs', category: 'DRESSING_PACKS', unit: 'pack', qty: [1, 1, 2] },
  { name: 'Micropore tape', category: 'STERILE_DRESSINGS', unit: 'roll', qty: [2, 2, 2] },
  { name: 'Zinc oxide tape', category: 'STERILE_DRESSINGS', unit: 'roll', qty: [2, 2, 2] },
  { name: 'Transparent dressing film', category: 'STERILE_DRESSINGS', unit: 'piece', qty: [2, 2, 2] },
];

const GAUZE_BUNDLE: GauzeBundle = {
  category: 'STERILE_DRESSINGS',
  unit: 'bundle',
  nameByMagnitude: {
    MINOR: 'Gauze bundle (minor)',
    INTERMEDIATE: 'Gauze bundle (intermediate)',
    MAJOR: 'Gauze bundle (major)',
  },
};

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

  items.push({
    name: GAUZE_BUNDLE.nameByMagnitude[mag],
    category: GAUZE_BUNDLE.category,
    size: null,
    unit: GAUZE_BUNDLE.unit,
    quantity: 1,
  });

  return items;
}

/** Human label for the base pack, e.g. for UI headings. */
export const BASE_PACK_LABEL = 'Mandatory base theatre pack';
