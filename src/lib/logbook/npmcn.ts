// ============================================================
// The NPMCN Faculty of Surgery Resident's Portfolio, as published
// ------------------------------------------------------------
// Transcribed on 8 November 2026 from the College's own document, supplied by
// the user: "NATIONAL POSTGRADUATE MEDICAL COLLEGE OF NIGERIA — Surgical
// Residency Training Programme — RESIDENT'S PORTFOLIO", signed by the Chairman
// and Secretary of the Faculty Board of Surgery.
//
// THE THREE THINGS THIS FILE GOT WRONG BEFORE THE DOCUMENT ARRIVED, and which
// are now right:
//
//   THE CODES ARE THREE, NOT FOUR, and they do not mean what a generic
//   logbook means by them. The College writes: "Assisting a senior — A;
//   Assisted by a consultant (or senior) — S; As surgeon in charge — P."
//   There is NO "observed" code. S is not "watched by a consultant", it is
//   the trainee operating WITH the consultant assisting — which is a more
//   senior claim than it sounds, and the opposite way round from how an
//   outsider reads the letter.
//
//   THE PATIENT'S NAME IS A COLUMN. Every table in the portfolio begins
//   "S/No. | Patient's Names | Hospital No. | Age | Sex | ...". The research
//   module next door strips names; this book asks for them, and the export
//   therefore offers the column rather than withholding it.
//
//   THE BOOK IS ORGANISED BY PROCEDURE CATEGORY, not as one list. Part 1 is
//   eighteen common categories every trainee fills; Part 2 is the subspecialty
//   tables. A flat chronological list is not this College's logbook.
//
// WHAT IS STILL NOT HERE: ANY MINIMUM NUMBER. The document heads the
// neurosurgery section "Minimum Operative Requirement" and then prints no
// figures at all — the tables are blank rows. So every category below carries
// `required: null`, and the screen shows a count with no progress bar. If the
// Faculty publishes the numbers separately, they go in here and nowhere else.
// ============================================================

export interface NpmcnCategory {
  key: string;
  /** The heading exactly as the portfolio prints it. */
  label: string;
  /**
   * Words that place a case in this table.
   *
   * Matched against the operation and the diagnosis, lower-cased. These are
   * a convenience for sorting a few hundred cases, NOT a clinical coding
   * system: anything that matches nothing lands in "Not yet classified",
   * which is shown rather than hidden so the trainee can place it by hand.
   */
  match: readonly string[];
}

export interface NpmcnSection {
  key: string;
  label: string;
  /** Part 1 is the common tables; Part 2 is the subspecialty ones. */
  part: 1 | 2;
  /** The subspecialty heading in Part 2, where there is one. */
  group?: string;
  categories: readonly NpmcnCategory[];
}

/** Part 1 — the eighteen tables every trainee completes. */
export const NPMCN_PART_1: readonly NpmcnCategory[] = [
  { key: 'groin-hernia', label: 'Groin hernia', match: ['groin hernia', 'inguinal hernia', 'herniorrhaphy', 'hernioplasty', 'femoral hernia', 'herniotomy'] },
  { key: 'trauma-laparotomy', label: 'Trauma laparotomy', match: ['trauma laparotomy', 'laparotomy for trauma', 'exploratory laparotomy trauma'] },
  { key: 'laparotomy-sepsis', label: 'Laparotomy for sepsis', match: ['laparotomy for sepsis', 'peritonitis', 'perforation', 'faecal peritonitis'] },
  { key: 'appendicectomy', label: 'Appendicectomy', match: ['appendicectomy', 'appendectomy', 'appendicitis'] },
  { key: 'intestinal-obstruction', label: 'Intestinal obstruction', match: ['intestinal obstruction', 'bowel obstruction', 'adhesiolysis', 'volvulus', 'intussusception'] },
  { key: 'gastric-duodenal', label: 'Gastric and duodenal surgery', match: ['gastrectomy', 'gastrojejunostomy', 'duodenal', 'pyloroplasty', 'vagotomy', 'gastric'] },
  { key: 'anorectal', label: 'Anorectal', match: ['haemorrhoid', 'hemorrhoid', 'fistula in ano', 'fissure in ano', 'anal', 'perianal', 'pilonidal'] },
  { key: 'hepato-biliary', label: 'Hepato-biliary', match: ['cholecystectomy', 'biliary', 'choledoch', 'hepatic', 'liver', 'gall bladder', 'gallbladder'] },
  { key: 'breast', label: 'Breast surgery', match: ['mastectomy', 'breast', 'lumpectomy', 'axillary clearance'] },
  { key: 'endocrine-exocrine', label: 'Endocrine/exocrine', match: ['thyroid', 'parathyroid', 'adrenal', 'goitre', 'goiter', 'pancrea'] },
  { key: 'gi-endoscopy', label: 'GI endoscopy', match: ['endoscopy', 'gastroscopy', 'colonoscopy', 'sigmoidoscopy', 'oesophagoscopy'] },
  { key: 'paediatric', label: 'Paediatric surgery', match: ['paediatric', 'pediatric', 'neonatal', 'herniotomy', 'circumcision', 'pyloromyotomy'] },
  { key: 'chest-tube', label: 'Chest tube insertion', match: ['chest tube', 'chest drain', 'thoracostomy', 'underwater seal'] },
  { key: 'plastic', label: 'Plastic surgery', match: ['skin graft', 'flap', 'keloid', 'contracture', 'burn', 'cleft', 'reconstruct'] },
  { key: 'urology', label: 'Urology', match: ['prostatectomy', 'urethro', 'cystostomy', 'nephrectomy', 'orchidopexy', 'hydrocele', 'circumcision', 'urolog', 'bladder'] },
  { key: 'orthopaedics', label: 'Orthopaedics', match: ['fracture', 'orthopaed', 'orthoped', 'nailing', 'plating', 'arthro', 'amputation', 'sequestrectomy'] },
  { key: 'diagnostic', label: 'Diagnostic procedures', match: ['biopsy', 'aspiration', 'diagnostic'] },
  { key: 'lump-excision', label: 'Lump excisions (excl. breast)', match: ['excision of lump', 'lipoma', 'excision biopsy', 'cyst excision', 'swelling'] },
];

/** A Part 2 table: the subspecialty heading and the procedures under it. */
const cat = (label: string, ...match: string[]): NpmcnCategory => ({
  key: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  label,
  match: match.length > 0 ? match : [label.toLowerCase()],
});

/** Part 2 — General Surgery, as the portfolio groups it. */
export const NPMCN_GENERAL_SURGERY: readonly NpmcnSection[] = [
  { key: 'gs-breast', label: 'Breast', part: 2, group: 'General Surgery', categories: [
    cat('Mastectomy'), cat('Axillary clearance'), cat('Wide local excision'),
  ] },
  { key: 'gs-endocrine', label: 'Endocrine', part: 2, group: 'General Surgery', categories: [
    cat('Thyroid', 'thyroid', 'goitre', 'goiter'), cat('Parathyroid'), cat('Adrenalectomy', 'adrenal'),
  ] },
  { key: 'gs-endoscopy', label: 'GI Endoscopy', part: 2, group: 'General Surgery', categories: [
    cat('GI Endoscopy', 'gi endoscopy'), cat('Upper GI', 'upper gi', 'gastroscopy'),
    cat('Flexible pan Colonoscopy', 'colonoscopy'), cat('Sigmoidoscopy'),
  ] },
  { key: 'gs-gastroduodenal', label: 'Gastroduodenal surgeries', part: 2, group: 'General Surgery', categories: [
    cat('Gastroduodenal surgeries', 'gastrectomy', 'gastrojejunostomy', 'pyloroplasty', 'vagotomy'),
  ] },
  { key: 'gs-colonic', label: 'Colonic Surgery', part: 2, group: 'General Surgery', categories: [
    cat('Stoma', 'colostomy', 'ileostomy', 'stoma'), cat('Rt hemicolectomy', 'right hemicolectomy', 'rt hemicolectomy'),
    cat('Lt hemicolectomy', 'left hemicolectomy', 'lt hemicolectomy'), cat('Anterior resection'),
    cat('APR', 'abdominoperineal'),
  ] },
  { key: 'gs-rectal', label: 'Rectal', part: 2, group: 'General Surgery', categories: [
    cat('Hemorrhoid', 'haemorrhoid', 'hemorrhoid'), cat('Fistula in ano'), cat('Fissure in ano'),
  ] },
  { key: 'gs-hepatobiliary', label: 'Hepatobiliary', part: 2, group: 'General Surgery', categories: [
    cat('Open cholecystectomy'), cat('Lap. Cholecystectomy', 'laparoscopic cholecystectomy', 'lap cholecystectomy'),
    cat('Cholecystojejunostomy'),
  ] },
  { key: 'gs-misc', label: 'Miscellaneous', part: 2, group: 'General Surgery', categories: [
    cat('Laparotomy for trauma'), cat('Salivary gland surgery', 'salivary', 'parotid', 'submandibular'),
    cat('Volvulus'), cat('Varicose veins'), cat('Vascular access (shunts)', 'vascular access', 'av fistula', 'shunt'),
    cat('Obstructed hernias', 'obstructed hernia', 'strangulated hernia'),
    cat('Small bowel resection'), cat('Hernia repair with mesh', 'mesh'),
    cat('Laparotomy for sepsis'),
  ] },
];

/** Part 2 — Urology. */
export const NPMCN_UROLOGY: readonly NpmcnSection[] = [
  { key: 'uro-core', label: 'Core skills', part: 2, group: 'Urology', categories: [
    cat('Prostatectomy'), cat('Urethroplasty', 'urethroplasty', 'urethrosplasty'), cat('Urethrostomy'),
    cat('Nephrectomy'), cat('Pyelolithotomy', 'pyelolith'), cat('Bladder Repair'),
    cat('Orchidopexy'), cat('Ureteric Reimplantation/Ileal conduit', 'ureteric reimplant', 'ileal conduit'),
    cat('A-V fistula/shunts/Vascular anastomosis', 'av fistula', 'a-v fistula', 'vascular anastomosis'),
    cat('Radical prostatectomy, cavernostomies/Shunts', 'radical prostatectomy', 'cavernostom'),
  ] },
  { key: 'uro-endoscopic', label: 'Endoscopic procedures', part: 2, group: 'Urology', categories: [
    cat('Cystoscopy'), cat('Ureteric catheterization', 'ureteric catheter'),
    cat('Ureteroscopy (Percutaneous)', 'ureteroscopy'), cat('Cystostomy (closed)', 'cystostomy'),
    cat('Nephrostomy (Percutaneous)', 'nephrostomy'), cat('Ureterostomy (Percutaneous)', 'ureterostomy'),
    cat('TURP-Assisted', 'turp', 'transurethral resection'),
  ] },
  { key: 'uro-others', label: 'Others', part: 2, group: 'Urology', categories: [
    cat('Neurophysiological procedures', 'neurophysiolog'), cat('Uroflowmetry'), cat('Cystometry'),
    cat('Radiological/Interventional procedures (TRUS/Biopsy)', 'trus', 'prostate biopsy'),
  ] },
];

/** Part 2 — Burns & Plastic. */
export const NPMCN_PLASTIC: readonly NpmcnSection[] = [
  { key: 'bp-head-neck', label: 'Head and Neck', part: 2, group: 'Burns & Plastic', categories: [
    cat('Cleft lip'), cat('Cleft palate'), cat('Craniofacial surgery', 'craniofacial'),
    cat('Soft tissue injury of the face', 'facial soft tissue', 'soft tissue inj'),
    cat('Facial fractures', 'facial fracture', 'mandibular fracture', 'zygomatic'),
    cat('Scalp, calvarium and forehead reconstruction', 'scalp', 'calvarium', 'forehead'),
    cat('Reconstruction of eyelid, eyebrow and correction of ptosis', 'eyelid', 'eyebrow', 'ptosis'),
    cat('Reconstruction of the ear', 'ear reconstruction', 'auricular'),
    cat('Nasal reconstruction', 'nasal reconstruction', 'rhinoplasty'),
    cat('Intraoral tumours and radical neck dissection', 'intraoral', 'neck dissection'),
    cat('Primary tumours of salivary gland and neck', 'salivary gland tumour', 'parotid tumour'),
    cat('Jaw tumours', 'jaw tumour', 'jaw tumor', 'mandibulectomy', 'maxillectomy'),
    cat('Neck contractures', 'neck contracture'),
  ] },
  { key: 'bp-skin', label: 'Skin and adnexae', part: 2, group: 'Burns & Plastic', categories: [
    cat('Burn management (not burn injury)', 'burn'),
    cat('Skin cancer', 'skin cancer', 'squamous cell', 'basal cell', 'melanoma'),
    cat('Benign growth and generalized skin disorder', 'benign skin', 'naevus', 'nevus'),
    cat('Hypertrophic scar and keloid', 'keloid', 'hypertrophic scar'),
  ] },
  { key: 'bp-hand', label: 'Upper extremity and hand', part: 2, group: 'Burns & Plastic', categories: [
    cat('Skin and soft tissue replacement in the hand', 'hand flap', 'hand graft'),
    cat('Fractures of finger and thumb', 'finger fracture', 'thumb fracture', 'phalan'),
    cat('Tendon injuries in the hand and forearm', 'tendon repair', 'tendon injury'),
    cat('Nerve injuries', 'nerve repair', 'nerve injury'),
    cat('Upper extremity contractures', 'upper limb contracture'),
  ] },
  { key: 'bp-breast', label: 'Breast', part: 2, group: 'Burns & Plastic', categories: [
    cat('Reduction mammoplasty and mastopexy', 'reduction mammoplasty', 'mastopexy'),
    cat('Augmentation mammoplasty', 'augmentation mammoplasty'),
    cat('Breast reconstruction following mastectomy', 'breast reconstruction'),
    cat('Gynaecomastia', 'gynaecomastia', 'gynecomastia'),
  ] },
  { key: 'bp-trunk', label: 'Trunk and lower extremity', part: 2, group: 'Burns & Plastic', categories: [
    cat('Reconstruction procedure for lower extremity soft tissue', 'lower limb reconstruction', 'leg flap'),
    cat('Pressure sore', 'pressure sore', 'bed sore', 'decubitus'),
    cat('Lymphoedema', 'lymphedema', 'lymphoedema'),
    cat('Leg and foot ulcers', 'leg ulcer', 'foot ulcer', 'diabetic foot'),
  ] },
  { key: 'bp-genitalia', label: 'Genitalia', part: 2, group: 'Burns & Plastic', categories: [
    cat('Hypospadias, epispadias, bladder exstrophy', 'hypospadias', 'epispadias', 'exstrophy'),
    cat('Injury to the external genitalia', 'genital injury'),
    cat('VVF', 'vesicovaginal', 'vvf'),
    cat('Gynaetresia and vaginal agenesis', 'gynaetresia', 'vaginal agenesis'),
  ] },
  { key: 'bp-aesthetic', label: 'Aesthetic Surgery', part: 2, group: 'Burns & Plastic', categories: [
    cat('Aesthetic Rhinoplasty', 'aesthetic rhinoplasty'),
    cat('Treatment of baldness with the use of flaps', 'baldness'),
    cat('Scar revision', 'scar revision'),
    cat('Aesthetic surgery of the ageing face', 'face lift', 'ageing face'),
  ] },
  { key: 'bp-micro', label: 'Microvascular Surgery', part: 2, group: 'Burns & Plastic', categories: [
    cat('Microvascular Surgery — all procedures', 'microvascular', 'free flap'),
  ] },
];

/** Part 2 — Paediatric Surgery, in the portfolio's five lettered groups. */
export const NPMCN_PAEDIATRIC: readonly NpmcnSection[] = [
  { key: 'paed-general', label: 'A. General Paediatric Surgery', part: 2, group: 'Paediatric Surgery', categories: [
    cat('Venous Cutdown', 'cutdown'), cat('Circumcision'), cat('Lymph node biopsy', 'lymph node biopsy'),
    cat('Tumour Biopsy', 'tumour biopsy', 'tumor biopsy'),
    cat("Rectal Biopsy for Hirschsprung's", 'rectal biopsy'), cat('Lumpectomy'),
    cat("Sistrunk's Operation", 'sistrunk', 'thyroglossal'),
    cat('Excision of Branchial Remnant', 'branchial'),
    cat('Inguinal Herniotomy', 'herniotomy'), cat('Repair of umbilical Hernia', 'umbilical hernia'),
    cat('Operation for cystic hygroma', 'cystic hygroma'),
  ] },
  { key: 'paed-neonatal', label: 'B. Neonatal Procedures', part: 2, group: 'Paediatric Surgery', categories: [
    cat('Operation for small bowel atresia', 'bowel atresia', 'jejunal atresia', 'ileal atresia'),
    cat('Operation for malrotation/volvulus', 'malrotation'),
    cat('Neonatal colostomy/ileostomy', 'neonatal colostomy', 'neonatal ileostomy'),
    cat('Anoplasty'), cat('Gastrostomy'),
    cat('Operation for Esophageal Atresia', 'oesophageal atresia', 'esophageal atresia'),
    cat('Operation for Diaphragmatic Hernia', 'diaphragmatic hernia'),
    cat('Non-operative management of Omphalocele', 'omphalocele conservative'),
    cat('Operative treatment of omphalocele/gastroschisis', 'omphalocele', 'gastroschisis'),
  ] },
  { key: 'paed-gi', label: 'C. Gastrointestinal/Hepatobiliary Procedures', part: 2, group: 'Paediatric Surgery', categories: [
    cat('Laparotomy for trauma/adhesion/perforation', 'laparotomy'),
    cat('Operative treatment of Intussusception', 'intussusception'),
    cat('Intestinal resection and anastomosis', 'resection and anastomosis'),
    cat('Colostomy/ileostomy (excluding neonates)', 'colostomy', 'ileostomy'),
    cat('Colostomy/ileostomy closure', 'colostomy closure', 'ileostomy closure'),
    cat('Operative correction of malrotation (excluding neonates)', 'malrotation'),
    cat('PSARP', 'psarp', 'anorectoplasty'),
    cat("Pull through for Hirschsprung's disease", 'pull through', 'hirschsprung'),
    cat('Pyloromyotomy'), cat('Appendicectomy'), cat('Splenectomy'),
    cat('Operation for Biliary atresia', 'biliary atresia', 'kasai'),
    cat('Operation for Choledochal cyst', 'choledochal'), cat('Cholecystectomy'),
  ] },
  { key: 'paed-urology', label: 'D. Urologic Procedures', part: 2, group: 'Paediatric Surgery', categories: [
    cat('Operation for testicular torsion', 'testicular torsion'),
    cat('Orchidopexy for undescended testis', 'orchidopexy'),
    cat('Correction of Posterior Urethral Valves', 'posterior urethral valve', 'puv'),
    cat('Hypospadias repair', 'hypospadias'), cat('Epispadias repair', 'epispadias'),
    cat('Surgery for urolithiasis', 'urolithiasis', 'stone'),
    cat('Ureterostomy/cystostomy', 'ureterostomy', 'cystostomy'),
    cat('Pyeloplasty'), cat('Undiversion'), cat('Vesicostomy'),
    cat('Nephrectomy (for benign conditions)', 'nephrectomy'),
    cat('Operation for Bladder exstrophy', 'bladder exstrophy'),
    cat('Operation for gender assignment', 'gender assignment'),
    cat('Genital repair for ambiguous genitalia', 'ambiguous genitalia'),
    cat('Urethrocystoscopy'), cat('Hydrocelectomy', 'hydrocele'),
  ] },
  { key: 'paed-oncology', label: 'E. Oncology', part: 2, group: 'Paediatric Surgery', categories: [
    cat('Nephroureterectomy', 'nephroureterectomy', 'wilms'),
    cat('Operation for Sacrococcygeal teratoma', 'sacrococcygeal'),
    cat('Operation for Rhabdomyosarcoma', 'rhabdomyosarcoma'),
    cat('Operation for abdominal Lymphoma', 'lymphoma'),
    cat('Operation for Neuroblastoma', 'neuroblastoma'),
  ] },
];

/** Part 2 — Cardio-thoracic Surgery. */
export const NPMCN_CARDIOTHORACIC: readonly NpmcnSection[] = [
  { key: 'ct-chest-wall', label: 'Chest Wall', part: 2, group: 'Cardio-thoracic Surgery', categories: [
    cat('Chest Wall', 'chest wall'), cat('Rib Resection', 'rib resection'),
    cat('Thoracoplasty'), cat('Resection and Reconstruction', 'chest wall reconstruction'),
  ] },
  { key: 'ct-lungs', label: 'Lungs and Pleura', part: 2, group: 'Cardio-thoracic Surgery', categories: [
    cat('Closed Chest Tube Intubation', 'chest tube', 'chest drain', 'thoracostomy'),
    cat('Open Lung Biopsy', 'lung biopsy'), cat('Pleurectomy'), cat('Decortication'),
    cat('Wedge Resection of the Lungs', 'wedge resection'),
    cat('Non Anatomic Lung Resection', 'non anatomic lung'),
    cat('Lobectomy'), cat('Pneumonectomy'), cat('Exploratory Thoracotomy', 'thoracotomy'),
    cat('Other Operations on the Lung', 'lung'),
    cat('Other Operations on the Pleura (Pleurodesis, Open Pleural Biopsy)', 'pleurodesis', 'pleural biopsy'),
  ] },
  { key: 'ct-mediastinum', label: 'Mediastinum', part: 2, group: 'Cardio-thoracic Surgery', categories: [
    cat('Mediastinum', 'mediastin'), cat('Exploration of the Mediastinum', 'mediastinal exploration'),
    cat('Excision of Mediastinal Tumours and cysts', 'mediastinal tumour', 'mediastinal cyst'),
  ] },
  { key: 'ct-diaphragm', label: 'Diaphragm', part: 2, group: 'Cardio-thoracic Surgery', categories: [
    cat('Repair of Congenital Diaphragmatic Hernia', 'diaphragmatic hernia'),
  ] },
  { key: 'ct-oesophagus', label: 'Oesophagus', part: 2, group: 'Cardio-thoracic Surgery', categories: [
    cat('Endoluminal Intubation-Stents', 'oesophageal stent', 'endoluminal'),
    cat('Oesophagectomy with Oesophago-Gastrectomy', 'oesophagectomy', 'esophagectomy'),
    cat('Colon bypass of the Oesophagus', 'colon bypass'),
    cat('Modified Hellers Procedure', 'heller'),
    cat('Repair of Tracheo-Oesophageal Fistula', 'tracheo-oesophageal', 'tracheoesophageal'),
    cat('Resection of Diverticulum', 'diverticulum'),
    cat('Oesophagostomy for Benign Tumours and Foreign Bodies', 'oesophagostomy', 'foreign body'),
  ] },
  { key: 'ct-pericardium', label: 'Pericardium', part: 2, group: 'Cardio-thoracic Surgery', categories: [
    cat('Pericardium', 'pericard'), cat('Pericardiostomy'), cat('Pericardiectomy'),
  ] },
  { key: 'ct-vascular', label: 'Vascular', part: 2, group: 'Cardio-thoracic Surgery', categories: [
    cat('Vascular', 'vascular'), cat('Repair of coarctation of the Aorta', 'coarctation'),
    cat('Repair of Congenital Vascular Anomalies', 'congenital vascular'),
    cat('Repair of Thoracic Aortic Aneurysms', 'thoracic aortic aneurysm'),
    cat('Repair of Abdominal Aortic Aneurysms', 'abdominal aortic aneurysm'),
    cat('Repair of peripheral Arterial Aneurysms', 'peripheral aneurysm'),
    cat('Reconstruction of Peripheral Vascular Disease', 'peripheral vascular'),
    cat('Traumatic Arterial Surgeries', 'arterial injury', 'arterial repair'),
  ] },
  { key: 'ct-cardiac', label: 'Cardiac', part: 2, group: 'Cardio-thoracic Surgery', categories: [
    cat('Cardiac', 'cardiac'), cat('Ligation of Persistent Ductus Arteriosus', 'ductus arteriosus', 'pda'),
    cat('Palliative Shunt for Congenital Heart Disease', 'palliative shunt'),
    cat('Blalock-Taussig Shunt', 'blalock'),
    cat('Closed Mitral Commissurotomy', 'commissurotomy'),
    cat('Corrective Congenital Cardiac Surgery', 'congenital cardiac'),
    cat('Closure of ASD', 'asd'), cat('Closure of VSD', 'vsd'),
    cat('Total Correction of Intracardiac Defect', 'intracardiac defect'),
    cat('Corrective Acquired Cardiac Surgery', 'acquired cardiac'),
    cat('Open Valvulotomy for Valve Repair', 'valvulotomy', 'valve repair'),
    cat('Mitral Valve Replacement', 'mitral valve'),
    cat('Aortic Valve Replacement', 'aortic valve'),
    cat('Multiple Valve Replacement', 'multiple valve'),
    cat('Other Open Heart Procedures', 'open heart'),
  ] },
  { key: 'ct-pacemaker', label: 'Pacemaker Implantation', part: 2, group: 'Cardio-thoracic Surgery', categories: [
    cat('Pacemaker Implantation', 'pacemaker'),
    cat('Primary Permanent Implantation', 'permanent pacemaker'),
    cat('Replacement of Pulse Generator', 'pulse generator'),
  ] },
  { key: 'ct-misc', label: 'Miscellaneous', part: 2, group: 'Cardio-thoracic Surgery', categories: [
    cat('Mediastinotomy (Chamberlain Procedure)', 'mediastinotomy', 'chamberlain'),
    cat('Thoracoscopy VATS', 'thoracoscopy', 'vats'),
    cat('Scalene Node Biopsy', 'scalene node'), cat('Tracheostomy'),
  ] },
  { key: 'ct-endoscopy', label: 'Endoscopy', part: 2, group: 'Cardio-thoracic Surgery', categories: [
    cat('Bronchoscopy'), cat('Mediastinoscopy'), cat('Oesophagoscopy', 'oesophagoscopy', 'esophagoscopy'),
  ] },
];

/**
 * Part 2 — Neurosurgery, headed in the portfolio "CONSOLIDATED NEUROSURGERY —
 * Minimum Operative Requirement".
 *
 * That heading is the only place in the whole document that promises numbers,
 * and the tables beneath it are blank. No figure is invented here.
 */
export const NPMCN_NEUROSURGERY: readonly NpmcnSection[] = [
  { key: 'ns-head-injury', label: 'Head Injuries', part: 2, group: 'Neurosurgery', categories: [
    cat('ICP bolt for pressure monitoring', 'icp bolt', 'intracranial pressure'),
    cat('Burr hole for CSDH/Hygroma', 'burr hole', 'b.hole', 'csdh', 'hygroma'),
    cat('Craniotomy for extradural', 'extradural'),
    cat('Craniotomy for acute subdural', 'acute subdural'),
    cat('Craniotomy for intracerebral', 'intracerebral'),
    cat('Decompressive Craniectomy', 'decompressive craniectomy'),
    cat('Depressed fracture', 'depressed fracture'),
    cat('Dural repair', 'dural repair'),
    cat('Combined craniofacial repair', 'craniofacial repair'),
    cat('Cranioplasty'),
  ] },
  { key: 'ns-supratentorial', label: 'Supratentorial Tumours', part: 2, group: 'Neurosurgery', categories: [
    cat('Biopsy', 'brain biopsy'), cat('Stereotactic biopsy', 'stereotactic'),
    cat('Craniotomy for intrinsic Tumour', 'intrinsic tumour'),
    cat('Meningioma'), cat('Other benign', 'benign tumour'),
    cat('Midline transsphenoidal', 'transsphenoidal', 'pituitary'),
    cat('Skull Base', 'skull base'),
  ] },
  { key: 'ns-posterior-fossa', label: 'Posterior Fossa Tumours', part: 2, group: 'Neurosurgery', categories: [
    cat('Malignant', 'posterior fossa malignant'), cat('Acoustic', 'acoustic neuroma', 'vestibular schwannoma'),
    cat('Other Benign', 'posterior fossa benign'),
  ] },
  { key: 'ns-hydrocephalus', label: 'Hydrocephalus/Congenital Anomalies', part: 2, group: 'Neurosurgery', categories: [
    cat('EVD', 'external ventricular drain', 'evd'), cat('Shunt insertion', 'shunt insertion', 'vp shunt'),
    cat('Shunt revision'), cat('Arnold Chiari', 'chiari'),
    cat('Encephalocoele', 'encephalocele', 'encephalocoele'),
    cat('Craniosynostosis'),
    cat('Dysraphism, Myelomeningocoele, Tethering', 'myelomeningocele', 'myelomeningocoele', 'dysraphism', 'tethered cord'),
  ] },
  { key: 'ns-vascular', label: 'Vascular', part: 2, group: 'Neurosurgery', categories: [
    cat('Aneurysm Clipping', 'aneurysm clip'), cat('AVM Excision', 'avm'),
    cat('Craniotomy Spontaneous ICH', 'spontaneous ich', 'intracerebral haemorrhage'),
    cat('Posterior fossa haematoma', 'posterior fossa haematoma'),
    cat('Craniectomy'), cat('Carotid Endarterectomy/Stenting', 'endarterectomy', 'carotid stent'),
    cat('By-pass surgeries', 'bypass'), cat('Endovascular'),
  ] },
  { key: 'ns-infection', label: 'Infections', part: 2, group: 'Neurosurgery', categories: [
    cat('Intracranial abscess', 'brain abscess', 'intracranial abscess'),
    cat('Subdural empyema', 'empyema'), cat('Spinal abscess'),
  ] },
  { key: 'ns-spine', label: 'Spine', part: 2, group: 'Neurosurgery', categories: [
    cat('Cervical disc disease/spondylosis', 'cervical disc', 'cervical spondylosis'),
    cat('ACDF', 'acdf', 'anterior cervical discectomy'),
    cat('Laminectomy'), cat('Foraminotomy'),
    cat('Thoracic disc disease', 'thoracic disc'),
    cat('Lumbar disc disease/spondylosis', 'lumbar disc', 'lumbar spondylosis'),
    cat('Transoral'), cat('Syrinx', 'syringomyelia', 'syrinx'),
    cat('Tumour extradural', 'extradural tumour'),
    cat('Tumour intradural extramedullary', 'intradural extramedullary', 'id em'),
    cat('Tumour intradural intramedullary', 'intramedullary', 'id im'),
    cat('Spinal fixation', 'spinal fixation', 'spinal instrumentation'),
  ] },
  { key: 'ns-pain', label: 'Pain', part: 2, group: 'Neurosurgery', categories: [
    cat('Trigeminal neuralgia lesion', 'trigeminal neuralgia lesion'),
    cat('Trigeminal neuralgia MVD/rhizotomy', 'microvascular decompression', 'rhizotomy'),
    cat('Spinal implants', 'spinal implant'),
  ] },
  { key: 'ns-functional', label: 'Functional', part: 2, group: 'Neurosurgery', categories: [
    cat('Stereotaxy lesion/implant', 'stereotaxy'),
    cat('Surgery for epilepsy', 'epilepsy'), cat('DBS', 'deep brain stimulation', 'dbs'),
  ] },
  { key: 'ns-other', label: 'Other', part: 2, group: 'Neurosurgery', categories: [
    cat('Cranio-Cervical decompression', 'craniocervical', 'cranio-cervical'),
    cat('Repair of CSF Fistulae', 'csf fistula', 'csf leak'),
    cat('Carpal Tunnel decompression', 'carpal tunnel'),
    cat('Ulnar nerve decompression', 'ulnar nerve'),
    cat('Sural nerve biopsy', 'sural nerve'), cat('Muscle biopsy'),
    cat('Temporal artery biopsy', 'temporal artery'), cat('Neuroendoscopy'),
  ] },
];

/**
 * The hands-on courses the neurosurgery portfolio requires.
 *
 * "Must attend at least 1 each year of training" — the ONE numeric
 * requirement anywhere in this document, and it is about courses rather than
 * operations. It is surfaced because a trainee who reaches the examination
 * without it has a problem no number of cases fixes, and because it is the
 * only figure here that was actually published.
 */
export const NPMCN_NEUROSURGERY_COURSES = {
  requirement: 'Must attend at least 1 each year of training',
  courses: [
    'Endoscopy Course', 'Spine Course', 'Skull Base Course',
    'Vascular Course', 'Neuronavigation Course', 'Neuroanatomy Course',
  ],
} as const;

/** The Part 2 subspecialties a trainee can pick between. */
export const NPMCN_SUBSPECIALTIES: ReadonlyArray<{
  key: string; label: string; sections: readonly NpmcnSection[];
}> = [
  { key: 'general', label: 'General Surgery', sections: NPMCN_GENERAL_SURGERY },
  { key: 'urology', label: 'Urology', sections: NPMCN_UROLOGY },
  { key: 'plastic', label: 'Burns & Plastic', sections: NPMCN_PLASTIC },
  { key: 'paediatric', label: 'Paediatric Surgery', sections: NPMCN_PAEDIATRIC },
  { key: 'cardiothoracic', label: 'Cardio-thoracic Surgery', sections: NPMCN_CARDIOTHORACIC },
  { key: 'neurosurgery', label: 'Neurosurgery', sections: NPMCN_NEUROSURGERY },
];

/** Part 1 as a single section, so both parts have one shape. */
export const NPMCN_PART_1_SECTION: NpmcnSection = {
  key: 'part-1', label: 'Part 1 procedures', part: 1, categories: NPMCN_PART_1,
};

/**
 * Which table a case belongs in.
 *
 * Matched on the operation first and the diagnosis second, because the
 * portfolio's tables are named after OPERATIONS. Returns the first category
 * that matches, in the order the College prints them — a case that could sit
 * in two tables goes in the earlier one, which is what a trainee filling the
 * book by hand would do.
 *
 * Returns null rather than guessing when nothing matches. Those cases are
 * shown as "not yet classified" so they can be placed by hand, which is
 * honest: a keyword list is a sorting aid, not a coding system, and a case
 * silently filed in the wrong table is worse than one left visibly unfiled.
 */
export function classifyNpmcn(
  categories: readonly NpmcnCategory[],
  operation: string | null,
  diagnosis: string | null,
): NpmcnCategory | null {
  const op = (operation ?? '').toLowerCase();
  const dx = (diagnosis ?? '').toLowerCase();
  if (!op && !dx) return null;

  for (const c of categories) {
    if (c.match.some((m) => op.includes(m))) return c;
  }
  for (const c of categories) {
    if (c.match.some((m) => dx.includes(m))) return c;
  }
  return null;
}

/** Every category in a set of sections, flattened in print order. */
export const flattenCategories = (
  sections: readonly NpmcnSection[],
): NpmcnCategory[] => sections.flatMap((s) => [...s.categories]);
