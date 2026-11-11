// ============================================================
// Ophthalmology packs — consumables, drugs, and the anaesthesia sets
// ------------------------------------------------------------
// Built to the same template as the hospital's shopping lists ("Surgical
// Consumables & Drugs Shopping Lists", Dr Nnadi Emmanuel Chibuike, v1.0,
// November 2026), which groups every procedure's materials as:
//
//     A  anaesthesia consumables      -> ANAESTHESIA::<technique>, CONSUMABLE
//     B  anaesthesia drugs            -> ANAESTHESIA::<technique>, PHARMACY
//     C  theatre, skin prep, dressings -\
//     D  procedure-specific & implants  >- Ophthalmology, CONSUMABLE
//     E  sutures                      -/
//     F  antibiotics, analgesics, other drugs -\
//     G  IV fluids                             >- Ophthalmology, PHARMACY
//
// That document covers ten specialties and NO eye surgery, so none of this is
// transcribed — it is written to its shape and conventions. Which is exactly
// why every pack here is seeded INACTIVE.
//
// WHY INACTIVE MATTERS. SurgicalPack.isActive defaults to false and is
// described in the schema as "draft until an admin activates it". A pack that
// is wrong in a way nobody notices is worse than no pack: it is handed to a
// relative as a shopping list, and they buy it. Ophthalmic materials are
// where that bites hardest — viscoelastic, an IOL of the wrong power or
// platform, mitomycin at the wrong concentration. So these are drafts for an
// ophthalmologist to read line by line and activate, not a list to hand out.
//
// Quantities are indicative for one average adult eye unless the pack says
// otherwise, covering the operation and the first 24-72 hours. Brand names
// indicate the TYPE of item; any registered equivalent may be used.
// ============================================================

/** A SurgicalConsumableCategory value. */
export type ConsumableCategory =
  | 'GLOVES' | 'GOWNS_DRAPES' | 'SUTURES' | 'SYRINGES_NEEDLES' | 'CATHETERS_TUBING'
  | 'DRESSING_PACKS' | 'SKIN_PREP' | 'CLEANING_SOLUTION' | 'STERILE_DRESSINGS'
  | 'IRRIGATION' | 'DIATHERMY' | 'SUCTION' | 'ANAESTHESIA_AIRWAY' | 'PPE' | 'OTHER';

/** A SurgicalDrugDressingType value. */
export type DrugType =
  | 'ANTIBIOTIC' | 'ANALGESIC' | 'ANAESTHETIC_ADJUNCT' | 'IV_FLUID'
  | 'WOUND_DRESSING_AGENT' | 'ANTISEPTIC' | 'HAEMOSTATIC' | 'OTHER';

export interface PackItemSeed {
  name: string;
  quantity: number;
  unit: string;
  /** Consumable packs only. */
  category?: ConsumableCategory;
  size?: string;
  /** Pharmacy packs only. */
  drugType?: DrugType;
  dosage?: string;
  route?: string;
  notes?: string;
}

export interface PackSeed {
  name: string;
  /** 'Ophthalmology', or 'ANAESTHESIA::<technique>' for an anaesthesia set. */
  subspecialty: string;
  kind: 'CONSUMABLE' | 'PHARMACY';
  description: string;
  items: PackItemSeed[];
}

export const ANAESTHESIA_PREFIX = 'ANAESTHESIA::';

// ---------------------------------------------------------------------------
// Section C — the theatre, prep and dressing items every eye case opens with.
//
// Shared rather than repeated so that a correction (the iodine strength, say)
// is made once. Povidone-iodine 5% AQUEOUS is the one that goes in the eye;
// the 10% skin preparation must not, and both are listed because both are on
// the trolley and the difference is not obvious from the bottle.
// ---------------------------------------------------------------------------
const theatreBase = (): PackItemSeed[] => [
  { name: 'Sterile surgical gloves (size as required)', quantity: 3, unit: 'pair', category: 'GLOVES' },
  { name: 'Ophthalmic adhesive drape with fluid pouch', quantity: 1, unit: 'piece', category: 'GOWNS_DRAPES' },
  { name: 'Sterile gown', quantity: 2, unit: 'piece', category: 'GOWNS_DRAPES' },
  { name: 'Gauze swabs 10 x 10 cm', quantity: 1, unit: 'pack', category: 'DRESSING_PACKS' },
  { name: 'Cellulose surgical spears (Weck-cel type)', quantity: 1, unit: 'pack', category: 'DRESSING_PACKS' },
  { name: 'Povidone-iodine 5% aqueous ophthalmic solution', quantity: 1, unit: 'bottle', category: 'SKIN_PREP', notes: 'For the conjunctival sac. NOT the 10% skin preparation.' },
  { name: 'Povidone-iodine 10% solution (periorbital skin)', quantity: 1, unit: 'bottle', category: 'SKIN_PREP' },
  { name: 'Balanced salt solution (BSS) 500 ml', quantity: 1, unit: 'bottle', category: 'IRRIGATION' },
  { name: 'Eye pad', quantity: 2, unit: 'piece', category: 'STERILE_DRESSINGS' },
  { name: 'Cartella eye shield', quantity: 1, unit: 'piece', category: 'STERILE_DRESSINGS' },
  { name: 'Adhesive plaster (zinc oxide) roll', quantity: 1, unit: 'roll', category: 'STERILE_DRESSINGS' },
];

/** Section F/G — what almost every eye case goes home on. */
const postOpDrops = (): PackItemSeed[] => [
  { name: 'Moxifloxacin 0.5% eye drops', quantity: 1, unit: 'bottle', drugType: 'ANTIBIOTIC', dosage: '1 drop', route: 'Topical', notes: 'Four times daily to the operated eye.' },
  { name: 'Prednisolone acetate 1% eye drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', dosage: '1 drop', route: 'Topical', notes: 'Tapering course as directed.' },
  { name: 'Tab. Paracetamol 1 g', quantity: 12, unit: 'tablet', drugType: 'ANALGESIC', dosage: '1 g', route: 'PO' },
];

const ivFluids = (bags = 1): PackItemSeed[] => [
  { name: 'Normal saline 0.9% 500 ml', quantity: bags, unit: 'bag', drugType: 'IV_FLUID', route: 'IV' },
];

// ===========================================================================
// ANAESTHESIA PACKS
// ---------------------------------------------------------------------------
// Stored in surgical_packs under the ANAESTHESIA:: prefix, which is how
// /api/anaesthesia-packs finds them. The technique is the part after the
// prefix, so it must read the way an anaesthetist would say it.
// ===========================================================================
const anaesthesiaPacks: PackSeed[] = [
  {
    name: 'Topical and intracameral — consumables',
    subspecialty: `${ANAESTHESIA_PREFIX}Topical and intracameral`,
    kind: 'CONSUMABLE',
    description: 'Section A for routine adult cataract surgery under drops.',
    items: [
      { name: 'IV cannula 20G', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING', notes: 'Access only; kept for the rare conversion.' },
      { name: 'Infusion (giving) set', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Syringe 2 ml', quantity: 2, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Syringe 5 ml', quantity: 2, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Hypodermic needle 23G', quantity: 4, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Anterior chamber cannula 27G', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'ECG electrodes', quantity: 3, unit: 'piece', category: 'OTHER' },
      { name: 'Examination gloves', quantity: 4, unit: 'pair', category: 'PPE' },
    ],
  },
  {
    name: 'Topical and intracameral — drugs',
    subspecialty: `${ANAESTHESIA_PREFIX}Topical and intracameral`,
    kind: 'PHARMACY',
    description: 'Section B for routine adult cataract surgery under drops.',
    items: [
      { name: 'Tetracaine 0.5% (or proparacaine 0.5%) eye drops', quantity: 1, unit: 'bottle', drugType: 'ANAESTHETIC_ADJUNCT', route: 'Topical' },
      { name: 'Lidocaine 1% preservative-free 5 ml', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '0.5 ml', route: 'Intracameral', notes: 'PRESERVATIVE-FREE only. Preserved lidocaine is toxic to the endothelium.' },
      { name: 'Phenylephrine 2.5% eye drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'Topical' },
      { name: 'Tropicamide 1% eye drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'Topical' },
      { name: 'Inj. Midazolam 5 mg', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '1-2 mg', route: 'IV', notes: 'Sedation if required.' },
    ],
  },
  {
    name: "Sub-Tenon's block — consumables",
    subspecialty: `${ANAESTHESIA_PREFIX}Sub-Tenon's block`,
    kind: 'CONSUMABLE',
    description: 'Section A for a blunt cannula block.',
    items: [
      { name: "Sub-Tenon's cannula (Southampton type)", quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Westcott spring scissors (single-use)', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Non-toothed conjunctival forceps (single-use)', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Syringe 5 ml', quantity: 2, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'IV cannula 20G', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Infusion (giving) set', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'ECG electrodes', quantity: 3, unit: 'piece', category: 'OTHER' },
      { name: 'Examination gloves', quantity: 4, unit: 'pair', category: 'PPE' },
    ],
  },
  {
    name: "Sub-Tenon's block — drugs",
    subspecialty: `${ANAESTHESIA_PREFIX}Sub-Tenon's block`,
    kind: 'PHARMACY',
    description: 'Section B for a blunt cannula block.',
    items: [
      { name: 'Tetracaine 0.5% (or proparacaine 0.5%) eye drops', quantity: 1, unit: 'bottle', drugType: 'ANAESTHETIC_ADJUNCT', route: 'Topical' },
      { name: 'Inj. Lidocaine 2% 20 ml', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '3-5 ml', route: "Sub-Tenon's" },
      { name: 'Inj. Bupivacaine 0.5% 20 ml', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', notes: 'Mixed with lidocaine where a longer block is wanted.' },
      { name: 'Hyaluronidase 1500 IU', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT' },
      { name: 'Inj. Midazolam 5 mg', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '1-2 mg', route: 'IV' },
    ],
  },
  {
    name: 'Peribulbar block — consumables',
    subspecialty: `${ANAESTHESIA_PREFIX}Peribulbar block`,
    kind: 'CONSUMABLE',
    description: 'Section A for a needle block.',
    items: [
      { name: 'Blunt-tip block needle 25G 25 mm', quantity: 2, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Syringe 10 ml', quantity: 2, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Syringe 5 ml', quantity: 2, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'IV cannula 20G', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Infusion (giving) set', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Honan balloon or ocular compression device', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'ECG electrodes', quantity: 3, unit: 'piece', category: 'OTHER' },
      { name: 'Examination gloves', quantity: 4, unit: 'pair', category: 'PPE' },
    ],
  },
  {
    name: 'Peribulbar block — drugs',
    subspecialty: `${ANAESTHESIA_PREFIX}Peribulbar block`,
    kind: 'PHARMACY',
    description: 'Section B for a needle block.',
    items: [
      { name: 'Inj. Lidocaine 2% 20 ml', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '5-8 ml', route: 'Peribulbar' },
      { name: 'Inj. Bupivacaine 0.5% 20 ml', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT' },
      { name: 'Hyaluronidase 1500 IU', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT' },
      { name: 'Tetracaine 0.5% (or proparacaine 0.5%) eye drops', quantity: 1, unit: 'bottle', drugType: 'ANAESTHETIC_ADJUNCT', route: 'Topical' },
      { name: 'Inj. Midazolam 5 mg', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '1-2 mg', route: 'IV' },
    ],
  },
  {
    name: 'General anaesthesia, adult eye — consumables',
    subspecialty: `${ANAESTHESIA_PREFIX}General anaesthesia (adult eye)`,
    kind: 'CONSUMABLE',
    description: 'Section A where the eye case needs a tube: long cases, anxious patients, open globes.',
    items: [
      { name: 'Endotracheal tube, cuffed (size 7.0-8.0)', quantity: 1, unit: 'piece', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'Guedel airway', quantity: 1, unit: 'piece', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'HME / breathing filter', quantity: 1, unit: 'piece', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'Suction catheter 12-14Fr', quantity: 2, unit: 'piece', category: 'SUCTION' },
      { name: 'IV cannula 18G', quantity: 2, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Infusion (giving) set', quantity: 2, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Syringes 2 ml / 5 ml / 10 ml', quantity: 5, unit: 'each', category: 'SYRINGES_NEEDLES' },
      { name: 'Hypodermic needles 21-23G', quantity: 10, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'ECG electrodes', quantity: 5, unit: 'piece', category: 'OTHER' },
      { name: 'Examination gloves', quantity: 10, unit: 'pair', category: 'PPE' },
    ],
  },
  {
    name: 'General anaesthesia, adult eye — drugs',
    subspecialty: `${ANAESTHESIA_PREFIX}General anaesthesia (adult eye)`,
    kind: 'PHARMACY',
    description: 'Section B for an adult eye case under GA.',
    items: [
      { name: 'Inj. Propofol 1% 20 ml', quantity: 2, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', route: 'IV' },
      { name: 'Inj. Atracurium 50 mg (or Vecuronium 10 mg)', quantity: 2, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', route: 'IV', notes: 'Non-depolarising. Suxamethonium raises intraocular pressure and is avoided in an open globe.' },
      { name: 'Inj. Fentanyl 100 mcg', quantity: 2, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', route: 'IV' },
      { name: 'Isoflurane (or Sevoflurane) 100 ml', quantity: 1, unit: 'bottle', drugType: 'ANAESTHETIC_ADJUNCT' },
      { name: 'Inj. Neostigmine 2.5 mg', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', route: 'IV' },
      { name: 'Inj. Atropine 0.6 mg', quantity: 3, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', route: 'IV', notes: 'Also for the oculocardiac reflex, which squint and retinal surgery provoke.' },
      { name: 'Inj. Ondansetron 4 mg', quantity: 2, unit: 'ampoule', drugType: 'OTHER', route: 'IV' },
      { name: 'Inj. Dexamethasone 8 mg', quantity: 1, unit: 'ampoule', drugType: 'OTHER', route: 'IV' },
      { name: 'Inj. Lidocaine 2% 20 ml', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT' },
      { name: 'Water for injection 10 ml', quantity: 10, unit: 'ampoule', drugType: 'OTHER' },
    ],
  },
  {
    name: 'General anaesthesia, paediatric eye — consumables',
    subspecialty: `${ANAESTHESIA_PREFIX}General anaesthesia (paediatric eye)`,
    kind: 'CONSUMABLE',
    description: 'Section A for congenital cataract, examination under anaesthesia, ROP and squint lists.',
    items: [
      { name: 'Endotracheal tube, uncuffed/cuffed (size by age)', quantity: 2, unit: 'piece', category: 'ANAESTHESIA_AIRWAY', notes: 'Size and the one either side of it.' },
      { name: 'Laryngeal mask airway (paediatric size)', quantity: 1, unit: 'piece', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'Paediatric breathing circuit', quantity: 1, unit: 'piece', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'HME / breathing filter (paediatric)', quantity: 1, unit: 'piece', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'Suction catheter 8-10Fr', quantity: 2, unit: 'piece', category: 'SUCTION' },
      { name: 'IV cannula 22G / 24G', quantity: 2, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Paediatric burette giving set', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Syringes 1 ml / 2 ml / 5 ml', quantity: 5, unit: 'each', category: 'SYRINGES_NEEDLES' },
      { name: 'ECG electrodes (paediatric)', quantity: 3, unit: 'piece', category: 'OTHER' },
      { name: 'Warming blanket or wrap', quantity: 1, unit: 'piece', category: 'OTHER', notes: 'A small child on a dark, still eye list cools fast.' },
    ],
  },
  {
    name: 'General anaesthesia, paediatric eye — drugs',
    subspecialty: `${ANAESTHESIA_PREFIX}General anaesthesia (paediatric eye)`,
    kind: 'PHARMACY',
    description: 'Section B, weight-based. Every dose is calculated for the child, not taken from this list.',
    items: [
      { name: 'Sevoflurane 250 ml', quantity: 1, unit: 'bottle', drugType: 'ANAESTHETIC_ADJUNCT', notes: 'Gas induction is the usual route in a small child.' },
      { name: 'Inj. Propofol 1% 20 ml', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '2-3 mg/kg', route: 'IV' },
      { name: 'Inj. Atracurium 50 mg', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '0.5 mg/kg', route: 'IV' },
      { name: 'Inj. Fentanyl 100 mcg', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '1 mcg/kg', route: 'IV' },
      { name: 'Inj. Atropine 0.6 mg', quantity: 2, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '20 mcg/kg', route: 'IV', notes: 'Squint surgery provokes the oculocardiac reflex; have it drawn up.' },
      { name: 'Inj. Paracetamol 10 mg/ml 50 ml', quantity: 1, unit: 'vial', drugType: 'ANALGESIC', dosage: '15 mg/kg', route: 'IV' },
      { name: 'Inj. Ondansetron 4 mg', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '0.1 mg/kg', route: 'IV' },
      { name: 'Inj. Dexamethasone 4 mg', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '0.15 mg/kg', route: 'IV' },
    ],
  },
];

// ===========================================================================
// PROCEDURE PACKS — sections C/D/E (consumables) and F/G (drugs)
// ===========================================================================
interface ProcedureSpec {
  procedure: string;
  anaesthesia: string;
  blood: string;
  consumables: PackItemSeed[];
  drugs: PackItemSeed[];
}

const PROCEDURES: ProcedureSpec[] = [
  {
    procedure: 'Phacoemulsification cataract extraction with intraocular lens implantation',
    anaesthesia: 'Topical and intracameral',
    blood: 'Not required',
    consumables: [
      ...theatreBase(),
      { name: 'Phaco handpiece tubing / cassette pack', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Phaco tip and sleeve', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Ophthalmic viscosurgical device (cohesive, 1 ml)', quantity: 1, unit: 'syringe', category: 'OTHER' },
      { name: 'Ophthalmic viscosurgical device (dispersive, 1 ml)', quantity: 1, unit: 'syringe', category: 'OTHER' },
      { name: 'Foldable posterior chamber intraocular lens', quantity: 1, unit: 'piece', category: 'OTHER', notes: 'POWER FROM THIS PATIENT\'S BIOMETRY. Confirmed by the surgeon before purchase.' },
      { name: 'IOL injector cartridge', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Keratome 2.2 mm / 2.75 mm', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Side-port blade 15 degree', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Cystotome needle 26G', quantity: 1, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Trypan blue 0.06% ophthalmic', quantity: 1, unit: 'ampoule', category: 'OTHER', notes: 'For a white or dense cataract.' },
      { name: 'Nylon 10/0 on spatulated needle', quantity: 1, unit: 'piece', category: 'SUTURES', notes: 'For a wound that will not seal.' },
    ],
    drugs: [
      ...postOpDrops(),
      { name: 'Inj. Cefuroxime 50 mg/0.1 ml (intracameral, reconstituted)', quantity: 1, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '1 mg in 0.1 ml', route: 'Intracameral', notes: 'RECONSTITUTION ERROR HERE CAUSES TOXIC ANTERIOR SEGMENT SYNDROME. Prepared to protocol.' },
      { name: 'Ketorolac 0.5% eye drops', quantity: 1, unit: 'bottle', drugType: 'ANALGESIC', route: 'Topical' },
    ],
  },
  {
    procedure: 'Manual small-incision cataract surgery (MSICS)',
    anaesthesia: "Sub-Tenon's block",
    blood: 'Not required',
    consumables: [
      ...theatreBase(),
      { name: 'Crescent blade', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Keratome 3.2 mm', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Side-port blade 15 degree', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Ophthalmic viscosurgical device (cohesive, 1 ml)', quantity: 2, unit: 'syringe', category: 'OTHER' },
      { name: 'Rigid PMMA posterior chamber intraocular lens', quantity: 1, unit: 'piece', category: 'OTHER', notes: 'POWER FROM THIS PATIENT\'S BIOMETRY.' },
      { name: 'Irrigating vectis / lens loop (single-use)', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Simcoe irrigation-aspiration cannula', quantity: 1, unit: 'piece', category: 'IRRIGATION' },
      { name: 'Cystotome needle 26G', quantity: 1, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Trypan blue 0.06% ophthalmic', quantity: 1, unit: 'ampoule', category: 'OTHER' },
      { name: 'Vicryl 8/0 on spatulated needle', quantity: 1, unit: 'piece', category: 'SUTURES', notes: 'Conjunctival closure.' },
      { name: 'Nylon 10/0 on spatulated needle', quantity: 1, unit: 'piece', category: 'SUTURES' },
      { name: 'Bipolar wet-field cautery tip', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
    ],
    drugs: [
      ...postOpDrops(),
      { name: 'Inj. Cefuroxime 50 mg/0.1 ml (intracameral, reconstituted)', quantity: 1, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '1 mg in 0.1 ml', route: 'Intracameral' },
      { name: 'Inj. Dexamethasone 4 mg', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '2 mg', route: 'Subconjunctival' },
    ],
  },
  {
    procedure: 'Extracapsular cataract extraction with intraocular lens',
    anaesthesia: 'Peribulbar block',
    blood: 'Not required',
    consumables: [
      ...theatreBase(),
      { name: 'Surgical blade size 15', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Keratome 3.2 mm', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Ophthalmic viscosurgical device (cohesive, 1 ml)', quantity: 2, unit: 'syringe', category: 'OTHER' },
      { name: 'Rigid PMMA posterior chamber intraocular lens', quantity: 1, unit: 'piece', category: 'OTHER', notes: 'POWER FROM THIS PATIENT\'S BIOMETRY.' },
      { name: 'Simcoe irrigation-aspiration cannula', quantity: 1, unit: 'piece', category: 'IRRIGATION' },
      { name: 'Cystotome needle 26G', quantity: 1, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Nylon 10/0 on spatulated needle', quantity: 3, unit: 'piece', category: 'SUTURES', notes: 'A limbal section needs several interrupted sutures.' },
      { name: 'Vicryl 8/0 on spatulated needle', quantity: 1, unit: 'piece', category: 'SUTURES' },
      { name: 'Bipolar wet-field cautery tip', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
    ],
    drugs: [
      ...postOpDrops(),
      { name: 'Inj. Dexamethasone 4 mg', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '2 mg', route: 'Subconjunctival' },
      { name: 'Inj. Gentamicin 80 mg', quantity: 1, unit: 'ampoule', drugType: 'ANTIBIOTIC', dosage: '20 mg', route: 'Subconjunctival' },
    ],
  },
  {
    procedure: 'Paediatric cataract extraction',
    anaesthesia: 'General anaesthesia (paediatric eye)',
    blood: 'Group and save',
    consumables: [
      ...theatreBase(),
      { name: 'Anterior vitrectomy cutter and tubing set', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Ophthalmic viscosurgical device (cohesive, 1 ml)', quantity: 2, unit: 'syringe', category: 'OTHER' },
      { name: 'Foldable posterior chamber intraocular lens (paediatric power)', quantity: 1, unit: 'piece', category: 'OTHER', notes: 'Power and whether to implant at all are the surgeon\'s decision on the day.' },
      { name: 'IOL injector cartridge', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Trypan blue 0.06% ophthalmic', quantity: 1, unit: 'ampoule', category: 'OTHER' },
      { name: 'Side-port blade 15 degree', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Keratome 2.75 mm', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Vicryl 10/0 on spatulated needle', quantity: 2, unit: 'piece', category: 'SUTURES', notes: 'A child\'s wound is always sutured.' },
      { name: 'Vicryl 8/0 on spatulated needle', quantity: 1, unit: 'piece', category: 'SUTURES' },
    ],
    drugs: [
      { name: 'Moxifloxacin 0.5% eye drops', quantity: 1, unit: 'bottle', drugType: 'ANTIBIOTIC', route: 'Topical' },
      { name: 'Prednisolone acetate 1% eye drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'Topical', notes: 'A child\'s eye inflames harder; the taper is longer.' },
      { name: 'Atropine 0.5% / 1% eye drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'Topical' },
      { name: 'Syrup Paracetamol 120 mg/5 ml', quantity: 1, unit: 'bottle', drugType: 'ANALGESIC', dosage: '15 mg/kg', route: 'PO' },
      { name: 'Inj. Dexamethasone 4 mg', quantity: 1, unit: 'ampoule', drugType: 'OTHER', route: 'Subconjunctival' },
      ...ivFluids(1),
    ],
  },
  {
    procedure: 'Trabeculectomy with antimetabolite application',
    anaesthesia: "Sub-Tenon's block",
    blood: 'Not required',
    consumables: [
      ...theatreBase(),
      { name: 'Surgical blade size 15', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Crescent blade', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Kelly Descemet punch (single-use) or trabeculectomy punch', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Cellulose surgical spears for antimetabolite application', quantity: 1, unit: 'pack', category: 'DRESSING_PACKS', notes: 'Carries the cytotoxic. Kept and disposed of separately from the general spears.' },
      { name: 'Nylon 10/0 on spatulated needle', quantity: 3, unit: 'piece', category: 'SUTURES' },
      { name: 'Vicryl 8/0 on spatulated needle', quantity: 2, unit: 'piece', category: 'SUTURES' },
      { name: 'Bipolar wet-field cautery tip', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
      { name: 'Syringe 2 ml with 27G cannula (bleb needling, if required)', quantity: 1, unit: 'set', category: 'SYRINGES_NEEDLES' },
    ],
    drugs: [
      { name: 'Mitomycin C 0.2 mg/ml (or 5-Fluorouracil 50 mg/ml)', quantity: 1, unit: 'vial', drugType: 'OTHER', dosage: '0.2 mg/ml for 2-3 minutes', route: 'Topical, intraoperative', notes: 'CONCENTRATION AND CONTACT TIME ARE THE SURGEON\'S ORDER. Cytotoxic: handled, disposed of and documented to protocol.' },
      { name: 'Prednisolone acetate 1% eye drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'Topical', notes: 'Intensive and slow to taper — the bleb depends on it.' },
      { name: 'Moxifloxacin 0.5% eye drops', quantity: 1, unit: 'bottle', drugType: 'ANTIBIOTIC', route: 'Topical' },
      { name: 'Atropine 1% eye drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'Topical' },
      { name: 'Tab. Paracetamol 1 g', quantity: 12, unit: 'tablet', drugType: 'ANALGESIC', route: 'PO' },
    ],
  },
  {
    procedure: 'Glaucoma drainage device implantation',
    anaesthesia: 'Peribulbar block',
    blood: 'Not required',
    consumables: [
      ...theatreBase(),
      { name: 'Glaucoma drainage implant (Ahmed / Baerveldt / Molteno)', quantity: 1, unit: 'piece', category: 'OTHER', notes: 'Model confirmed by the surgeon before purchase.' },
      { name: 'Scleral patch graft (donor sclera, pericardium or cornea)', quantity: 1, unit: 'piece', category: 'OTHER', notes: 'Covers the tube. Must be sourced before the list.' },
      { name: 'Needle 23G (tube entry track)', quantity: 2, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Nylon 10/0 on spatulated needle', quantity: 3, unit: 'piece', category: 'SUTURES' },
      { name: 'Prolene 9/0 on spatulated needle', quantity: 1, unit: 'piece', category: 'SUTURES' },
      { name: 'Vicryl 8/0 on spatulated needle', quantity: 2, unit: 'piece', category: 'SUTURES' },
      { name: 'Ophthalmic viscosurgical device (cohesive, 1 ml)', quantity: 1, unit: 'syringe', category: 'OTHER' },
      { name: 'Bipolar wet-field cautery tip', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
    ],
    drugs: [
      ...postOpDrops(),
      { name: 'Atropine 1% eye drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'Topical' },
      { name: 'Inj. Dexamethasone 4 mg', quantity: 1, unit: 'ampoule', drugType: 'OTHER', route: 'Subconjunctival' },
    ],
  },
  {
    procedure: 'Pars plana vitrectomy',
    anaesthesia: 'Peribulbar block',
    blood: 'Group and save',
    consumables: [
      ...theatreBase(),
      { name: 'Vitrectomy pack (cutter, light pipe, infusion cannula)', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Trocar cannula set 23G / 25G', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Vitrectomy tubing and cassette', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Endolaser probe', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Intraocular forceps / scissors (single-use)', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Silicone oil 1000 cSt / 5000 cSt', quantity: 1, unit: 'syringe', category: 'OTHER', notes: 'Tamponade chosen in theatre; gas may be used instead.' },
      { name: 'Perfluoropropane (C3F8) or SF6 gas', quantity: 1, unit: 'canister', category: 'OTHER' },
      { name: 'Perfluorocarbon liquid 5 ml', quantity: 1, unit: 'syringe', category: 'OTHER' },
      { name: 'Brilliant blue G / triamcinolone for membrane staining', quantity: 1, unit: 'vial', category: 'OTHER' },
      { name: 'Vicryl 7/0 on spatulated needle', quantity: 2, unit: 'piece', category: 'SUTURES', notes: 'Sclerotomy closure where the ports leak.' },
      { name: 'BSS Plus irrigating solution 500 ml', quantity: 1, unit: 'bottle', category: 'IRRIGATION' },
    ],
    drugs: [
      ...postOpDrops(),
      { name: 'Atropine 1% eye drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'Topical' },
      { name: 'Inj. Dexamethasone 4 mg', quantity: 1, unit: 'ampoule', drugType: 'OTHER', route: 'Subconjunctival' },
      { name: 'Acetazolamide 250 mg tablets', quantity: 8, unit: 'tablet', drugType: 'OTHER', route: 'PO', notes: 'For the pressure rise that follows a gas or oil fill.' },
      ...ivFluids(1),
    ],
  },
  {
    procedure: 'Scleral buckling for retinal detachment',
    anaesthesia: 'Peribulbar block',
    blood: 'Group and save',
    consumables: [
      ...theatreBase(),
      { name: 'Silicone buckle band / sponge (240 / 279 type)', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Watzke sleeve or buckle clip', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Cryotherapy probe (retinal) and gas', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Needle 27G (subretinal fluid drainage)', quantity: 1, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Prolene 5/0 on spatulated needle (scleral sutures)', quantity: 2, unit: 'piece', category: 'SUTURES' },
      { name: 'Vicryl 6/0 on spatulated needle (muscle slings)', quantity: 2, unit: 'piece', category: 'SUTURES' },
      { name: 'Vicryl 8/0 on spatulated needle (conjunctiva)', quantity: 2, unit: 'piece', category: 'SUTURES' },
      { name: 'Muscle hook and squint set (single-use where available)', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Bipolar wet-field cautery tip', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
    ],
    drugs: [
      ...postOpDrops(),
      { name: 'Atropine 1% eye drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'Topical' },
      { name: 'Inj. Dexamethasone 4 mg', quantity: 1, unit: 'ampoule', drugType: 'OTHER', route: 'Subconjunctival' },
      { name: 'Inj. Gentamicin 80 mg', quantity: 1, unit: 'ampoule', drugType: 'ANTIBIOTIC', dosage: '20 mg', route: 'Subconjunctival' },
      ...ivFluids(1),
    ],
  },
  {
    procedure: 'Intravitreal anti-VEGF injection',
    anaesthesia: 'Topical and intracameral',
    blood: 'Not required',
    consumables: [
      { name: 'Sterile surgical gloves (size as required)', quantity: 1, unit: 'pair', category: 'GLOVES' },
      { name: 'Ophthalmic adhesive drape with fluid pouch', quantity: 1, unit: 'piece', category: 'GOWNS_DRAPES' },
      { name: 'Eyelid speculum (single-use)', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Povidone-iodine 5% aqueous ophthalmic solution', quantity: 1, unit: 'bottle', category: 'SKIN_PREP', notes: 'The single most important step against endophthalmitis.' },
      { name: 'Syringe 1 ml (tuberculin)', quantity: 1, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Needle 30G', quantity: 1, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Needle 18G (drawing up)', quantity: 1, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Calipers or marker (3.5-4.0 mm from limbus)', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Cellulose surgical spears (Weck-cel type)', quantity: 1, unit: 'pack', category: 'DRESSING_PACKS' },
      { name: 'Gauze swabs 10 x 10 cm', quantity: 1, unit: 'pack', category: 'DRESSING_PACKS' },
    ],
    drugs: [
      { name: 'Anti-VEGF agent (bevacizumab / ranibizumab / aflibercept)', quantity: 1, unit: 'vial', drugType: 'OTHER', route: 'Intravitreal', notes: 'Agent and dose are the surgeon\'s order. Cold chain maintained to the point of injection.' },
      { name: 'Tetracaine 0.5% (or proparacaine 0.5%) eye drops', quantity: 1, unit: 'bottle', drugType: 'ANAESTHETIC_ADJUNCT', route: 'Topical' },
      { name: 'Moxifloxacin 0.5% eye drops', quantity: 1, unit: 'bottle', drugType: 'ANTIBIOTIC', route: 'Topical' },
    ],
  },
  {
    procedure: 'Penetrating keratoplasty',
    anaesthesia: 'General anaesthesia (adult eye)',
    blood: 'Group and save',
    consumables: [
      ...theatreBase(),
      { name: 'Donor corneal graft (from eye bank)', quantity: 1, unit: 'piece', category: 'OTHER', notes: 'TISSUE MUST BE CONFIRMED AVAILABLE AND IN DATE BEFORE THE PATIENT IS SENT FOR.' },
      { name: 'Corneal trephine (recipient and donor punch)', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Ophthalmic viscosurgical device (cohesive, 1 ml)', quantity: 2, unit: 'syringe', category: 'OTHER' },
      { name: 'Nylon 10/0 on spatulated needle', quantity: 4, unit: 'piece', category: 'SUTURES', notes: '16 interrupted bites or a continuous run.' },
      { name: 'Vicryl 8/0 on spatulated needle', quantity: 1, unit: 'piece', category: 'SUTURES' },
      { name: 'Flieringa ring', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Corneal storage medium (Optisol type)', quantity: 1, unit: 'vial', category: 'OTHER' },
    ],
    drugs: [
      { name: 'Moxifloxacin 0.5% eye drops', quantity: 1, unit: 'bottle', drugType: 'ANTIBIOTIC', route: 'Topical' },
      { name: 'Prednisolone acetate 1% eye drops', quantity: 2, unit: 'bottle', drugType: 'OTHER', route: 'Topical', notes: 'Long course — a graft is lost to rejection when drops stop.' },
      { name: 'Ciclosporin 0.05% eye drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'Topical' },
      { name: 'Atropine 1% eye drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'Topical' },
      { name: 'Tab. Paracetamol 1 g', quantity: 12, unit: 'tablet', drugType: 'ANALGESIC', route: 'PO' },
      ...ivFluids(1),
    ],
  },
  {
    procedure: 'Pterygium excision with conjunctival autograft',
    anaesthesia: "Sub-Tenon's block",
    blood: 'Not required',
    consumables: [
      ...theatreBase(),
      { name: 'Surgical blade size 15', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Crescent blade', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Westcott spring scissors (single-use)', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Vicryl 8/0 on spatulated needle', quantity: 2, unit: 'piece', category: 'SUTURES' },
      { name: 'Nylon 10/0 on spatulated needle', quantity: 1, unit: 'piece', category: 'SUTURES' },
      { name: 'Fibrin sealant (where glue is used instead of sutures)', quantity: 1, unit: 'kit', category: 'OTHER' },
      { name: 'Bipolar wet-field cautery tip', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
    ],
    drugs: [
      ...postOpDrops(),
      { name: 'Mitomycin C 0.2 mg/ml', quantity: 1, unit: 'vial', drugType: 'OTHER', dosage: 'As ordered', route: 'Topical, intraoperative', notes: 'Only for recurrent pterygium, on the surgeon\'s order. Cytotoxic.' },
      { name: 'Carboxymethylcellulose 0.5% lubricant drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'Topical' },
    ],
  },
  {
    procedure: 'External DCR',
    anaesthesia: 'General anaesthesia (adult eye)',
    blood: 'Group and save',
    consumables: [
      ...theatreBase(),
      { name: 'Surgical blade size 15', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Bone punch / rongeur (Kerrison)', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Silicone bicanalicular stent (Crawford type)', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Punctal dilator and lacrimal probes', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Nasal pack / Merocel', quantity: 2, unit: 'piece', category: 'STERILE_DRESSINGS' },
      { name: 'Vicryl 6/0 on cutting needle', quantity: 2, unit: 'piece', category: 'SUTURES' },
      { name: 'Nylon 6/0 on cutting needle (skin)', quantity: 1, unit: 'piece', category: 'SUTURES' },
      { name: 'Bipolar diathermy forceps', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
      { name: 'Suction catheter 10-12Fr', quantity: 2, unit: 'piece', category: 'SUCTION' },
    ],
    drugs: [
      { name: 'Inj. Ceftriaxone 1 g', quantity: 2, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '1 g', route: 'IV' },
      { name: 'Chloramphenicol 1% eye ointment', quantity: 1, unit: 'tube', drugType: 'ANTIBIOTIC', route: 'Topical' },
      { name: 'Dexamethasone-neomycin eye drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'Topical' },
      { name: 'Xylometazoline 0.1% nasal drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'Nasal' },
      { name: 'Tab. Paracetamol 1 g', quantity: 12, unit: 'tablet', drugType: 'ANALGESIC', route: 'PO' },
      ...ivFluids(2),
    ],
  },
  {
    procedure: 'Horizontal rectus muscle surgery',
    anaesthesia: 'General anaesthesia (paediatric eye)',
    blood: 'Not required',
    consumables: [
      ...theatreBase(),
      { name: 'Squint set: muscle hooks, calipers, Westcott scissors (single-use where available)', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Vicryl 6/0 on double-armed spatulated needle', quantity: 2, unit: 'piece', category: 'SUTURES', notes: 'The muscle suture. Double-armed.' },
      { name: 'Vicryl 8/0 on spatulated needle (conjunctiva)', quantity: 2, unit: 'piece', category: 'SUTURES' },
      { name: 'Bipolar wet-field cautery tip', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
    ],
    drugs: [
      { name: 'Dexamethasone-neomycin eye drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'Topical' },
      { name: 'Chloramphenicol 1% eye ointment', quantity: 1, unit: 'tube', drugType: 'ANTIBIOTIC', route: 'Topical' },
      { name: 'Syrup Paracetamol 120 mg/5 ml', quantity: 1, unit: 'bottle', drugType: 'ANALGESIC', dosage: '15 mg/kg', route: 'PO' },
      { name: 'Inj. Ondansetron 4 mg', quantity: 2, unit: 'ampoule', drugType: 'OTHER', route: 'IV', notes: 'Squint surgery is among the most emetogenic operations in children.' },
      { name: 'Inj. Atropine 0.6 mg', quantity: 2, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', route: 'IV', notes: 'Oculocardiac reflex on muscle traction.' },
    ],
  },
  {
    procedure: 'Enucleation of eyeball',
    anaesthesia: 'General anaesthesia (adult eye)',
    blood: 'Group and save',
    consumables: [
      ...theatreBase(),
      { name: 'Orbital implant (acrylic / hydroxyapatite, sized)', quantity: 1, unit: 'piece', category: 'OTHER', notes: 'Size confirmed by the surgeon.' },
      { name: 'Enucleation scissors and snare (single-use where available)', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Surgical blade size 15', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Vicryl 5/0 on cutting needle (Tenon and muscle)', quantity: 3, unit: 'piece', category: 'SUTURES' },
      { name: 'Vicryl 6/0 on spatulated needle (conjunctiva)', quantity: 2, unit: 'piece', category: 'SUTURES' },
      { name: 'Conformer shell', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Bipolar diathermy forceps', quantity: 1, unit: 'piece', category: 'DIATHERMY' },
      { name: 'Pressure dressing and bandage', quantity: 1, unit: 'set', category: 'STERILE_DRESSINGS' },
      { name: 'Specimen container with 10% formalin', quantity: 1, unit: 'piece', category: 'OTHER', notes: 'Histology is mandatory where tumour is the indication.' },
    ],
    drugs: [
      { name: 'Inj. Ceftriaxone 1 g', quantity: 2, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '1 g', route: 'IV' },
      { name: 'Inj. Metronidazole 500 mg', quantity: 3, unit: 'bag', drugType: 'ANTIBIOTIC', route: 'IV' },
      { name: 'Chloramphenicol 1% eye ointment', quantity: 1, unit: 'tube', drugType: 'ANTIBIOTIC', route: 'Topical' },
      { name: 'Tab. Paracetamol 1 g', quantity: 12, unit: 'tablet', drugType: 'ANALGESIC', route: 'PO' },
      { name: 'Inj. Pentazocine 30 mg (or Tramadol 100 mg)', quantity: 2, unit: 'ampoule', drugType: 'ANALGESIC', route: 'IM' },
      ...ivFluids(2),
    ],
  },
  {
    procedure: 'Combined corneoscleral laceration repair',
    anaesthesia: 'General anaesthesia (adult eye)',
    blood: 'Group and save',
    consumables: [
      ...theatreBase(),
      { name: 'Nylon 10/0 on spatulated needle', quantity: 4, unit: 'piece', category: 'SUTURES', notes: 'Corneal bites.' },
      { name: 'Vicryl 8/0 on spatulated needle', quantity: 2, unit: 'piece', category: 'SUTURES', notes: 'Scleral and conjunctival closure.' },
      { name: 'Ophthalmic viscosurgical device (cohesive, 1 ml)', quantity: 2, unit: 'syringe', category: 'OTHER' },
      { name: 'Anterior vitrectomy cutter and tubing set', quantity: 1, unit: 'set', category: 'OTHER', notes: 'For prolapsed vitreous.' },
      { name: 'Cyanoacrylate tissue adhesive', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Bandage contact lens', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Cartella eye shield for continuous wear at home', quantity: 1, unit: 'piece', category: 'STERILE_DRESSINGS', notes: 'Worn day and night until reviewed; separate from the one applied in theatre.' },
      { name: 'Specimen container (foreign body / culture)', quantity: 2, unit: 'piece', category: 'OTHER' },
    ],
    drugs: [
      { name: 'Inj. Ceftriaxone 1 g', quantity: 4, unit: 'vial', drugType: 'ANTIBIOTIC', dosage: '1 g', route: 'IV' },
      { name: 'Inj. Vancomycin 500 mg', quantity: 2, unit: 'vial', drugType: 'ANTIBIOTIC', route: 'IV', notes: 'Where endophthalmitis is feared.' },
      { name: 'Inj. Ceftazidime 1 g', quantity: 2, unit: 'vial', drugType: 'ANTIBIOTIC', route: 'IV' },
      { name: 'Tetanus toxoid 0.5 ml', quantity: 1, unit: 'ampoule', drugType: 'OTHER', route: 'IM', notes: 'Check status; a dirty penetrating injury needs cover.' },
      { name: 'Moxifloxacin 0.5% eye drops', quantity: 1, unit: 'bottle', drugType: 'ANTIBIOTIC', route: 'Topical' },
      { name: 'Atropine 1% eye drops', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'Topical' },
      { name: 'Inj. Pentazocine 30 mg (or Tramadol 100 mg)', quantity: 2, unit: 'ampoule', drugType: 'ANALGESIC', route: 'IM' },
      ...ivFluids(2),
    ],
  },
];

const procedurePacks: PackSeed[] = PROCEDURES.flatMap((p) => [
  {
    name: p.procedure,
    subspecialty: 'Ophthalmology',
    kind: 'CONSUMABLE' as const,
    description: `Sections C-E: theatre, skin preparation, dressings, procedure-specific items and sutures. Anaesthesia: ${p.anaesthesia}. Blood: ${p.blood}.`,
    items: p.consumables,
  },
  {
    name: p.procedure,
    subspecialty: 'Ophthalmology',
    kind: 'PHARMACY' as const,
    description: `Sections F-G: antibiotics, analgesics, other drugs and IV fluids. Anaesthesia: ${p.anaesthesia}. Blood: ${p.blood}.`,
    items: p.drugs,
  },
]);

export const OPHTHALMOLOGY_PACKS: PackSeed[] = [...procedurePacks, ...anaesthesiaPacks];

/** The anaesthesia technique a procedure pack expects, by procedure name. */
export const ANAESTHESIA_FOR: Record<string, string> = Object.fromEntries(
  PROCEDURES.map((p) => [p.procedure, p.anaesthesia])
);

/** Every technique an anaesthesia pack is filed under, without the prefix. */
export function anaesthesiaTechniques(): string[] {
  return Array.from(new Set(
    anaesthesiaPacks.map((p) => p.subspecialty.slice(ANAESTHESIA_PREFIX.length))
  ));
}

export function packCount(): number {
  return OPHTHALMOLOGY_PACKS.length;
}

export function itemCount(): number {
  return OPHTHALMOLOGY_PACKS.reduce((n, p) => n + p.items.length, 0);
}
