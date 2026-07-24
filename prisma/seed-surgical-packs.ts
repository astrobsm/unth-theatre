/**
 * seed-surgical-packs.ts
 * ---------------------------------------------------------------------------
 * Evidence-based DEFAULT surgical consumable & pharmacy packs, keyed by the
 * subspecialties (and the high-volume procedures) actually booked in this app.
 *
 * How this fits the existing system:
 *   - A CONSUMABLE pack expands (at booking) into SurgeryConsumableRequest rows
 *     routed to the Consumable Pack Providers / theatre store.
 *   - A PHARMACY pack expands into SurgeryDrugDressingRequest rows routed to the
 *     Pharmacy (this is how antibiotics + IV fluids reach the pharmacist queue).
 *   - The MANDATORY base pack (PPE / gowns / gloves / drapes / swabs / skin-prep)
 *     is a separate code constant (src/lib/baseConsumablePack.ts) that the server
 *     ALWAYS attaches. These packs therefore carry only the SUBSPECIALTY- and
 *     PROCEDURE-SPECIFIC additions on top of that base — no duplication.
 *
 * Quantities use internationally-accepted defaults (WHO Surgical Safety / SSI
 * guidance, ACS/RCS/AORN preference-card norms, NICE/CDC prophylaxis timing).
 * They are DEFAULTS ONLY — every item is editable at booking ("View pack
 * content") and centrally in the admin Surgical Packs screen, and surgeons can
 * add/remove items per case. Antibiotic regimens follow common Nigerian
 * teaching-hospital practice with a penicillin-allergy alternative noted; local
 * protocols override.
 *
 * Idempotent: re-running upserts each pack by (name, subspecialty, kind) and
 * replaces its items, so it is safe to run repeatedly and after edits here.
 * ---------------------------------------------------------------------------
 */

import type { PrismaClient } from '@prisma/client';

// ---- authoring types (map onto SurgicalPackItem) --------------------------
type ConsumableItem = {
  name: string;
  quantity: number;
  unit?: string;
  category: string; // a SurgicalConsumableCategory value
  size?: string;
  notes?: string;
};
type DrugItem = {
  name: string;
  quantity: number;
  unit?: string;
  drugType: string; // a SurgicalDrugDressingType value
  dosage?: string;
  route?: string;
  notes?: string;
};
type PackSeed = {
  name: string;
  subspecialty: string;
  kind: 'CONSUMABLE' | 'PHARMACY';
  description?: string;
  sortOrder?: number;
  consumables?: ConsumableItem[];
  drugs?: DrugItem[];
};

// ---- reusable building blocks ---------------------------------------------
const C = {
  suction: (): ConsumableItem[] => [
    { name: 'Suction tubing', quantity: 1, unit: 'piece', category: 'SUCTION' },
    { name: 'Yankauer suction handle', quantity: 1, unit: 'piece', category: 'SUCTION' },
  ],
  diathermy: (): ConsumableItem[] => [
    { name: 'Diathermy (monopolar) pencil with holster', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
    { name: 'Diathermy patient plate (return electrode)', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
    { name: 'Diathermy scratch/cleaning pad', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
  ],
  blades: (): ConsumableItem[] => [
    { name: 'Scalpel blade No. 10', quantity: 2, unit: 'piece', category: 'SYRINGES_NEEDLES' },
    { name: 'Scalpel blade No. 15', quantity: 1, unit: 'piece', category: 'SYRINGES_NEEDLES' },
  ],
  syringes: (): ConsumableItem[] => [
    { name: 'Disposable syringe', quantity: 5, unit: 'piece', category: 'SYRINGES_NEEDLES', size: '10 ml' },
    { name: 'Disposable syringe', quantity: 3, unit: 'piece', category: 'SYRINGES_NEEDLES', size: '5 ml' },
    { name: 'Hypodermic needles', quantity: 5, unit: 'piece', category: 'SYRINGES_NEEDLES', size: '21G/23G' },
  ],
  catheter: (): ConsumableItem[] => [
    { name: 'Foley catheter', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING', size: '16 Fr' },
    { name: 'Urine drainage bag', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
    { name: 'Sterile lubricating jelly', quantity: 1, unit: 'sachet', category: 'CATHETERS_TUBING' },
  ],
  specimen: (): ConsumableItem[] => [
    { name: 'Specimen container', quantity: 2, unit: 'piece', category: 'OTHER' },
    { name: 'Formalin (10%) specimen bottle', quantity: 1, unit: 'bottle', category: 'OTHER' },
    { name: 'Histology request/label', quantity: 1, unit: 'piece', category: 'OTHER' },
  ],
  ivAccess: (): ConsumableItem[] => [
    { name: 'IV cannula', quantity: 2, unit: 'piece', category: 'CATHETERS_TUBING', size: '18G/16G' },
    { name: 'IV giving set', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
    { name: '3-way tap with extension', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
  ],
};

const stdFluids = (major = false): DrugItem[] =>
  major
    ? [
        { name: 'Normal Saline 0.9%', quantity: 3, unit: 'litre', drugType: 'IV_FLUID', dosage: '1 L', route: 'IV' },
        { name: "Ringer's Lactate (Hartmann's)", quantity: 2, unit: 'litre', drugType: 'IV_FLUID', dosage: '1 L', route: 'IV' },
        { name: 'Dextrose 5%', quantity: 1, unit: 'litre', drugType: 'IV_FLUID', dosage: '500 ml', route: 'IV' },
      ]
    : [
        { name: 'Normal Saline 0.9%', quantity: 2, unit: 'litre', drugType: 'IV_FLUID', dosage: '1 L', route: 'IV' },
        { name: "Ringer's Lactate (Hartmann's)", quantity: 1, unit: 'litre', drugType: 'IV_FLUID', dosage: '1 L', route: 'IV' },
      ];

const analgesia = (): DrugItem[] => [
  { name: 'Paracetamol (IV)', quantity: 1, unit: 'vial', drugType: 'ANALGESIC', dosage: '1 g', route: 'IV' },
  { name: 'Diclofenac', quantity: 1, unit: 'ampoule', drugType: 'ANALGESIC', dosage: '75 mg', route: 'IM/IV' },
];

const penAllergyNote =
  'Penicillin/cephalosporin allergy: substitute Clindamycin 900 mg IV (± Gentamicin 5 mg/kg). Give within 60 min before incision; re-dose if op > 4 h or blood loss > 1.5 L.';

// ===========================================================================
// PACK DEFINITIONS
// ===========================================================================
export const SURGICAL_PACK_SEED: PackSeed[] = [
  // ------------------------------------------------------------------ GENERAL SURGERY
  {
    name: 'General Surgery — Standard Consumables',
    subspecialty: 'General Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 0,
    description: 'Default consumables for a general-surgery case (on top of the base pack).',
    consumables: [
      { name: 'Vicryl (polyglactin) suture', quantity: 3, unit: 'piece', category: 'SUTURES', size: '1' },
      { name: 'Vicryl (polyglactin) suture', quantity: 3, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'PDS suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '1 (loop)' },
      { name: 'Nylon suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Silk suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '2-0' },
      ...C.blades(),
      ...C.diathermy(),
      ...C.suction(),
      ...C.catheter(),
      { name: 'Nasogastric tube', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING', size: '16 Fr' },
      { name: 'Redivac/closed suction drain', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING', size: '14 Fr' },
      ...C.specimen(),
    ],
  },
  {
    name: 'General Surgery — Antibiotics & IV Fluids',
    subspecialty: 'General Surgery',
    kind: 'PHARMACY',
    sortOrder: 1,
    description: 'Prophylaxis + fluids for clean-contaminated GI surgery. Wired to Pharmacy.',
    drugs: [
      { name: 'Ceftriaxone', quantity: 1, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '1 g', route: 'IV', notes: penAllergyNote },
      { name: 'Metronidazole (IV infusion)', quantity: 1, unit: 'bag', drugType: 'ANTIBIOTIC', dosage: '500 mg', route: 'IV' },
      ...stdFluids(),
      ...analgesia(),
      { name: 'Lignocaine 2%', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '20 ml', route: 'Infiltration' },
    ],
  },
  {
    name: 'Exploratory Laparotomy — Consumables',
    subspecialty: 'General Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 10,
    description: 'Major open abdominal case (bowel resection / obstruction / trauma).',
    consumables: [
      { name: 'Vicryl (polyglactin) suture', quantity: 4, unit: 'piece', category: 'SUTURES', size: '1' },
      { name: 'PDS loop suture (mass closure)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '1' },
      { name: 'Vicryl suture (bowel)', quantity: 4, unit: 'piece', category: 'SUTURES', size: '3-0' },
      { name: 'Skin stapler / Nylon 2-0', quantity: 1, unit: 'piece', category: 'SUTURES' },
      { name: 'Linear cutter/stapler reload (if bowel resection)', quantity: 1, unit: 'piece', category: 'OTHER' },
      ...C.blades(),
      ...C.diathermy(),
      ...C.suction(),
      { name: 'Large abdominal drain (Robinson/Redivac)', quantity: 2, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Nasogastric tube', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING', size: '16 Fr' },
      ...C.catheter(),
      ...C.specimen(),
    ],
  },
  {
    name: 'Herniorrhaphy / Mesh Repair — Consumables',
    subspecialty: 'General Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 11,
    description: 'Inguinal/ventral hernia repair with prosthetic mesh.',
    consumables: [
      { name: 'Lightweight polypropylene mesh', quantity: 1, unit: 'piece', category: 'OTHER', size: '15 × 15 cm' },
      { name: 'Prolene (polypropylene) suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Vicryl suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Nylon suture (skin)', quantity: 1, unit: 'piece', category: 'SUTURES', size: '3-0' },
      ...C.blades(),
      ...C.diathermy(),
      ...C.specimen(),
    ],
  },
  {
    name: 'Mastectomy / Breast Surgery — Consumables',
    subspecialty: 'General Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 12,
    description: 'Mastectomy ± axillary clearance / wide local excision.',
    consumables: [
      { name: 'Vicryl suture', quantity: 3, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Vicryl suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '3-0' },
      { name: 'Monocryl suture (subcuticular)', quantity: 1, unit: 'piece', category: 'SUTURES', size: '3-0' },
      ...C.blades(),
      ...C.diathermy(),
      ...C.suction(),
      { name: 'Redivac closed-suction drain', quantity: 2, unit: 'piece', category: 'CATHETERS_TUBING', size: '14 Fr' },
      { name: 'Skin marker', quantity: 1, unit: 'piece', category: 'OTHER' },
      ...C.specimen(),
    ],
  },
  {
    name: 'Thyroidectomy — Consumables',
    subspecialty: 'General Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 13,
    description: 'Total/hemithyroidectomy — meticulous haemostasis, drain.',
    consumables: [
      { name: 'Vicryl suture', quantity: 3, unit: 'piece', category: 'SUTURES', size: '3-0' },
      { name: 'Vicryl tie', quantity: 4, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Monocryl suture (subcuticular)', quantity: 1, unit: 'piece', category: 'SUTURES', size: '4-0' },
      ...C.blades(),
      ...C.diathermy(),
      ...C.suction(),
      { name: 'Redivac closed-suction drain', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING', size: '12 Fr' },
      ...C.specimen(),
    ],
  },

  // ------------------------------------------------------------------ OBSTETRICS & GYNAECOLOGY
  {
    name: 'O&G — Standard Consumables',
    subspecialty: 'Obstetrics & Gynaecology',
    kind: 'CONSUMABLE',
    sortOrder: 0,
    description: 'Default consumables for obstetric/gynaecological surgery.',
    consumables: [
      { name: 'Vicryl (polyglactin) suture', quantity: 3, unit: 'piece', category: 'SUTURES', size: '1' },
      { name: 'Vicryl suture', quantity: 3, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Vicryl suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '0' },
      { name: 'Monocryl/Nylon (skin)', quantity: 1, unit: 'piece', category: 'SUTURES', size: '3-0' },
      ...C.blades(),
      ...C.diathermy(),
      ...C.suction(),
      ...C.catheter(),
      ...C.specimen(),
    ],
  },
  {
    name: 'O&G — Antibiotics & IV Fluids',
    subspecialty: 'Obstetrics & Gynaecology',
    kind: 'PHARMACY',
    sortOrder: 1,
    description: 'Prophylaxis + fluids for CS / hysterectomy / gynae surgery. Wired to Pharmacy.',
    drugs: [
      { name: 'Cefazolin (or Ceftriaxone 1 g)', quantity: 1, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '2 g', route: 'IV', notes: penAllergyNote },
      { name: 'Metronidazole (IV infusion)', quantity: 1, unit: 'bag', drugType: 'ANTIBIOTIC', dosage: '500 mg', route: 'IV' },
      ...stdFluids(true),
      ...analgesia(),
    ],
  },
  {
    name: 'Caesarean Section — Drugs & Fluids',
    subspecialty: 'Obstetrics & Gynaecology',
    kind: 'PHARMACY',
    sortOrder: 10,
    description: 'CS uterotonics + prophylaxis. Antibiotic within 60 min before skin incision.',
    drugs: [
      { name: 'Cefazolin (or Ceftriaxone 1 g)', quantity: 1, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '2 g', route: 'IV', notes: penAllergyNote },
      { name: 'Oxytocin', quantity: 5, unit: 'ampoule', drugType: 'OTHER', dosage: '10 IU', route: 'IV/IM', notes: 'Uterotonic — slow IV bolus + infusion after delivery.' },
      { name: 'Ergometrine', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '0.5 mg', route: 'IM', notes: 'Second-line uterotonic (avoid in hypertension).' },
      { name: 'Misoprostol', quantity: 4, unit: 'tablet', drugType: 'OTHER', dosage: '200 mcg', route: 'PR/SL', notes: 'For atony (up to 800–1000 mcg).' },
      { name: 'Carboprost (Haemabate)', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '250 mcg', route: 'IM', notes: 'Refractory atony.' },
      { name: 'Tranexamic acid', quantity: 1, unit: 'ampoule', drugType: 'HAEMOSTATIC', dosage: '1 g', route: 'IV' },
      ...stdFluids(true),
    ],
  },
  {
    name: 'Hysterectomy / TAH-BSO — Consumables',
    subspecialty: 'Obstetrics & Gynaecology',
    kind: 'CONSUMABLE',
    sortOrder: 11,
    description: 'Abdominal hysterectomy ± BSO / debulking.',
    consumables: [
      { name: 'Vicryl suture', quantity: 4, unit: 'piece', category: 'SUTURES', size: '1' },
      { name: 'Vicryl suture', quantity: 4, unit: 'piece', category: 'SUTURES', size: '0' },
      { name: 'Vicryl suture', quantity: 3, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'PDS loop (mass closure)', quantity: 1, unit: 'piece', category: 'SUTURES', size: '1' },
      ...C.blades(),
      ...C.diathermy(),
      ...C.suction(),
      { name: 'Pelvic drain', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      ...C.catheter(),
      ...C.specimen(),
    ],
  },

  // ------------------------------------------------------------------ NEUROSURGERY
  {
    name: 'Neurosurgery — Standard Consumables',
    subspecialty: 'Neurosurgery',
    kind: 'CONSUMABLE',
    sortOrder: 0,
    description: 'Default cranial/spinal consumables (on top of base pack).',
    consumables: [
      { name: 'Neurosurgical patties/cottonoids (assorted)', quantity: 1, unit: 'pack', category: 'STERILE_DRESSINGS' },
      { name: 'Bipolar diathermy forceps + lead', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
      { name: 'Monopolar diathermy pencil + plate', quantity: 1, unit: 'set', category: 'DIATHERMY' },
      ...C.suction(),
      { name: 'Vicryl suture (galea)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Nylon/staples (scalp)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Cranial fixation plates/screws (burr-hole covers)', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Bone flap fixation clamps', quantity: 1, unit: 'set', category: 'OTHER' },
      ...C.catheter(),
      ...C.specimen(),
    ],
  },
  {
    name: 'Neurosurgery — Antibiotics & Adjuncts',
    subspecialty: 'Neurosurgery',
    kind: 'PHARMACY',
    sortOrder: 1,
    description: 'Cranial prophylaxis, brain relaxation, seizure & haemostasis adjuncts. Wired to Pharmacy.',
    drugs: [
      { name: 'Ceftriaxone', quantity: 2, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '2 g', route: 'IV', notes: penAllergyNote + ' Add Vancomycin for CSF-shunt hardware.' },
      { name: 'Mannitol 20%', quantity: 1, unit: 'bag', drugType: 'OTHER', dosage: '0.5–1 g/kg', route: 'IV', notes: 'Brain relaxation / raised ICP.' },
      { name: 'Dexamethasone', quantity: 2, unit: 'ampoule', drugType: 'OTHER', dosage: '8 mg', route: 'IV', notes: 'Peritumoural oedema.' },
      { name: 'Phenytoin', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '15 mg/kg loading', route: 'IV', notes: 'Seizure prophylaxis (supratentorial).' },
      { name: 'Tranexamic acid', quantity: 1, unit: 'ampoule', drugType: 'HAEMOSTATIC', dosage: '1 g', route: 'IV' },
      { name: 'Bone wax', quantity: 2, unit: 'piece', drugType: 'HAEMOSTATIC', notes: 'Diploic bleeding.' },
      { name: 'Absorbable haemostat (Surgicel/Gelfoam)', quantity: 2, unit: 'piece', drugType: 'HAEMOSTATIC' },
      ...stdFluids(true),
    ],
  },
  {
    name: 'Craniotomy (Tumour) — Consumables',
    subspecialty: 'Neurosurgery',
    kind: 'CONSUMABLE',
    sortOrder: 10,
    description: 'Craniotomy + microsurgical tumour excision.',
    consumables: [
      { name: 'Neurosurgical patties/cottonoids (assorted)', quantity: 2, unit: 'pack', category: 'STERILE_DRESSINGS' },
      { name: 'Dural substitute (graft)', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Cranial fixation plate & screw set', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Bone flap fixation system', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Microscope drape', quantity: 1, unit: 'piece', category: 'GOWNS_DRAPES' },
      { name: 'High-speed drill/craniotome burr', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Bipolar forceps + lead', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
      ...C.suction(),
      { name: 'Dural suture (Nurolon/Silk)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '4-0' },
      ...C.specimen(),
    ],
  },
  {
    name: 'Burr-hole / Chronic SDH Evacuation — Consumables',
    subspecialty: 'Neurosurgery',
    kind: 'CONSUMABLE',
    sortOrder: 11,
    description: 'Burr-hole drainage of chronic subdural haematoma.',
    consumables: [
      { name: 'Neurosurgical patties/cottonoids', quantity: 1, unit: 'pack', category: 'STERILE_DRESSINGS' },
      { name: 'Subdural/soft closed drain', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Bipolar forceps + lead', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
      ...C.suction(),
      { name: 'Nylon suture (scalp)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Warm saline for irrigation', quantity: 2, unit: 'litre', category: 'IRRIGATION' },
    ],
  },
  {
    name: 'VP Shunt — Consumables',
    subspecialty: 'Neurosurgery',
    kind: 'CONSUMABLE',
    sortOrder: 12,
    description: 'Ventriculoperitoneal shunt insertion/revision.',
    consumables: [
      { name: 'VP shunt system (valve + proximal + peritoneal catheter)', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Shunt passer/tunneler', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Neurosurgical patties', quantity: 1, unit: 'pack', category: 'STERILE_DRESSINGS' },
      { name: 'Vicryl suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '3-0' },
      { name: 'Nylon suture (scalp/abdomen)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '2-0' },
      ...C.suction(),
    ],
  },
  {
    name: 'Laminectomy / Spinal — Consumables',
    subspecialty: 'Neurosurgery',
    kind: 'CONSUMABLE',
    sortOrder: 13,
    description: 'Lumbar/thoracic laminectomy ± spinal tumour excision.',
    consumables: [
      { name: 'Neurosurgical patties/cottonoids', quantity: 1, unit: 'pack', category: 'STERILE_DRESSINGS' },
      { name: 'Bone wax', quantity: 2, unit: 'piece', category: 'OTHER' },
      { name: 'Absorbable haemostat (Surgicel/Gelfoam)', quantity: 2, unit: 'piece', category: 'OTHER' },
      { name: 'Bipolar forceps + lead', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
      ...C.suction(),
      { name: 'Vicryl suture (fascia)', quantity: 3, unit: 'piece', category: 'SUTURES', size: '1' },
      { name: 'Nylon/staples (skin)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Closed suction drain', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      ...C.specimen(),
    ],
  },

  // ------------------------------------------------------------------ OPHTHALMOLOGY
  {
    name: 'Ophthalmology — Standard Consumables',
    subspecialty: 'Ophthalmology',
    kind: 'CONSUMABLE',
    sortOrder: 0,
    description: 'Default micro-ophthalmic consumables.',
    consumables: [
      { name: 'Ophthalmic drape (fenestrated, adhesive)', quantity: 1, unit: 'piece', category: 'GOWNS_DRAPES' },
      { name: 'Eye speculum (wire/adjustable)', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Balanced Salt Solution (BSS)', quantity: 1, unit: 'bottle', category: 'IRRIGATION', size: '500 ml' },
      { name: 'Nylon suture (ophthalmic)', quantity: 1, unit: 'piece', category: 'SUTURES', size: '10-0' },
      { name: 'Vicryl suture (ophthalmic)', quantity: 1, unit: 'piece', category: 'SUTURES', size: '8-0' },
      { name: 'Cellulose sponges (weck-cel)', quantity: 1, unit: 'pack', category: 'STERILE_DRESSINGS' },
      { name: 'Ophthalmic blade (crescent/keratome/side-port)', quantity: 1, unit: 'set', category: 'SYRINGES_NEEDLES' },
      { name: 'Eye pad + protective shield', quantity: 1, unit: 'piece', category: 'DRESSING_PACKS' },
    ],
  },
  {
    name: 'Ophthalmology — Drops & Intraocular Drugs',
    subspecialty: 'Ophthalmology',
    kind: 'PHARMACY',
    sortOrder: 1,
    description: 'Peri-operative ophthalmic pharmacology. Wired to Pharmacy.',
    drugs: [
      { name: 'Intracameral Cefuroxime', quantity: 1, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '1 mg/0.1 ml', route: 'Intracameral', notes: 'Endophthalmitis prophylaxis.' },
      { name: 'Topical antibiotic (Ciprofloxacin/Moxifloxacin) drops', quantity: 1, unit: 'bottle', drugType: 'ANTIBIOTIC', route: 'Topical' },
      { name: 'Tropicamide + Phenylephrine (mydriatic) drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'Topical', notes: 'Pupil dilation.' },
      { name: 'Proparacaine/Tetracaine (topical anaesthetic) drops', quantity: 1, unit: 'bottle', drugType: 'ANAESTHETIC_ADJUNCT', route: 'Topical' },
      { name: 'Lignocaine 2% (peribulbar/sub-Tenon)', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '2–5 ml', route: 'Peribulbar' },
      { name: 'Ophthalmic viscoelastic (OVD, e.g. HPMC)', quantity: 1, unit: 'syringe', drugType: 'OTHER', notes: 'Anterior-chamber maintenance.' },
      { name: 'Dexamethasone + antibiotic ointment', quantity: 1, unit: 'tube', drugType: 'OTHER', route: 'Topical' },
    ],
  },
  {
    name: 'Cataract (SICS/Phaco + PCIOL) — Consumables',
    subspecialty: 'Ophthalmology',
    kind: 'CONSUMABLE',
    sortOrder: 10,
    description: 'Small-incision cataract surgery with posterior-chamber IOL.',
    consumables: [
      { name: 'Posterior-chamber IOL (PCIOL)', quantity: 1, unit: 'piece', category: 'OTHER', notes: 'Power per biometry.' },
      { name: 'Ophthalmic viscoelastic (OVD)', quantity: 1, unit: 'syringe', category: 'IRRIGATION' },
      { name: 'Keratome + side-port blade', quantity: 1, unit: 'set', category: 'SYRINGES_NEEDLES' },
      { name: 'Crescent blade', quantity: 1, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Hydrodissection cannula', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Simcoe / I-A cannula', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Balanced Salt Solution (BSS)', quantity: 1, unit: 'bottle', category: 'IRRIGATION', size: '500 ml' },
      { name: 'Nylon suture', quantity: 1, unit: 'piece', category: 'SUTURES', size: '10-0' },
      { name: 'Eye pad + shield', quantity: 1, unit: 'piece', category: 'DRESSING_PACKS' },
    ],
  },
  {
    name: 'Trabeculectomy / Pterygium — Drugs',
    subspecialty: 'Ophthalmology',
    kind: 'PHARMACY',
    sortOrder: 11,
    description: 'Antifibrotic-assisted glaucoma/pterygium surgery. Wired to Pharmacy.',
    drugs: [
      { name: 'Mitomycin C (MMC)', quantity: 1, unit: 'vial', drugType: 'OTHER', dosage: '0.02% (0.2 mg/ml)', route: 'Topical (intra-op)', notes: 'Antifibrotic — timed application, copious irrigation after.' },
      { name: '5-Fluorouracil (alternative)', quantity: 1, unit: 'vial', drugType: 'OTHER', dosage: '50 mg/ml', route: 'Topical/subconjunctival' },
      { name: 'Balanced Salt Solution (BSS) for irrigation', quantity: 1, unit: 'bottle', drugType: 'OTHER', dosage: '500 ml' },
      { name: 'Topical antibiotic-steroid drops', quantity: 1, unit: 'bottle', drugType: 'ANTIBIOTIC', route: 'Topical' },
    ],
  },
  {
    name: 'Intravitreal Injection (anti-VEGF) — Drugs',
    subspecialty: 'Ophthalmology',
    kind: 'PHARMACY',
    sortOrder: 12,
    description: 'IVI anti-VEGF / triamcinolone. Wired to Pharmacy.',
    drugs: [
      { name: 'Bevacizumab (Avastin) — anti-VEGF', quantity: 1, unit: 'vial', drugType: 'OTHER', dosage: '1.25 mg/0.05 ml', route: 'Intravitreal', notes: 'Aliquot under sterile conditions.' },
      { name: 'Triamcinolone (Kenalog)', quantity: 1, unit: 'vial', drugType: 'OTHER', dosage: '4 mg/0.1 ml', route: 'Intravitreal/Intralesional' },
      { name: 'Povidone-iodine 5% (ocular)', quantity: 1, unit: 'bottle', drugType: 'ANTISEPTIC', route: 'Topical', notes: 'Pre-injection asepsis.' },
      { name: 'Proparacaine (topical anaesthetic)', quantity: 1, unit: 'bottle', drugType: 'ANAESTHETIC_ADJUNCT', route: 'Topical' },
    ],
  },

  // ------------------------------------------------------------------ UROLOGY
  {
    name: 'Urology — Standard Consumables',
    subspecialty: 'Urology',
    kind: 'CONSUMABLE',
    sortOrder: 0,
    description: 'Default urology consumables.',
    consumables: [
      { name: 'Vicryl suture', quantity: 3, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Vicryl suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '3-0' },
      { name: 'Nylon suture (skin)', quantity: 1, unit: 'piece', category: 'SUTURES', size: '2-0' },
      ...C.blades(),
      ...C.diathermy(),
      ...C.suction(),
      { name: '3-way Foley catheter', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING', size: '20–22 Fr' },
      { name: 'Urine drainage bag', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Bladder irrigation set', quantity: 1, unit: 'piece', category: 'IRRIGATION' },
      ...C.specimen(),
    ],
  },
  {
    name: 'Urology — Antibiotics & Irrigation',
    subspecialty: 'Urology',
    kind: 'PHARMACY',
    sortOrder: 1,
    description: 'Prophylaxis + irrigation for urinary-tract surgery. Wired to Pharmacy.',
    drugs: [
      { name: 'Ceftriaxone', quantity: 1, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '1 g', route: 'IV', notes: penAllergyNote },
      { name: 'Gentamicin', quantity: 1, unit: 'ampoule', drugType: 'ANTIBIOTIC', dosage: '5 mg/kg', route: 'IV', notes: 'For instrumentation / entering urinary tract.' },
      { name: 'Ciprofloxacin (for prostate biopsy)', quantity: 1, unit: 'tablet', drugType: 'ANTIBIOTIC', dosage: '500 mg', route: 'PO/IV' },
      { name: 'Sterile water / Glycine for irrigation', quantity: 3, unit: 'litre', drugType: 'IV_FLUID', dosage: '3 L', route: 'Irrigation', notes: 'Glycine for monopolar TURP; saline for bipolar.' },
      ...stdFluids(),
      ...analgesia(),
    ],
  },
  {
    name: 'Open Prostatectomy / TVP — Consumables',
    subspecialty: 'Urology',
    kind: 'CONSUMABLE',
    sortOrder: 10,
    description: 'Open transvesical/retropubic prostatectomy.',
    consumables: [
      { name: 'Vicryl suture', quantity: 4, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Vicryl suture (haemostatic)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '0' },
      { name: 'PDS/Vicryl (bladder)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: '3-way Foley catheter', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING', size: '22 Fr' },
      { name: 'Suprapubic catheter', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Bladder irrigation set + drainage bag', quantity: 1, unit: 'set', category: 'IRRIGATION' },
      { name: 'Pelvic/retropubic drain', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      ...C.diathermy(),
      ...C.suction(),
      ...C.specimen(),
    ],
  },
  {
    name: 'Nephrectomy — Consumables',
    subspecialty: 'Urology',
    kind: 'CONSUMABLE',
    sortOrder: 11,
    description: 'Simple/radical/nephroureterectomy.',
    consumables: [
      { name: 'Vicryl suture', quantity: 4, unit: 'piece', category: 'SUTURES', size: '1' },
      { name: 'Prolene suture (vascular)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '4-0' },
      { name: 'Vascular ties / Vicryl', quantity: 4, unit: 'piece', category: 'SUTURES', size: '0' },
      { name: 'Haemostatic clips (Hem-o-lok/Ligaclip)', quantity: 1, unit: 'pack', category: 'OTHER' },
      { name: 'Large closed-suction drain', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      ...C.diathermy(),
      ...C.suction(),
      ...C.catheter(),
      ...C.specimen(),
    ],
  },
  {
    name: 'Prostate Biopsy — Consumables',
    subspecialty: 'Urology',
    kind: 'CONSUMABLE',
    sortOrder: 12,
    description: 'TRUS/transperineal prostate biopsy.',
    consumables: [
      { name: 'Biopsy needle (18G, spring-loaded)', quantity: 1, unit: 'piece', category: 'SYRINGES_NEEDLES', size: '18G' },
      { name: 'Biopsy gun (reusable/disposable)', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Formalin specimen bottles (labelled by site)', quantity: 6, unit: 'bottle', category: 'OTHER' },
      { name: 'Sterile lubricating jelly', quantity: 1, unit: 'sachet', category: 'CATHETERS_TUBING' },
      { name: 'Sterile gloves + probe cover', quantity: 1, unit: 'set', category: 'GLOVES' },
    ],
  },
  {
    name: 'Orchidectomy / Scrotal — Consumables',
    subspecialty: 'Urology',
    kind: 'CONSUMABLE',
    sortOrder: 13,
    description: 'Bilateral total orchidectomy / orchidopexy.',
    consumables: [
      { name: 'Vicryl suture', quantity: 3, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Vicryl suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '3-0' },
      { name: 'Vicryl (scrotal skin)', quantity: 1, unit: 'piece', category: 'SUTURES', size: '3-0' },
      ...C.blades(),
      ...C.diathermy(),
      ...C.specimen(),
    ],
  },

  // ------------------------------------------------------------------ ORTHOPAEDICS
  {
    name: 'Orthopaedics — Standard Consumables',
    subspecialty: 'Orthopaedics',
    kind: 'CONSUMABLE',
    sortOrder: 0,
    description: 'Default orthopaedic consumables.',
    consumables: [
      { name: 'Pneumatic tourniquet cuff + wrap', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Pulse lavage / bulb irrigation', quantity: 1, unit: 'set', category: 'IRRIGATION' },
      { name: 'Normal saline for irrigation', quantity: 3, unit: 'litre', category: 'IRRIGATION' },
      { name: 'Vicryl suture (deep)', quantity: 3, unit: 'piece', category: 'SUTURES', size: '1' },
      { name: 'Nylon/staples (skin)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '2-0' },
      ...C.blades(),
      ...C.diathermy(),
      ...C.suction(),
      { name: 'Closed-suction drain', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Plaster of Paris / synthetic cast + wool', quantity: 1, unit: 'set', category: 'DRESSING_PACKS' },
      ...C.specimen(),
    ],
  },
  {
    name: 'Orthopaedics — Antibiotics & Fluids',
    subspecialty: 'Orthopaedics',
    kind: 'PHARMACY',
    sortOrder: 1,
    description: 'Implant/trauma prophylaxis + fluids. Wired to Pharmacy.',
    drugs: [
      { name: 'Cefazolin (or Ceftriaxone 1 g)', quantity: 2, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '2 g', route: 'IV', notes: penAllergyNote + ' Implant surgery — strict timing; re-dose intra-op.' },
      { name: 'Tranexamic acid', quantity: 1, unit: 'ampoule', drugType: 'HAEMOSTATIC', dosage: '1 g', route: 'IV', notes: 'Reduce peri-op blood loss.' },
      ...stdFluids(true),
      ...analgesia(),
    ],
  },
  {
    name: 'ORIF (Plate/Nail) — Implants & Consumables',
    subspecialty: 'Orthopaedics',
    kind: 'CONSUMABLE',
    sortOrder: 10,
    description: 'Open reduction & internal fixation — plate/screws or IM nail. Confirm implant sizes from templating.',
    consumables: [
      { name: 'Bone plate (DCP/locking) — size per templating', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Cortical/cancellous/locking screws (assorted)', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Intramedullary nail + locking bolts (if nailing)', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'K-wires (assorted)', quantity: 1, unit: 'pack', category: 'OTHER' },
      { name: 'Cerclage wire', quantity: 1, unit: 'roll', category: 'OTHER' },
      { name: 'Drill bits + guide', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Saw blade / oscillating', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Pulse lavage + saline 3 L', quantity: 1, unit: 'set', category: 'IRRIGATION' },
      ...C.diathermy(),
      ...C.suction(),
      { name: 'Closed-suction drain', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
    ],
  },
  {
    name: 'Amputation (AKA/BKA) — Consumables',
    subspecialty: 'Orthopaedics',
    kind: 'CONSUMABLE',
    sortOrder: 11,
    description: 'Above/below-knee amputation / stump refashioning.',
    consumables: [
      { name: 'Amputation saw (Gigli/oscillating) blade', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Bone file/rasp', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Vicryl suture (muscle/fascia)', quantity: 4, unit: 'piece', category: 'SUTURES', size: '1' },
      { name: 'Vicryl suture (ligature)', quantity: 4, unit: 'piece', category: 'SUTURES', size: '0' },
      { name: 'Nylon suture (skin)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Bone wax', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Closed-suction drain', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Stump/compression dressing + crepe', quantity: 1, unit: 'set', category: 'DRESSING_PACKS' },
      ...C.diathermy(),
      ...C.suction(),
      ...C.specimen(),
    ],
  },
  {
    name: 'Arthrotomy & Lavage — Consumables',
    subspecialty: 'Orthopaedics',
    kind: 'CONSUMABLE',
    sortOrder: 12,
    description: 'Septic arthritis washout.',
    consumables: [
      { name: 'Normal saline for lavage', quantity: 6, unit: 'litre', category: 'IRRIGATION' },
      { name: 'Pulse lavage set', quantity: 1, unit: 'set', category: 'IRRIGATION' },
      { name: 'Vicryl suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Nylon suture (skin)', quantity: 1, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Corrugated/closed drain', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Microbiology specimen containers (C/S)', quantity: 3, unit: 'piece', category: 'OTHER' },
      ...C.suction(),
    ],
  },

  // ------------------------------------------------------------------ PAEDIATRIC SURGERY
  {
    name: 'Paediatric Surgery — Standard Consumables',
    subspecialty: 'Paediatric Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 0,
    description: 'Default paediatric consumables (fine sutures, small-bore tubes).',
    consumables: [
      { name: 'Vicryl suture', quantity: 3, unit: 'piece', category: 'SUTURES', size: '3-0' },
      { name: 'Vicryl suture', quantity: 3, unit: 'piece', category: 'SUTURES', size: '4-0' },
      { name: 'Monocryl suture (subcuticular)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '5-0' },
      { name: 'Scalpel blade No. 15', quantity: 2, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Bipolar diathermy + lead', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
      ...C.suction(),
      { name: 'Paediatric Foley catheter', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING', size: '8–10 Fr' },
      { name: 'Paediatric NG/feeding tube', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING', size: '8 Fr' },
      ...C.specimen(),
    ],
  },
  {
    name: 'Paediatric Surgery — Antibiotics & Fluids',
    subspecialty: 'Paediatric Surgery',
    kind: 'PHARMACY',
    sortOrder: 1,
    description: 'Weight-based prophylaxis + fluids. Wired to Pharmacy — confirm weight-based dosing.',
    drugs: [
      { name: 'Cefuroxime', quantity: 1, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '50 mg/kg', route: 'IV', notes: penAllergyNote + ' Paediatric — dose strictly by weight.' },
      { name: 'Metronidazole', quantity: 1, unit: 'bag', drugType: 'ANTIBIOTIC', dosage: '7.5 mg/kg', route: 'IV', notes: 'For contaminated/GI cases.' },
      { name: "Ringer's Lactate / 0.45% saline+dextrose (maintenance)", quantity: 1, unit: 'bag', drugType: 'IV_FLUID', dosage: 'per weight', route: 'IV' },
      { name: 'Paracetamol (IV/PR)', quantity: 1, unit: 'vial', drugType: 'ANALGESIC', dosage: '15 mg/kg', route: 'IV/PR' },
      { name: 'Bupivacaine 0.25% (caudal/wound)', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', dosage: 'max 2 mg/kg', route: 'Infiltration/Caudal' },
    ],
  },
  {
    name: 'Inguinal Herniotomy — Consumables',
    subspecialty: 'Paediatric Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 10,
    description: 'Paediatric inguinal herniotomy / orchidopexy (no mesh).',
    consumables: [
      { name: 'Vicryl suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '3-0' },
      { name: 'Vicryl suture (sac transfixion)', quantity: 1, unit: 'piece', category: 'SUTURES', size: '4-0' },
      { name: 'Monocryl (subcuticular)', quantity: 1, unit: 'piece', category: 'SUTURES', size: '5-0' },
      { name: 'Scalpel blade No. 15', quantity: 1, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Bipolar diathermy + lead', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
      { name: 'Skin glue / adhesive strips', quantity: 1, unit: 'piece', category: 'DRESSING_PACKS' },
    ],
  },
  {
    name: 'Hypospadias / Genital Repair — Consumables',
    subspecialty: 'Paediatric Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 11,
    description: 'Hypospadias/epispadias repair, meatoplasty, fistula repair.',
    consumables: [
      { name: 'Fine absorbable suture (PDS/Vicryl)', quantity: 3, unit: 'piece', category: 'SUTURES', size: '6-0' },
      { name: 'Fine absorbable suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '7-0' },
      { name: 'Paediatric urethral catheter/stent', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING', size: '6–8 Fr' },
      { name: 'Fine bipolar diathermy + lead', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
      { name: 'Optical magnification loupes drape', quantity: 1, unit: 'piece', category: 'GOWNS_DRAPES' },
      { name: 'Compressive penile dressing', quantity: 1, unit: 'set', category: 'DRESSING_PACKS' },
    ],
  },
  {
    name: 'Paediatric Colostomy / Ex-lap — Consumables',
    subspecialty: 'Paediatric Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 12,
    description: 'Colostomy (± rectal biopsy), exploratory laparotomy, PSARP.',
    consumables: [
      { name: 'Vicryl suture', quantity: 3, unit: 'piece', category: 'SUTURES', size: '3-0' },
      { name: 'Vicryl suture (bowel)', quantity: 3, unit: 'piece', category: 'SUTURES', size: '4-0' },
      { name: 'Monocryl (skin)', quantity: 1, unit: 'piece', category: 'SUTURES', size: '5-0' },
      { name: 'Paediatric stoma appliance', quantity: 1, unit: 'piece', category: 'DRESSING_PACKS' },
      { name: 'Paediatric NG tube', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING', size: '8 Fr' },
      { name: 'Bipolar diathermy + lead', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
      ...C.suction(),
      ...C.specimen(),
    ],
  },

  // ------------------------------------------------------------------ PLASTIC SURGERY
  {
    name: 'Plastic Surgery — Standard Consumables',
    subspecialty: 'Plastic Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 0,
    description: 'Default plastic/reconstructive consumables.',
    consumables: [
      { name: 'Monocryl suture', quantity: 3, unit: 'piece', category: 'SUTURES', size: '4-0' },
      { name: 'Nylon suture', quantity: 3, unit: 'piece', category: 'SUTURES', size: '4-0' },
      { name: 'Nylon suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '5-0' },
      { name: 'Vicryl suture (deep)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '3-0' },
      { name: 'Scalpel blade No. 15', quantity: 2, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Bipolar diathermy + lead', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
      { name: 'Skin marker + ruler', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Paraffin/tulle gras (non-adherent) gauze', quantity: 2, unit: 'piece', category: 'STERILE_DRESSINGS' },
      ...C.specimen(),
    ],
  },
  {
    name: 'Plastic Surgery — Local Anaesthetic & Antibiotics',
    subspecialty: 'Plastic Surgery',
    kind: 'PHARMACY',
    sortOrder: 1,
    description: 'Infiltration anaesthesia + prophylaxis. Wired to Pharmacy.',
    drugs: [
      { name: 'Lignocaine 2% with Adrenaline 1:200,000', quantity: 2, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', dosage: 'max 7 mg/kg (with adrenaline)', route: 'Infiltration', notes: 'Avoid adrenaline in digits/appendages.' },
      { name: 'Bupivacaine 0.5%', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', dosage: 'max 2 mg/kg', route: 'Infiltration/Block' },
      { name: 'Cefazolin (or Ceftriaxone 1 g)', quantity: 1, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '2 g', route: 'IV', notes: penAllergyNote },
      { name: 'Triamcinolone (Kenalog) — keloid', quantity: 1, unit: 'vial', drugType: 'OTHER', dosage: '10–40 mg/ml', route: 'Intralesional' },
      ...analgesia(),
    ],
  },
  {
    name: 'Skin Grafting (STSG) — Consumables',
    subspecialty: 'Plastic Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 10,
    description: 'Split-thickness skin graft harvest + application.',
    consumables: [
      { name: 'Humby/Watson knife blade (or dermatome blade)', quantity: 1, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Skin graft mesher / mesh plate', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Mineral oil / liquid paraffin (glide)', quantity: 1, unit: 'bottle', category: 'SKIN_PREP' },
      { name: 'Staples / Chromic 4-0 (graft fixation)', quantity: 1, unit: 'piece', category: 'SUTURES', size: '4-0' },
      { name: 'Paraffin/tulle gras (non-adherent) gauze', quantity: 3, unit: 'piece', category: 'STERILE_DRESSINGS' },
      { name: 'Tie-over / foam bolster dressing', quantity: 1, unit: 'set', category: 'DRESSING_PACKS' },
      { name: 'Donor-site dressing (alginate/foam)', quantity: 1, unit: 'set', category: 'DRESSING_PACKS' },
      ...C.suction(),
    ],
  },
  {
    name: 'Flap Cover / Tendon Repair — Consumables',
    subspecialty: 'Plastic Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 11,
    description: 'Local/regional flap cover, wound exploration + tendon repair.',
    consumables: [
      { name: 'Nylon suture', quantity: 3, unit: 'piece', category: 'SUTURES', size: '4-0' },
      { name: 'Nylon/Prolene suture (tendon core)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '3-0' },
      { name: 'PDS suture (tendon)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '4-0' },
      { name: 'Monocryl suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '5-0' },
      { name: 'Fine skin hooks / vessel loops', quantity: 1, unit: 'pack', category: 'OTHER' },
      { name: 'Bipolar diathermy + lead', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
      { name: 'Volar/plaster splint + wool', quantity: 1, unit: 'set', category: 'DRESSING_PACKS' },
      ...C.suction(),
    ],
  },

  // ------------------------------------------------------------------ CARDIOTHORACIC SURGERY
  {
    name: 'Cardiothoracic — Standard Consumables',
    subspecialty: 'Cardiothoracic Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 0,
    description: 'Default thoracic consumables.',
    consumables: [
      { name: 'Chest drain (intercostal)', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING', size: '28–32 Fr' },
      { name: 'Underwater-seal drainage bottle/system', quantity: 1, unit: 'set', category: 'CATHETERS_TUBING' },
      { name: 'Prolene suture (vascular)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '4-0' },
      { name: 'Vicryl suture', quantity: 3, unit: 'piece', category: 'SUTURES', size: '1' },
      { name: 'Nylon suture (drain/skin)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '2-0' },
      ...C.blades(),
      ...C.diathermy(),
      ...C.suction(),
      ...C.specimen(),
    ],
  },
  {
    name: 'Cardiothoracic — Antibiotics & Fluids',
    subspecialty: 'Cardiothoracic Surgery',
    kind: 'PHARMACY',
    sortOrder: 1,
    description: 'Thoracic prophylaxis + fluids. Wired to Pharmacy.',
    drugs: [
      { name: 'Cefuroxime (or Cefazolin 2 g)', quantity: 2, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '1.5 g', route: 'IV', notes: penAllergyNote + ' Re-dose for long cases.' },
      { name: 'Bupivacaine 0.5% (intercostal/paravertebral)', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', dosage: 'max 2 mg/kg', route: 'Block' },
      { name: 'Tranexamic acid', quantity: 1, unit: 'ampoule', drugType: 'HAEMOSTATIC', dosage: '1 g', route: 'IV' },
      ...stdFluids(true),
      ...analgesia(),
    ],
  },
  {
    name: 'Thoracotomy / Lobectomy — Consumables',
    subspecialty: 'Cardiothoracic Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 10,
    description: 'Open thoracotomy, lobectomy/decortication.',
    consumables: [
      { name: 'Prolene suture (vascular/bronchus)', quantity: 3, unit: 'piece', category: 'SUTURES', size: '3-0' },
      { name: 'Prolene suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '4-0' },
      { name: 'Linear stapler + vascular/parenchyma reloads', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Chest drains', quantity: 2, unit: 'piece', category: 'CATHETERS_TUBING', size: '28–32 Fr' },
      { name: 'Underwater-seal drainage system', quantity: 1, unit: 'set', category: 'CATHETERS_TUBING' },
      { name: 'Pericostal / heavy Vicryl (rib approximation)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '1' },
      { name: 'Absorbable haemostat (Surgicel)', quantity: 2, unit: 'piece', category: 'OTHER' },
      ...C.diathermy(),
      ...C.suction(),
      ...C.specimen(),
    ],
  },
  {
    name: 'PDA Ligation — Consumables',
    subspecialty: 'Cardiothoracic Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 11,
    description: 'Ligation of patent ductus arteriosus (paediatric).',
    consumables: [
      { name: 'Silk/Prolene ties (ductal ligation)', quantity: 3, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Haemostatic clips (ductal)', quantity: 1, unit: 'pack', category: 'OTHER' },
      { name: 'Prolene suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '5-0' },
      { name: 'Paediatric chest drain', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING', size: '16–20 Fr' },
      { name: 'Underwater-seal drainage system', quantity: 1, unit: 'set', category: 'CATHETERS_TUBING' },
      { name: 'Fine bipolar + lead', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
      ...C.suction(),
    ],
  },
  {
    name: 'Sternotomy / Varicose (SFJ) — Consumables',
    subspecialty: 'Cardiothoracic Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 12,
    description: 'Sternotomy + thyroidectomy, or SFJ/varicose-vein ligation & stripping.',
    consumables: [
      { name: 'Sternal wire', quantity: 1, unit: 'pack', category: 'OTHER' },
      { name: 'Bone wax', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Prolene suture (vascular)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '4-0' },
      { name: 'Vein stripper (disposable)', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Vicryl / Silk ties', quantity: 4, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Compression bandage (limb)', quantity: 1, unit: 'set', category: 'DRESSING_PACKS' },
      ...C.diathermy(),
      ...C.suction(),
      ...C.specimen(),
    ],
  },

  // ------------------------------------------------------------------ MAXILLOFACIAL SURGERY
  {
    name: 'Maxillofacial — Standard Consumables',
    subspecialty: 'Maxillofacial Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 0,
    description: 'Default OMFS consumables.',
    consumables: [
      { name: 'Vicryl suture', quantity: 3, unit: 'piece', category: 'SUTURES', size: '3-0' },
      { name: 'Vicryl suture (mucosa)', quantity: 3, unit: 'piece', category: 'SUTURES', size: '4-0' },
      { name: 'Nylon suture (skin)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '5-0' },
      { name: 'Scalpel blade No. 15', quantity: 2, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Bipolar diathermy + lead', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
      ...C.suction(),
      { name: 'Corrugated/closed drain', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      ...C.specimen(),
    ],
  },
  {
    name: 'Maxillofacial — Antibiotics & Local Anaesthetic',
    subspecialty: 'Maxillofacial Surgery',
    kind: 'PHARMACY',
    sortOrder: 1,
    description: 'Oral/facial prophylaxis (oral flora) + LA. Wired to Pharmacy.',
    drugs: [
      { name: 'Co-amoxiclav (Augmentin)', quantity: 1, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '1.2 g', route: 'IV', notes: penAllergyNote + ' Covers oral flora.' },
      { name: 'Metronidazole', quantity: 1, unit: 'bag', drugType: 'ANTIBIOTIC', dosage: '500 mg', route: 'IV' },
      { name: 'Lignocaine 2% with Adrenaline 1:80,000 (dental)', quantity: 2, unit: 'cartridge', drugType: 'ANAESTHETIC_ADJUNCT', route: 'Infiltration/Block' },
      { name: 'Dexamethasone (facial swelling)', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '8 mg', route: 'IV' },
      ...analgesia(),
    ],
  },
  {
    name: 'Facial Fracture ORIF — Plates & Consumables',
    subspecialty: 'Maxillofacial Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 10,
    description: 'ORIF of mandible/mid-face fractures; MMF.',
    consumables: [
      { name: 'Titanium mini/micro plates (assorted)', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Mono-cortical/bi-cortical screws (assorted)', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'MMF screws / arch bars + wires', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Drill bits + irrigation', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Vicryl suture (mucosa)', quantity: 3, unit: 'piece', category: 'SUTURES', size: '3-0' },
      { name: 'Nylon suture (skin)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '5-0' },
      ...C.suction(),
    ],
  },
  {
    name: 'Mandibulectomy / Tumour Excision — Consumables',
    subspecialty: 'Maxillofacial Surgery',
    kind: 'CONSUMABLE',
    sortOrder: 11,
    description: 'Segmental/hemi-mandibulectomy ± reconstruction plate.',
    consumables: [
      { name: 'Reconstruction plate + locking screws', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Reciprocating/oscillating saw blade', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Vicryl suture', quantity: 4, unit: 'piece', category: 'SUTURES', size: '3-0' },
      { name: 'Nylon suture (skin)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '4-0' },
      { name: 'Closed-suction drain', quantity: 2, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Bone wax', quantity: 1, unit: 'piece', category: 'OTHER' },
      ...C.diathermy(),
      ...C.suction(),
      ...C.specimen(),
    ],
  },

  // ------------------------------------------------------------------ ENT (OTORHINOLARYNGOLOGY)
  {
    name: 'ENT — Standard Consumables',
    subspecialty: 'ENT (Otorhinolaryngology)',
    kind: 'CONSUMABLE',
    sortOrder: 0,
    description: 'Default ENT consumables.',
    consumables: [
      { name: 'Throat pack', quantity: 1, unit: 'piece', category: 'STERILE_DRESSINGS' },
      { name: 'Bipolar diathermy forceps + lead', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
      { name: 'Fine suction catheters (assorted)', quantity: 2, unit: 'piece', category: 'SUCTION' },
      { name: 'Vicryl suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '3-0' },
      { name: 'Nylon suture (skin)', quantity: 1, unit: 'piece', category: 'SUTURES', size: '4-0' },
      { name: 'Neuro-patties / ribbon gauze (nasal)', quantity: 1, unit: 'pack', category: 'STERILE_DRESSINGS' },
      ...C.specimen(),
    ],
  },
  {
    name: 'ENT — Antibiotics & Adjuncts',
    subspecialty: 'ENT (Otorhinolaryngology)',
    kind: 'PHARMACY',
    sortOrder: 1,
    description: 'ENT prophylaxis + PONV/oedema adjuncts. Wired to Pharmacy.',
    drugs: [
      { name: 'Co-amoxiclav (Augmentin)', quantity: 1, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '1.2 g', route: 'IV', notes: penAllergyNote },
      { name: 'Dexamethasone', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '8 mg', route: 'IV', notes: 'Reduces PONV & oedema (esp. tonsillectomy).' },
      { name: 'Lignocaine 2% with Adrenaline 1:100,000', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', route: 'Infiltration', notes: 'Haemostasis + analgesia.' },
      { name: 'Adrenaline 1:1000 (topical soaks)', quantity: 1, unit: 'ampoule', drugType: 'OTHER', route: 'Topical', notes: 'Tonsillar-bed / nasal haemostasis.' },
      ...analgesia(),
    ],
  },
  {
    name: 'Adenotonsillectomy — Consumables',
    subspecialty: 'ENT (Otorhinolaryngology)',
    kind: 'CONSUMABLE',
    sortOrder: 10,
    description: 'Adenotonsillectomy / tonsillectomy.',
    consumables: [
      { name: 'Boyle-Davis mouth gag + blades', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Tonsillar swabs (on holder)', quantity: 5, unit: 'piece', category: 'STERILE_DRESSINGS' },
      { name: 'Adenoid curette', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Bipolar diathermy forceps + lead', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
      { name: 'Vicryl tie (tonsillar pillar, if needed)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Fine suction (tonsil sucker)', quantity: 1, unit: 'piece', category: 'SUCTION' },
      ...C.specimen(),
    ],
  },
  {
    name: 'Tracheostomy — Consumables',
    subspecialty: 'ENT (Otorhinolaryngology)',
    kind: 'CONSUMABLE',
    sortOrder: 11,
    description: 'Emergency/elective tracheostomy.',
    consumables: [
      { name: 'Tracheostomy tube (cuffed) + spare', quantity: 2, unit: 'piece', category: 'ANAESTHESIA_AIRWAY', size: '7.0–8.0' },
      { name: 'Tracheal dilator + hook (in set)', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Vicryl suture', quantity: 2, unit: 'piece', category: 'SUTURES', size: '3-0' },
      { name: 'Nylon suture (stay/skin)', quantity: 2, unit: 'piece', category: 'SUTURES', size: '2-0' },
      { name: 'Tracheostomy tape/ties + keyhole dressing', quantity: 1, unit: 'set', category: 'DRESSING_PACKS' },
      { name: 'Fine suction catheters', quantity: 3, unit: 'piece', category: 'SUCTION' },
      ...C.diathermy(),
    ],
  },
  {
    name: 'Laryngoscopy / Oesophagoscopy — Consumables',
    subspecialty: 'ENT (Otorhinolaryngology)',
    kind: 'CONSUMABLE',
    sortOrder: 12,
    description: 'Rigid laryngoscopy/oesophagoscopy ± biopsy / FB removal.',
    consumables: [
      { name: 'Microlaryngeal tube (MLT)', quantity: 1, unit: 'piece', category: 'ANAESTHESIA_AIRWAY', size: '5.0–6.0' },
      { name: 'Biopsy forceps (cup)', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Foreign-body grasping forceps', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Fine suction catheters', quantity: 2, unit: 'piece', category: 'SUCTION' },
      { name: 'Formalin specimen bottles', quantity: 2, unit: 'bottle', category: 'OTHER' },
      { name: 'Topical Lignocaine spray (airway)', quantity: 1, unit: 'bottle', category: 'ANAESTHESIA_AIRWAY' },
    ],
  },
];

// ===========================================================================
// SEED RUNNER (idempotent)
// ===========================================================================
export async function seedSurgicalPacks(
  prisma: PrismaClient,
  opts: { isActive?: boolean; createdByName?: string } = {},
): Promise<{ created: number; updated: number; packs: number; items: number }> {
  const isActive = opts.isActive ?? true;
  const createdByName = opts.createdByName ?? 'System Seed';

  let created = 0;
  let updated = 0;
  let itemCount = 0;

  for (const p of SURGICAL_PACK_SEED) {
    const rawItems = (p.kind === 'CONSUMABLE' ? p.consumables : p.drugs) ?? [];
    const items = rawItems.map((it, i) =>
      p.kind === 'CONSUMABLE'
        ? {
            name: it.name,
            quantity: it.quantity,
            unit: (it as ConsumableItem).unit ?? 'piece',
            category: (it as ConsumableItem).category ?? 'OTHER',
            size: (it as ConsumableItem).size ?? null,
            notes: (it as ConsumableItem).notes ?? null,
            sortOrder: i,
          }
        : {
            name: it.name,
            quantity: it.quantity,
            unit: (it as DrugItem).unit ?? 'vial',
            drugType: (it as DrugItem).drugType ?? 'OTHER',
            dosage: (it as DrugItem).dosage ?? null,
            route: (it as DrugItem).route ?? null,
            notes: (it as DrugItem).notes ?? null,
            sortOrder: i,
          },
    );
    itemCount += items.length;

    const existing = await prisma.surgicalPack.findFirst({
      where: { name: p.name, subspecialty: p.subspecialty, kind: p.kind as any },
      select: { id: true },
    });

    if (existing) {
      await prisma.surgicalPackItem.deleteMany({ where: { packId: existing.id } });
      await prisma.surgicalPack.update({
        where: { id: existing.id },
        data: {
          description: p.description ?? null,
          isActive,
          sortOrder: p.sortOrder ?? 0,
          items: { create: items as any },
        },
      });
      updated++;
    } else {
      await prisma.surgicalPack.create({
        data: {
          name: p.name,
          subspecialty: p.subspecialty,
          kind: p.kind as any,
          description: p.description ?? null,
          isActive,
          sortOrder: p.sortOrder ?? 0,
          createdByName,
          items: { create: items as any },
        },
      });
      created++;
    }
  }

  return { created, updated, packs: SURGICAL_PACK_SEED.length, items: itemCount };
}
