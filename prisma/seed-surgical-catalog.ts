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
  notes?: string;
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

  // ─────────────────────────────────────────────────────────────────────
  // Orthopaedic Unit — submitted by Igwe Jovita
  // Specialty-tagged so the booking form filters them under Orthopaedics.
  // ─────────────────────────────────────────────────────────────────────
  { name: "Normal Saline 0.9% N/F (Carton, 1 L)", category: "IRRIGATION" as any, size: "1 L", unit: "carton", specialty: "Orthopaedics", defaultQuantity: 1 },
  { name: "Blood Giving Set", category: "CATHETERS_TUBING" as any, unit: "piece", specialty: "Orthopaedics", defaultQuantity: 1 },
  { name: "IV Fluid Giving Set", category: "CATHETERS_TUBING" as any, unit: "piece", specialty: "Orthopaedics", defaultQuantity: 1 },
  { name: "IV Cannula", category: "SYRINGES_NEEDLES" as any, size: "16 G", unit: "piece", specialty: "Orthopaedics", defaultQuantity: 2 },
  { name: "IV Cannula", category: "SYRINGES_NEEDLES" as any, size: "22 G", unit: "piece", specialty: "Orthopaedics", defaultQuantity: 2 },
  { name: "Disposable Syringe", category: "SYRINGES_NEEDLES" as any, size: "2 ml", unit: "piece", specialty: "Orthopaedics", defaultQuantity: 10 },
  { name: "Latex Gloves (Examination, Packet)", category: "GLOVES" as any, unit: "packet", specialty: "Orthopaedics", defaultQuantity: 1 },
  { name: "Methylated Spirit", category: "SKIN_PREP" as any, size: "500 ml", unit: "bottle", specialty: "Orthopaedics", defaultQuantity: 1 },
  { name: "Savlon (Cetrimide + Chlorhexidine)", category: "CLEANING_SOLUTION" as any, size: "500 ml", unit: "bottle", specialty: "Orthopaedics", defaultQuantity: 1 },
  { name: "Crepe Bandage", category: "STERILE_DRESSINGS" as any, size: "6 inch", unit: "roll", specialty: "Orthopaedics", defaultQuantity: 8 },
  { name: "Adhesive Plaster (Big)", category: "STERILE_DRESSINGS" as any, size: "Big", unit: "roll", specialty: "Orthopaedics", defaultQuantity: 1 },
  { name: "Redivac Drain", category: "CATHETERS_TUBING" as any, unit: "piece", specialty: "Orthopaedics", defaultQuantity: 1 },
  { name: "Cerclage Wire", category: "OTHER" as any, unit: "piece", specialty: "Orthopaedics", defaultQuantity: 1 },
  { name: "K-Wire (Kirschner Wire)", category: "OTHER" as any, unit: "piece", specialty: "Orthopaedics", defaultQuantity: 4 },
  { name: "Gigli Saw", category: "OTHER" as any, unit: "piece", specialty: "Orthopaedics", defaultQuantity: 2 },
  { name: "Urethral Catheter (Foley)", category: "CATHETERS_TUBING" as any, size: "Age-dependent", unit: "piece", specialty: "Orthopaedics", defaultQuantity: 1 },
  { name: "Urine Drainage Bag", category: "CATHETERS_TUBING" as any, size: "Ortho", unit: "piece", specialty: "Orthopaedics", defaultQuantity: 1 },
  { name: "KY Lubricating Gel", category: "OTHER" as any, unit: "tube", specialty: "Orthopaedics", defaultQuantity: 1 },
  { name: "Vicryl 2 (Round Body)", category: "SUTURES" as any, unit: "piece", specialty: "Orthopaedics", defaultQuantity: 2 },
  { name: "Vicryl 2-0 (Round Body)", category: "SUTURES" as any, size: "Ortho", unit: "piece", specialty: "Orthopaedics", defaultQuantity: 2 },
  { name: "Nylon 2 (Cutting)", category: "SUTURES" as any, unit: "piece", specialty: "Orthopaedics", defaultQuantity: 2 },
  { name: "Nylon 1 (Cutting)", category: "SUTURES" as any, unit: "piece", specialty: "Orthopaedics", defaultQuantity: 2 },
  { name: "Nylon 0 (Cutting)", category: "SUTURES" as any, unit: "piece", specialty: "Orthopaedics", defaultQuantity: 2 },
  { name: "Nylon 2-0 (Cutting)", category: "SUTURES" as any, unit: "piece", specialty: "Orthopaedics", defaultQuantity: 2 },
  { name: "Skin Stapler (Disposable)", category: "OTHER" as any, unit: "piece", specialty: "Orthopaedics", defaultQuantity: 1 },
  { name: "Skin Staple Remover", category: "OTHER" as any, unit: "piece", specialty: "Orthopaedics", defaultQuantity: 1 },
  { name: "Water for Injection (10 ml)", category: "IRRIGATION" as any, size: "10 ml", unit: "ampoule", specialty: "Orthopaedics", defaultQuantity: 10 },
  { name: "Velband Orthopaedic Padding", category: "STERILE_DRESSINGS" as any, size: "6 inch", unit: "roll", specialty: "Orthopaedics", defaultQuantity: 8 },
  { name: "Velband Orthopaedic Padding", category: "STERILE_DRESSINGS" as any, size: "4 inch", unit: "roll", specialty: "Orthopaedics", defaultQuantity: 4 },
  { name: "Plaster of Paris (POP) Cast", category: "STERILE_DRESSINGS" as any, size: "6 inch", unit: "roll", specialty: "Orthopaedics", defaultQuantity: 15 },
  { name: "Plaster of Paris (POP) Cast", category: "STERILE_DRESSINGS" as any, size: "4 inch", unit: "roll", specialty: "Orthopaedics", defaultQuantity: 4 },

  // ─────────────────────────────────────────────────────────────────────
  // Paediatric Surgery Unit — submitted by Dr Ogaranya
  // Includes hypospadias repair sub-units (Unit 1 = Surgicryl SF;
  // Unit 2 = Ethicon). All entries carry distinct (name,size) pairs so
  // the upsert keeps each variant as its own row.
  // ─────────────────────────────────────────────────────────────────────

  // General paediatric surgery essentials
  { name: "IV Cannula (Paediatric)", category: "SYRINGES_NEEDLES" as any, size: "24 G - Yellow", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 1 },
  { name: "IV Cannula (Paediatric)", category: "SYRINGES_NEEDLES" as any, size: "22 G - Blue", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 1 },
  { name: "Crepe Bandage", category: "STERILE_DRESSINGS" as any, size: "4 inch", unit: "roll", specialty: "Paediatric Surgery", defaultQuantity: 1 },
  { name: "Dextrose 5% (500 ml)", category: "IRRIGATION" as any, size: "500 ml", unit: "bag", specialty: "Paediatric Surgery", defaultQuantity: 1 },
  { name: "Disposable Syringe (Paediatric)", category: "SYRINGES_NEEDLES" as any, size: "10 ml", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 5 },
  { name: "Disposable Syringe (Paediatric)", category: "SYRINGES_NEEDLES" as any, size: "5 ml", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 5 },
  { name: "Disposable Syringe (Paediatric)", category: "SYRINGES_NEEDLES" as any, size: "2 ml", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 5 },
  { name: "Water for Injection (Paediatric)", category: "IRRIGATION" as any, size: "10 ml", unit: "ampoule", specialty: "Paediatric Surgery", defaultQuantity: 5 },
  { name: "NG Tube (Paediatric)", category: "CATHETERS_TUBING" as any, size: "10 Fr", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 12 },
  { name: "Savlon (Paediatric Surgery)", category: "SKIN_PREP" as any, size: "500 ml", unit: "bottle", specialty: "Paediatric Surgery", defaultQuantity: 1 },
  { name: "Povidone Iodine 10% (Paediatric Surgery)", category: "SKIN_PREP" as any, size: "500 ml", unit: "bottle", specialty: "Paediatric Surgery", defaultQuantity: 1 },

  // Hypospadias Repair Unit 1 — Surgicryl SF Vicryl
  { name: "Surgicryl SF Vicryl (Hypospadias Unit 1)", category: "SUTURES" as any, size: "4-0", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 3, notes: "Hypospadias Repair Unit 1 — Surgicryl brand SF" },
  { name: "Surgicryl SF Vicryl (Hypospadias Unit 1)", category: "SUTURES" as any, size: "5-0", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 2, notes: "Hypospadias Repair Unit 1 — Surgicryl brand SF" },
  { name: "Surgicryl SF Vicryl (Hypospadias Unit 1)", category: "SUTURES" as any, size: "3-0", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 2, notes: "Hypospadias Repair Unit 1 — Surgicryl brand SF" },
  { name: "Silk (Hypospadias Repair)", category: "SUTURES" as any, size: "3-0", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 1, notes: "Used by Hypospadias Repair Units 1 & 2" },

  // Hypospadias Repair Unit 2 — Ethicon Vicryl
  { name: "Ethicon Vicryl (Hypospadias Unit 2)", category: "SUTURES" as any, size: "4-0", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 3, notes: "Hypospadias Repair Unit 2 — Ethicon brand (Unit 2 prefers Ethicon only)" },
  { name: "Ethicon Vicryl (Hypospadias Unit 2)", category: "SUTURES" as any, size: "3-0", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 3, notes: "Hypospadias Repair Unit 2 — Ethicon brand (Unit 2 prefers Ethicon only)" },
  { name: "Latex Foley Catheter (Paediatric)", category: "CATHETERS_TUBING" as any, size: "6 Fr", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 1, notes: "Hypospadias Repair Unit 2" },
  { name: "All-Silicone Urethral Catheter (Paediatric)", category: "CATHETERS_TUBING" as any, size: "8 Fr", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 1, notes: "Hypospadias Repair Unit 2 (also used in general paediatric cases)" },
  { name: "Urine Drainage Bag (Paediatric)", category: "CATHETERS_TUBING" as any, size: "Paed", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 1, notes: "Hypospadias Repair Units 1 & 2" },

  // Sutures used by BOTH hypospadias units (Unit 2 prefers Ethicon equivalents — higher quantity row)
  { name: "Surgicryl Vicryl (Both Hypospadias Units)", category: "SUTURES" as any, size: "2-0", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 2, notes: "Both Hypospadias Units 1 & 2" },
  { name: "Surgicryl Vicryl (Both Hypospadias Units)", category: "SUTURES" as any, size: "3-0", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 2, notes: "Both Hypospadias Units 1 & 2" },
  { name: "Ethicon Vicryl (Hypospadias Unit 2 — Both Sizes)", category: "SUTURES" as any, size: "2-0", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 4, notes: "Unit 2 prefers Ethicon only — Ethicon-equivalent of Surgicryl 2-0" },
  { name: "Ethicon Vicryl (Hypospadias Unit 2 — Both Sizes)", category: "SUTURES" as any, size: "3-0", unit: "piece", specialty: "Paediatric Surgery", defaultQuantity: 4, notes: "Unit 2 prefers Ethicon only — Ethicon-equivalent of Surgicryl 3-0" },
  { name: "Normal Saline 0.9% (Paediatric, 500 ml)", category: "IRRIGATION" as any, size: "500 ml", unit: "bottle", specialty: "Paediatric Surgery", defaultQuantity: 1, notes: "Both Hypospadias Units 1 & 2" },

  // ─────────────────────────────────────────────────────────────────────
  // ENT (Otorhinolaryngology) Units — disposables / single-use
  // ─────────────────────────────────────────────────────────────────────

  // Gloves
  { name: "Disposable Sterile Surgical Gloves (ENT)", category: "GLOVES" as any, size: "7.5", unit: "pair", specialty: "ENT", defaultQuantity: 4 },
  { name: "Disposable Sterile Surgical Gloves (ENT)", category: "GLOVES" as any, size: "8.0", unit: "pair", specialty: "ENT", defaultQuantity: 4 },

  // Drapes / gowns / PPE
  { name: "Fenestrated ENT Drape", category: "GOWNS_DRAPES" as any, unit: "piece", specialty: "ENT", defaultQuantity: 1 },
  { name: "Sterile Surgeon Gown (ENT)", category: "GOWNS_DRAPES" as any, size: "L", unit: "piece", specialty: "ENT", defaultQuantity: 3 },
  { name: "Disposable Face Mask (ENT)", category: "PPE" as any, unit: "piece", specialty: "ENT", defaultQuantity: 6 },
  { name: "Disposable Theatre Cap (ENT)", category: "PPE" as any, unit: "piece", specialty: "ENT", defaultQuantity: 6 },
  { name: "Shoe Cover (ENT)", category: "PPE" as any, unit: "pair", specialty: "ENT", defaultQuantity: 6 },

  // Suction
  { name: "Yankauer Suction Tip (ENT)", category: "SUCTION" as any, unit: "piece", specialty: "ENT", defaultQuantity: 1 },
  { name: "Fine ENT Suction Tip (Frazier)", category: "SUCTION" as any, unit: "piece", specialty: "ENT", defaultQuantity: 1 },

  // ENT instruments / disposables
  { name: "Disposable Ear Speculum (Assorted)", category: "OTHER" as any, unit: "piece", specialty: "ENT", defaultQuantity: 4 },
  { name: "Surgical Blade No. 15", category: "OTHER" as any, size: "15", unit: "piece", specialty: "ENT", defaultQuantity: 2 },

  // Syringes
  { name: "Disposable Syringe (ENT)", category: "SYRINGES_NEEDLES" as any, size: "2 ml", unit: "piece", specialty: "ENT", defaultQuantity: 5 },
  { name: "Disposable Syringe (ENT)", category: "SYRINGES_NEEDLES" as any, size: "5 ml", unit: "piece", specialty: "ENT", defaultQuantity: 5 },
  { name: "Disposable Syringe (ENT)", category: "SYRINGES_NEEDLES" as any, size: "10 ml", unit: "piece", specialty: "ENT", defaultQuantity: 5 },
  { name: "Disposable Syringe (ENT)", category: "SYRINGES_NEEDLES" as any, size: "20 ml", unit: "piece", specialty: "ENT", defaultQuantity: 3 },

  // IV cannulae (all colours/sizes)
  { name: "IV Cannula (ENT)", category: "SYRINGES_NEEDLES" as any, size: "24 G - Yellow", unit: "piece", specialty: "ENT", defaultQuantity: 1 },
  { name: "IV Cannula (ENT)", category: "SYRINGES_NEEDLES" as any, size: "22 G - Blue", unit: "piece", specialty: "ENT", defaultQuantity: 1 },
  { name: "IV Cannula (ENT)", category: "SYRINGES_NEEDLES" as any, size: "20 G - Pink", unit: "piece", specialty: "ENT", defaultQuantity: 1 },
  { name: "IV Cannula (ENT)", category: "SYRINGES_NEEDLES" as any, size: "18 G - Green", unit: "piece", specialty: "ENT", defaultQuantity: 1 },
  { name: "IV Cannula (ENT)", category: "SYRINGES_NEEDLES" as any, size: "16 G - Grey", unit: "piece", specialty: "ENT", defaultQuantity: 1 },

  // Sutures (ENT-tagged variants so they appear in the ENT filter)
  { name: "Vicryl (ENT)", category: "SUTURES" as any, size: "3-0", unit: "piece", specialty: "ENT", defaultQuantity: 2 },
  { name: "Vicryl (ENT)", category: "SUTURES" as any, size: "4-0", unit: "piece", specialty: "ENT", defaultQuantity: 2 },
  { name: "Nylon (ENT)", category: "SUTURES" as any, size: "3-0", unit: "piece", specialty: "ENT", defaultQuantity: 2 },
  { name: "Silk (ENT)", category: "SUTURES" as any, size: "3-0", unit: "piece", specialty: "ENT", defaultQuantity: 2 },

  // Haemostatics / packing
  { name: "Surgicel (ENT, Oxidised Cellulose)", category: "OTHER" as any, unit: "piece", specialty: "ENT", defaultQuantity: 1 },
  { name: "Bone Wax", category: "OTHER" as any, unit: "piece", specialty: "ENT", defaultQuantity: 1 },
  { name: "Merocel Nasal Pack", category: "OTHER" as any, unit: "piece", specialty: "ENT", defaultQuantity: 2 },
  { name: "Nasal Stent", category: "OTHER" as any, unit: "piece", specialty: "ENT", defaultQuantity: 1 },

  // Airways
  { name: "Tracheostomy Tube (Cuffed)", category: "ANAESTHESIA_AIRWAY" as any, size: "Assorted", unit: "piece", specialty: "ENT", defaultQuantity: 1 },
  { name: "Tracheostomy Tube (Uncuffed)", category: "ANAESTHESIA_AIRWAY" as any, size: "Assorted", unit: "piece", specialty: "ENT", defaultQuantity: 1 },

  // IV fluids (issued as consumables alongside giving sets)
  { name: "Normal Saline 0.9% (ENT, 500 ml)", category: "IRRIGATION" as any, size: "500 ml", unit: "bag", specialty: "ENT", defaultQuantity: 1 },
  { name: "Dextrose-Saline 5% (ENT, 500 ml)", category: "IRRIGATION" as any, size: "500 ml", unit: "bag", specialty: "ENT", defaultQuantity: 1 },
  { name: "Paediatric Saline (ENT, 500 ml)", category: "IRRIGATION" as any, size: "500 ml", unit: "bag", specialty: "ENT", defaultQuantity: 1 },
  { name: "Blood Giving Set (ENT)", category: "CATHETERS_TUBING" as any, unit: "piece", specialty: "ENT", defaultQuantity: 1 },
  { name: "IV Fluid Giving Set (ENT)", category: "CATHETERS_TUBING" as any, unit: "piece", specialty: "ENT", defaultQuantity: 1 },

  // Skin prep / cleaning
  { name: "Povidone Iodine 10% (ENT)", category: "SKIN_PREP" as any, size: "500 ml", unit: "bottle", specialty: "ENT", defaultQuantity: 1 },
  { name: "Hydrogen Peroxide 3% (ENT)", category: "SKIN_PREP" as any, size: "500 ml", unit: "bottle", specialty: "ENT", defaultQuantity: 1 },
  { name: "Methylated Spirit (ENT)", category: "SKIN_PREP" as any, size: "500 ml", unit: "bottle", specialty: "ENT", defaultQuantity: 1 },
  { name: "Formalin 10% (ENT, Specimen Pot)", category: "CLEANING_SOLUTION" as any, size: "500 ml", unit: "bottle", specialty: "ENT", defaultQuantity: 1, notes: "For histology specimens" },

  // ─────────────────────────────────────────────────────────────────────
  // Oral & Maxillofacial Surgery — Theatre + Dental Clinic packs
  // Packs covered:
  //   Theatre Major: A) Tumour, B) Fracture, C) Ludwig Angina I&D (GA)
  //   Dental Clinic Minor: A) I&D, B) Necrotizing-fasciitis debridement,
  //   C) Surgical extraction, D) Incisional biopsy, E) Fracture under LA,
  //   F) Consultation/Examination, G) Wound dressing
  // Quantities = max requested across packs; the `notes` field indicates
  // which pack(s) the item belongs to so the packer can confirm.
  // ─────────────────────────────────────────────────────────────────────

  // Gloves / PPE
  { name: "Disposable Sterile Surgical Gloves (OMF)", category: "GLOVES" as any, size: "7.5", unit: "pair", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 7, notes: "OMF Tumour pack 7 each / Fracture 5 / I&D 6 / Dental I&D 4 / Debridement 2 / Extraction 2 / Biopsy 2 / Fracture-LA 2" },
  { name: "Disposable Sterile Surgical Gloves (OMF)", category: "GLOVES" as any, size: "8.0", unit: "pair", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 7, notes: "OMF Tumour pack 7 each / Fracture 5 / I&D 6" },
  { name: "Examination/Disposable Gloves (OMF Packet)", category: "GLOVES" as any, unit: "packet", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "All OMF theatre & dental packs" },
  { name: "Latex Gloves (OMF Consultation)", category: "GLOVES" as any, unit: "pair", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 3, notes: "Dental Consultation/Examination pack" },
  { name: "Disposable Surgical Gown (OMF)", category: "GOWNS_DRAPES" as any, unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 4, notes: "Tumour 3 / Fracture 4 / Ludwig I&D 3" },
  { name: "Face Mask (OMF)", category: "PPE" as any, unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 10, notes: "Dental I&D 10 / Theatre packs 4-7 / Consultation 3" },
  { name: "Sterile Drape (OMF Dental Clinic)", category: "GOWNS_DRAPES" as any, unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Dental clinic minor packs" },

  // Catheters / drains / tubes
  { name: "Foley Catheter (OMF)", category: "CATHETERS_TUBING" as any, size: "16 Fr", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Size depends on patient — Tumour, Fracture, Ludwig I&D" },
  { name: "Urine Drainage Bag (OMF)", category: "CATHETERS_TUBING" as any, unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Tumour, Fracture, Ludwig I&D packs" },
  { name: "Active Drain (Redivac)", category: "CATHETERS_TUBING" as any, size: "OMF", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Tumour pack" },
  { name: "Corrugated Rubber Drain", category: "CATHETERS_TUBING" as any, unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Ludwig I&D, Dental I&D" },
  { name: "NG Tube (OMF)", category: "CATHETERS_TUBING" as any, size: "16 Fr", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Tumour & Ludwig I&D packs" },
  { name: "NG Tube (OMF)", category: "CATHETERS_TUBING" as any, size: "18 Fr", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Tumour pack" },
  { name: "Blood Giving Set (OMF)", category: "CATHETERS_TUBING" as any, unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Tumour, Fracture packs" },
  { name: "IV Fluid Giving Set (OMF)", category: "CATHETERS_TUBING" as any, unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 2, notes: "Ludwig I&D ×2 / Tumour, Fracture, Dental I&D ×1" },
  { name: "Suction Tube (OMF)", category: "SUCTION" as any, unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Tumour, Fracture packs" },
  { name: "Tracheostomy Tube & Set (OMF)", category: "ANAESTHESIA_AIRWAY" as any, size: "Assorted", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Ludwig Angina I&D under GA" },

  // IV cannulae (UK colour-coded)
  { name: "IV Cannula (OMF)", category: "SYRINGES_NEEDLES" as any, size: "16 G - Grey", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 2, notes: "Tumour, Fracture, Ludwig I&D" },
  { name: "IV Cannula (OMF)", category: "SYRINGES_NEEDLES" as any, size: "18 G - Green", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 2, notes: "All major packs + Dental I&D/Debridement/Fracture-LA" },
  { name: "IV Cannula (OMF)", category: "SYRINGES_NEEDLES" as any, size: "20 G - Pink", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 2, notes: "All major packs + Dental I&D/Debridement/Fracture-LA" },

  // Syringes & dental needles
  { name: "Disposable Syringe (OMF)", category: "SYRINGES_NEEDLES" as any, size: "2 ml", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 15, notes: "Tumour 15 / Fracture 10 / Ludwig 5 / Dental packs 3-5" },
  { name: "Disposable Syringe (OMF)", category: "SYRINGES_NEEDLES" as any, size: "5 ml", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 15, notes: "Tumour 15 / Fracture 10 / Ludwig 5 / Dental packs 3-5" },
  { name: "Disposable Syringe (OMF)", category: "SYRINGES_NEEDLES" as any, size: "10 ml", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 15, notes: "Tumour 15 / Fracture 10 / Ludwig 5 / Dental packs 3-5" },
  { name: "Dental Needle (27 G Long)", category: "SYRINGES_NEEDLES" as any, size: "27 G - Long", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "All dental clinic LA packs" },
  { name: "Dental Needle (27 G Short)", category: "SYRINGES_NEEDLES" as any, size: "27 G - Short", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Dental I&D pack" },

  // Surgical blades
  { name: "Surgical Blade No. 15 (OMF)", category: "OTHER" as any, size: "15", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 2, notes: "Tumour ×2 / Fracture, Debridement, Extraction, Biopsy, Fracture-LA ×1" },
  { name: "Surgical Blade No. 11 (OMF)", category: "OTHER" as any, size: "11", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Ludwig Angina I&D, Dental I&D" },

  // Sutures
  { name: "Vicryl (OMF)", category: "SUTURES" as any, size: "2-0", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 5, notes: "Tumour 5 / Fracture 4 / Extraction-Biopsy-Fracture-LA 1-2" },
  { name: "Vicryl (OMF)", category: "SUTURES" as any, size: "3-0", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 5, notes: "Tumour 5 / Fracture 4" },
  { name: "Vicryl (OMF, Heavy)", category: "SUTURES" as any, size: "0", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 2, notes: "Tumour, Fracture" },
  { name: "Vicryl (OMF, Heavy)", category: "SUTURES" as any, size: "1", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 2, notes: "Tumour, Fracture" },
  { name: "Nylon (OMF)", category: "SUTURES" as any, size: "2-0", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 4, notes: "Tumour 3 / Fracture 4 / Ludwig 2 / Dental I&D 2" },
  { name: "Nylon (OMF)", category: "SUTURES" as any, size: "3-0", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 4, notes: "Tumour 3 / Fracture 4" },

  // Maxillofacial fracture hardware
  { name: "Soft Stainless Steel Wire 0.45 mm", category: "OTHER" as any, size: "5 m roll", unit: "roll", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Fracture pack 4 m / Fracture-LA 5 m" },
  { name: "Arch Bar", category: "OTHER" as any, size: "30 cm", unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Fracture, Fracture-LA packs" },
  { name: "Gigli Saw (OMF)", category: "OTHER" as any, unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Tumour pack" },

  // Haemostasis / theatre adjuncts
  { name: "Surgicel (OMF)", category: "OTHER" as any, unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 3, notes: "Tumour pack ×3" },
  { name: "Bone Wax (OMF)", category: "OTHER" as any, unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Tumour pack" },
  { name: "KY Lubricating Gel (OMF)", category: "OTHER" as any, unit: "tube", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "All major packs (catheter insertion)" },
  { name: "Diathermy Pad / Patient Return Plate (OMF)", category: "DIATHERMY" as any, unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Tumour, Fracture, Ludwig I&D" },
  { name: "ECG Electrode (OMF)", category: "OTHER" as any, unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 6, notes: "All theatre packs" },

  // Dressings / gauze
  { name: "Sterile Gauze Pack (OMF)", category: "STERILE_DRESSINGS" as any, unit: "pack", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 5, notes: "Tumour 5 packs / Ludwig 2 / Dental Debridement 20 pcs / Dental I&D 15 pcs / Extraction-Biopsy 10 pcs" },
  { name: "Sterile Mop (OMF)", category: "STERILE_DRESSINGS" as any, unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 8, notes: "Tumour 8 / Fracture 5" },
  { name: "Cotton Wool Roll (OMF)", category: "STERILE_DRESSINGS" as any, unit: "roll", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 15, notes: "Debridement 15 / Dental I&D 10" },
  { name: "Crepe Bandage (OMF)", category: "STERILE_DRESSINGS" as any, size: "4 inch", unit: "roll", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "All major + dental packs" },
  { name: "Adhesive Plaster (OMF)", category: "STERILE_DRESSINGS" as any, unit: "roll", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "All major + dental packs" },
  { name: "Size 4 Bandage (OMF Wound Dressing)", category: "STERILE_DRESSINGS" as any, size: "4 inch", unit: "roll", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Wound Dressing pack" },
  { name: "Honey-Care Gauze (OMF)", category: "STERILE_DRESSINGS" as any, unit: "pack", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Debridement for necrotising fasciitis" },

  // Fluids / consumable liquids (kept under IRRIGATION for booking-form filtering)
  { name: "Water for Injection (OMF)", category: "IRRIGATION" as any, size: "10 ml", unit: "ampoule", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 5, notes: "All theatre + dental packs" },
  { name: "IVF Normal Saline (OMF)", category: "IRRIGATION" as any, size: "500 ml", unit: "bag", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Dental Extraction, Biopsy, Fracture-LA, Wound Dressing" },

  // Skin prep / cleaning solutions
  { name: "Savlon (OMF, 125 ml)", category: "SKIN_PREP" as any, size: "125 ml", unit: "bottle", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Tumour, Fracture, Ludwig I&D, Dental I&D, Debridement" },
  { name: "Methylated Spirit (OMF)", category: "SKIN_PREP" as any, size: "500 ml", unit: "bottle", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "All theatre + dental packs" },
  { name: "Povidone Iodine (OMF)", category: "SKIN_PREP" as any, size: "500 ml", unit: "bottle", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 1, notes: "Tumour, Fracture packs" },

  // Examination consumables (Consultation pack)
  { name: "Wooden Tongue Spatula", category: "OTHER" as any, unit: "piece", specialty: "Oral & Maxillofacial Surgery", defaultQuantity: 2, notes: "Consultation/Examination pack" },
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

  // ─────────────────────────────────────────────────────────────────────
  // Orthopaedic Unit drugs — submitted by Igwe Jovita
  // ─────────────────────────────────────────────────────────────────────
  { name: "Ceftriaxone 2 g (Vial)", type: "ANTIBIOTIC", defaultDosage: "2 g IV stat", defaultRoute: "IV", defaultQuantity: 1, unit: "vial" },
  { name: "Tranexamic Acid 1 g (Ampoule)", type: "HAEMOSTATIC", defaultDosage: "1 g IV", defaultRoute: "IV", defaultQuantity: 1, unit: "ampoule" },
  { name: "Lidocaine 2% with Adrenaline 1:200,000 (20 ml)", type: "ANAESTHETIC_ADJUNCT", defaultRoute: "SC/Local", defaultQuantity: 1, unit: "vial" },

  // ─────────────────────────────────────────────────────────────────────
  // Paediatric Surgery drugs — submitted by Dr Ogaranya
  // ─────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────
  // ENT Units — drugs / inhalational agents / topical preparations
  // ─────────────────────────────────────────────────────────────────────
  { name: "Sevoflurane (Inhalational Anaesthetic, 250 ml)", type: "ANAESTHETIC_ADJUNCT", defaultRoute: "Inhalation", defaultQuantity: 1, unit: "bottle" },
  { name: "Otrivine (Xylometazoline 0.1%) Nasal Drops", type: "OTHER", defaultRoute: "Intranasal", defaultQuantity: 1, unit: "bottle" },
  { name: "Diclofenac 100 mg Suppository", type: "ANALGESIC", defaultDosage: "100 mg PR", defaultRoute: "PR", defaultQuantity: 2, unit: "suppository" },
  { name: "Gentamicin Ear/Eye Cream", type: "WOUND_DRESSING_AGENT", defaultRoute: "Topical", defaultQuantity: 1, unit: "tube" },
  { name: "Liquid Paraffin (BP)", type: "WOUND_DRESSING_AGENT", defaultRoute: "Topical", defaultQuantity: 1, unit: "bottle" },
  { name: "Adrenaline 1 mg / 1 ml (Ampoule)", type: "HAEMOSTATIC", defaultDosage: "Titrate per case", defaultRoute: "Topical/IV", defaultQuantity: 2, unit: "ampoule" },

  // ─────────────────────────────────────────────────────────────────────
  // Oral & Maxillofacial Surgery — drugs / topical agents / LA carpules
  // ─────────────────────────────────────────────────────────────────────
  { name: "Lidocaine 2% + Adrenaline (Brown Bottle, OMF)", type: "LOCAL_ANAESTHETIC", defaultDosage: "Max 7 mg/kg with adrenaline", defaultRoute: "Infiltration", defaultQuantity: 1, unit: "bottle" },
  { name: "Lidocaine 2% + Adrenaline Dental Carpule", type: "LOCAL_ANAESTHETIC", defaultDosage: "2.2 ml carpule (1:80,000 adrenaline)", defaultRoute: "Dental Infiltration/Block", defaultQuantity: 2, unit: "carpule" },
  { name: "Carnoy's Solution", type: "OTHER", defaultDosage: "Apply topically with cotton applicator, 3 min × cycles", defaultRoute: "Topical (Bone Cavity)", defaultQuantity: 1, unit: "bottle" },
  { name: "Wosan Antiseptic Cream", type: "ANTISEPTIC", defaultRoute: "Topical", defaultQuantity: 1, unit: "tube" },
  { name: "Hydrogen Peroxide (OMF, 250 ml)", type: "ANTISEPTIC", defaultRoute: "Topical/Wound Irrigation", defaultQuantity: 1, unit: "bottle" },
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
