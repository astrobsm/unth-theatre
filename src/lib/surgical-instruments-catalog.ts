/**
 * Comprehensive Surgical Instruments Catalog
 * ---------------------------------------------
 * Compiled for the UNTH Theatre Management System.
 * Organised by surgical subspecialty so the scrub nurse can quickly find
 * an instrument set during count initialization.
 *
 * Each entry has:
 *   - id          : stable slug used as React key & DB identifier
 *   - name        : display name
 *   - category    : broad grouping (Cutting, Grasping, Retracting, Hemostatic,
 *                   Suction, Suturing, Specialty, Power)
 *   - subspecialty: which surgical specialty most uses it (or "General")
 *   - aliases     : alternate names (used by the search filter)
 */

export interface SurgicalInstrument {
  id: string;
  name: string;
  category:
    | 'Cutting'
    | 'Grasping'
    | 'Retracting'
    | 'Hemostatic'
    | 'Suction'
    | 'Suturing'
    | 'Specialty'
    | 'Power'
    | 'Accessory';
  subspecialty: string;
  aliases?: string[];
}

export const SURGICAL_SUBSPECIALTIES = [
  'General',
  'General Surgery',
  'Orthopedics',
  'Neurosurgery',
  'Cardiothoracic',
  'Obstetrics & Gynaecology',
  'Urology',
  'ENT',
  'Ophthalmology',
  'Plastic & Reconstructive',
  'Paediatric Surgery',
  'Vascular',
  'Maxillofacial',
  'Laparoscopic',
] as const;

export const SURGICAL_INSTRUMENTS: SurgicalInstrument[] = [
  // ===================== GENERAL / BASIC SET =====================
  { id: 'scalpel-handle-3', name: 'Scalpel Handle No. 3 (Bard-Parker)', category: 'Cutting', subspecialty: 'General' },
  { id: 'scalpel-handle-4', name: 'Scalpel Handle No. 4 (Bard-Parker)', category: 'Cutting', subspecialty: 'General' },
  { id: 'scalpel-handle-7', name: 'Scalpel Handle No. 7 (long)', category: 'Cutting', subspecialty: 'General' },
  { id: 'mayo-scissors-straight', name: 'Mayo Scissors – Straight', category: 'Cutting', subspecialty: 'General' },
  { id: 'mayo-scissors-curved', name: 'Mayo Scissors – Curved', category: 'Cutting', subspecialty: 'General' },
  { id: 'metzenbaum-scissors', name: 'Metzenbaum Scissors', category: 'Cutting', subspecialty: 'General', aliases: ['Metz'] },
  { id: 'iris-scissors', name: 'Iris Scissors', category: 'Cutting', subspecialty: 'General' },
  { id: 'suture-scissors', name: 'Suture Scissors', category: 'Cutting', subspecialty: 'General' },
  { id: 'bandage-scissors', name: 'Bandage Scissors (Lister)', category: 'Cutting', subspecialty: 'General' },

  { id: 'adson-forceps-toothed', name: 'Adson Tissue Forceps – Toothed', category: 'Grasping', subspecialty: 'General' },
  { id: 'adson-forceps-non-toothed', name: 'Adson Tissue Forceps – Non-Toothed', category: 'Grasping', subspecialty: 'General' },
  { id: 'debakey-forceps', name: 'DeBakey Forceps', category: 'Grasping', subspecialty: 'General' },
  { id: 'russian-forceps', name: 'Russian Tissue Forceps', category: 'Grasping', subspecialty: 'General' },
  { id: 'allis-forceps', name: 'Allis Tissue Forceps', category: 'Grasping', subspecialty: 'General' },
  { id: 'babcock-forceps', name: 'Babcock Tissue Forceps', category: 'Grasping', subspecialty: 'General' },
  { id: 'kocher-forceps', name: 'Kocher (Ochsner) Forceps', category: 'Grasping', subspecialty: 'General' },
  { id: 'sponge-holding-forceps', name: 'Sponge-Holding Forceps (Rampley)', category: 'Grasping', subspecialty: 'General', aliases: ['Rampley'] },
  { id: 'towel-clip-backhaus', name: 'Towel Clip (Backhaus)', category: 'Accessory', subspecialty: 'General' },
  { id: 'towel-clip-jones', name: 'Towel Clip (Jones / cross-action)', category: 'Accessory', subspecialty: 'General' },

  { id: 'mosquito-curved', name: 'Mosquito Artery Forceps – Curved', category: 'Hemostatic', subspecialty: 'General', aliases: ['Halsted'] },
  { id: 'mosquito-straight', name: 'Mosquito Artery Forceps – Straight', category: 'Hemostatic', subspecialty: 'General' },
  { id: 'crile-forceps', name: 'Crile Artery Forceps', category: 'Hemostatic', subspecialty: 'General' },
  { id: 'kelly-forceps', name: 'Kelly Artery Forceps', category: 'Hemostatic', subspecialty: 'General' },
  { id: 'spencer-wells-curved', name: 'Spencer-Wells Forceps – Curved', category: 'Hemostatic', subspecialty: 'General' },
  { id: 'spencer-wells-straight', name: 'Spencer-Wells Forceps – Straight', category: 'Hemostatic', subspecialty: 'General' },
  { id: 'right-angle-forceps', name: 'Right-Angle (Mixter) Forceps', category: 'Hemostatic', subspecialty: 'General', aliases: ['Mixter'] },
  { id: 'roberts-forceps', name: 'Roberts Artery Forceps', category: 'Hemostatic', subspecialty: 'General' },

  { id: 'needle-holder-mayo-hegar', name: 'Needle Holder (Mayo-Hegar)', category: 'Suturing', subspecialty: 'General' },
  { id: 'needle-holder-crile-wood', name: 'Needle Holder (Crile-Wood)', category: 'Suturing', subspecialty: 'General' },
  { id: 'needle-holder-castro-viejo', name: 'Needle Holder (Castroviejo)', category: 'Suturing', subspecialty: 'General' },

  { id: 'yankauer-suction', name: 'Yankauer Suction Tip', category: 'Suction', subspecialty: 'General' },
  { id: 'frazier-suction', name: 'Frazier Suction Tip', category: 'Suction', subspecialty: 'General' },
  { id: 'poole-suction', name: 'Poole Suction Tip', category: 'Suction', subspecialty: 'General' },
  { id: 'suction-tubing', name: 'Suction Tubing', category: 'Suction', subspecialty: 'General' },

  { id: 'retractor-langenbeck', name: 'Langenbeck Retractor', category: 'Retracting', subspecialty: 'General' },
  { id: 'retractor-czerny', name: 'Czerny Retractor', category: 'Retracting', subspecialty: 'General' },
  { id: 'retractor-deaver', name: 'Deaver Retractor', category: 'Retracting', subspecialty: 'General' },
  { id: 'retractor-richardson', name: 'Richardson Retractor', category: 'Retracting', subspecialty: 'General' },
  { id: 'retractor-army-navy', name: 'Army-Navy Retractor', category: 'Retracting', subspecialty: 'General' },
  { id: 'retractor-malleable', name: 'Malleable (Ribbon) Retractor', category: 'Retracting', subspecialty: 'General' },
  { id: 'retractor-self-balfour', name: 'Balfour Self-Retaining Retractor', category: 'Retracting', subspecialty: 'General' },
  { id: 'retractor-self-bookwalter', name: 'Bookwalter Self-Retaining Retractor', category: 'Retracting', subspecialty: 'General' },
  { id: 'retractor-self-weitlaner', name: 'Weitlaner Self-Retaining Retractor', category: 'Retracting', subspecialty: 'General' },
  { id: 'retractor-self-gelpi', name: 'Gelpi Self-Retaining Retractor', category: 'Retracting', subspecialty: 'General' },
  { id: 'retractor-volkmann', name: 'Volkmann (Rake) Retractor', category: 'Retracting', subspecialty: 'General' },

  { id: 'gallipot', name: 'Gallipot', category: 'Accessory', subspecialty: 'General' },
  { id: 'kidney-dish', name: 'Kidney Dish (Receiver)', category: 'Accessory', subspecialty: 'General' },
  { id: 'instrument-tray', name: 'Instrument Tray', category: 'Accessory', subspecialty: 'General' },
  { id: 'diathermy-pencil', name: 'Diathermy / Electrocautery Pencil', category: 'Power', subspecialty: 'General' },
  { id: 'diathermy-forceps-bipolar', name: 'Bipolar Diathermy Forceps', category: 'Power', subspecialty: 'General' },

  // ===================== GENERAL SURGERY (LAPAROTOMY) =====================
  { id: 'doyen-intestinal-clamp', name: 'Doyen Intestinal Clamp', category: 'Grasping', subspecialty: 'General Surgery' },
  { id: 'pean-forceps', name: 'Péan Forceps', category: 'Hemostatic', subspecialty: 'General Surgery' },
  { id: 'desjardins-stone-forceps', name: 'Desjardins Gallstone Forceps', category: 'Specialty', subspecialty: 'General Surgery' },
  { id: 'gallbladder-trocar', name: 'Gallbladder Trocar', category: 'Specialty', subspecialty: 'General Surgery' },
  { id: 'lahey-thyroid-forceps', name: 'Lahey Thyroid Forceps', category: 'Grasping', subspecialty: 'General Surgery' },
  { id: 'mayo-table-cover', name: 'Mayo Table Cover', category: 'Accessory', subspecialty: 'General Surgery' },
  { id: 'cholangiogram-clamp', name: 'Cholangiogram Clamp', category: 'Specialty', subspecialty: 'General Surgery' },
  { id: 'hernia-mesh-tacker', name: 'Hernia Mesh Tacker', category: 'Specialty', subspecialty: 'General Surgery' },

  // ===================== ORTHOPEDICS =====================
  { id: 'bone-cutter', name: 'Bone Cutter', category: 'Cutting', subspecialty: 'Orthopedics' },
  { id: 'bone-nibbler', name: 'Bone Nibbler (Rongeur)', category: 'Cutting', subspecialty: 'Orthopedics' },
  { id: 'kerrison-rongeur', name: 'Kerrison Rongeur', category: 'Cutting', subspecialty: 'Orthopedics' },
  { id: 'osteotome', name: 'Osteotome (assorted sizes)', category: 'Cutting', subspecialty: 'Orthopedics' },
  { id: 'gouge', name: 'Gouge', category: 'Cutting', subspecialty: 'Orthopedics' },
  { id: 'mallet', name: 'Orthopaedic Mallet', category: 'Power', subspecialty: 'Orthopedics' },
  { id: 'periosteal-elevator', name: 'Periosteal Elevator (Bristow / Cobb)', category: 'Specialty', subspecialty: 'Orthopedics' },
  { id: 'bone-holding-forceps', name: 'Bone-Holding Forceps (Lowman / Verbrugge)', category: 'Grasping', subspecialty: 'Orthopedics' },
  { id: 'bone-reduction-clamp', name: 'Bone Reduction Clamp', category: 'Grasping', subspecialty: 'Orthopedics' },
  { id: 'depth-gauge', name: 'Depth Gauge', category: 'Specialty', subspecialty: 'Orthopedics' },
  { id: 'screwdriver-orthopaedic', name: 'Orthopaedic Screwdriver', category: 'Specialty', subspecialty: 'Orthopedics' },
  { id: 'drill-bit-set', name: 'Drill Bit Set', category: 'Power', subspecialty: 'Orthopedics' },
  { id: 'drill-power', name: 'Power Drill', category: 'Power', subspecialty: 'Orthopedics' },
  { id: 'oscillating-saw', name: 'Oscillating Saw', category: 'Power', subspecialty: 'Orthopedics' },
  { id: 'gigli-saw', name: 'Gigli Saw', category: 'Cutting', subspecialty: 'Orthopedics' },
  { id: 'amputation-knife', name: 'Amputation Knife', category: 'Cutting', subspecialty: 'Orthopedics' },
  { id: 'curette-bone', name: 'Bone Curette', category: 'Specialty', subspecialty: 'Orthopedics' },
  { id: 'plate-bender', name: 'Plate Bender', category: 'Specialty', subspecialty: 'Orthopedics' },
  { id: 'hohmann-retractor', name: 'Hohmann Retractor', category: 'Retracting', subspecialty: 'Orthopedics' },
  { id: 'steinmann-pin', name: 'Steinmann Pin', category: 'Specialty', subspecialty: 'Orthopedics' },
  { id: 'kirschner-wire', name: 'Kirschner Wire (K-wire)', category: 'Specialty', subspecialty: 'Orthopedics' },
  { id: 'tourniquet-orthopaedic', name: 'Pneumatic Tourniquet', category: 'Accessory', subspecialty: 'Orthopedics' },

  // ===================== NEUROSURGERY =====================
  { id: 'neuro-microscissors', name: 'Neuro Microscissors', category: 'Cutting', subspecialty: 'Neurosurgery' },
  { id: 'penfield-dissector', name: 'Penfield Dissector', category: 'Specialty', subspecialty: 'Neurosurgery' },
  { id: 'dural-hook', name: 'Dural Hook', category: 'Specialty', subspecialty: 'Neurosurgery' },
  { id: 'dural-scissors', name: 'Dural Scissors', category: 'Cutting', subspecialty: 'Neurosurgery' },
  { id: 'leyla-retractor', name: 'Leyla Self-Retaining Retractor', category: 'Retracting', subspecialty: 'Neurosurgery' },
  { id: 'mayfield-clamp', name: 'Mayfield Head Clamp', category: 'Accessory', subspecialty: 'Neurosurgery' },
  { id: 'perforator-cranial', name: 'Cranial Perforator', category: 'Power', subspecialty: 'Neurosurgery' },
  { id: 'craniotome', name: 'Craniotome', category: 'Power', subspecialty: 'Neurosurgery' },
  { id: 'bipolar-neuro', name: 'Neurosurgical Bipolar Forceps', category: 'Power', subspecialty: 'Neurosurgery' },
  { id: 'aneurysm-clip-applier', name: 'Aneurysm Clip Applier', category: 'Specialty', subspecialty: 'Neurosurgery' },
  { id: 'cusa-handpiece', name: 'CUSA Ultrasonic Aspirator Handpiece', category: 'Power', subspecialty: 'Neurosurgery' },

  // ===================== CARDIOTHORACIC =====================
  { id: 'sternal-saw', name: 'Sternal Saw', category: 'Power', subspecialty: 'Cardiothoracic' },
  { id: 'sternal-retractor', name: 'Sternal Retractor (Finochietto)', category: 'Retracting', subspecialty: 'Cardiothoracic' },
  { id: 'rib-spreader', name: 'Rib Spreader', category: 'Retracting', subspecialty: 'Cardiothoracic' },
  { id: 'rib-shears', name: 'Rib Shears', category: 'Cutting', subspecialty: 'Cardiothoracic' },
  { id: 'satinsky-clamp', name: 'Satinsky Vascular Clamp', category: 'Hemostatic', subspecialty: 'Cardiothoracic' },
  { id: 'debakey-vascular-clamp', name: 'DeBakey Vascular Clamp', category: 'Hemostatic', subspecialty: 'Cardiothoracic' },
  { id: 'cooley-clamp', name: 'Cooley Vascular Clamp', category: 'Hemostatic', subspecialty: 'Cardiothoracic' },
  { id: 'cardiac-needle-holder', name: 'Cardiac Needle Holder', category: 'Suturing', subspecialty: 'Cardiothoracic' },
  { id: 'sternal-wire-twister', name: 'Sternal Wire Twister', category: 'Specialty', subspecialty: 'Cardiothoracic' },
  { id: 'chest-tube-clamp', name: 'Chest Tube Clamp', category: 'Specialty', subspecialty: 'Cardiothoracic' },
  { id: 'bulldog-clamp', name: 'Bulldog Vascular Clamp', category: 'Hemostatic', subspecialty: 'Cardiothoracic' },

  // ===================== OBSTETRICS & GYNAECOLOGY =====================
  { id: 'sims-speculum', name: "Sims' Speculum", category: 'Specialty', subspecialty: 'Obstetrics & Gynaecology' },
  { id: 'cusco-speculum', name: "Cusco's Bivalve Speculum", category: 'Specialty', subspecialty: 'Obstetrics & Gynaecology' },
  { id: 'auvard-speculum', name: 'Auvard Weighted Speculum', category: 'Specialty', subspecialty: 'Obstetrics & Gynaecology' },
  { id: 'vulsellum-forceps', name: 'Vulsellum Forceps', category: 'Grasping', subspecialty: 'Obstetrics & Gynaecology' },
  { id: 'tenaculum-forceps', name: 'Tenaculum Forceps', category: 'Grasping', subspecialty: 'Obstetrics & Gynaecology' },
  { id: 'hegar-dilators', name: 'Hegar Cervical Dilators (set)', category: 'Specialty', subspecialty: 'Obstetrics & Gynaecology' },
  { id: 'curette-uterine', name: 'Uterine Curette (sharp & blunt)', category: 'Specialty', subspecialty: 'Obstetrics & Gynaecology' },
  { id: 'uterine-sound', name: 'Uterine Sound', category: 'Specialty', subspecialty: 'Obstetrics & Gynaecology' },
  { id: 'obstetric-forceps-wrigley', name: "Wrigley's Obstetric Forceps", category: 'Specialty', subspecialty: 'Obstetrics & Gynaecology' },
  { id: 'obstetric-forceps-kielland', name: "Kielland's Obstetric Forceps", category: 'Specialty', subspecialty: 'Obstetrics & Gynaecology' },
  { id: 'vacuum-extractor', name: 'Vacuum Extractor (Ventouse)', category: 'Specialty', subspecialty: 'Obstetrics & Gynaecology' },
  { id: 'green-armytage', name: 'Green-Armytage Haemostat', category: 'Hemostatic', subspecialty: 'Obstetrics & Gynaecology' },
  { id: 'doyens-retractor', name: "Doyen's Retractor (CS)", category: 'Retracting', subspecialty: 'Obstetrics & Gynaecology' },
  { id: 'cord-clamp', name: 'Umbilical Cord Clamp', category: 'Accessory', subspecialty: 'Obstetrics & Gynaecology' },
  { id: 'cord-scissors', name: 'Umbilical Cord Scissors', category: 'Cutting', subspecialty: 'Obstetrics & Gynaecology' },

  // ===================== UROLOGY =====================
  { id: 'cystoscope', name: 'Cystoscope', category: 'Specialty', subspecialty: 'Urology' },
  { id: 'resectoscope', name: 'Resectoscope (TURP)', category: 'Specialty', subspecialty: 'Urology' },
  { id: 'ureteric-catheter', name: 'Ureteric Catheter', category: 'Specialty', subspecialty: 'Urology' },
  { id: 'jj-stent', name: 'JJ (Double-J) Stent', category: 'Specialty', subspecialty: 'Urology' },
  { id: 'stone-basket', name: 'Stone Basket (Dormia)', category: 'Specialty', subspecialty: 'Urology' },
  { id: 'lithotrite', name: 'Lithotrite', category: 'Specialty', subspecialty: 'Urology' },
  { id: 'urethral-dilators', name: 'Urethral Dilators (set)', category: 'Specialty', subspecialty: 'Urology' },
  { id: 'foley-catheter', name: 'Foley Catheter', category: 'Accessory', subspecialty: 'Urology' },

  // ===================== ENT =====================
  { id: 'tonsil-snare', name: 'Tonsil Snare (Eve)', category: 'Specialty', subspecialty: 'ENT' },
  { id: 'tonsil-dissector', name: 'Tonsil Dissector', category: 'Specialty', subspecialty: 'ENT' },
  { id: 'boyle-davis-mouth-gag', name: 'Boyle-Davis Mouth Gag', category: 'Retracting', subspecialty: 'ENT' },
  { id: 'nasal-speculum-thudichum', name: "Thudichum's Nasal Speculum", category: 'Specialty', subspecialty: 'ENT' },
  { id: 'nasal-speculum-killian', name: 'Killian Nasal Speculum', category: 'Specialty', subspecialty: 'ENT' },
  { id: 'aural-speculum', name: 'Aural Speculum', category: 'Specialty', subspecialty: 'ENT' },
  { id: 'myringotomy-knife', name: 'Myringotomy Knife', category: 'Cutting', subspecialty: 'ENT' },
  { id: 'crocodile-forceps', name: 'Crocodile Forceps', category: 'Grasping', subspecialty: 'ENT' },
  { id: 'laryngoscope-blade', name: 'Laryngoscope Blade', category: 'Specialty', subspecialty: 'ENT' },
  { id: 'tracheostomy-tube', name: 'Tracheostomy Tube', category: 'Specialty', subspecialty: 'ENT' },
  { id: 'tracheal-dilator', name: 'Tracheal Dilator (Trousseau)', category: 'Specialty', subspecialty: 'ENT' },

  // ===================== OPHTHALMOLOGY =====================
  { id: 'lid-speculum', name: 'Lid Speculum (Barraquer)', category: 'Specialty', subspecialty: 'Ophthalmology' },
  { id: 'corneal-scissors', name: 'Corneal Scissors', category: 'Cutting', subspecialty: 'Ophthalmology' },
  { id: 'cataract-knife', name: 'Cataract Knife (keratome)', category: 'Cutting', subspecialty: 'Ophthalmology' },
  { id: 'iris-forceps', name: 'Iris Forceps', category: 'Grasping', subspecialty: 'Ophthalmology' },
  { id: 'capsulotomy-forceps', name: 'Capsulotomy Forceps (Utrata)', category: 'Grasping', subspecialty: 'Ophthalmology' },
  { id: 'phaco-handpiece', name: 'Phacoemulsification Handpiece', category: 'Power', subspecialty: 'Ophthalmology' },
  { id: 'iol-injector', name: 'IOL Injector', category: 'Specialty', subspecialty: 'Ophthalmology' },
  { id: 'lacrimal-probe', name: 'Lacrimal Probe (Bowman)', category: 'Specialty', subspecialty: 'Ophthalmology' },

  // ===================== PLASTIC & RECONSTRUCTIVE =====================
  { id: 'skin-graft-knife-humby', name: 'Humby Skin Graft Knife', category: 'Cutting', subspecialty: 'Plastic & Reconstructive' },
  { id: 'dermatome', name: 'Powered Dermatome', category: 'Power', subspecialty: 'Plastic & Reconstructive' },
  { id: 'mesh-graft-expander', name: 'Mesh Graft Expander', category: 'Specialty', subspecialty: 'Plastic & Reconstructive' },
  { id: 'skin-hook', name: 'Skin Hook (single / double prong)', category: 'Retracting', subspecialty: 'Plastic & Reconstructive' },
  { id: 'gillies-needle-holder', name: 'Gillies Needle Holder', category: 'Suturing', subspecialty: 'Plastic & Reconstructive' },
  { id: 'gillies-skin-hook', name: 'Gillies Skin Hook', category: 'Retracting', subspecialty: 'Plastic & Reconstructive' },
  { id: 'micro-forceps-jewellers', name: "Jeweller's Micro Forceps", category: 'Grasping', subspecialty: 'Plastic & Reconstructive' },
  { id: 'micro-scissors-vannas', name: 'Vannas Micro Scissors', category: 'Cutting', subspecialty: 'Plastic & Reconstructive' },

  // ===================== PAEDIATRIC SURGERY =====================
  { id: 'paed-mosquito-forceps', name: 'Paediatric Mosquito Forceps', category: 'Hemostatic', subspecialty: 'Paediatric Surgery' },
  { id: 'paed-retractor', name: 'Paediatric Retractor (Senn)', category: 'Retracting', subspecialty: 'Paediatric Surgery' },
  { id: 'hegar-paed-dilators', name: 'Paediatric Hegar Dilators', category: 'Specialty', subspecialty: 'Paediatric Surgery' },
  { id: 'paed-bowel-clamp', name: 'Paediatric Bowel Clamp', category: 'Grasping', subspecialty: 'Paediatric Surgery' },

  // ===================== VASCULAR =====================
  { id: 'potts-scissors', name: 'Potts Vascular Scissors', category: 'Cutting', subspecialty: 'Vascular' },
  { id: 'fogarty-catheter', name: 'Fogarty Embolectomy Catheter', category: 'Specialty', subspecialty: 'Vascular' },
  { id: 'castro-viejo-needle-holder', name: 'Castroviejo Needle Holder (vascular)', category: 'Suturing', subspecialty: 'Vascular' },
  { id: 'vascular-bulldog', name: 'Vascular Bulldog Clamp', category: 'Hemostatic', subspecialty: 'Vascular' },
  { id: 'vessel-loop', name: 'Vessel Loop', category: 'Accessory', subspecialty: 'Vascular' },

  // ===================== MAXILLOFACIAL =====================
  { id: 'dental-elevator', name: 'Dental Elevator', category: 'Specialty', subspecialty: 'Maxillofacial' },
  { id: 'dental-forceps', name: 'Dental Extraction Forceps', category: 'Grasping', subspecialty: 'Maxillofacial' },
  { id: 'bone-file', name: 'Bone File', category: 'Specialty', subspecialty: 'Maxillofacial' },
  { id: 'mandibular-retractor', name: 'Mandibular Retractor (Obwegeser)', category: 'Retracting', subspecialty: 'Maxillofacial' },
  { id: 'arch-bar', name: 'Arch Bar', category: 'Specialty', subspecialty: 'Maxillofacial' },

  // ===================== LAPAROSCOPIC =====================
  { id: 'verres-needle', name: 'Veress Needle', category: 'Specialty', subspecialty: 'Laparoscopic' },
  { id: 'lap-trocar-5mm', name: 'Laparoscopic Trocar 5mm', category: 'Specialty', subspecialty: 'Laparoscopic' },
  { id: 'lap-trocar-10mm', name: 'Laparoscopic Trocar 10mm', category: 'Specialty', subspecialty: 'Laparoscopic' },
  { id: 'lap-trocar-12mm', name: 'Laparoscopic Trocar 12mm', category: 'Specialty', subspecialty: 'Laparoscopic' },
  { id: 'lap-camera', name: 'Laparoscopic Camera Head', category: 'Specialty', subspecialty: 'Laparoscopic' },
  { id: 'lap-telescope-0', name: 'Laparoscopic Telescope 0°', category: 'Specialty', subspecialty: 'Laparoscopic' },
  { id: 'lap-telescope-30', name: 'Laparoscopic Telescope 30°', category: 'Specialty', subspecialty: 'Laparoscopic' },
  { id: 'lap-light-cable', name: 'Light Cable (fibre-optic)', category: 'Specialty', subspecialty: 'Laparoscopic' },
  { id: 'lap-grasper-maryland', name: 'Maryland Dissector (lap)', category: 'Grasping', subspecialty: 'Laparoscopic' },
  { id: 'lap-grasper-fenestrated', name: 'Fenestrated Grasper (lap)', category: 'Grasping', subspecialty: 'Laparoscopic' },
  { id: 'lap-scissors', name: 'Laparoscopic Scissors', category: 'Cutting', subspecialty: 'Laparoscopic' },
  { id: 'lap-needle-holder', name: 'Laparoscopic Needle Holder', category: 'Suturing', subspecialty: 'Laparoscopic' },
  { id: 'lap-clip-applier', name: 'Laparoscopic Clip Applier', category: 'Specialty', subspecialty: 'Laparoscopic' },
  { id: 'lap-stapler', name: 'Laparoscopic Stapler', category: 'Specialty', subspecialty: 'Laparoscopic' },
  { id: 'lap-suction-irrigation', name: 'Laparoscopic Suction-Irrigation Probe', category: 'Suction', subspecialty: 'Laparoscopic' },
  { id: 'lap-hook-electrode', name: 'Laparoscopic Hook Electrode', category: 'Power', subspecialty: 'Laparoscopic' },
  { id: 'lap-retrieval-bag', name: 'Specimen Retrieval Bag', category: 'Accessory', subspecialty: 'Laparoscopic' },
];

export function searchInstruments(query: string, subspecialtyFilter?: string): SurgicalInstrument[] {
  const q = query.trim().toLowerCase();
  return SURGICAL_INSTRUMENTS.filter((i) => {
    if (subspecialtyFilter && subspecialtyFilter !== 'All' && i.subspecialty !== subspecialtyFilter) {
      return false;
    }
    if (!q) return true;
    if (i.name.toLowerCase().includes(q)) return true;
    if (i.category.toLowerCase().includes(q)) return true;
    if (i.subspecialty.toLowerCase().includes(q)) return true;
    if (i.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
    return false;
  });
}
