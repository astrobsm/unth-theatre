/**
 * Seed file: surgical consumable + drug/dressing catalog templates.
 *
 * Idempotent — uses upsert keyed on (name, size?) for consumables and (name) for
 * drugs/dressings. Safe to run multiple times.
 *
 * Run:
 *   npx tsx prisma/seed-consumable-drug-catalog.ts
 *
 * Or POST /api/admin/seed-surgical-catalog (admin only) from the running app.
 */

import { PrismaClient } from "@prisma/client";

export const prismaInstance = new PrismaClient();

// --------------------------------------------------------------------------
// Consumables catalog
// --------------------------------------------------------------------------
const GLOVE_SIZES = ["6.0", "6.5", "7.0", "7.5", "8.0", "8.5"];

export const CONSUMABLE_SEED: Array<{
  name: string;
  category: any;
  size?: string;
  unit?: string;
  specialty?: string | null;
  defaultQuantity?: number;
  sortOrder?: number;
}> = [
  // Disposable surgical gloves — sized
  ...GLOVE_SIZES.map((s, i) => ({
    name: "Disposable Sterile Surgical Gloves",
    category: "GLOVES" as any,
    size: s,
    unit: "pair",
    defaultQuantity: 4,
    sortOrder: i,
  })),
  { name: "Examination Gloves (Latex, Powder-Free)", category: "GLOVES" as any, size: "M", unit: "pair", defaultQuantity: 6 },
  { name: "Examination Gloves (Latex, Powder-Free)", category: "GLOVES" as any, size: "L", unit: "pair", defaultQuantity: 6 },

  // Gowns / drapes
  { name: "Sterile Surgeon Gown", category: "GOWNS_DRAPES" as any, size: "L", unit: "piece", defaultQuantity: 4 },
  { name: "Sterile Surgeon Gown", category: "GOWNS_DRAPES" as any, size: "XL", unit: "piece", defaultQuantity: 2 },
  { name: "Disposable Theatre Cap", category: "GOWNS_DRAPES" as any, unit: "piece", defaultQuantity: 8 },
  { name: "Disposable Face Mask", category: "GOWNS_DRAPES" as any, unit: "piece", defaultQuantity: 8 },
  { name: "Sterile Drape Pack (Universal)", category: "GOWNS_DRAPES" as any, unit: "pack", defaultQuantity: 1 },
  { name: "Adhesive Incise Drape", category: "GOWNS_DRAPES" as any, size: "Medium", unit: "piece", defaultQuantity: 1 },

  // Syringes / needles
  { name: "Disposable Syringe", category: "SYRINGES_NEEDLES" as any, size: "5 ml", unit: "piece", defaultQuantity: 10 },
  { name: "Disposable Syringe", category: "SYRINGES_NEEDLES" as any, size: "10 ml", unit: "piece", defaultQuantity: 10 },
  { name: "Disposable Syringe", category: "SYRINGES_NEEDLES" as any, size: "20 ml", unit: "piece", defaultQuantity: 4 },
  { name: "Hypodermic Needle", category: "SYRINGES_NEEDLES" as any, size: "21 G", unit: "piece", defaultQuantity: 10 },
  { name: "Hypodermic Needle", category: "SYRINGES_NEEDLES" as any, size: "23 G", unit: "piece", defaultQuantity: 10 },
  { name: "IV Cannula", category: "SYRINGES_NEEDLES" as any, size: "18 G", unit: "piece", defaultQuantity: 2 },
  { name: "IV Cannula", category: "SYRINGES_NEEDLES" as any, size: "20 G", unit: "piece", defaultQuantity: 2 },

  // Sutures
  { name: "Vicryl 2-0 (Round Body)", category: "SUTURES" as any, unit: "piece", defaultQuantity: 4 },
  { name: "Vicryl 3-0 (Round Body)", category: "SUTURES" as any, unit: "piece", defaultQuantity: 4 },
  { name: "Silk 2-0 (Cutting)", category: "SUTURES" as any, unit: "piece", defaultQuantity: 4 },
  { name: "Nylon 3-0 (Cutting)", category: "SUTURES" as any, unit: "piece", defaultQuantity: 4 },
  { name: "PDS 1 (Loop)", category: "SUTURES" as any, unit: "piece", defaultQuantity: 1 },

  // Catheters / tubing
  { name: "Foley Catheter", category: "CATHETERS_TUBING" as any, size: "14 Fr", unit: "piece", defaultQuantity: 1 },
  { name: "Foley Catheter", category: "CATHETERS_TUBING" as any, size: "16 Fr", unit: "piece", defaultQuantity: 1 },
  { name: "Urine Drainage Bag", category: "CATHETERS_TUBING" as any, unit: "piece", defaultQuantity: 1 },
  { name: "Suction Tubing", category: "SUCTION" as any, unit: "piece", defaultQuantity: 1 },
  { name: "Yankauer Suction Tip", category: "SUCTION" as any, unit: "piece", defaultQuantity: 1 },

  // Dressing pack / sterile dressings
  { name: "Sterile Dressing Pack", category: "DRESSING_PACKS" as any, unit: "pack", defaultQuantity: 1 },
  { name: "Surgical Gauze Swab (10 x 10 cm)", category: "STERILE_DRESSINGS" as any, unit: "pack", defaultQuantity: 4 },
  { name: "Abdominal Pad (Big Pad)", category: "STERILE_DRESSINGS" as any, unit: "piece", defaultQuantity: 4 },
  { name: "Crepe Bandage", category: "STERILE_DRESSINGS" as any, size: "10 cm", unit: "roll", defaultQuantity: 2 },
  { name: "Adhesive Plaster (Elastoplast)", category: "STERILE_DRESSINGS" as any, unit: "roll", defaultQuantity: 1 },

  // Skin prep
  { name: "Chlorhexidine 2% Skin Prep", category: "SKIN_PREP" as any, size: "500 ml", unit: "bottle", defaultQuantity: 1 },
  { name: "Povidone Iodine 10% Skin Prep", category: "SKIN_PREP" as any, size: "500 ml", unit: "bottle", defaultQuantity: 1 },
  { name: "Alcohol-Based Skin Prep (Chloraprep)", category: "SKIN_PREP" as any, size: "26 ml", unit: "applicator", defaultQuantity: 2 },

  // Cleaning solutions (theatre / instrument)
  { name: "Hibiscrub (Chlorhexidine 4%)", category: "CLEANING_SOLUTION" as any, size: "500 ml", unit: "bottle", defaultQuantity: 1 },
  { name: "Sterillium Hand Disinfectant", category: "CLEANING_SOLUTION" as any, size: "500 ml", unit: "bottle", defaultQuantity: 1 },
  { name: "Cidex OPA Instrument Disinfectant", category: "CLEANING_SOLUTION" as any, size: "5 L", unit: "container", defaultQuantity: 1 },
  { name: "Sodium Hypochlorite 1% (Surface Disinfection)", category: "CLEANING_SOLUTION" as any, size: "5 L", unit: "container", defaultQuantity: 1 },
  { name: "Detergent Enzymatic Cleaner", category: "CLEANING_SOLUTION" as any, size: "1 L", unit: "bottle", defaultQuantity: 1 },

  // Irrigation
  { name: "Normal Saline 0.9% (Irrigation)", category: "IRRIGATION" as any, size: "1 L", unit: "bottle", defaultQuantity: 4 },
  { name: "Sterile Water for Irrigation", category: "IRRIGATION" as any, size: "1 L", unit: "bottle", defaultQuantity: 2 },

  // Diathermy
  { name: "Diathermy Pencil (Disposable)", category: "DIATHERMY" as any, unit: "piece", defaultQuantity: 1 },
  { name: "Patient Return Plate (Diathermy)", category: "DIATHERMY" as any, unit: "piece", defaultQuantity: 1 },

  // Anaesthesia / airway
  { name: "Endotracheal Tube (Cuffed)", category: "ANAESTHESIA_AIRWAY" as any, size: "7.0", unit: "piece", defaultQuantity: 1 },
  { name: "Endotracheal Tube (Cuffed)", category: "ANAESTHESIA_AIRWAY" as any, size: "7.5", unit: "piece", defaultQuantity: 1 },
  { name: "Laryngeal Mask Airway", category: "ANAESTHESIA_AIRWAY" as any, size: "3", unit: "piece", defaultQuantity: 1 },
  { name: "Laryngeal Mask Airway", category: "ANAESTHESIA_AIRWAY" as any, size: "4", unit: "piece", defaultQuantity: 1 },
  { name: "Spinal Needle (Quincke)", category: "ANAESTHESIA_AIRWAY" as any, size: "25 G", unit: "piece", defaultQuantity: 1 },

  // PPE
  { name: "Sterile Surgeon Cap (Long)", category: "PPE" as any, unit: "piece", defaultQuantity: 4 },
  { name: "Shoe Cover (Disposable)", category: "PPE" as any, unit: "pair", defaultQuantity: 8 },
  { name: "Eye Shield / Visor", category: "PPE" as any, unit: "piece", defaultQuantity: 4 },
];

// --------------------------------------------------------------------------
// Drugs / IV fluids / wound-dressing agents catalog
// --------------------------------------------------------------------------
export const DRUG_DRESSING_SEED: Array<{
  name: string;
  type: any;
  defaultDosage?: string;
  defaultRoute?: string;
  defaultQuantity?: number;
  unit?: string;
  isControlled?: boolean;
  sortOrder?: number;
}> = [
  // Antibiotics
  { name: "Ceftriaxone 1 g (Vial)", type: "ANTIBIOTIC", defaultDosage: "1 g IV stat", defaultRoute: "IV", defaultQuantity: 2, unit: "vial" },
  { name: "Cefuroxime 750 mg (Vial)", type: "ANTIBIOTIC", defaultDosage: "750 mg IV stat", defaultRoute: "IV", defaultQuantity: 2, unit: "vial" },
  { name: "Metronidazole 500 mg / 100 ml IV", type: "ANTIBIOTIC", defaultDosage: "500 mg IV stat", defaultRoute: "IV", defaultQuantity: 1, unit: "bottle" },
  { name: "Gentamicin 80 mg (Ampoule)", type: "ANTIBIOTIC", defaultDosage: "80 mg IV stat", defaultRoute: "IV", defaultQuantity: 1, unit: "ampoule" },
  { name: "Ciprofloxacin 200 mg / 100 ml IV", type: "ANTIBIOTIC", defaultDosage: "200 mg IV", defaultRoute: "IV", defaultQuantity: 1, unit: "bottle" },
  { name: "Clindamycin 600 mg (Vial)", type: "ANTIBIOTIC", defaultDosage: "600 mg IV stat", defaultRoute: "IV", defaultQuantity: 1, unit: "vial" },
  { name: "Amoxicillin-Clavulanate 1.2 g IV", type: "ANTIBIOTIC", defaultDosage: "1.2 g IV stat", defaultRoute: "IV", defaultQuantity: 1, unit: "vial" },

  // IV fluids
  { name: "Normal Saline 0.9% (1 L)", type: "IV_FLUID", defaultRoute: "IV", defaultQuantity: 2, unit: "bag" },
  { name: "Ringer's Lactate (1 L)", type: "IV_FLUID", defaultRoute: "IV", defaultQuantity: 2, unit: "bag" },
  { name: "Dextrose 5% (1 L)", type: "IV_FLUID", defaultRoute: "IV", defaultQuantity: 1, unit: "bag" },
  { name: "Dextrose-Saline 4.3%/0.18% (500 ml)", type: "IV_FLUID", defaultRoute: "IV", defaultQuantity: 1, unit: "bag" },
  { name: "Hetastarch 6% (500 ml)", type: "IV_FLUID", defaultRoute: "IV", defaultQuantity: 1, unit: "bag" },
  { name: "Gelofusine (500 ml)", type: "IV_FLUID", defaultRoute: "IV", defaultQuantity: 1, unit: "bag" },

  // Wound-dressing agents (active)
  { name: "Sofratulle Gauze (Framycetin)", type: "WOUND_DRESSING_AGENT", defaultRoute: "Topical", defaultQuantity: 2, unit: "piece" },
  { name: "HERA Wound Gel", type: "WOUND_DRESSING_AGENT", defaultRoute: "Topical", defaultQuantity: 1, unit: "tube" },
  { name: "Wound-Care Honey Gauze", type: "WOUND_DRESSING_AGENT", defaultRoute: "Topical", defaultQuantity: 1, unit: "piece" },
  { name: "Honey-Impregnated Dressing (Medihoney)", type: "WOUND_DRESSING_AGENT", defaultRoute: "Topical", defaultQuantity: 1, unit: "piece" },
  { name: "Silver Sulfadiazine Cream 1%", type: "WOUND_DRESSING_AGENT", defaultRoute: "Topical", defaultQuantity: 1, unit: "tube" },
  { name: "Hydrocolloid Dressing", type: "WOUND_DRESSING_AGENT", defaultRoute: "Topical", defaultQuantity: 1, unit: "piece" },

  // Antiseptics / cleaners
  { name: "Povidone Iodine 10% (Solution)", type: "ANTISEPTIC", defaultRoute: "Topical", defaultQuantity: 1, unit: "bottle" },
  { name: "Hydrogen Peroxide 3%", type: "ANTISEPTIC", defaultRoute: "Topical", defaultQuantity: 1, unit: "bottle" },
  { name: "Wound-Clex (Wound Cleansing Solution)", type: "ANTISEPTIC", defaultRoute: "Topical", defaultQuantity: 1, unit: "bottle" },
  { name: "Chlorhexidine 0.05% (Wound Wash)", type: "ANTISEPTIC", defaultRoute: "Topical", defaultQuantity: 1, unit: "bottle" },
  { name: "Acetic Acid 1% (Wound Irrigation)", type: "ANTISEPTIC", defaultRoute: "Topical", defaultQuantity: 1, unit: "bottle" },

  // Haemostatics
  { name: "Surgicel (Oxidised Cellulose)", type: "HAEMOSTATIC", defaultRoute: "Topical", defaultQuantity: 1, unit: "piece" },
  { name: "Tranexamic Acid 500 mg (Ampoule)", type: "HAEMOSTATIC", defaultDosage: "1 g IV", defaultRoute: "IV", defaultQuantity: 2, unit: "ampoule" },

  // Anaesthetic adjuncts (non-controlled)
  { name: "Lidocaine 2% (Plain, 20 ml)", type: "ANAESTHETIC_ADJUNCT", defaultRoute: "SC/Local", defaultQuantity: 1, unit: "vial" },
  { name: "Bupivacaine 0.5% (10 ml)", type: "ANAESTHETIC_ADJUNCT", defaultRoute: "Local/Spinal", defaultQuantity: 1, unit: "vial" },

  // Analgesics
  { name: "Paracetamol 1 g IV (100 ml)", type: "ANALGESIC", defaultDosage: "1 g IV", defaultRoute: "IV", defaultQuantity: 1, unit: "bottle" },
  { name: "Diclofenac 75 mg IM (Ampoule)", type: "ANALGESIC", defaultDosage: "75 mg IM", defaultRoute: "IM", defaultQuantity: 1, unit: "ampoule" },
];

export async function seedSurgicalCatalog(prisma: PrismaClient = prismaInstance) {
  let created = 0;
  let updated = 0;

  for (const c of CONSUMABLE_SEED) {
    const existing = await prisma.surgicalConsumableTemplate.findFirst({
      where: { name: c.name, size: c.size ?? null },
    });
    if (existing) {
      await prisma.surgicalConsumableTemplate.update({
        where: { id: existing.id },
        data: { ...c, isActive: true } as any,
      });
      updated++;
    } else {
      await prisma.surgicalConsumableTemplate.create({ data: c as any });
      created++;
    }
  }

  for (const d of DRUG_DRESSING_SEED) {
    const existing = await prisma.surgicalDrugDressingTemplate.findFirst({
      where: { name: d.name },
    });
    if (existing) {
      await prisma.surgicalDrugDressingTemplate.update({
        where: { id: existing.id },
        data: { ...d, isActive: true } as any,
      });
      updated++;
    } else {
      await prisma.surgicalDrugDressingTemplate.create({ data: d as any });
      created++;
    }
  }

  return { created, updated };
}

if (require.main === module) {
  seedSurgicalCatalog()
    .then((r) => {
      console.log(`✅ Surgical catalog seeded — created ${r.created}, updated ${r.updated}`);
    })
    .catch((e) => {
      console.error("❌ Seed failed:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prismaInstance.$disconnect();
    });
}
