// ============================================================
// Minimum standard packs, by what the operation actually is
// ------------------------------------------------------------
// There are 588 procedures in the catalogue and more are added at booking, so a
// hand-written pack for each is neither possible nor safe to maintain — the
// hundredth list would be four years out of date and nobody would know which.
//
// So a pack is COMPOSED: the mandatory base theatre pack, plus what the
// APPROACH needs (an abdomen opened, a joint replaced, a scope passed), plus
// what the FAMILY of operation needs, scaled by operative magnitude. A
// procedure nobody has ever booked before still gets a defensible pack, because
// its family and approach are read from its name and subspecialty.
//
// WHERE THE CLINICAL CONTENT COMES FROM. The antimicrobial prophylaxis follows
// the ASHP/IDSA/SIS/SHEA clinical practice guidelines for antimicrobial
// prophylaxis in surgery (Am J Health-Syst Pharm 2013;70:195-283); the base
// theatre requirements follow the WHO Generic Essential Emergency Equipment
// List and the WHO integrated management for emergency and essential surgical
// care supply lists; the suture lines are the Ethicon wound closure catalogue,
// which this hospital has standardised on. Each block records its basis so a
// pharmacist reviewing it can see what it was built from.
//
// WHAT THIS IS NOT. It is not a prescription and it is not a protocol. Every
// pack it produces is a DRAFT the surgeon edits and submits; the antibiotic is
// offered as the guideline options with the choice left open, because choosing
// the agent for a particular patient is a clinical decision and this is a
// stores list. Nothing here is auto-submitted and nothing reaches a pharmacy
// without a named person sending it.
// ============================================================

import type { SurgeryMagnitude } from '@/lib/baseConsumablePack';

// ── Families ────────────────────────────────────────────────────────────────

export type ProcedureFamily =
  | 'LAPAROTOMY' | 'LAPAROSCOPIC' | 'APPENDICECTOMY' | 'COLORECTAL' | 'BILIARY'
  | 'HERNIA' | 'BREAST' | 'ENDOCRINE_NECK'
  | 'CAESAREAN' | 'HYSTERECTOMY' | 'GYNAE_VAGINAL' | 'OBSTETRIC_OTHER'
  | 'ARTHROPLASTY' | 'FRACTURE_FIXATION' | 'OPEN_FRACTURE' | 'ORTHOPAEDIC_SOFT_TISSUE'
  | 'CRANIOTOMY' | 'SPINAL' | 'CSF_SHUNT'
  | 'UROLOGY_ENDOSCOPIC' | 'UROLOGY_OPEN'
  | 'ENT_CLEAN' | 'ENT_AERODIGESTIVE'
  | 'OPHTHALMIC' | 'MAXILLOFACIAL'
  | 'SKIN_GRAFT_FLAP' | 'SUPERFICIAL'
  | 'CARDIAC' | 'THORACIC' | 'VASCULAR'
  | 'ENDOSCOPY_DIAGNOSTIC'
  | 'GENERAL';

export const FAMILY_LABEL: Record<ProcedureFamily, string> = {
  LAPAROTOMY: 'Open abdominal', LAPAROSCOPIC: 'Laparoscopic',
  APPENDICECTOMY: 'Appendicectomy', COLORECTAL: 'Colorectal', BILIARY: 'Biliary',
  HERNIA: 'Hernia repair', BREAST: 'Breast', ENDOCRINE_NECK: 'Thyroid / parathyroid',
  CAESAREAN: 'Caesarean section', HYSTERECTOMY: 'Hysterectomy',
  GYNAE_VAGINAL: 'Vaginal / intrauterine', OBSTETRIC_OTHER: 'Obstetric',
  ARTHROPLASTY: 'Joint replacement', FRACTURE_FIXATION: 'Fracture fixation',
  OPEN_FRACTURE: 'Open fracture', ORTHOPAEDIC_SOFT_TISSUE: 'Orthopaedic soft tissue',
  CRANIOTOMY: 'Craniotomy', SPINAL: 'Spinal', CSF_SHUNT: 'CSF shunt',
  UROLOGY_ENDOSCOPIC: 'Endoscopic urology', UROLOGY_OPEN: 'Open urology',
  ENT_CLEAN: 'ENT clean', ENT_AERODIGESTIVE: 'ENT aerodigestive',
  OPHTHALMIC: 'Ophthalmic', MAXILLOFACIAL: 'Maxillofacial',
  SKIN_GRAFT_FLAP: 'Graft or flap', SUPERFICIAL: 'Superficial / minor',
  CARDIAC: 'Cardiac', THORACIC: 'Thoracic', VASCULAR: 'Vascular',
  ENDOSCOPY_DIAGNOSTIC: 'Diagnostic endoscopy', GENERAL: 'General',
};

/**
 * Name patterns, most specific first.
 *
 * Order matters: "laparoscopic appendicectomy" must land on APPENDICECTOMY for
 * its prophylaxis and pick up the laparoscopic consumables separately, which is
 * why the approach is worked out on its own below.
 */
const FAMILY_PATTERNS: Array<{ re: RegExp; family: ProcedureFamily }> = [
  // Cranial first. These names share words with other specialties
  // ('evacuation', 'fixation') and a craniotomy matched elsewhere loses its
  // bone wax, its haemostat and its head pins.
  { re: /\b(craniot|cranioplast|burr ?hole|aneurysm clip|\bedh\b|\bsdh\b|extradural|subdural|evacuation of (haematoma|hematoma))/i, family: 'CRANIOTOMY' },
  { re: /\b(appendic|appendec)/i, family: 'APPENDICECTOMY' },
  { re: /\b(colect|hemicolect|colostom|ileostom|anterior resection|abdominoperineal|colorect|sigmoid|rectopexy|haemorrhoid|hemorrhoid|fistula.?in.?ano|anal|pilonidal)/i, family: 'COLORECTAL' },
  { re: /\b(cholecystect|biliary|choledoch|bile duct|hepaticojejunost)/i, family: 'BILIARY' },
  { re: /\b(herni|hernio)/i, family: 'HERNIA' },
  { re: /\b(mastect|lumpect|breast|axillary clearance)/i, family: 'BREAST' },
  { re: /\b(thyroid|parathyroid|goitre|goiter)/i, family: 'ENDOCRINE_NECK' },

  { re: /\b(caesar|cesar|\bc.?section\b)/i, family: 'CAESAREAN' },
  { re: /\b(hysterect|myomect)/i, family: 'HYSTERECTOMY' },
  // 'evacuation' alone is not gynaecological — a craniotomy for evacuation of
  // a haematoma matched here and would have been sent a vaginal pack and no
  // bone wax. It must carry its uterine context.
  { re: /\b(evacuation of retained|uterine evacuation|evacuation of the uterus|\bd&c\b|dilatation and curettage|manual vacuum|cervical|colporrhaph|vaginal|marsupial|bartholin)/i, family: 'GYNAE_VAGINAL' },
  { re: /\b(salping|oophor|ectopic|ovarian cystect|tubal)/i, family: 'LAPAROTOMY' },

  { re: /\b(arthroplast|hip replacement|knee replacement|hemiarthroplast|prosthe)/i, family: 'ARTHROPLASTY' },
  { re: /\b(open fracture|debridement of (open )?fracture|gustilo)/i, family: 'OPEN_FRACTURE' },
  { re: /\b(orif|internal fixation|plating|nailing|\bk.?wire|external fixat|fracture)/i, family: 'FRACTURE_FIXATION' },
  { re: /\b(tendon|ligament|arthroscop|menisc|carpal tunnel|ganglion|amputation)/i, family: 'ORTHOPAEDIC_SOFT_TISSUE' },

  { re: /\b(laminect|discect|spinal|spine|kyphoplast|fusion)/i, family: 'SPINAL' },
  { re: /\b(shunt|ventriculoperitoneal|\bvp shunt|myelomeningocele|encephalocele)/i, family: 'CSF_SHUNT' },

  { re: /\b(turp|cystoscop|ureteroscop|urethroscop|transurethral|\bpcnl\b|lithotrips|\bdj stent|double.?j)/i, family: 'UROLOGY_ENDOSCOPIC' },
  { re: /\b(nephrect|prostatect|pyelolithot|ureterolithot|cystect|orchid|hydrocel|circumcis|urethroplast|vesicolithot|varicocel)/i, family: 'UROLOGY_OPEN' },

  { re: /\b(tonsillect|adenoid|laryngect|tracheost|pharyng|glossect|neck dissection|maxillect)/i, family: 'ENT_AERODIGESTIVE' },
  { re: /\b(myringot|mastoid|septoplast|rhinoplast|antrostom|polypect|grommet|stapedect|\bfess\b)/i, family: 'ENT_CLEAN' },

  { re: /\b(cataract|trabeculect|vitrect|squint|strabismus|pterygium|enucleat|eviscerat|keratoplast|dacryocyst)/i, family: 'OPHTHALMIC' },
  { re: /\b(mandib|maxillofac|\borif of (mandible|maxilla)|cleft|alveolar|odontect|temporomandib)/i, family: 'MAXILLOFACIAL' },

  { re: /\b(skin graft|\bssg\b|\bftsg\b|flap|z.?plasty|contracture release)/i, family: 'SKIN_GRAFT_FLAP' },
  { re: /\b(cabg|coronary artery bypass|valve replacement|valvotom|pericardiect|cardiac)/i, family: 'CARDIAC' },
  { re: /\b(thoracot|lobect|pneumonect|decortic|thoracoscop|chest tube|pleurodes|mediastin)/i, family: 'THORACIC' },
  { re: /\b(vascular|arteriovenous fistula|\bavf\b|embolect|aneurysm repair|bypass graft|varicose vein)/i, family: 'VASCULAR' },

  { re: /\b(examination under an|\beua\b|biops|excision of (cyst|lipoma)|lipoma|cyst|incision and drainage|\bi&d\b|abscess|wound debridement|suturing|toilet and)/i, family: 'SUPERFICIAL' },
  { re: /\b(endoscop|gastroscop|colonoscop|sigmoidoscop|bronchoscop)/i, family: 'ENDOSCOPY_DIAGNOSTIC' },
  { re: /\b(laparotom|explorat)/i, family: 'LAPAROTOMY' },
];

/** Fallback by subspecialty, when the name says nothing recognisable. */
const SUBSPECIALTY_DEFAULT: Record<string, ProcedureFamily> = {
  'General Surgery': 'LAPAROTOMY',
  'Obstetrics & Gynaecology': 'OBSTETRIC_OTHER',
  Orthopaedics: 'ORTHOPAEDIC_SOFT_TISSUE',
  Neurosurgery: 'CRANIOTOMY',
  Urology: 'UROLOGY_OPEN',
  'ENT (Otorhinolaryngology)': 'ENT_CLEAN',
  Ophthalmology: 'OPHTHALMIC',
  'Maxillofacial Surgery': 'MAXILLOFACIAL',
  'Plastic Surgery': 'SKIN_GRAFT_FLAP',
  'Paediatric Surgery': 'LAPAROTOMY',
  'Cardiothoracic Surgery': 'THORACIC',
};

export function familyOf(procedureName: string, subspecialty?: string | null): ProcedureFamily {
  const name = (procedureName ?? '').trim();
  if (name) {
    const hit = FAMILY_PATTERNS.find((p) => p.re.test(name));
    if (hit) return hit.family;
  }
  return SUBSPECIALTY_DEFAULT[(subspecialty ?? '').trim()] ?? 'GENERAL';
}

// ── Approach ────────────────────────────────────────────────────────────────

export type Approach = 'OPEN' | 'LAPAROSCOPIC' | 'ENDOSCOPIC' | 'MICROSCOPIC' | 'PERCUTANEOUS';

/**
 * How the operation is done, which decides a whole block of consumables
 * independently of what is being operated on.
 *
 * Separate from the family so "laparoscopic appendicectomy" gets appendicectomy
 * prophylaxis AND laparoscopy consumables. Bundling them would need a family
 * for every combination.
 */
export function approachOf(procedureName: string, family: ProcedureFamily): Approach {
  const n = (procedureName ?? '').toLowerCase();
  if (/\blaparoscop|\bthoracoscop|\bkeyhole|\bminimal(ly)? invasive/.test(n)) return 'LAPAROSCOPIC';
  if (/\bendoscop|\bcystoscop|\bureteroscop|transurethral|\bturp\b|\bgastroscop|\bcolonoscop|\bbronchoscop|\bfess\b/.test(n)) return 'ENDOSCOPIC';
  if (/\bpercutaneous|\bpcnl\b|\bclosed reduction/.test(n)) return 'PERCUTANEOUS';
  if (family === 'OPHTHALMIC' || /\bmicro(surgical|scopic|discect)/.test(n)) return 'MICROSCOPIC';
  if (family === 'UROLOGY_ENDOSCOPIC' || family === 'ENDOSCOPY_DIAGNOSTIC') return 'ENDOSCOPIC';
  return 'OPEN';
}

// ── Antimicrobial prophylaxis ───────────────────────────────────────────────

export interface ProphylaxisOption {
  /** Generic agent. The brand is the surgeon's choice — see ANTIBIOTIC_BRANDS. */
  agent: string;
  /** Standard adult intravenous prophylactic dose from the guideline. */
  adultDose: string;
  route: string;
  note?: string;
}

export interface ProphylaxisAdvice {
  /** Empty means the guideline does not recommend routine prophylaxis. */
  firstLine: ProphylaxisOption[];
  /** For a documented beta-lactam allergy. */
  betaLactamAllergy: ProphylaxisOption[];
  /** Why this group, in words a pharmacist can check. */
  basis: string;
  /** Said out loud where the guideline itself says none is indicated. */
  routineNotIndicated?: boolean;
}

const CEFAZOLIN: ProphylaxisOption = {
  agent: 'Cefazolin', adultDose: '2 g', route: 'IV',
  note: 'Within 60 minutes of incision. 3 g if over 120 kg.',
};
const CEFUROXIME: ProphylaxisOption = { agent: 'Cefuroxime', adultDose: '1.5 g', route: 'IV' };
const METRONIDAZOLE: ProphylaxisOption = { agent: 'Metronidazole', adultDose: '500 mg', route: 'IV' };
const CLINDAMYCIN: ProphylaxisOption = { agent: 'Clindamycin', adultDose: '900 mg', route: 'IV' };
const GENTAMICIN: ProphylaxisOption = {
  agent: 'Gentamicin', adultDose: '5 mg/kg', route: 'IV',
  note: 'Weight-based. Check renal function.',
};
const VANCOMYCIN: ProphylaxisOption = {
  agent: 'Vancomycin', adultDose: '15 mg/kg', route: 'IV',
  note: 'Start the infusion 120 minutes before incision.',
};
const CEFTRIAXONE: ProphylaxisOption = { agent: 'Ceftriaxone', adultDose: '2 g', route: 'IV' };
const CIPROFLOXACIN: ProphylaxisOption = { agent: 'Ciprofloxacin', adultDose: '400 mg', route: 'IV' };

const ASHP = 'ASHP/IDSA/SIS/SHEA clinical practice guidelines for antimicrobial prophylaxis in surgery (2013)';

export const PROPHYLAXIS: Record<ProcedureFamily, ProphylaxisAdvice> = {
  APPENDICECTOMY: {
    firstLine: [CEFAZOLIN, METRONIDAZOLE],
    betaLactamAllergy: [CLINDAMYCIN, GENTAMICIN],
    basis: `${ASHP} — appendicectomy, uncomplicated.`,
  },
  COLORECTAL: {
    firstLine: [CEFAZOLIN, METRONIDAZOLE],
    betaLactamAllergy: [CLINDAMYCIN, GENTAMICIN],
    basis: `${ASHP} — colorectal.`,
  },
  BILIARY: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN, GENTAMICIN],
    basis: `${ASHP} — biliary tract, open. Ceftriaxone is an alternative first line.`,
  },
  LAPAROTOMY: {
    firstLine: [CEFAZOLIN, METRONIDAZOLE],
    betaLactamAllergy: [CLINDAMYCIN, GENTAMICIN],
    basis: `${ASHP} — gastroduodenal / abdominal with gastrointestinal entry.`,
  },
  LAPAROSCOPIC: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN],
    basis: `${ASHP} — abdominal, by the operation performed.`,
  },
  HERNIA: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN, VANCOMYCIN],
    basis: `${ASHP} — hernia repair.`,
  },
  BREAST: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN, VANCOMYCIN],
    basis: `${ASHP} — breast, clean with risk factors.`,
  },
  ENDOCRINE_NECK: {
    firstLine: [],
    betaLactamAllergy: [],
    basis: `${ASHP} — head and neck, clean: routine prophylaxis not indicated.`,
    routineNotIndicated: true,
  },
  CAESAREAN: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN, GENTAMICIN],
    basis: `${ASHP} — caesarean delivery. Give before incision, not after cord clamping.`,
  },
  HYSTERECTOMY: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN, GENTAMICIN],
    basis: `${ASHP} — hysterectomy.`,
  },
  GYNAE_VAGINAL: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN],
    basis: `${ASHP} — gynaecological, by the procedure performed.`,
  },
  OBSTETRIC_OTHER: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN],
    basis: `${ASHP} — obstetric, by the procedure performed.`,
  },
  ARTHROPLASTY: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN, VANCOMYCIN],
    basis: `${ASHP} — total joint replacement.`,
  },
  FRACTURE_FIXATION: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN, VANCOMYCIN],
    basis: `${ASHP} — hip fracture repair / internal fixation.`,
  },
  OPEN_FRACTURE: {
    firstLine: [CEFAZOLIN, GENTAMICIN],
    betaLactamAllergy: [CLINDAMYCIN, GENTAMICIN],
    basis: 'Open fracture: this is TREATMENT, not prophylaxis, and its duration is a clinical decision. Grade and contamination govern the regimen.',
  },
  ORTHOPAEDIC_SOFT_TISSUE: {
    firstLine: [],
    betaLactamAllergy: [],
    basis: `${ASHP} — clean orthopaedic without implant: routine prophylaxis not indicated.`,
    routineNotIndicated: true,
  },
  CRANIOTOMY: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN, VANCOMYCIN],
    basis: `${ASHP} — craniotomy.`,
  },
  SPINAL: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN, VANCOMYCIN],
    basis: `${ASHP} — spinal procedures.`,
  },
  CSF_SHUNT: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN, VANCOMYCIN],
    basis: `${ASHP} — CSF-shunting procedures.`,
  },
  UROLOGY_ENDOSCOPIC: {
    firstLine: [CIPROFLOXACIN],
    betaLactamAllergy: [GENTAMICIN],
    basis: `${ASHP} — lower tract instrumentation with risk factors. Cefazolin is an alternative.`,
  },
  UROLOGY_OPEN: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN, GENTAMICIN],
    basis: `${ASHP} — urological, clean or with prosthesis.`,
  },
  ENT_CLEAN: {
    firstLine: [],
    betaLactamAllergy: [],
    basis: `${ASHP} — head and neck, clean: routine prophylaxis not indicated.`,
    routineNotIndicated: true,
  },
  ENT_AERODIGESTIVE: {
    firstLine: [CEFAZOLIN, METRONIDAZOLE],
    betaLactamAllergy: [CLINDAMYCIN],
    basis: `${ASHP} — head and neck, clean-contaminated. Cefuroxime + metronidazole is an alternative.`,
  },
  OPHTHALMIC: {
    firstLine: [],
    betaLactamAllergy: [],
    basis: 'Ophthalmic: topical and intracameral practice governs, and is the surgeon’s decision. No systemic prophylaxis is generated.',
    routineNotIndicated: true,
  },
  MAXILLOFACIAL: {
    firstLine: [CEFAZOLIN, METRONIDAZOLE],
    betaLactamAllergy: [CLINDAMYCIN],
    basis: `${ASHP} — head and neck, clean-contaminated where the aerodigestive tract is entered.`,
  },
  SKIN_GRAFT_FLAP: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN, VANCOMYCIN],
    basis: `${ASHP} — plastic surgery, clean with risk factors.`,
  },
  SUPERFICIAL: {
    firstLine: [],
    betaLactamAllergy: [],
    basis: 'Clean superficial procedure: routine prophylaxis not indicated. An established infection is treated, not prophylaxed.',
    routineNotIndicated: true,
  },
  CARDIAC: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN, VANCOMYCIN],
    basis: `${ASHP} — cardiac. Cefuroxime is an alternative first line.`,
  },
  THORACIC: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN, VANCOMYCIN],
    basis: `${ASHP} — non-cardiac thoracic.`,
  },
  VASCULAR: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN, VANCOMYCIN],
    basis: `${ASHP} — vascular.`,
  },
  ENDOSCOPY_DIAGNOSTIC: {
    firstLine: [],
    betaLactamAllergy: [],
    basis: 'Diagnostic endoscopy: routine prophylaxis not indicated.',
    routineNotIndicated: true,
  },
  GENERAL: {
    firstLine: [CEFAZOLIN],
    betaLactamAllergy: [CLINDAMYCIN],
    basis: `${ASHP} — general default. Confirm against the operation actually planned.`,
  },
};

/** Alternatives offered beside the first line, so the choice is visibly open. */
export const ALTERNATIVE_AGENTS: ProphylaxisOption[] = [
  CEFUROXIME, CEFTRIAXONE, GENTAMICIN, METRONIDAZOLE, CLINDAMYCIN, VANCOMYCIN, CIPROFLOXACIN,
];

/**
 * Brands stocked for each generic agent, for the surgeon's dropdown.
 *
 * A brand is a procurement choice, not a clinical one — the agent and the dose
 * are what matter to the patient. Kept editable here because what the pharmacy
 * actually holds changes with the tender.
 */
export const ANTIBIOTIC_BRANDS: Record<string, string[]> = {
  Cefazolin: ['Any available generic', 'Kefzol', 'Ancef', 'Cefamezin', 'Zolicef'],
  Cefuroxime: ['Any available generic', 'Zinacef', 'Zinnat', 'Cefurox', 'Furoxime'],
  Ceftriaxone: ['Any available generic', 'Rocephin', 'Ceftrix', 'Emzor Ceftriaxone', 'Rocefin'],
  Metronidazole: ['Any available generic', 'Flagyl', 'Metrozol', 'Unimetro', 'Emzor Metronidazole'],
  Clindamycin: ['Any available generic', 'Dalacin C', 'Clindacin', 'Clinsol'],
  Gentamicin: ['Any available generic', 'Garamycin', 'Gentacin', 'Emzor Gentamicin'],
  Vancomycin: ['Any available generic', 'Vancocin', 'Vancorin'],
  Ciprofloxacin: ['Any available generic', 'Ciprotab', 'Ciloxan', 'Cifran', 'Emzor Ciprofloxacin'],
};

// ── Sutures ─────────────────────────────────────────────────────────────────

export interface SutureLine {
  /** The Ethicon product name. The hospital has standardised on Ethicon. */
  brand: string;
  material: string;
  absorbable: boolean;
  gauge: string;
  needle?: string;
  /** What it is on the pack for. */
  use: string;
}

/**
 * The Ethicon lines this hospital stocks, from the Ethicon wound closure
 * catalogue. A pack names the product, not "suture 2/0" — the theatre is sent
 * what was asked for, and a request nobody can read is a request somebody
 * substitutes.
 */
export const ETHICON: Record<string, SutureLine> = {
  VICRYL_1: { brand: 'Coated VICRYL', material: 'Polyglactin 910, braided', absorbable: true, gauge: '1', needle: 'Round-bodied', use: 'Abdominal wall / mass closure' },
  VICRYL_2_0: { brand: 'Coated VICRYL', material: 'Polyglactin 910, braided', absorbable: true, gauge: '2/0', needle: 'Round-bodied', use: 'Deep layers, peritoneum, uterus' },
  VICRYL_3_0: { brand: 'Coated VICRYL', material: 'Polyglactin 910, braided', absorbable: true, gauge: '3/0', needle: 'Round-bodied', use: 'Subcutaneous, bowel, ligation' },
  VICRYL_4_0: { brand: 'Coated VICRYL', material: 'Polyglactin 910, braided', absorbable: true, gauge: '4/0', needle: 'Round-bodied', use: 'Fine deep layers, paediatric' },
  VICRYL_RAPIDE_3_0: { brand: 'VICRYL RAPIDE', material: 'Polyglactin 910, rapid absorbing', absorbable: true, gauge: '3/0', use: 'Perineal and superficial skin' },
  MONOCRYL_3_0: { brand: 'MONOCRYL', material: 'Poliglecaprone 25, monofilament', absorbable: true, gauge: '3/0', needle: 'Cutting', use: 'Subcuticular skin closure' },
  MONOCRYL_4_0: { brand: 'MONOCRYL', material: 'Poliglecaprone 25, monofilament', absorbable: true, gauge: '4/0', needle: 'Cutting', use: 'Fine subcuticular skin' },
  PDS_1: { brand: 'PDS II', material: 'Polydioxanone, monofilament', absorbable: true, gauge: '1', needle: 'Round-bodied', use: 'Abdominal wall where slow healing is expected' },
  PDS_3_0: { brand: 'PDS II', material: 'Polydioxanone, monofilament', absorbable: true, gauge: '3/0', use: 'Slow-healing deep tissue, paediatric' },
  PROLENE_2_0: { brand: 'PROLENE', material: 'Polypropylene, monofilament', absorbable: false, gauge: '2/0', use: 'Mesh fixation, fascia, vascular' },
  PROLENE_3_0: { brand: 'PROLENE', material: 'Polypropylene, monofilament', absorbable: false, gauge: '3/0', use: 'Vascular anastomosis, mesh' },
  PROLENE_5_0: { brand: 'PROLENE', material: 'Polypropylene, monofilament', absorbable: false, gauge: '5/0', use: 'Fine vascular, cardiac' },
  PROLENE_6_0: { brand: 'PROLENE', material: 'Polypropylene, monofilament', absorbable: false, gauge: '6/0', use: 'Microvascular, cardiac' },
  ETHILON_2_0: { brand: 'ETHILON', material: 'Nylon, monofilament', absorbable: false, gauge: '2/0', needle: 'Cutting', use: 'Skin, drain fixation' },
  ETHILON_3_0: { brand: 'ETHILON', material: 'Nylon, monofilament', absorbable: false, gauge: '3/0', needle: 'Cutting', use: 'Skin closure' },
  ETHILON_4_0: { brand: 'ETHILON', material: 'Nylon, monofilament', absorbable: false, gauge: '4/0', needle: 'Cutting', use: 'Face and fine skin' },
  ETHIBOND_2_0: { brand: 'ETHIBOND EXCEL', material: 'Polyester, braided', absorbable: false, gauge: '2/0', use: 'Tendon, cardiac, high-tension' },
  MERSILK_2_0: { brand: 'MERSILK', material: 'Silk, braided', absorbable: false, gauge: '2/0', use: 'Ligation, drain fixation' },
  MERSILK_3_0: { brand: 'MERSILK', material: 'Silk, braided', absorbable: false, gauge: '3/0', use: 'Ligation' },
};

/** Which lines a family's pack carries, and how many of each at MAJOR. */
const SUTURE_SETS: Record<ProcedureFamily, Array<[keyof typeof ETHICON, number]>> = {
  LAPAROTOMY: [['VICRYL_1', 3], ['VICRYL_2_0', 3], ['VICRYL_3_0', 2], ['MONOCRYL_3_0', 2], ['MERSILK_2_0', 2]],
  LAPAROSCOPIC: [['VICRYL_2_0', 2], ['MONOCRYL_3_0', 2], ['MERSILK_2_0', 1]],
  APPENDICECTOMY: [['VICRYL_1', 2], ['VICRYL_2_0', 2], ['VICRYL_3_0', 2], ['MONOCRYL_3_0', 2]],
  COLORECTAL: [['VICRYL_1', 3], ['VICRYL_2_0', 3], ['VICRYL_3_0', 4], ['PDS_3_0', 2], ['MONOCRYL_3_0', 2]],
  BILIARY: [['VICRYL_1', 2], ['VICRYL_2_0', 2], ['VICRYL_3_0', 2], ['MONOCRYL_3_0', 2], ['MERSILK_2_0', 2]],
  HERNIA: [['PROLENE_2_0', 2], ['VICRYL_2_0', 2], ['MONOCRYL_3_0', 2]],
  BREAST: [['VICRYL_2_0', 2], ['VICRYL_3_0', 2], ['MONOCRYL_3_0', 2], ['ETHILON_3_0', 1]],
  ENDOCRINE_NECK: [['VICRYL_3_0', 3], ['MONOCRYL_4_0', 2], ['MERSILK_3_0', 2]],
  CAESAREAN: [['VICRYL_1', 3], ['VICRYL_2_0', 3], ['MONOCRYL_3_0', 2]],
  HYSTERECTOMY: [['VICRYL_1', 3], ['VICRYL_2_0', 4], ['VICRYL_3_0', 2], ['MONOCRYL_3_0', 2]],
  GYNAE_VAGINAL: [['VICRYL_RAPIDE_3_0', 3], ['VICRYL_2_0', 2]],
  OBSTETRIC_OTHER: [['VICRYL_RAPIDE_3_0', 3], ['VICRYL_2_0', 2], ['MONOCRYL_3_0', 1]],
  ARTHROPLASTY: [['VICRYL_1', 3], ['VICRYL_2_0', 3], ['MONOCRYL_3_0', 2], ['ETHILON_2_0', 2]],
  FRACTURE_FIXATION: [['VICRYL_2_0', 3], ['VICRYL_3_0', 2], ['ETHILON_2_0', 2], ['MONOCRYL_3_0', 1]],
  OPEN_FRACTURE: [['VICRYL_2_0', 3], ['ETHILON_2_0', 3], ['MERSILK_2_0', 2]],
  ORTHOPAEDIC_SOFT_TISSUE: [['VICRYL_3_0', 2], ['ETHILON_3_0', 2], ['ETHIBOND_2_0', 1]],
  CRANIOTOMY: [['VICRYL_3_0', 3], ['ETHILON_3_0', 2], ['PROLENE_3_0', 1], ['MERSILK_3_0', 1]],
  SPINAL: [['VICRYL_1', 2], ['VICRYL_2_0', 3], ['MONOCRYL_3_0', 2], ['ETHILON_2_0', 1]],
  CSF_SHUNT: [['VICRYL_3_0', 3], ['MONOCRYL_4_0', 2], ['PROLENE_3_0', 1]],
  UROLOGY_ENDOSCOPIC: [['VICRYL_3_0', 1], ['ETHILON_3_0', 1]],
  UROLOGY_OPEN: [['VICRYL_2_0', 3], ['VICRYL_3_0', 3], ['VICRYL_4_0', 2], ['MONOCRYL_3_0', 2]],
  ENT_CLEAN: [['VICRYL_3_0', 2], ['ETHILON_4_0', 2], ['MERSILK_3_0', 1]],
  ENT_AERODIGESTIVE: [['VICRYL_2_0', 3], ['VICRYL_3_0', 3], ['MERSILK_2_0', 2], ['ETHILON_3_0', 2]],
  OPHTHALMIC: [['ETHILON_4_0', 1], ['VICRYL_4_0', 2]],
  MAXILLOFACIAL: [['VICRYL_3_0', 3], ['VICRYL_4_0', 2], ['ETHILON_4_0', 2], ['PROLENE_5_0', 1]],
  SKIN_GRAFT_FLAP: [['VICRYL_3_0', 2], ['MONOCRYL_4_0', 3], ['ETHILON_4_0', 3], ['MERSILK_3_0', 2]],
  SUPERFICIAL: [['VICRYL_3_0', 1], ['ETHILON_3_0', 2], ['MONOCRYL_4_0', 1]],
  CARDIAC: [['PROLENE_3_0', 4], ['PROLENE_5_0', 4], ['PROLENE_6_0', 2], ['ETHIBOND_2_0', 4], ['VICRYL_1', 2]],
  THORACIC: [['VICRYL_1', 3], ['VICRYL_2_0', 3], ['PROLENE_3_0', 2], ['MONOCRYL_3_0', 2]],
  VASCULAR: [['PROLENE_5_0', 4], ['PROLENE_6_0', 2], ['PROLENE_3_0', 2], ['VICRYL_2_0', 2]],
  ENDOSCOPY_DIAGNOSTIC: [],
  GENERAL: [['VICRYL_2_0', 2], ['VICRYL_3_0', 2], ['MONOCRYL_3_0', 2], ['ETHILON_3_0', 1]],
};

/** Suture lines for a family, scaled by magnitude. */
export function suturesFor(
  family: ProcedureFamily,
  magnitude: SurgeryMagnitude,
): Array<{ line: SutureLine; quantity: number }> {
  const scale = magnitude === 'MAJOR' ? 1 : magnitude === 'INTERMEDIATE' ? 0.7 : 0.5;
  return (SUTURE_SETS[family] ?? SUTURE_SETS.GENERAL).map(([key, atMajor]) => ({
    line: ETHICON[key],
    // Never below one: a pack that lists a suture and asks for none of it is
    // worse than not listing it, because the theatre reads the line and assumes.
    quantity: Math.max(1, Math.round(atMajor * scale)),
  }));
}

// ── Approach and family consumables ─────────────────────────────────────────

export interface StandardItem {
  name: string;
  category: string;
  unit: string;
  /** [minor, intermediate, major] */
  qty: [number, number, number];
  size?: string;
  note?: string;
}

/** What the approach itself needs, whatever is being operated on. */
export const APPROACH_ITEMS: Record<Approach, StandardItem[]> = {
  OPEN: [
    { name: 'Surgical blade No. 22', category: 'SURGICAL_BLADES', unit: 'piece', qty: [1, 2, 2] },
    { name: 'Surgical blade No. 15', category: 'SURGICAL_BLADES', unit: 'piece', qty: [1, 1, 2] },
    { name: 'Diathermy pencil with plate', category: 'DIATHERMY', unit: 'set', qty: [1, 1, 1] },
    { name: 'Suction tubing and yankauer', category: 'SUCTION', unit: 'set', qty: [1, 1, 1] },
  ],
  LAPAROSCOPIC: [
    { name: 'Surgical blade No. 11', category: 'SURGICAL_BLADES', unit: 'piece', qty: [1, 1, 2] },
    { name: 'CO2 insufflation tubing with filter', category: 'OTHER', unit: 'set', qty: [1, 1, 1] },
    { name: 'Disposable trocar 10/11 mm', category: 'OTHER', unit: 'piece', qty: [1, 1, 2] },
    { name: 'Disposable trocar 5 mm', category: 'OTHER', unit: 'piece', qty: [2, 2, 3] },
    { name: 'Camera drape / scope sheath', category: 'GOWNS_DRAPES', unit: 'piece', qty: [1, 1, 1] },
    { name: 'Anti-fog solution', category: 'OTHER', unit: 'bottle', qty: [1, 1, 1] },
    { name: 'Specimen retrieval bag', category: 'OTHER', unit: 'piece', qty: [1, 1, 1] },
    { name: 'Suction/irrigation set', category: 'SUCTION', unit: 'set', qty: [1, 1, 1] },
  ],
  ENDOSCOPIC: [
    { name: 'Irrigation fluid (normal saline / glycine)', category: 'IRRIGATION', size: '3 litres', unit: 'bag', qty: [2, 3, 4] },
    { name: 'Irrigation giving set', category: 'IRRIGATION', unit: 'set', qty: [1, 1, 2] },
    { name: 'Lubricating jelly, sterile', category: 'OTHER', unit: 'tube', qty: [1, 2, 2] },
    { name: 'Scope light lead cover', category: 'GOWNS_DRAPES', unit: 'piece', qty: [1, 1, 1] },
  ],
  MICROSCOPIC: [
    { name: 'Microscope drape', category: 'GOWNS_DRAPES', unit: 'piece', qty: [1, 1, 1] },
    { name: 'Surgical blade No. 15', category: 'SURGICAL_BLADES', unit: 'piece', qty: [1, 1, 2] },
    { name: 'Micro-swabs / cellulose spears', category: 'GAUZE_SWABS', unit: 'pack', qty: [1, 2, 2] },
  ],
  PERCUTANEOUS: [
    { name: 'Surgical blade No. 11', category: 'SURGICAL_BLADES', unit: 'piece', qty: [1, 1, 1] },
    { name: 'Guidewire', category: 'OTHER', unit: 'piece', qty: [1, 1, 2] },
    { name: 'Image intensifier drape', category: 'GOWNS_DRAPES', unit: 'piece', qty: [1, 1, 1] },
  ],
};

/** What the family needs beyond the base pack and the approach. */
export const FAMILY_ITEMS: Partial<Record<ProcedureFamily, StandardItem[]>> = {
  LAPAROTOMY: [
    { name: 'Abdominal packs / large swabs', category: 'GAUZE_SWABS', unit: 'pack', qty: [1, 2, 3] },
    { name: 'Nasogastric tube', category: 'TUBES_CATHETERS', unit: 'piece', qty: [0, 1, 1] },
    { name: 'Urethral catheter with drainage bag', category: 'TUBES_CATHETERS', unit: 'set', qty: [0, 1, 1] },
    { name: 'Abdominal drain with bag', category: 'DRAINS', unit: 'set', qty: [0, 1, 1] },
  ],
  COLORECTAL: [
    { name: 'Abdominal packs / large swabs', category: 'GAUZE_SWABS', unit: 'pack', qty: [1, 2, 3] },
    { name: 'Bowel clamps, disposable', category: 'OTHER', unit: 'set', qty: [1, 1, 1] },
    { name: 'Stoma appliance with baseplate', category: 'OTHER', unit: 'set', qty: [0, 1, 1], note: 'Where a stoma is planned or possible.' },
    { name: 'Urethral catheter with drainage bag', category: 'TUBES_CATHETERS', unit: 'set', qty: [1, 1, 1] },
    { name: 'Abdominal drain with bag', category: 'DRAINS', unit: 'set', qty: [1, 1, 2] },
  ],
  APPENDICECTOMY: [
    { name: 'Abdominal packs / large swabs', category: 'GAUZE_SWABS', unit: 'pack', qty: [1, 1, 2] },
    { name: 'Specimen pot with formalin', category: 'OTHER', unit: 'piece', qty: [1, 1, 1] },
  ],
  BILIARY: [
    { name: 'Specimen pot with formalin', category: 'OTHER', unit: 'piece', qty: [1, 1, 1] },
    { name: 'Abdominal drain with bag', category: 'DRAINS', unit: 'set', qty: [1, 1, 1] },
  ],
  HERNIA: [
    { name: 'Polypropylene mesh', category: 'OTHER', size: '15 x 15 cm', unit: 'piece', qty: [1, 1, 1], note: 'Size and type are the surgeon’s choice.' },
  ],
  BREAST: [
    { name: 'Closed suction drain with bottle', category: 'DRAINS', unit: 'set', qty: [1, 1, 2] },
    { name: 'Specimen pot with formalin', category: 'OTHER', unit: 'piece', qty: [1, 1, 2] },
  ],
  ENDOCRINE_NECK: [
    { name: 'Closed suction drain with bottle', category: 'DRAINS', unit: 'set', qty: [1, 1, 1] },
    { name: 'Specimen pot with formalin', category: 'OTHER', unit: 'piece', qty: [1, 1, 1] },
  ],
  CAESAREAN: [
    { name: 'Urethral catheter with drainage bag', category: 'TUBES_CATHETERS', unit: 'set', qty: [1, 1, 1] },
    { name: 'Cord clamp', category: 'OTHER', unit: 'piece', qty: [1, 1, 2] },
    { name: 'Neonatal resuscitation set (bag, mask, suction)', category: 'OTHER', unit: 'set', qty: [1, 1, 1] },
    { name: 'Sanitary pads, maternity', category: 'OTHER', unit: 'pack', qty: [1, 1, 1] },
    { name: 'Abdominal packs / large swabs', category: 'GAUZE_SWABS', unit: 'pack', qty: [1, 2, 2] },
  ],
  HYSTERECTOMY: [
    { name: 'Urethral catheter with drainage bag', category: 'TUBES_CATHETERS', unit: 'set', qty: [1, 1, 1] },
    { name: 'Abdominal packs / large swabs', category: 'GAUZE_SWABS', unit: 'pack', qty: [1, 2, 3] },
    { name: 'Specimen pot with formalin', category: 'OTHER', unit: 'piece', qty: [1, 1, 1] },
    { name: 'Vaginal pack', category: 'GAUZE_SWABS', unit: 'piece', qty: [1, 1, 1] },
  ],
  GYNAE_VAGINAL: [
    { name: 'Urethral catheter with drainage bag', category: 'TUBES_CATHETERS', unit: 'set', qty: [1, 1, 1] },
    { name: 'Vaginal pack', category: 'GAUZE_SWABS', unit: 'piece', qty: [1, 1, 1] },
    { name: 'Specimen pot with formalin', category: 'OTHER', unit: 'piece', qty: [1, 1, 1] },
  ],
  ARTHROPLASTY: [
    { name: 'Bone cement with mixing set', category: 'OTHER', unit: 'set', qty: [1, 1, 2], note: 'Where a cemented implant is planned.' },
    { name: 'Pulse lavage / irrigation set', category: 'IRRIGATION', unit: 'set', qty: [1, 1, 1] },
    { name: 'Closed suction drain with bottle', category: 'DRAINS', unit: 'set', qty: [1, 1, 1] },
    { name: 'Impervious stockinette', category: 'GOWNS_DRAPES', unit: 'piece', qty: [1, 1, 2] },
    { name: 'Normal saline for irrigation', category: 'IRRIGATION', size: '1 litre', unit: 'bag', qty: [2, 3, 4] },
  ],
  FRACTURE_FIXATION: [
    { name: 'Image intensifier drape', category: 'GOWNS_DRAPES', unit: 'piece', qty: [1, 1, 1] },
    { name: 'Normal saline for irrigation', category: 'IRRIGATION', size: '1 litre', unit: 'bag', qty: [1, 2, 3] },
    { name: 'Plaster of Paris / cast material', category: 'OTHER', unit: 'roll', qty: [2, 3, 4] },
    { name: 'Orthopaedic wool / padding', category: 'OTHER', unit: 'roll', qty: [2, 2, 3] },
  ],
  OPEN_FRACTURE: [
    { name: 'Normal saline for irrigation', category: 'IRRIGATION', size: '1 litre', unit: 'bag', qty: [4, 6, 9], note: 'Copious lavage; volume is a clinical decision.' },
    { name: 'Pulse lavage / irrigation set', category: 'IRRIGATION', unit: 'set', qty: [1, 1, 1] },
    { name: 'External fixator pin set', category: 'OTHER', unit: 'set', qty: [0, 1, 1] },
    { name: 'Wound swab for culture', category: 'OTHER', unit: 'piece', qty: [1, 1, 2] },
    { name: 'Plaster of Paris / cast material', category: 'OTHER', unit: 'roll', qty: [2, 3, 4] },
  ],
  CRANIOTOMY: [
    { name: 'Bone wax', category: 'HAEMOSTATICS', unit: 'piece', qty: [1, 1, 2] },
    { name: 'Absorbable haemostat (oxidised cellulose)', category: 'HAEMOSTATICS', unit: 'piece', qty: [1, 2, 3] },
    { name: 'Neuro patties / cottonoids', category: 'GAUZE_SWABS', unit: 'pack', qty: [1, 2, 2] },
    { name: 'Closed suction drain with bottle', category: 'DRAINS', unit: 'set', qty: [1, 1, 1] },
    { name: 'Head fixation pin set', category: 'OTHER', unit: 'set', qty: [1, 1, 1] },
  ],
  SPINAL: [
    { name: 'Bone wax', category: 'HAEMOSTATICS', unit: 'piece', qty: [1, 1, 2] },
    { name: 'Absorbable haemostat (oxidised cellulose)', category: 'HAEMOSTATICS', unit: 'piece', qty: [1, 2, 2] },
    { name: 'Closed suction drain with bottle', category: 'DRAINS', unit: 'set', qty: [1, 1, 1] },
    { name: 'Image intensifier drape', category: 'GOWNS_DRAPES', unit: 'piece', qty: [1, 1, 1] },
  ],
  CSF_SHUNT: [
    { name: 'Ventriculoperitoneal shunt system', category: 'OTHER', unit: 'set', qty: [1, 1, 1], note: 'Valve type is the surgeon’s choice.' },
    { name: 'Shunt passer', category: 'OTHER', unit: 'piece', qty: [1, 1, 1] },
  ],
  UROLOGY_ENDOSCOPIC: [
    { name: 'Three-way urethral catheter with bag', category: 'TUBES_CATHETERS', unit: 'set', qty: [1, 1, 1] },
    { name: 'Bladder irrigation set', category: 'IRRIGATION', unit: 'set', qty: [1, 1, 1] },
    { name: 'Specimen pot with formalin', category: 'OTHER', unit: 'piece', qty: [1, 1, 1] },
  ],
  UROLOGY_OPEN: [
    { name: 'Urethral catheter with drainage bag', category: 'TUBES_CATHETERS', unit: 'set', qty: [1, 1, 1] },
    { name: 'Closed suction drain with bottle', category: 'DRAINS', unit: 'set', qty: [1, 1, 1] },
    { name: 'Specimen pot with formalin', category: 'OTHER', unit: 'piece', qty: [1, 1, 1] },
  ],
  ENT_AERODIGESTIVE: [
    { name: 'Tracheostomy tube, cuffed', category: 'TUBES_CATHETERS', unit: 'piece', qty: [0, 1, 1], note: 'Where a tracheostomy is planned or possible.' },
    { name: 'Closed suction drain with bottle', category: 'DRAINS', unit: 'set', qty: [1, 1, 2] },
    { name: 'Nasogastric tube', category: 'TUBES_CATHETERS', unit: 'piece', qty: [1, 1, 1] },
    { name: 'Specimen pot with formalin', category: 'OTHER', unit: 'piece', qty: [1, 1, 2] },
  ],
  ENT_CLEAN: [
    { name: 'Nasal packing / merocel', category: 'GAUZE_SWABS', unit: 'piece', qty: [1, 2, 2] },
    { name: 'Specimen pot with formalin', category: 'OTHER', unit: 'piece', qty: [1, 1, 1] },
  ],
  OPHTHALMIC: [
    { name: 'Viscoelastic (OVD)', category: 'OTHER', unit: 'syringe', qty: [1, 1, 1] },
    { name: 'Intraocular lens', category: 'OTHER', unit: 'piece', qty: [1, 1, 1], note: 'Power is calculated for the patient.' },
    { name: 'Balanced salt solution', category: 'IRRIGATION', unit: 'bottle', qty: [1, 1, 1] },
    { name: 'Eye shield and pad', category: 'DRESSINGS', unit: 'set', qty: [1, 1, 1] },
  ],
  MAXILLOFACIAL: [
    { name: 'Arch bars and wires', category: 'OTHER', unit: 'set', qty: [1, 1, 1] },
    { name: 'Specimen pot with formalin', category: 'OTHER', unit: 'piece', qty: [1, 1, 1] },
    { name: 'Nasogastric tube', category: 'TUBES_CATHETERS', unit: 'piece', qty: [0, 1, 1] },
  ],
  SKIN_GRAFT_FLAP: [
    { name: 'Paraffin gauze dressing', category: 'DRESSINGS', unit: 'piece', qty: [2, 4, 6] },
    { name: 'Skin graft mesher carrier', category: 'OTHER', unit: 'piece', qty: [0, 1, 1] },
    { name: 'Crepe bandage', category: 'DRESSINGS', unit: 'roll', qty: [2, 3, 4] },
    { name: 'Non-adherent dressing', category: 'DRESSINGS', unit: 'piece', qty: [2, 3, 4] },
  ],
  CARDIAC: [
    { name: 'Chest drain with underwater seal', category: 'DRAINS', unit: 'set', qty: [2, 2, 3] },
    { name: 'Sternal wire', category: 'OTHER', unit: 'piece', qty: [6, 6, 8] },
    { name: 'Absorbable haemostat (oxidised cellulose)', category: 'HAEMOSTATICS', unit: 'piece', qty: [2, 3, 4] },
    { name: 'Temporary pacing wire', category: 'OTHER', unit: 'piece', qty: [1, 2, 2] },
    { name: 'Normal saline for irrigation', category: 'IRRIGATION', size: '1 litre', unit: 'bag', qty: [2, 3, 4] },
  ],
  THORACIC: [
    { name: 'Chest drain with underwater seal', category: 'DRAINS', unit: 'set', qty: [1, 2, 2] },
    { name: 'Absorbable haemostat (oxidised cellulose)', category: 'HAEMOSTATICS', unit: 'piece', qty: [1, 2, 3] },
    { name: 'Specimen pot with formalin', category: 'OTHER', unit: 'piece', qty: [1, 1, 2] },
  ],
  VASCULAR: [
    { name: 'Vascular graft / patch', category: 'OTHER', unit: 'piece', qty: [0, 1, 1], note: 'Size and type are the surgeon’s choice.' },
    { name: 'Vessel loops', category: 'OTHER', unit: 'pack', qty: [1, 1, 2] },
    { name: 'Heparinised saline', category: 'IRRIGATION', unit: 'bag', qty: [1, 1, 2] },
    { name: 'Absorbable haemostat (oxidised cellulose)', category: 'HAEMOSTATICS', unit: 'piece', qty: [1, 2, 2] },
  ],
  SUPERFICIAL: [
    { name: 'Specimen pot with formalin', category: 'OTHER', unit: 'piece', qty: [1, 1, 1] },
    { name: 'Wound swab for culture', category: 'OTHER', unit: 'piece', qty: [1, 1, 1] },
  ],
};

/** Theatre drugs a case needs regardless of the antibiotic decision. */
export const THEATRE_PHARMACY: StandardItem[] = [
  { name: 'Normal saline 0.9%', category: 'IV_FLUID', size: '500 ml', unit: 'bag', qty: [2, 3, 4] },
  { name: 'Ringer’s lactate', category: 'IV_FLUID', size: '500 ml', unit: 'bag', qty: [1, 2, 3] },
  { name: 'Lidocaine 2%', category: 'LOCAL_ANAESTHETIC', unit: 'vial', qty: [1, 2, 2] },
  { name: 'Water for injection', category: 'OTHER', size: '10 ml', unit: 'ampoule', qty: [4, 6, 8] },
  { name: 'Paracetamol', category: 'ANALGESIC', size: '1 g IV', unit: 'vial', qty: [1, 2, 2] },
];
