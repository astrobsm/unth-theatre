// ============================================================
// The seeded procedure catalogue
// ------------------------------------------------------------
// The starting list a surgeon picks from, by subspecialty. It is a STARTING
// list, not a closed one: anything missing can be added at booking time and
// is then permanently available to everybody.
//
// The subspecialty strings below MUST match surgical_units.subspecialty
// exactly. They are the join key for the dropdown, and a near-miss ("ENT"
// instead of "ENT (Otorhinolaryngology)") produces an empty picker with no
// error — the worst kind of failure. `scripts/lib-tests/procedures.test.ts`
// asserts every key is one of the eleven, and the seed script checks them
// against the live surgical_units table before writing anything.
//
// Scope: what a Nigerian teaching hospital actually does, including the
// emergency workload. Procedures that only exist in centres with facilities
// UNTH does not have are left out — a dropdown of operations nobody can
// perform is noise, and this list is meant to be read at 3 a.m.
// ============================================================

export interface CatalogueEntry {
  name: string;
  /** Grouping within the subspecialty, shown as an optgroup. */
  category: string;
  /** True for procedures commonly done as emergencies. Drives ordering only. */
  emergency?: boolean;
}

export const SUBSPECIALTIES = [
  'General Surgery',
  'Obstetrics & Gynaecology',
  'Orthopaedics',
  'Neurosurgery',
  'Urology',
  'ENT (Otorhinolaryngology)',
  'Ophthalmology',
  'Maxillofacial Surgery',
  'Plastic Surgery',
  'Paediatric Surgery',
  'Cardiothoracic Surgery',
] as const;

export type Subspecialty = (typeof SUBSPECIALTIES)[number];

export const CATALOGUE: Record<Subspecialty, CatalogueEntry[]> = {
  // ==========================================================================
  'General Surgery': [
    // Abdominal — emergency
    { name: 'Exploratory laparotomy', category: 'Abdominal', emergency: true },
    { name: 'Emergency laparotomy for perforated viscus', category: 'Abdominal', emergency: true },
    { name: 'Laparotomy for intestinal obstruction', category: 'Abdominal', emergency: true },
    { name: 'Laparotomy for blunt abdominal trauma', category: 'Abdominal', emergency: true },
    { name: 'Laparotomy for penetrating abdominal injury', category: 'Abdominal', emergency: true },
    { name: 'Damage control laparotomy', category: 'Abdominal', emergency: true },
    { name: 'Relaparotomy for burst abdomen', category: 'Abdominal', emergency: true },
    { name: 'Adhesiolysis', category: 'Abdominal' },
    { name: 'Peritoneal lavage and drainage', category: 'Abdominal', emergency: true },

    // Appendix
    { name: 'Open appendicectomy', category: 'Appendix', emergency: true },
    { name: 'Laparoscopic appendicectomy', category: 'Appendix', emergency: true },
    { name: 'Appendicectomy with peritoneal toilet', category: 'Appendix', emergency: true },
    { name: 'Drainage of appendicular abscess', category: 'Appendix', emergency: true },
    { name: 'Interval appendicectomy', category: 'Appendix' },

    // Hepatobiliary
    { name: 'Open cholecystectomy', category: 'Hepatobiliary' },
    { name: 'Laparoscopic cholecystectomy', category: 'Hepatobiliary' },
    { name: 'Cholecystectomy with common bile duct exploration', category: 'Hepatobiliary' },
    { name: 'Choledochoduodenostomy', category: 'Hepatobiliary' },
    { name: 'Choledochojejunostomy', category: 'Hepatobiliary' },
    { name: 'Hepatic resection', category: 'Hepatobiliary' },
    { name: 'Drainage of liver abscess', category: 'Hepatobiliary', emergency: true },
    { name: 'Deroofing of hepatic cyst', category: 'Hepatobiliary' },
    { name: 'Splenectomy', category: 'Hepatobiliary', emergency: true },
    { name: 'Splenorrhaphy', category: 'Hepatobiliary', emergency: true },
    { name: 'Distal pancreatectomy', category: 'Hepatobiliary' },
    { name: 'Whipple procedure (pancreaticoduodenectomy)', category: 'Hepatobiliary' },
    { name: 'Cystogastrostomy for pancreatic pseudocyst', category: 'Hepatobiliary' },
    { name: 'Necrosectomy for pancreatic necrosis', category: 'Hepatobiliary', emergency: true },

    // Upper gastrointestinal
    { name: 'Truncal vagotomy and pyloroplasty', category: 'Upper GI' },
    { name: 'Graham omental patch repair of perforated ulcer', category: 'Upper GI', emergency: true },
    { name: 'Gastrojejunostomy', category: 'Upper GI' },
    { name: 'Partial gastrectomy', category: 'Upper GI' },
    { name: 'Total gastrectomy', category: 'Upper GI' },
    { name: 'Feeding gastrostomy', category: 'Upper GI' },
    { name: 'Feeding jejunostomy', category: 'Upper GI' },
    { name: 'Oesophagectomy', category: 'Upper GI' },
    { name: 'Heller myotomy for achalasia', category: 'Upper GI' },
    { name: 'Nissen fundoplication', category: 'Upper GI' },
    { name: 'Upper gastrointestinal endoscopy', category: 'Upper GI' },
    { name: 'Oesophagoscopy and dilatation', category: 'Upper GI' },

    // Colorectal
    { name: 'Right hemicolectomy', category: 'Colorectal' },
    { name: 'Left hemicolectomy', category: 'Colorectal' },
    { name: 'Extended right hemicolectomy', category: 'Colorectal' },
    { name: 'Sigmoid colectomy', category: 'Colorectal' },
    { name: 'Subtotal colectomy', category: 'Colorectal' },
    { name: 'Total colectomy', category: 'Colorectal' },
    { name: 'Hartmann procedure', category: 'Colorectal', emergency: true },
    { name: 'Reversal of Hartmann procedure', category: 'Colorectal' },
    { name: 'Anterior resection', category: 'Colorectal' },
    { name: 'Abdominoperineal resection', category: 'Colorectal' },
    { name: 'Loop colostomy', category: 'Colorectal', emergency: true },
    { name: 'Divided (end) colostomy', category: 'Colorectal', emergency: true },
    { name: 'Loop ileostomy', category: 'Colorectal' },
    { name: 'Closure of colostomy', category: 'Colorectal' },
    { name: 'Closure of ileostomy', category: 'Colorectal' },
    { name: 'Small bowel resection and anastomosis', category: 'Colorectal', emergency: true },
    { name: 'Sigmoidopexy for volvulus', category: 'Colorectal', emergency: true },
    { name: 'Detorsion of sigmoid volvulus', category: 'Colorectal', emergency: true },
    { name: 'Colonoscopy', category: 'Colorectal' },
    { name: 'Colonoscopy and polypectomy', category: 'Colorectal' },
    { name: 'Rigid sigmoidoscopy', category: 'Colorectal' },

    // Anorectal
    { name: 'Haemorrhoidectomy', category: 'Anorectal' },
    { name: 'Stapled haemorrhoidopexy', category: 'Anorectal' },
    { name: 'Banding of haemorrhoids', category: 'Anorectal' },
    { name: 'Lateral internal sphincterotomy', category: 'Anorectal' },
    { name: 'Fistulotomy for fistula-in-ano', category: 'Anorectal' },
    { name: 'Seton insertion for fistula-in-ano', category: 'Anorectal' },
    { name: 'Drainage of perianal abscess', category: 'Anorectal', emergency: true },
    { name: 'Drainage of ischiorectal abscess', category: 'Anorectal', emergency: true },
    { name: 'Excision of pilonidal sinus', category: 'Anorectal' },
    { name: 'Examination under anaesthesia and rectal biopsy', category: 'Anorectal' },
    { name: 'Rectopexy for rectal prolapse', category: 'Anorectal' },
    { name: 'Anal fissure excision', category: 'Anorectal' },

    // Hernia
    { name: 'Open inguinal hernia repair (mesh)', category: 'Hernia' },
    { name: 'Open inguinal hernia repair (tissue)', category: 'Hernia' },
    { name: 'Laparoscopic inguinal hernia repair', category: 'Hernia' },
    { name: 'Bilateral inguinal hernia repair', category: 'Hernia' },
    { name: 'Emergency repair of obstructed inguinal hernia', category: 'Hernia', emergency: true },
    { name: 'Emergency repair of strangulated hernia with bowel resection', category: 'Hernia', emergency: true },
    { name: 'Femoral hernia repair', category: 'Hernia' },
    { name: 'Umbilical hernia repair', category: 'Hernia' },
    { name: 'Paraumbilical hernia repair', category: 'Hernia' },
    { name: 'Epigastric hernia repair', category: 'Hernia' },
    { name: 'Incisional hernia repair', category: 'Hernia' },
    { name: 'Ventral hernia repair with mesh', category: 'Hernia' },

    // Breast
    { name: 'Modified radical mastectomy', category: 'Breast' },
    { name: 'Simple mastectomy', category: 'Breast' },
    { name: 'Toilet mastectomy', category: 'Breast' },
    { name: 'Breast-conserving surgery (wide local excision)', category: 'Breast' },
    { name: 'Wide local excision with axillary clearance', category: 'Breast' },
    { name: 'Axillary lymph node dissection', category: 'Breast' },
    { name: 'Excision biopsy of breast lump', category: 'Breast' },
    { name: 'Incision biopsy of breast mass', category: 'Breast' },
    { name: 'Microdochectomy', category: 'Breast' },
    { name: 'Drainage of breast abscess', category: 'Breast', emergency: true },
    { name: 'Excision of fibroadenoma', category: 'Breast' },
    { name: 'Subcutaneous mastectomy for gynaecomastia', category: 'Breast' },

    // Endocrine
    { name: 'Total thyroidectomy', category: 'Endocrine' },
    { name: 'Subtotal thyroidectomy', category: 'Endocrine' },
    { name: 'Hemithyroidectomy', category: 'Endocrine' },
    { name: 'Isthmusectomy', category: 'Endocrine' },
    { name: 'Parathyroidectomy', category: 'Endocrine' },
    { name: 'Adrenalectomy', category: 'Endocrine' },
    { name: 'Excision of thyroglossal cyst (Sistrunk procedure)', category: 'Endocrine' },

    // Soft tissue, vascular and general
    { name: 'Excision of lipoma', category: 'Soft tissue' },
    { name: 'Excision of sebaceous cyst', category: 'Soft tissue' },
    { name: 'Excision biopsy of soft tissue mass', category: 'Soft tissue' },
    { name: 'Lymph node biopsy', category: 'Soft tissue' },
    { name: 'Incision and drainage of abscess', category: 'Soft tissue', emergency: true },
    { name: 'Wound debridement', category: 'Soft tissue', emergency: true },
    { name: 'Debridement of necrotising fasciitis', category: 'Soft tissue', emergency: true },
    { name: 'Secondary suturing of wound', category: 'Soft tissue' },
    { name: 'Varicose vein stripping', category: 'Vascular' },
    { name: 'Arteriovenous fistula creation for dialysis', category: 'Vascular' },
    { name: 'Embolectomy', category: 'Vascular', emergency: true },
    { name: 'Repair of peripheral arterial injury', category: 'Vascular', emergency: true },
    { name: 'Above-knee amputation', category: 'Vascular', emergency: true },
    { name: 'Below-knee amputation', category: 'Vascular', emergency: true },
    { name: 'Ray amputation', category: 'Vascular' },
    { name: 'Toe amputation', category: 'Vascular' },
    { name: 'Central venous catheter insertion', category: 'Vascular' },
    { name: 'Tunnelled dialysis catheter insertion', category: 'Vascular' },
    { name: 'Diagnostic laparoscopy', category: 'Diagnostic' },
    { name: 'Tube thoracostomy (chest drain insertion)', category: 'Diagnostic', emergency: true },
  ],

  // ==========================================================================
  'Obstetrics & Gynaecology': [
    // Obstetric — emergency
    { name: 'Emergency caesarean section', category: 'Obstetric', emergency: true },
    { name: 'Elective caesarean section', category: 'Obstetric' },
    { name: 'Caesarean section with bilateral tubal ligation', category: 'Obstetric' },
    { name: 'Caesarean hysterectomy', category: 'Obstetric', emergency: true },
    { name: 'Repair of ruptured uterus', category: 'Obstetric', emergency: true },
    { name: 'Laparotomy for ruptured ectopic pregnancy', category: 'Obstetric', emergency: true },
    { name: 'Salpingectomy for ectopic pregnancy', category: 'Obstetric', emergency: true },
    { name: 'Salpingostomy for ectopic pregnancy', category: 'Obstetric', emergency: true },
    { name: 'Manual removal of placenta', category: 'Obstetric', emergency: true },
    { name: 'Examination under anaesthesia for postpartum haemorrhage', category: 'Obstetric', emergency: true },
    { name: 'Uterine artery ligation', category: 'Obstetric', emergency: true },
    { name: 'B-Lynch compression suture', category: 'Obstetric', emergency: true },
    { name: 'Internal iliac artery ligation', category: 'Obstetric', emergency: true },
    { name: 'Repair of cervical tear', category: 'Obstetric', emergency: true },
    { name: 'Repair of third-degree perineal tear', category: 'Obstetric', emergency: true },
    { name: 'Repair of fourth-degree perineal tear', category: 'Obstetric', emergency: true },
    { name: 'Episiotomy repair', category: 'Obstetric', emergency: true },
    { name: 'Assisted vaginal delivery (vacuum)', category: 'Obstetric', emergency: true },
    { name: 'Assisted vaginal delivery (forceps)', category: 'Obstetric', emergency: true },
    { name: 'Destructive operation for obstructed labour', category: 'Obstetric', emergency: true },
    { name: 'Cervical cerclage (McDonald)', category: 'Obstetric' },
    { name: 'Removal of cervical cerclage', category: 'Obstetric' },
    { name: 'Evacuation of retained products of conception', category: 'Obstetric', emergency: true },
    { name: 'Suction curettage for molar pregnancy', category: 'Obstetric', emergency: true },
    { name: 'Dilatation and curettage', category: 'Obstetric' },
    { name: 'Manual vacuum aspiration', category: 'Obstetric' },

    // Gynaecological — open
    { name: 'Total abdominal hysterectomy', category: 'Gynaecological' },
    { name: 'Total abdominal hysterectomy with bilateral salpingo-oophorectomy', category: 'Gynaecological' },
    { name: 'Subtotal abdominal hysterectomy', category: 'Gynaecological' },
    { name: 'Vaginal hysterectomy', category: 'Gynaecological' },
    { name: 'Radical hysterectomy (Wertheim)', category: 'Gynaecological' },
    { name: 'Abdominal myomectomy', category: 'Gynaecological' },
    { name: 'Hysteroscopic myomectomy', category: 'Gynaecological' },
    { name: 'Ovarian cystectomy', category: 'Gynaecological' },
    { name: 'Oophorectomy', category: 'Gynaecological' },
    { name: 'Salpingo-oophorectomy', category: 'Gynaecological' },
    { name: 'Detorsion of ovarian cyst', category: 'Gynaecological', emergency: true },
    { name: 'Laparotomy for ovarian torsion', category: 'Gynaecological', emergency: true },
    { name: 'Drainage of tubo-ovarian abscess', category: 'Gynaecological', emergency: true },
    { name: 'Staging laparotomy for ovarian cancer', category: 'Gynaecological' },
    { name: 'Debulking surgery for ovarian cancer', category: 'Gynaecological' },
    { name: 'Bilateral tubal ligation', category: 'Gynaecological' },
    { name: 'Tubal reanastomosis', category: 'Gynaecological' },

    // Minimally invasive and diagnostic
    { name: 'Diagnostic laparoscopy and dye test', category: 'Endoscopic' },
    { name: 'Operative laparoscopy', category: 'Endoscopic' },
    { name: 'Diagnostic hysteroscopy', category: 'Endoscopic' },
    { name: 'Hysteroscopy and polypectomy', category: 'Endoscopic' },
    { name: 'Hysteroscopic adhesiolysis', category: 'Endoscopic' },
    { name: 'Examination under anaesthesia and biopsy', category: 'Endoscopic' },
    { name: 'Cervical biopsy', category: 'Endoscopic' },
    { name: 'Cone biopsy of cervix', category: 'Endoscopic' },
    { name: 'Large loop excision of transformation zone', category: 'Endoscopic' },
    { name: 'Endometrial biopsy', category: 'Endoscopic' },

    // Urogynaecology and vulval
    { name: 'Anterior colporrhaphy', category: 'Urogynaecology' },
    { name: 'Posterior colporrhaphy', category: 'Urogynaecology' },
    { name: 'Pelvic floor repair', category: 'Urogynaecology' },
    { name: 'Manchester repair', category: 'Urogynaecology' },
    { name: 'Sacrospinous fixation', category: 'Urogynaecology' },
    { name: 'Vesicovaginal fistula repair', category: 'Urogynaecology' },
    { name: 'Rectovaginal fistula repair', category: 'Urogynaecology' },
    { name: 'Marsupialisation of Bartholin cyst', category: 'Vulval' },
    { name: 'Drainage of Bartholin abscess', category: 'Vulval', emergency: true },
    { name: 'Vulval biopsy', category: 'Vulval' },
    { name: 'Simple vulvectomy', category: 'Vulval' },
    { name: 'Radical vulvectomy', category: 'Vulval' },
    { name: 'Excision of vaginal septum', category: 'Vulval' },
    { name: 'Hymenectomy for imperforate hymen', category: 'Vulval', emergency: true },
  ],

  // ==========================================================================
  Orthopaedics: [
    // Trauma — upper limb
    { name: 'Open reduction and internal fixation of humeral shaft fracture', category: 'Upper limb trauma', emergency: true },
    { name: 'Open reduction and internal fixation of supracondylar fracture', category: 'Upper limb trauma', emergency: true },
    { name: 'Open reduction and internal fixation of radius and ulna fracture', category: 'Upper limb trauma', emergency: true },
    { name: 'Open reduction and internal fixation of distal radius fracture', category: 'Upper limb trauma' },
    { name: 'Open reduction and internal fixation of clavicle fracture', category: 'Upper limb trauma' },
    { name: 'Open reduction and internal fixation of olecranon fracture', category: 'Upper limb trauma' },
    { name: 'Closed reduction and percutaneous pinning', category: 'Upper limb trauma', emergency: true },
    { name: 'Closed reduction and casting', category: 'Upper limb trauma', emergency: true },
    { name: 'Shoulder dislocation reduction under anaesthesia', category: 'Upper limb trauma', emergency: true },

    // Trauma — lower limb
    { name: 'Intramedullary nailing of femur', category: 'Lower limb trauma', emergency: true },
    { name: 'Intramedullary nailing of tibia', category: 'Lower limb trauma', emergency: true },
    { name: 'Open reduction and internal fixation of femoral shaft fracture', category: 'Lower limb trauma', emergency: true },
    { name: 'Dynamic hip screw fixation', category: 'Lower limb trauma', emergency: true },
    { name: 'Proximal femoral nailing', category: 'Lower limb trauma', emergency: true },
    { name: 'Hemiarthroplasty for femoral neck fracture', category: 'Lower limb trauma', emergency: true },
    { name: 'Open reduction and internal fixation of tibial plateau fracture', category: 'Lower limb trauma' },
    { name: 'Open reduction and internal fixation of ankle fracture', category: 'Lower limb trauma', emergency: true },
    { name: 'Open reduction and internal fixation of calcaneal fracture', category: 'Lower limb trauma' },
    { name: 'Patellar tension band wiring', category: 'Lower limb trauma' },
    { name: 'Skeletal traction application', category: 'Lower limb trauma', emergency: true },
    { name: 'External fixator application', category: 'Lower limb trauma', emergency: true },
    { name: 'Removal of external fixator', category: 'Lower limb trauma' },
    { name: 'Removal of implant', category: 'Lower limb trauma' },

    // Pelvis and spine
    { name: 'Pelvic fracture fixation', category: 'Pelvis & spine', emergency: true },
    { name: 'Acetabular fracture fixation', category: 'Pelvis & spine' },
    { name: 'Spinal decompression and fusion', category: 'Pelvis & spine' },
    { name: 'Posterior spinal instrumentation', category: 'Pelvis & spine' },
    { name: 'Laminectomy', category: 'Pelvis & spine' },
    { name: 'Discectomy', category: 'Pelvis & spine' },

    // Arthroplasty
    { name: 'Total hip replacement', category: 'Arthroplasty' },
    { name: 'Total knee replacement', category: 'Arthroplasty' },
    { name: 'Revision hip arthroplasty', category: 'Arthroplasty' },
    { name: 'Revision knee arthroplasty', category: 'Arthroplasty' },
    { name: 'Girdlestone excision arthroplasty', category: 'Arthroplasty' },

    // Infection and tumour
    { name: 'Sequestrectomy for chronic osteomyelitis', category: 'Infection & tumour' },
    { name: 'Saucerisation for osteomyelitis', category: 'Infection & tumour' },
    { name: 'Arthrotomy and washout of septic arthritis', category: 'Infection & tumour', emergency: true },
    { name: 'Drainage of psoas abscess', category: 'Infection & tumour', emergency: true },
    { name: 'Bone biopsy', category: 'Infection & tumour' },
    { name: 'Curettage and bone grafting', category: 'Infection & tumour' },
    { name: 'Wide local excision of bone tumour', category: 'Infection & tumour' },
    { name: 'Limb amputation for tumour', category: 'Infection & tumour' },
    { name: 'Fasciotomy for compartment syndrome', category: 'Infection & tumour', emergency: true },

    // Elective reconstructive and paediatric
    { name: 'Arthroscopy of knee', category: 'Elective & paediatric' },
    { name: 'Anterior cruciate ligament reconstruction', category: 'Elective & paediatric' },
    { name: 'Meniscectomy', category: 'Elective & paediatric' },
    { name: 'Tendon repair', category: 'Elective & paediatric', emergency: true },
    { name: 'Tendon transfer', category: 'Elective & paediatric' },
    { name: 'Carpal tunnel release', category: 'Elective & paediatric' },
    { name: 'Ganglion excision', category: 'Elective & paediatric' },
    { name: 'Corrective osteotomy', category: 'Elective & paediatric' },
    { name: 'Soft tissue release for contracture', category: 'Elective & paediatric' },
    { name: 'Tenotomy for club foot', category: 'Elective & paediatric' },
    { name: 'Ponseti casting under anaesthesia', category: 'Elective & paediatric' },
    { name: 'Open reduction for developmental dysplasia of the hip', category: 'Elective & paediatric' },
    { name: 'Manipulation under anaesthesia', category: 'Elective & paediatric' },
    { name: 'Bone lengthening (Ilizarov)', category: 'Elective & paediatric' },
  ],

  // ==========================================================================
  Neurosurgery: [
    // Trauma
    { name: 'Craniotomy for extradural haematoma', category: 'Trauma', emergency: true },
    { name: 'Craniotomy for subdural haematoma', category: 'Trauma', emergency: true },
    { name: 'Burr hole drainage of chronic subdural haematoma', category: 'Trauma', emergency: true },
    { name: 'Decompressive craniectomy', category: 'Trauma', emergency: true },
    { name: 'Elevation of depressed skull fracture', category: 'Trauma', emergency: true },
    { name: 'Debridement of compound depressed skull fracture', category: 'Trauma', emergency: true },
    { name: 'Cranioplasty', category: 'Trauma' },
    { name: 'Repair of cerebrospinal fluid leak', category: 'Trauma' },
    { name: 'Intracranial pressure monitor insertion', category: 'Trauma', emergency: true },

    // Hydrocephalus and congenital
    { name: 'Ventriculoperitoneal shunt insertion', category: 'Hydrocephalus & congenital', emergency: true },
    { name: 'Ventriculoperitoneal shunt revision', category: 'Hydrocephalus & congenital', emergency: true },
    { name: 'External ventricular drain insertion', category: 'Hydrocephalus & congenital', emergency: true },
    { name: 'Endoscopic third ventriculostomy', category: 'Hydrocephalus & congenital' },
    { name: 'Repair of myelomeningocele', category: 'Hydrocephalus & congenital' },
    { name: 'Repair of encephalocele', category: 'Hydrocephalus & congenital' },
    { name: 'Release of tethered cord', category: 'Hydrocephalus & congenital' },

    // Tumour and vascular
    { name: 'Craniotomy and excision of brain tumour', category: 'Tumour & vascular' },
    { name: 'Craniotomy for meningioma', category: 'Tumour & vascular' },
    { name: 'Transsphenoidal excision of pituitary tumour', category: 'Tumour & vascular' },
    { name: 'Stereotactic brain biopsy', category: 'Tumour & vascular' },
    { name: 'Craniotomy and clipping of aneurysm', category: 'Tumour & vascular' },
    { name: 'Excision of arteriovenous malformation', category: 'Tumour & vascular' },
    { name: 'Drainage of cerebral abscess', category: 'Tumour & vascular', emergency: true },

    // Spine
    { name: 'Lumbar discectomy', category: 'Spine' },
    { name: 'Cervical discectomy and fusion', category: 'Spine' },
    { name: 'Lumbar laminectomy and decompression', category: 'Spine' },
    { name: 'Spinal fixation for unstable fracture', category: 'Spine', emergency: true },
    { name: 'Excision of spinal tumour', category: 'Spine' },
    { name: 'Drainage of spinal epidural abscess', category: 'Spine', emergency: true },

    // Functional and peripheral nerve
    { name: 'Peripheral nerve repair', category: 'Peripheral nerve' },
    { name: 'Nerve decompression', category: 'Peripheral nerve' },
    { name: 'Excision of peripheral nerve tumour', category: 'Peripheral nerve' },
  ],

  // ==========================================================================
  Urology: [
    // Endourology
    { name: 'Transurethral resection of the prostate', category: 'Endourology' },
    { name: 'Transurethral resection of bladder tumour', category: 'Endourology' },
    { name: 'Cystoscopy', category: 'Endourology' },
    { name: 'Cystoscopy and biopsy', category: 'Endourology' },
    { name: 'Cystoscopy and stent insertion', category: 'Endourology', emergency: true },
    { name: 'Cystoscopy and stent removal', category: 'Endourology' },
    { name: 'Ureteroscopy and stone removal', category: 'Endourology', emergency: true },
    { name: 'Percutaneous nephrolithotomy', category: 'Endourology' },
    { name: 'Optical urethrotomy', category: 'Endourology' },
    { name: 'Urethral dilatation', category: 'Endourology' },

    // Open upper tract
    { name: 'Open prostatectomy', category: 'Upper tract' },
    { name: 'Radical prostatectomy', category: 'Upper tract' },
    { name: 'Nephrectomy', category: 'Upper tract' },
    { name: 'Radical nephrectomy', category: 'Upper tract' },
    { name: 'Partial nephrectomy', category: 'Upper tract' },
    { name: 'Nephrolithotomy', category: 'Upper tract' },
    { name: 'Pyelolithotomy', category: 'Upper tract' },
    { name: 'Pyeloplasty', category: 'Upper tract' },
    { name: 'Ureterolithotomy', category: 'Upper tract', emergency: true },
    { name: 'Ureteric reimplantation', category: 'Upper tract' },
    { name: 'Percutaneous nephrostomy', category: 'Upper tract', emergency: true },
    { name: 'Drainage of perinephric abscess', category: 'Upper tract', emergency: true },

    // Bladder and urethra
    { name: 'Open cystolithotomy', category: 'Bladder & urethra' },
    { name: 'Partial cystectomy', category: 'Bladder & urethra' },
    { name: 'Radical cystectomy with urinary diversion', category: 'Bladder & urethra' },
    { name: 'Suprapubic cystostomy', category: 'Bladder & urethra', emergency: true },
    { name: 'Repair of bladder injury', category: 'Bladder & urethra', emergency: true },
    { name: 'Urethroplasty', category: 'Bladder & urethra' },
    { name: 'Repair of urethral injury', category: 'Bladder & urethra', emergency: true },
    { name: 'Repair of urethrocutaneous fistula', category: 'Bladder & urethra' },

    // Genital
    { name: 'Circumcision', category: 'Genital' },
    { name: 'Adult circumcision', category: 'Genital' },
    { name: 'Reduction of paraphimosis', category: 'Genital', emergency: true },
    { name: 'Hydrocelectomy', category: 'Genital' },
    { name: 'Orchidectomy', category: 'Genital' },
    { name: 'Bilateral orchidectomy', category: 'Genital' },
    { name: 'Orchidopexy', category: 'Genital', emergency: true },
    { name: 'Scrotal exploration for testicular torsion', category: 'Genital', emergency: true },
    { name: 'Varicocelectomy', category: 'Genital' },
    { name: 'Vasectomy', category: 'Genital' },
    { name: 'Vasovasostomy', category: 'Genital' },
    { name: 'Excision of epididymal cyst', category: 'Genital' },
    { name: 'Testicular biopsy', category: 'Genital' },
    { name: 'Debridement for Fournier gangrene', category: 'Genital', emergency: true },
    { name: 'Penectomy', category: 'Genital' },
  ],

  // ==========================================================================
  'ENT (Otorhinolaryngology)': [
    // Otology
    { name: 'Myringotomy', category: 'Otology' },
    { name: 'Myringotomy and grommet insertion', category: 'Otology' },
    { name: 'Tympanoplasty', category: 'Otology' },
    { name: 'Myringoplasty', category: 'Otology' },
    { name: 'Cortical mastoidectomy', category: 'Otology' },
    { name: 'Modified radical mastoidectomy', category: 'Otology' },
    { name: 'Radical mastoidectomy', category: 'Otology' },
    { name: 'Examination of ear under anaesthesia', category: 'Otology' },
    { name: 'Removal of foreign body from ear', category: 'Otology', emergency: true },
    { name: 'Drainage of mastoid abscess', category: 'Otology', emergency: true },
    { name: 'Pinnaplasty', category: 'Otology' },
    { name: 'Excision of preauricular sinus', category: 'Otology' },

    // Rhinology
    { name: 'Septoplasty', category: 'Rhinology' },
    { name: 'Submucous resection of septum', category: 'Rhinology' },
    { name: 'Functional endoscopic sinus surgery', category: 'Rhinology' },
    { name: 'Antral washout', category: 'Rhinology' },
    { name: 'Caldwell-Luc operation', category: 'Rhinology' },
    { name: 'Polypectomy (nasal)', category: 'Rhinology' },
    { name: 'Turbinate reduction', category: 'Rhinology' },
    { name: 'Nasal packing for epistaxis', category: 'Rhinology', emergency: true },
    { name: 'Arterial ligation for epistaxis', category: 'Rhinology', emergency: true },
    { name: 'Reduction of nasal fracture', category: 'Rhinology', emergency: true },
    { name: 'Removal of foreign body from nose', category: 'Rhinology', emergency: true },
    { name: 'Excision of angiofibroma', category: 'Rhinology' },
    { name: 'Repair of choanal atresia', category: 'Rhinology' },

    // Throat, head and neck
    { name: 'Tonsillectomy', category: 'Throat' },
    { name: 'Adenoidectomy', category: 'Throat' },
    { name: 'Adenotonsillectomy', category: 'Throat' },
    { name: 'Drainage of peritonsillar abscess (quinsy)', category: 'Throat', emergency: true },
    { name: 'Drainage of retropharyngeal abscess', category: 'Throat', emergency: true },
    { name: 'Direct laryngoscopy', category: 'Throat' },
    { name: 'Microlaryngoscopy and biopsy', category: 'Throat' },
    { name: 'Excision of vocal cord nodule', category: 'Throat' },
    { name: 'Rigid oesophagoscopy and foreign body removal', category: 'Throat', emergency: true },
    { name: 'Bronchoscopy and foreign body removal', category: 'Throat', emergency: true },
    { name: 'Tracheostomy', category: 'Throat', emergency: true },
    { name: 'Emergency cricothyroidotomy', category: 'Throat', emergency: true },
    { name: 'Closure of tracheostomy', category: 'Throat' },
    { name: 'Laryngectomy', category: 'Throat' },
    { name: 'Pharyngoplasty', category: 'Throat' },
    { name: 'Uvulopalatopharyngoplasty', category: 'Throat' },
    { name: 'Excision of branchial cyst', category: 'Head & neck' },
    { name: 'Excision of thyroglossal duct cyst', category: 'Head & neck' },
    { name: 'Superficial parotidectomy', category: 'Head & neck' },
    { name: 'Total parotidectomy', category: 'Head & neck' },
    { name: 'Submandibular gland excision', category: 'Head & neck' },
    { name: 'Neck dissection', category: 'Head & neck' },
    { name: 'Cervical lymph node biopsy', category: 'Head & neck' },
    { name: 'Drainage of deep neck space abscess', category: 'Head & neck', emergency: true },
  ],

  // ==========================================================================
  Ophthalmology: [
    // Cataract and lens
    { name: 'Small incision cataract surgery with intraocular lens', category: 'Cataract & lens' },
    { name: 'Phacoemulsification with intraocular lens', category: 'Cataract & lens' },
    { name: 'Extracapsular cataract extraction with intraocular lens', category: 'Cataract & lens' },
    { name: 'Intracapsular cataract extraction', category: 'Cataract & lens' },
    { name: 'Paediatric cataract surgery', category: 'Cataract & lens' },
    { name: 'Secondary intraocular lens implantation', category: 'Cataract & lens' },
    { name: 'Neodymium-YAG capsulotomy', category: 'Cataract & lens' },

    // Glaucoma
    { name: 'Trabeculectomy', category: 'Glaucoma' },
    { name: 'Trabeculectomy with mitomycin C', category: 'Glaucoma' },
    { name: 'Glaucoma drainage device implantation', category: 'Glaucoma' },
    { name: 'Cyclophotocoagulation', category: 'Glaucoma' },
    { name: 'Peripheral iridectomy', category: 'Glaucoma', emergency: true },
    { name: 'Laser peripheral iridotomy', category: 'Glaucoma', emergency: true },

    // Cornea and ocular surface
    { name: 'Penetrating keratoplasty', category: 'Cornea & surface' },
    { name: 'Corneal graft', category: 'Cornea & surface' },
    { name: 'Pterygium excision', category: 'Cornea & surface' },
    { name: 'Pterygium excision with conjunctival autograft', category: 'Cornea & surface' },
    { name: 'Corneal repair for perforation', category: 'Cornea & surface', emergency: true },
    { name: 'Conjunctival flap', category: 'Cornea & surface' },
    { name: 'Removal of corneal foreign body', category: 'Cornea & surface', emergency: true },
    { name: 'Tarsorrhaphy', category: 'Cornea & surface' },

    // Vitreoretinal
    { name: 'Pars plana vitrectomy', category: 'Vitreoretinal' },
    { name: 'Scleral buckling for retinal detachment', category: 'Vitreoretinal', emergency: true },
    { name: 'Retinal laser photocoagulation', category: 'Vitreoretinal' },
    { name: 'Intravitreal injection', category: 'Vitreoretinal' },
    { name: 'Cryotherapy for retinopathy of prematurity', category: 'Vitreoretinal' },

    // Oculoplastic and orbit
    { name: 'Evisceration', category: 'Oculoplastic & orbit' },
    { name: 'Enucleation', category: 'Oculoplastic & orbit' },
    { name: 'Exenteration', category: 'Oculoplastic & orbit' },
    { name: 'Ptosis correction', category: 'Oculoplastic & orbit' },
    { name: 'Entropion correction', category: 'Oculoplastic & orbit' },
    { name: 'Ectropion correction', category: 'Oculoplastic & orbit' },
    { name: 'Chalazion incision and curettage', category: 'Oculoplastic & orbit' },
    { name: 'Excision of eyelid lesion', category: 'Oculoplastic & orbit' },
    { name: 'Dacryocystorhinostomy', category: 'Oculoplastic & orbit' },
    { name: 'Syringing and probing of lacrimal duct', category: 'Oculoplastic & orbit' },
    { name: 'Orbitotomy', category: 'Oculoplastic & orbit' },
    { name: 'Repair of eyelid laceration', category: 'Oculoplastic & orbit', emergency: true },
    { name: 'Repair of globe rupture', category: 'Oculoplastic & orbit', emergency: true },
    { name: 'Removal of intraocular foreign body', category: 'Oculoplastic & orbit', emergency: true },

    // Strabismus and examination
    { name: 'Strabismus surgery (recession)', category: 'Strabismus' },
    { name: 'Strabismus surgery (resection)', category: 'Strabismus' },
    { name: 'Examination under anaesthesia (ophthalmic)', category: 'Strabismus' },
  ],

  // ==========================================================================
  'Maxillofacial Surgery': [
    // Trauma
    { name: 'Open reduction and internal fixation of mandibular fracture', category: 'Facial trauma', emergency: true },
    { name: 'Open reduction and internal fixation of maxillary fracture', category: 'Facial trauma', emergency: true },
    { name: 'Open reduction and internal fixation of zygomatic fracture', category: 'Facial trauma', emergency: true },
    { name: 'Reduction of nasal bone fracture', category: 'Facial trauma', emergency: true },
    { name: 'Repair of orbital floor fracture', category: 'Facial trauma' },
    { name: 'Intermaxillary fixation (arch bars)', category: 'Facial trauma', emergency: true },
    { name: 'Removal of intermaxillary fixation', category: 'Facial trauma' },
    { name: 'Repair of facial soft tissue laceration', category: 'Facial trauma', emergency: true },
    { name: 'Panfacial fracture reconstruction', category: 'Facial trauma', emergency: true },

    // Dentoalveolar
    { name: 'Surgical extraction of impacted third molar', category: 'Dentoalveolar' },
    { name: 'Multiple dental extractions under anaesthesia', category: 'Dentoalveolar' },
    { name: 'Apicectomy', category: 'Dentoalveolar' },
    { name: 'Alveoloplasty', category: 'Dentoalveolar' },
    { name: 'Removal of retained root', category: 'Dentoalveolar' },
    { name: 'Exposure of unerupted tooth', category: 'Dentoalveolar' },
    { name: 'Dental implant placement', category: 'Dentoalveolar' },

    // Infection
    { name: 'Incision and drainage of dental abscess', category: 'Infection', emergency: true },
    { name: 'Drainage of Ludwig angina', category: 'Infection', emergency: true },
    { name: 'Drainage of submandibular abscess', category: 'Infection', emergency: true },
    { name: 'Sequestrectomy of the jaw', category: 'Infection' },
    { name: 'Debridement for osteomyelitis of the jaw', category: 'Infection' },
    { name: 'Debridement for noma (cancrum oris)', category: 'Infection' },

    // Tumour and cyst
    { name: 'Enucleation of jaw cyst', category: 'Tumour & cyst' },
    { name: 'Marsupialisation of jaw cyst', category: 'Tumour & cyst' },
    { name: 'Excision of ameloblastoma', category: 'Tumour & cyst' },
    { name: 'Segmental mandibulectomy', category: 'Tumour & cyst' },
    { name: 'Hemimandibulectomy', category: 'Tumour & cyst' },
    { name: 'Maxillectomy', category: 'Tumour & cyst' },
    { name: 'Partial maxillectomy', category: 'Tumour & cyst' },
    { name: 'Excision of oral cavity tumour', category: 'Tumour & cyst' },
    { name: 'Glossectomy', category: 'Tumour & cyst' },
    { name: 'Biopsy of oral lesion', category: 'Tumour & cyst' },

    // Reconstructive and orthognathic
    { name: 'Reconstruction with free fibula flap', category: 'Reconstructive' },
    { name: 'Reconstruction with pectoralis major flap', category: 'Reconstructive' },
    { name: 'Bone grafting of the jaw', category: 'Reconstructive' },
    { name: 'Le Fort I osteotomy', category: 'Reconstructive' },
    { name: 'Bilateral sagittal split osteotomy', category: 'Reconstructive' },
    { name: 'Genioplasty', category: 'Reconstructive' },
    { name: 'Temporomandibular joint arthroplasty', category: 'Reconstructive' },
    { name: 'Release of temporomandibular joint ankylosis', category: 'Reconstructive' },
    { name: 'Excision of ranula', category: 'Salivary' },
    { name: 'Sialolithotomy', category: 'Salivary' },
    { name: 'Excision of mucocele', category: 'Salivary' },
  ],

  // ==========================================================================
  'Plastic Surgery': [
    // Burns
    { name: 'Burn wound debridement', category: 'Burns', emergency: true },
    { name: 'Escharotomy', category: 'Burns', emergency: true },
    { name: 'Tangential excision and grafting', category: 'Burns' },
    { name: 'Split-thickness skin grafting', category: 'Burns' },
    { name: 'Full-thickness skin grafting', category: 'Burns' },
    { name: 'Release of post-burn contracture', category: 'Burns' },
    { name: 'Serial dressing change under anaesthesia', category: 'Burns' },

    // Reconstruction
    { name: 'Local flap reconstruction', category: 'Reconstruction' },
    { name: 'Fasciocutaneous flap', category: 'Reconstruction' },
    { name: 'Myocutaneous flap', category: 'Reconstruction' },
    { name: 'Free flap reconstruction', category: 'Reconstruction' },
    { name: 'Z-plasty', category: 'Reconstruction' },
    { name: 'Tissue expander insertion', category: 'Reconstruction' },
    { name: 'Scar revision', category: 'Reconstruction' },
    { name: 'Excision of keloid', category: 'Reconstruction' },
    { name: 'Coverage of pressure sore', category: 'Reconstruction' },
    { name: 'Breast reconstruction', category: 'Reconstruction' },
    { name: 'Nipple-areola reconstruction', category: 'Reconstruction' },

    // Congenital
    { name: 'Cleft lip repair', category: 'Congenital' },
    { name: 'Cleft palate repair', category: 'Congenital' },
    { name: 'Alveolar bone grafting', category: 'Congenital' },
    { name: 'Repair of syndactyly', category: 'Congenital' },
    { name: 'Excision of polydactyly', category: 'Congenital' },
    { name: 'Correction of hypospadias', category: 'Congenital' },
    { name: 'Ear reconstruction for microtia', category: 'Congenital' },

    // Hand and trauma
    { name: 'Repair of flexor tendon injury', category: 'Hand & trauma', emergency: true },
    { name: 'Repair of extensor tendon injury', category: 'Hand & trauma', emergency: true },
    { name: 'Digital nerve repair', category: 'Hand & trauma', emergency: true },
    { name: 'Replantation of amputated digit', category: 'Hand & trauma', emergency: true },
    { name: 'Release of Dupuytren contracture', category: 'Hand & trauma' },
    { name: 'Trigger finger release', category: 'Hand & trauma' },
    { name: 'Drainage of hand infection', category: 'Hand & trauma', emergency: true },
    { name: 'Terminalisation of digit', category: 'Hand & trauma', emergency: true },

    // Aesthetic and skin
    { name: 'Excision of skin tumour and reconstruction', category: 'Skin & aesthetic' },
    { name: 'Wide local excision of melanoma', category: 'Skin & aesthetic' },
    { name: 'Abdominoplasty', category: 'Skin & aesthetic' },
    { name: 'Liposuction', category: 'Skin & aesthetic' },
    { name: 'Reduction mammoplasty', category: 'Skin & aesthetic' },
    { name: 'Augmentation mammoplasty', category: 'Skin & aesthetic' },
    { name: 'Rhinoplasty', category: 'Skin & aesthetic' },
    { name: 'Blepharoplasty', category: 'Skin & aesthetic' },
    { name: 'Excision of lymphangioma', category: 'Skin & aesthetic' },
    { name: 'Excision of haemangioma', category: 'Skin & aesthetic' },
  ],

  // ==========================================================================
  'Paediatric Surgery': [
    // Neonatal — emergency
    { name: 'Repair of gastroschisis', category: 'Neonatal', emergency: true },
    { name: 'Repair of exomphalos', category: 'Neonatal', emergency: true },
    { name: 'Repair of oesophageal atresia and tracheo-oesophageal fistula', category: 'Neonatal', emergency: true },
    { name: 'Repair of congenital diaphragmatic hernia', category: 'Neonatal', emergency: true },
    { name: 'Laparotomy for necrotising enterocolitis', category: 'Neonatal', emergency: true },
    { name: 'Laparotomy for intestinal atresia', category: 'Neonatal', emergency: true },
    { name: 'Laparotomy for malrotation and volvulus', category: 'Neonatal', emergency: true },
    { name: 'Duodenoduodenostomy', category: 'Neonatal', emergency: true },
    { name: 'Ramstedt pyloromyotomy', category: 'Neonatal', emergency: true },
    { name: 'Peritoneal drain insertion (neonatal)', category: 'Neonatal', emergency: true },

    // Anorectal and colorectal
    { name: 'Anoplasty for imperforate anus', category: 'Anorectal', emergency: true },
    { name: 'Posterior sagittal anorectoplasty', category: 'Anorectal' },
    { name: 'Colostomy (paediatric)', category: 'Anorectal', emergency: true },
    { name: 'Closure of colostomy (paediatric)', category: 'Anorectal' },
    { name: 'Rectal biopsy for Hirschsprung disease', category: 'Anorectal' },
    { name: 'Soave pull-through', category: 'Anorectal' },
    { name: 'Duhamel pull-through', category: 'Anorectal' },
    { name: 'Swenson pull-through', category: 'Anorectal' },
    { name: 'Transanal endorectal pull-through', category: 'Anorectal' },

    // Abdominal
    { name: 'Reduction of intussusception', category: 'Abdominal', emergency: true },
    { name: 'Laparotomy for intussusception', category: 'Abdominal', emergency: true },
    { name: 'Appendicectomy (paediatric)', category: 'Abdominal', emergency: true },
    { name: 'Laparotomy for typhoid perforation', category: 'Abdominal', emergency: true },
    { name: 'Excision of Meckel diverticulum', category: 'Abdominal', emergency: true },
    { name: 'Excision of choledochal cyst', category: 'Abdominal' },
    { name: 'Kasai portoenterostomy', category: 'Abdominal' },
    { name: 'Splenectomy (paediatric)', category: 'Abdominal' },
    { name: 'Nephrectomy for Wilms tumour', category: 'Abdominal' },
    { name: 'Excision of neuroblastoma', category: 'Abdominal' },
    { name: 'Excision of sacrococcygeal teratoma', category: 'Abdominal' },

    // Groin, genital and general
    { name: 'Herniotomy (inguinal)', category: 'Groin & genital' },
    { name: 'Bilateral herniotomy', category: 'Groin & genital' },
    { name: 'Emergency herniotomy for obstructed hernia', category: 'Groin & genital', emergency: true },
    { name: 'Umbilical hernia repair (paediatric)', category: 'Groin & genital' },
    { name: 'Orchidopexy (paediatric)', category: 'Groin & genital' },
    { name: 'Hydrocelectomy (paediatric)', category: 'Groin & genital' },
    { name: 'Circumcision (paediatric)', category: 'Groin & genital' },
    { name: 'Repair of hypospadias', category: 'Groin & genital' },
    { name: 'Cystoscopy (paediatric)', category: 'Groin & genital' },
    { name: 'Posterior urethral valve ablation', category: 'Groin & genital', emergency: true },
    { name: 'Excision of thyroglossal cyst (paediatric)', category: 'General' },
    { name: 'Excision of branchial remnant', category: 'General' },
    { name: 'Excision of cystic hygroma', category: 'General' },
    { name: 'Central venous access (paediatric)', category: 'General' },
    { name: 'Examination under anaesthesia (paediatric)', category: 'General' },
  ],

  // ==========================================================================
  'Cardiothoracic Surgery': [
    // Thoracic
    { name: 'Tube thoracostomy', category: 'Thoracic', emergency: true },
    { name: 'Thoracotomy for haemothorax', category: 'Thoracic', emergency: true },
    { name: 'Emergency thoracotomy for chest trauma', category: 'Thoracic', emergency: true },
    { name: 'Decortication for empyema', category: 'Thoracic' },
    { name: 'Open drainage of empyema', category: 'Thoracic', emergency: true },
    { name: 'Lobectomy', category: 'Thoracic' },
    { name: 'Pneumonectomy', category: 'Thoracic' },
    { name: 'Wedge resection of lung', category: 'Thoracic' },
    { name: 'Lung biopsy', category: 'Thoracic' },
    { name: 'Pleurodesis', category: 'Thoracic' },
    { name: 'Pleural biopsy', category: 'Thoracic' },
    { name: 'Repair of diaphragmatic injury', category: 'Thoracic', emergency: true },
    { name: 'Excision of mediastinal mass', category: 'Thoracic' },
    { name: 'Mediastinoscopy', category: 'Thoracic' },
    { name: 'Thymectomy', category: 'Thoracic' },
    { name: 'Rigid bronchoscopy', category: 'Thoracic', emergency: true },
    { name: 'Video-assisted thoracoscopic surgery', category: 'Thoracic' },
    { name: 'Repair of chest wall defect', category: 'Thoracic' },
    { name: 'Correction of pectus excavatum', category: 'Thoracic' },

    // Cardiac
    { name: 'Pericardiocentesis', category: 'Cardiac', emergency: true },
    { name: 'Pericardial window', category: 'Cardiac', emergency: true },
    { name: 'Pericardiectomy', category: 'Cardiac' },
    { name: 'Closure of atrial septal defect', category: 'Cardiac' },
    { name: 'Closure of ventricular septal defect', category: 'Cardiac' },
    { name: 'Patent ductus arteriosus ligation', category: 'Cardiac' },
    { name: 'Coronary artery bypass grafting', category: 'Cardiac' },
    { name: 'Mitral valve replacement', category: 'Cardiac' },
    { name: 'Aortic valve replacement', category: 'Cardiac' },
    { name: 'Mitral valve repair', category: 'Cardiac' },
    { name: 'Repair of tetralogy of Fallot', category: 'Cardiac' },
    { name: 'Blalock-Taussig shunt', category: 'Cardiac' },
    { name: 'Permanent pacemaker implantation', category: 'Cardiac' },
    { name: 'Temporary pacing wire insertion', category: 'Cardiac', emergency: true },
    { name: 'Repair of cardiac injury', category: 'Cardiac', emergency: true },

    // Vascular (thoracic)
    { name: 'Repair of thoracic aortic aneurysm', category: 'Vascular' },
    { name: 'Repair of abdominal aortic aneurysm', category: 'Vascular' },
    { name: 'Aorto-bifemoral bypass', category: 'Vascular' },
    { name: 'Femoro-popliteal bypass', category: 'Vascular' },
    { name: 'Carotid endarterectomy', category: 'Vascular' },
  ],
};

/** Every entry, flattened, with its subspecialty attached. */
export function allEntries(): (CatalogueEntry & { subspecialty: Subspecialty })[] {
  return (Object.keys(CATALOGUE) as Subspecialty[]).flatMap((sub) =>
    CATALOGUE[sub].map((e) => ({ ...e, subspecialty: sub }))
  );
}

/** How many procedures the catalogue seeds, in total. */
export function catalogueSize(): number {
  return allEntries().length;
}
