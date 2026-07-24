/**
 * seed-anaesthesia-packs.ts
 * ---------------------------------------------------------------------------
 * Evidence-based DEFAULT anaesthesia packs (drugs + consumables), stratified by
 * anaesthesia technique and by common comorbidity / age / subspecialty needs.
 * Sources: WHO Surgical Safety, ASA, AAGBI/RCoA guidelines, OAA (obstetric),
 * APA (paediatric), and standard international anaesthetic machine/monitoring
 * checklists. Quantities/doses are internationally-accepted defaults — editable
 * per case and centrally by admins.
 *
 * Storage: these reuse the existing SurgicalPack / SurgicalPackItem tables, keyed
 * by `subspecialty = "ANAESTHESIA::<technique>"` so they stay separate from the
 * surgical booking packs (the surgical picker excludes the ANAESTHESIA:: prefix).
 *
 * Routing (same as surgical packs):
 *   - kind = PHARMACY   → drugs / fluids  → Pharmacy (SurgeryDrugDressingRequest)
 *   - kind = CONSUMABLE → airway/monitoring/regional consumables (ECG electrodes,
 *     ETTs, spinal/epidural needles …) → Consumable Pack Provider.
 * ---------------------------------------------------------------------------
 */

import type { PrismaClient } from '@prisma/client';

export const ANAESTHESIA_PREFIX = 'ANAESTHESIA::';

type Drug = { name: string; quantity: number; unit?: string; drugType: string; dosage?: string; route?: string; notes?: string };
type Cons = { name: string; quantity: number; unit?: string; category: string; size?: string; notes?: string };
type APack = {
  technique: string;   // e.g. "General", "Spinal", "Adjunct"
  name: string;
  kind: 'PHARMACY' | 'CONSUMABLE';
  description?: string;
  sortOrder?: number;
  drugs?: Drug[];
  consumables?: Cons[];
};

// ---- reusable monitoring / access consumables (attach to most techniques) ----
const MONITORING: Cons[] = [
  { name: 'ECG electrodes', quantity: 5, unit: 'piece', category: 'OTHER' },
  { name: 'SpO2 (pulse oximeter) sensor', quantity: 1, unit: 'piece', category: 'OTHER' },
  { name: 'NIBP cuff (appropriate size)', quantity: 1, unit: 'piece', category: 'OTHER' },
];
const IV_ACCESS: Cons[] = [
  { name: 'IV cannula', quantity: 2, unit: 'piece', category: 'CATHETERS_TUBING', size: '18G/16G' },
  { name: 'IV giving set', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING' },
  { name: 'Assorted syringes (2/5/10/20 ml)', quantity: 6, unit: 'piece', category: 'SYRINGES_NEEDLES' },
  { name: 'Hypodermic/drawing-up needles', quantity: 6, unit: 'piece', category: 'SYRINGES_NEEDLES' },
];
const NEURAXIAL_PREP: Cons[] = [
  { name: 'Chlorhexidine 0.5% in alcohol skin prep', quantity: 1, unit: 'applicator', category: 'SKIN_PREP' },
  { name: 'Sterile neuraxial drape + pack', quantity: 1, unit: 'pack', category: 'GOWNS_DRAPES' },
  { name: 'Sterile gloves', quantity: 1, unit: 'pair', category: 'GLOVES' },
];
const CO_FLUIDS: Drug[] = [
  { name: "Ringer's Lactate (Hartmann's)", quantity: 2, unit: 'litre', drugType: 'IV_FLUID', dosage: '1 L', route: 'IV' },
  { name: 'Normal Saline 0.9%', quantity: 1, unit: 'litre', drugType: 'IV_FLUID', dosage: '1 L', route: 'IV' },
];

// ===========================================================================
export const ANAESTHESIA_PACK_SEED: APack[] = [
  // ------------------------------------------------------------ GENERAL ANAESTHESIA
  {
    technique: 'General', kind: 'PHARMACY', sortOrder: 0,
    name: 'General Anaesthesia — Drugs',
    description: 'Standard GA drug set: induction, opioid, relaxant, reversal, volatile, antiemetics, emergency drugs.',
    drugs: [
      { name: 'Propofol 1%', quantity: 2, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '1.5–2.5 mg/kg', route: 'IV', notes: 'Induction (Etomidate/Ketamine alt if unstable).' },
      { name: 'Thiopentone (alt induction)', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '3–5 mg/kg', route: 'IV' },
      { name: 'Fentanyl', quantity: 2, unit: 'ampoule', drugType: 'ANALGESIC', dosage: '1–2 mcg/kg', route: 'IV' },
      { name: 'Suxamethonium', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '1–1.5 mg/kg', route: 'IV', notes: 'For RSI / rapid intubation.' },
      { name: 'Rocuronium (or Atracurium)', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '0.6 mg/kg', route: 'IV', notes: 'Non-depolarising maintenance relaxant.' },
      { name: 'Neostigmine + Glycopyrrolate', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '50 mcg/kg + 10 mcg/kg', route: 'IV', notes: 'Reversal (Sugammadex if rocuronium & available).' },
      { name: 'Sevoflurane (volatile)', quantity: 1, unit: 'bottle', drugType: 'ANAESTHETIC_ADJUNCT', route: 'Inhalation', notes: 'Or Isoflurane for maintenance.' },
      { name: 'Ondansetron', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '4 mg', route: 'IV', notes: 'PONV prophylaxis.' },
      { name: 'Dexamethasone', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '4–8 mg', route: 'IV' },
      { name: 'Paracetamol (IV)', quantity: 1, unit: 'vial', drugType: 'ANALGESIC', dosage: '1 g', route: 'IV' },
      { name: 'Ephedrine', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '3–6 mg', route: 'IV', notes: 'Vasopressor.' },
      { name: 'Atropine', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '0.6 mg', route: 'IV' },
      { name: 'Lignocaine 2% (plain)', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', route: 'IV', notes: 'Obtund intubation response.' },
      ...CO_FLUIDS,
    ],
  },
  {
    technique: 'General', kind: 'CONSUMABLE', sortOrder: 1,
    name: 'General Anaesthesia — Consumables',
    description: 'Airway, breathing-circuit and monitoring consumables for GA. Wired to the pack provider.',
    consumables: [
      { name: 'Endotracheal tube (cuffed)', quantity: 2, unit: 'piece', category: 'ANAESTHESIA_AIRWAY', size: '7.0 / 7.5 / 8.0' },
      { name: 'Laryngeal mask airway (LMA)', quantity: 1, unit: 'piece', category: 'ANAESTHESIA_AIRWAY', size: '3 / 4' },
      { name: 'Guedel oropharyngeal airways (assorted)', quantity: 2, unit: 'piece', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'HME filter (heat & moisture exchanger)', quantity: 1, unit: 'piece', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'Catheter mount', quantity: 1, unit: 'piece', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'Bougie / intubating stylet', quantity: 1, unit: 'piece', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'Laryngoscope blades (Mac 3/4) + spare batteries', quantity: 1, unit: 'set', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'Face mask (anaesthetic, sized)', quantity: 1, unit: 'piece', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'Suction catheters (assorted)', quantity: 2, unit: 'piece', category: 'SUCTION' },
      { name: 'Yankauer suction', quantity: 1, unit: 'piece', category: 'SUCTION' },
      { name: 'Capnography sampling line', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Temperature probe', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Nasogastric tube', quantity: 1, unit: 'piece', category: 'CATHETERS_TUBING', size: '16 Fr' },
      ...MONITORING,
      ...IV_ACCESS,
    ],
  },

  // ------------------------------------------------------------ SPINAL
  {
    technique: 'Spinal', kind: 'PHARMACY', sortOrder: 0,
    name: 'Spinal Anaesthesia — Drugs',
    description: 'Subarachnoid block drugs + vasopressors for sympathetic block.',
    drugs: [
      { name: 'Heavy Bupivacaine 0.5% (hyperbaric)', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '2–3 ml (10–15 mg)', route: 'Intrathecal' },
      { name: 'Fentanyl (intrathecal adjunct)', quantity: 1, unit: 'ampoule', drugType: 'ANALGESIC', dosage: '10–25 mcg', route: 'Intrathecal' },
      { name: 'Preservative-free Morphine (optional)', quantity: 1, unit: 'ampoule', drugType: 'ANALGESIC', dosage: '100–200 mcg', route: 'Intrathecal', notes: 'Long post-op analgesia; monitor for delayed resp. depression.' },
      { name: 'Phenylephrine (or Ephedrine)', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '50–100 mcg boluses', route: 'IV', notes: 'Treat block-induced hypotension.' },
      { name: 'Atropine', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '0.6 mg', route: 'IV', notes: 'For bradycardia.' },
      ...CO_FLUIDS,
    ],
  },
  {
    technique: 'Spinal', kind: 'CONSUMABLE', sortOrder: 1,
    name: 'Spinal Anaesthesia — Consumables',
    description: 'Aseptic subarachnoid block kit + monitoring.',
    consumables: [
      { name: 'Spinal needle (pencil-point)', quantity: 1, unit: 'piece', category: 'SYRINGES_NEEDLES', size: '25G / 26G / 27G' },
      { name: 'Introducer needle', quantity: 1, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      ...NEURAXIAL_PREP,
      ...MONITORING,
      ...IV_ACCESS,
    ],
  },

  // ------------------------------------------------------------ EPIDURAL
  {
    technique: 'Epidural', kind: 'PHARMACY', sortOrder: 0,
    name: 'Epidural Anaesthesia — Drugs',
    description: 'Epidural local anaesthetic + opioid, with adrenaline test dose.',
    drugs: [
      { name: 'Bupivacaine 0.25% / 0.5%', quantity: 2, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', dosage: 'titrated to level', route: 'Epidural' },
      { name: 'Lidocaine 2% with Adrenaline 1:200,000', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '3 ml test dose', route: 'Epidural', notes: 'Detect intravascular/intrathecal placement.' },
      { name: 'Fentanyl (epidural adjunct)', quantity: 1, unit: 'ampoule', drugType: 'ANALGESIC', dosage: '50–100 mcg', route: 'Epidural' },
      { name: 'Preservative-free Morphine (optional)', quantity: 1, unit: 'ampoule', drugType: 'ANALGESIC', dosage: '2–4 mg', route: 'Epidural' },
      ...CO_FLUIDS,
    ],
  },
  {
    technique: 'Epidural', kind: 'CONSUMABLE', sortOrder: 1,
    name: 'Epidural Anaesthesia — Consumables',
    description: 'Epidural insertion kit + infusion.',
    consumables: [
      { name: 'Epidural kit (Tuohy needle + catheter + filter + LOR syringe)', quantity: 1, unit: 'kit', category: 'CATHETERS_TUBING' },
      { name: 'Epidural infusion pump set', quantity: 1, unit: 'set', category: 'CATHETERS_TUBING' },
      { name: 'Catheter fixation dressing', quantity: 1, unit: 'piece', category: 'DRESSING_PACKS' },
      ...NEURAXIAL_PREP,
      ...MONITORING,
      ...IV_ACCESS,
    ],
  },

  // ------------------------------------------------------------ COMBINED SPINAL-EPIDURAL
  {
    technique: 'Combined Spinal-Epidural', kind: 'PHARMACY', sortOrder: 0,
    name: 'Combined Spinal-Epidural — Drugs',
    description: 'CSE: intrathecal onset + epidural top-up/analgesia.',
    drugs: [
      { name: 'Heavy Bupivacaine 0.5% (intrathecal)', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '1.5–2.5 ml', route: 'Intrathecal' },
      { name: 'Bupivacaine 0.1–0.25% (epidural)', quantity: 2, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', route: 'Epidural' },
      { name: 'Fentanyl', quantity: 1, unit: 'ampoule', drugType: 'ANALGESIC', dosage: '10–25 mcg IT / 50–100 mcg epidural', route: 'Neuraxial' },
      { name: 'Phenylephrine (or Ephedrine)', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', route: 'IV' },
      ...CO_FLUIDS,
    ],
  },
  {
    technique: 'Combined Spinal-Epidural', kind: 'CONSUMABLE', sortOrder: 1,
    name: 'Combined Spinal-Epidural — Consumables',
    description: 'CSE needle-through-needle kit + monitoring.',
    consumables: [
      { name: 'CSE kit (Tuohy + spinal needle-through-needle + catheter + filter)', quantity: 1, unit: 'kit', category: 'CATHETERS_TUBING' },
      { name: 'Epidural infusion pump set', quantity: 1, unit: 'set', category: 'CATHETERS_TUBING' },
      ...NEURAXIAL_PREP,
      ...MONITORING,
      ...IV_ACCESS,
    ],
  },

  // ------------------------------------------------------------ LOCAL
  {
    technique: 'Local', kind: 'PHARMACY', sortOrder: 0,
    name: 'Local Anaesthesia — Drugs',
    description: 'Infiltration local anaesthesia (surgeon/anaesthetist).',
    drugs: [
      { name: 'Lignocaine 1% / 2% (± Adrenaline 1:200,000)', quantity: 2, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', dosage: 'max 3 mg/kg plain, 7 mg/kg with adrenaline', route: 'Infiltration', notes: 'Avoid adrenaline in end-arteries.' },
      { name: 'Bupivacaine 0.25% / 0.5%', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', dosage: 'max 2 mg/kg', route: 'Infiltration' },
    ],
  },
  {
    technique: 'Local', kind: 'CONSUMABLE', sortOrder: 1,
    name: 'Local Anaesthesia — Consumables',
    description: 'Infiltration + minimal monitoring.',
    consumables: [
      { name: 'Fine infiltration needles (25G/23G) + syringes', quantity: 4, unit: 'piece', category: 'SYRINGES_NEEDLES' },
      { name: 'Skin prep (chlorhexidine/povidone)', quantity: 1, unit: 'bottle', category: 'SKIN_PREP' },
      { name: 'SpO2 (pulse oximeter) sensor', quantity: 1, unit: 'piece', category: 'OTHER' },
    ],
  },

  // ------------------------------------------------------------ REGIONAL (nerve blocks)
  {
    technique: 'Regional', kind: 'PHARMACY', sortOrder: 0,
    name: 'Regional Block — Drugs',
    description: 'Peripheral nerve/plexus block local anaesthetic + adjuncts.',
    drugs: [
      { name: 'Ropivacaine 0.5% (or Bupivacaine 0.5%)', quantity: 2, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', dosage: 'block-dependent, within max', route: 'Perineural' },
      { name: 'Lidocaine 1–2% (faster onset)', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', route: 'Perineural' },
      { name: 'Dexamethasone (perineural adjunct)', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '4 mg', route: 'Perineural', notes: 'Prolongs block.' },
      { name: 'Intralipid 20% (LA toxicity rescue)', quantity: 1, unit: 'bag', drugType: 'OTHER', dosage: '1.5 ml/kg bolus', route: 'IV', notes: 'MUST be immediately available for LAST.' },
    ],
  },
  {
    technique: 'Regional', kind: 'CONSUMABLE', sortOrder: 1,
    name: 'Regional Block — Consumables',
    description: 'Ultrasound/nerve-stimulator guided block kit.',
    consumables: [
      { name: 'Echogenic/insulated block needle', quantity: 1, unit: 'piece', category: 'SYRINGES_NEEDLES', size: '50–100 mm' },
      { name: 'Ultrasound probe cover + sterile gel', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Nerve stimulator electrode pads', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Block pack (drape, gauze, gallipot)', quantity: 1, unit: 'pack', category: 'GOWNS_DRAPES' },
      { name: 'Skin prep (chlorhexidine)', quantity: 1, unit: 'applicator', category: 'SKIN_PREP' },
      ...MONITORING,
      ...IV_ACCESS,
    ],
  },

  // ------------------------------------------------------------ SEDATION (MAC)
  {
    technique: 'Sedation', kind: 'PHARMACY', sortOrder: 0,
    name: 'Sedation (MAC) — Drugs',
    description: 'Procedural sedation with rescue/reversal agents.',
    drugs: [
      { name: 'Midazolam', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '0.02–0.05 mg/kg', route: 'IV' },
      { name: 'Propofol (titrated / TCI)', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: 'titrate', route: 'IV' },
      { name: 'Fentanyl', quantity: 1, unit: 'ampoule', drugType: 'ANALGESIC', dosage: '0.5–1 mcg/kg', route: 'IV' },
      { name: 'Ketamine (analgo-sedation)', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '0.25–0.5 mg/kg', route: 'IV' },
      { name: 'Dexmedetomidine (optional)', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', route: 'IV infusion' },
      { name: 'Flumazenil (benzodiazepine reversal)', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '200 mcg', route: 'IV' },
      { name: 'Naloxone (opioid reversal)', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '400 mcg', route: 'IV' },
    ],
  },
  {
    technique: 'Sedation', kind: 'CONSUMABLE', sortOrder: 1,
    name: 'Sedation (MAC) — Consumables',
    description: 'Oxygen delivery + monitoring (capnography mandatory).',
    consumables: [
      { name: 'Nasal cannula / Hudson O2 mask', quantity: 1, unit: 'piece', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'Capnography sampling line (nasal)', quantity: 1, unit: 'piece', category: 'OTHER' },
      { name: 'Suction catheters + Yankauer', quantity: 1, unit: 'set', category: 'SUCTION' },
      ...MONITORING,
      ...IV_ACCESS,
    ],
  },

  // ------------------------------------------------------------ STRATIFIED ADJUNCT PACKS
  {
    technique: 'Adjunct', kind: 'PHARMACY', sortOrder: 10,
    name: 'Emergency / Resuscitation Drugs (all cases)',
    description: 'Immediately-available anaesthetic emergency drugs. Wired to Pharmacy.',
    drugs: [
      { name: 'Adrenaline (Epinephrine) 1:1000 / 1:10,000', quantity: 2, unit: 'ampoule', drugType: 'OTHER', dosage: '10 mcg/kg (anaphylaxis/arrest)', route: 'IV/IM' },
      { name: 'Atropine', quantity: 2, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '0.6 mg', route: 'IV' },
      { name: 'Ephedrine', quantity: 2, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '3–6 mg', route: 'IV' },
      { name: 'Hydrocortisone', quantity: 1, unit: 'vial', drugType: 'OTHER', dosage: '200 mg', route: 'IV' },
      { name: 'Chlorphenamine', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '10 mg', route: 'IV' },
      { name: 'Magnesium sulfate', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '2 g', route: 'IV' },
      { name: 'Amiodarone', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '300 mg', route: 'IV' },
      { name: 'Calcium gluconate 10%', quantity: 1, unit: 'ampoule', drugType: 'OTHER', route: 'IV' },
      { name: 'Sodium bicarbonate 8.4%', quantity: 1, unit: 'bottle', drugType: 'OTHER', route: 'IV' },
      { name: 'Intralipid 20% (LA toxicity)', quantity: 1, unit: 'bag', drugType: 'OTHER', route: 'IV' },
    ],
  },
  {
    technique: 'Adjunct', kind: 'CONSUMABLE', sortOrder: 11,
    name: 'Difficult Airway Cart (as indicated)',
    description: 'Difficult/failed intubation adjuncts per DAS guidance.',
    consumables: [
      { name: 'Video laryngoscope blade + handle', quantity: 1, unit: 'set', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'Second-generation supraglottic airway (i-gel/ProSeal)', quantity: 2, unit: 'piece', category: 'ANAESTHESIA_AIRWAY', size: '3 / 4' },
      { name: 'Bougie + airway exchange catheter', quantity: 1, unit: 'set', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'Range of ETTs (small sizes incl. 5.0–6.0)', quantity: 3, unit: 'piece', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'Front-of-neck-access (cricothyroidotomy) kit + scalpel', quantity: 1, unit: 'kit', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'Fibreoptic scope drape/adjuncts', quantity: 1, unit: 'set', category: 'ANAESTHESIA_AIRWAY' },
    ],
  },
  {
    technique: 'Adjunct', kind: 'PHARMACY', sortOrder: 12,
    name: 'Rapid Sequence Induction / Full Stomach',
    description: 'Aspiration-risk cases (obstruction, trauma, obstetric, reflux).',
    drugs: [
      { name: 'Suxamethonium', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '1–1.5 mg/kg', route: 'IV' },
      { name: 'Rocuronium (high-dose RSI alt)', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '1.2 mg/kg', route: 'IV', notes: 'Sugammadex 16 mg/kg for rescue.' },
      { name: 'Sodium citrate 0.3M', quantity: 1, unit: 'bottle', drugType: 'ANTISEPTIC', dosage: '30 ml', route: 'PO', notes: 'Non-particulate antacid pre-induction.' },
      { name: 'Metoclopramide', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '10 mg', route: 'IV' },
      { name: 'Ranitidine/Omeprazole', quantity: 1, unit: 'ampoule', drugType: 'OTHER', route: 'IV' },
    ],
  },
  {
    technique: 'Obstetric', kind: 'PHARMACY', sortOrder: 20,
    name: 'Obstetric Spinal (Caesarean) — Drugs',
    description: 'Spinal for CS with uterotonics + aspiration prophylaxis (OAA).',
    drugs: [
      { name: 'Heavy Bupivacaine 0.5%', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '2–2.5 ml', route: 'Intrathecal' },
      { name: 'Fentanyl + Preservative-free Morphine', quantity: 1, unit: 'ampoule', drugType: 'ANALGESIC', dosage: '15 mcg + 100 mcg', route: 'Intrathecal' },
      { name: 'Phenylephrine (infusion/boluses)', quantity: 2, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', route: 'IV', notes: 'Maintain maternal BP.' },
      { name: 'Oxytocin', quantity: 5, unit: 'ampoule', drugType: 'OTHER', dosage: '5 IU slow IV then infusion', route: 'IV', notes: 'After delivery.' },
      { name: 'Carbetocin (alt uterotonic)', quantity: 1, unit: 'ampoule', drugType: 'OTHER', dosage: '100 mcg', route: 'IV' },
      { name: 'Sodium citrate + Ranitidine + Metoclopramide', quantity: 1, unit: 'set', drugType: 'OTHER', notes: 'Aspiration prophylaxis.' },
      { name: 'Tranexamic acid', quantity: 1, unit: 'ampoule', drugType: 'HAEMOSTATIC', dosage: '1 g', route: 'IV' },
      ...CO_FLUIDS,
    ],
  },
  {
    technique: 'Paediatric', kind: 'PHARMACY', sortOrder: 21,
    name: 'Paediatric GA — Drugs (weight-based)',
    description: 'Paediatric general anaesthesia — confirm all doses by weight (APA).',
    drugs: [
      { name: 'Propofol / Sevoflurane induction', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: 'Propofol 3–4 mg/kg', route: 'IV/Inhalation' },
      { name: 'Atropine', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '20 mcg/kg (min 100 mcg)', route: 'IV' },
      { name: 'Fentanyl', quantity: 1, unit: 'ampoule', drugType: 'ANALGESIC', dosage: '1 mcg/kg', route: 'IV' },
      { name: 'Atracurium', quantity: 1, unit: 'ampoule', drugType: 'ANAESTHETIC_ADJUNCT', dosage: '0.5 mg/kg', route: 'IV' },
      { name: 'Paracetamol (IV/PR)', quantity: 1, unit: 'vial', drugType: 'ANALGESIC', dosage: '15 mg/kg', route: 'IV/PR' },
      { name: 'Dexamethasone + Ondansetron', quantity: 1, unit: 'set', drugType: 'OTHER', notes: 'PONV prophylaxis, weight-based.' },
      { name: "Ringer's Lactate / maintenance fluid", quantity: 1, unit: 'bag', drugType: 'IV_FLUID', dosage: 'per weight', route: 'IV' },
    ],
  },
  {
    technique: 'Paediatric', kind: 'CONSUMABLE', sortOrder: 22,
    name: 'Paediatric GA — Consumables (sized)',
    description: 'Size-appropriate paediatric airway + circuit.',
    consumables: [
      { name: 'Paediatric ETT (uncuffed/microcuff, assorted)', quantity: 3, unit: 'piece', category: 'ANAESTHESIA_AIRWAY', size: 'age/weight-based' },
      { name: 'Paediatric LMA (sizes 1–2.5)', quantity: 1, unit: 'piece', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'Paediatric face masks + Guedel airways', quantity: 1, unit: 'set', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'Paediatric breathing circuit (Ayre’s T-piece/Jackson-Rees)', quantity: 1, unit: 'piece', category: 'ANAESTHESIA_AIRWAY' },
      { name: 'Paediatric IV cannula (22G/24G)', quantity: 2, unit: 'piece', category: 'CATHETERS_TUBING' },
      { name: 'Paediatric ECG electrodes + small NIBP cuff + SpO2', quantity: 1, unit: 'set', category: 'OTHER' },
    ],
  },
  {
    technique: 'Adjunct', kind: 'CONSUMABLE', sortOrder: 23,
    name: 'Invasive Monitoring (cardiac / major / tumour)',
    description: 'Arterial + central venous access for high-risk / major cases.',
    consumables: [
      { name: 'Arterial line cannula + transducer set', quantity: 1, unit: 'set', category: 'CATHETERS_TUBING' },
      { name: 'Central venous catheter kit (multi-lumen)', quantity: 1, unit: 'kit', category: 'CATHETERS_TUBING' },
      { name: 'Pressure transducer + flush set', quantity: 1, unit: 'set', category: 'CATHETERS_TUBING' },
      { name: 'Ultrasound probe cover + gel (for CVC)', quantity: 1, unit: 'set', category: 'OTHER' },
      { name: 'Central line dressing + fixation', quantity: 1, unit: 'set', category: 'DRESSING_PACKS' },
    ],
  },
  {
    technique: 'Adjunct', kind: 'PHARMACY', sortOrder: 24,
    name: 'Diabetic / Comorbidity Adjuncts',
    description: 'Glycaemic control + common comorbidity adjuncts.',
    drugs: [
      { name: 'Soluble insulin (sliding scale)', quantity: 1, unit: 'vial', drugType: 'OTHER', route: 'IV infusion', notes: 'Monitor CBG hourly.' },
      { name: 'Dextrose 5% / 10%', quantity: 1, unit: 'bag', drugType: 'IV_FLUID', route: 'IV' },
      { name: '50% Dextrose (hypoglycaemia rescue)', quantity: 1, unit: 'ampoule', drugType: 'OTHER', route: 'IV' },
      { name: 'GTN (for hypertension/ischaemia)', quantity: 1, unit: 'vial', drugType: 'OTHER', route: 'IV infusion' },
      { name: 'Labetalol / Hydralazine', quantity: 1, unit: 'ampoule', drugType: 'OTHER', route: 'IV', notes: 'BP control.' },
      { name: 'Salbutamol nebules + Hydrocortisone (reactive airway)', quantity: 1, unit: 'set', drugType: 'OTHER', route: 'Nebulised/IV' },
    ],
  },
];

// ===========================================================================
export async function seedAnaesthesiaPacks(
  prisma: PrismaClient,
  opts: { isActive?: boolean; createdByName?: string } = {},
): Promise<{ created: number; updated: number; packs: number; items: number }> {
  const isActive = opts.isActive ?? true;
  const createdByName = opts.createdByName ?? 'System Seed';
  let created = 0, updated = 0, itemCount = 0;

  for (const p of ANAESTHESIA_PACK_SEED) {
    const subspecialty = `${ANAESTHESIA_PREFIX}${p.technique}`;
    const rawItems = (p.kind === 'CONSUMABLE' ? p.consumables : p.drugs) ?? [];
    const items = rawItems.map((it, i) =>
      p.kind === 'CONSUMABLE'
        ? {
            name: it.name, quantity: it.quantity, unit: (it as Cons).unit ?? 'piece',
            category: (it as Cons).category ?? 'OTHER', size: (it as Cons).size ?? null,
            notes: (it as Cons).notes ?? null, sortOrder: i,
          }
        : {
            name: it.name, quantity: it.quantity, unit: (it as Drug).unit ?? 'vial',
            drugType: (it as Drug).drugType ?? 'OTHER', dosage: (it as Drug).dosage ?? null,
            route: (it as Drug).route ?? null, notes: (it as Drug).notes ?? null, sortOrder: i,
          },
    );
    itemCount += items.length;

    const existing = await prisma.surgicalPack.findFirst({
      where: { name: p.name, subspecialty, kind: p.kind as any },
      select: { id: true },
    });
    if (existing) {
      await prisma.surgicalPackItem.deleteMany({ where: { packId: existing.id } });
      await prisma.surgicalPack.update({
        where: { id: existing.id },
        data: { description: p.description ?? null, isActive, sortOrder: p.sortOrder ?? 0, items: { create: items as any } },
      });
      updated++;
    } else {
      await prisma.surgicalPack.create({
        data: {
          name: p.name, subspecialty, kind: p.kind as any, description: p.description ?? null,
          isActive, sortOrder: p.sortOrder ?? 0, createdByName, items: { create: items as any },
        },
      });
      created++;
    }
  }
  return { created, updated, packs: ANAESTHESIA_PACK_SEED.length, items: itemCount };
}
