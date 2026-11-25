// ============================================================
// The NHIA Medicines Price List, April 2025
// ------------------------------------------------------------
// Transcribed from the National Health Insurance Authority's published list
// (Dr Kelechi Ohiri, Director General; dated 1 April 2025). It is the answer
// to the question this application could not previously answer: WHAT DOES THE
// SCHEME ACTUALLY COVER.
//
// Until this arrived every catalogue item was flagged not-covered, because a
// wrong `true` sends an item to a counter that will refuse it with the patient
// already on the list. This is the document that lets the flags be set from a
// source rather than from a guess.
//
// WHAT IS HERE, AND WHY NOT ALL OF IT. The published list runs to several
// hundred medicines across thirty-six sections, most of which no theatre ever
// asks for -- anti-parkinsonism drugs, dementia drugs, dialysis solutions.
// What is transcribed here is every section a theatre pack can draw on:
// anaesthetics, analgesics, anti-allergics, antidotes, anticonvulsants, the
// anti-infectives, antiseptics, blood products, inotropes, antiemetics,
// corticosteroids, oxytocics, fluids, minerals and the Authority's own
// consumables list. Adding a section later is adding rows to this file.
//
// THREE STATES, NOT TWO, and the distinction is the patient's money:
//
//   FULL      the scheme pays. Sections 1-28.
//   PARTIAL   50:50 with the enrolee, per the Authority's own note on the
//             partial-coverage pages. Sections 29-36. A few named brands are
//             50:30:20 with the manufacturer; the enrolee's share is still
//             20-50%, so from this application's point of view it is PARTIAL
//             and the note says the patient pays a share.
//   EXCLUDED  named in the list and explicitly not covered: the
//             anti-retrovirals at 6.11 are an exclusion list.
//
// PRICES ARE THE AUTHORITY'S REIMBURSEMENT PRICES IN NAIRA, not what the
// hospital pays or charges. They are carried so the NHIA desk can see what a
// line is worth to the scheme; nothing in this application bills from them.
//
// THE LIST HAS A DATE ON IT. It was last revised in 2025, the one before was
// 2024, and the Authority says it reviews periodically. NHIA_LIST_VERSION is
// shown wherever coverage is displayed so nobody has to wonder how old it is.
// ============================================================

export const NHIA_LIST_VERSION = 'April 2025';
export const NHIA_LIST_SOURCE =
  'NHIA Medicines Price List, April 2025 (National Health Insurance Authority, Abuja)';

export type NhiaCoverage = 'FULL' | 'PARTIAL' | 'EXCLUDED';

export interface NhiaItem {
  /** The Authority's own code, e.g. NHIA-01-01-02. */
  code: string;
  name: string;
  form?: string;
  strength?: string;
  presentation?: string;
  /** Naira. Absent where the list left the price blank. */
  price?: number;
  coverage: NhiaCoverage;
  /** The section heading, for grouping on screen. */
  group: string;
}

const full = (
  code: string, name: string, group: string,
  form?: string, strength?: string, presentation?: string, price?: number,
): NhiaItem => ({ code, name, group, form, strength, presentation, price, coverage: 'FULL' });

const partial = (
  code: string, name: string, group: string,
  form?: string, strength?: string, presentation?: string, price?: number,
): NhiaItem => ({ code, name, group, form, strength, presentation, price, coverage: 'PARTIAL' });

const excluded = (code: string, name: string, group: string, form?: string, strength?: string): NhiaItem =>
  ({ code, name, group, form, strength, coverage: 'EXCLUDED' });

/* eslint-disable max-len */
export const NHIA_PRICE_LIST: NhiaItem[] = [
  // ── 1. Anaesthetics ──────────────────────────────────────────────────────
  full('NHIA-01-01-01', 'Halothane', 'General anaesthetics', 'Inhalation, liquid', '10 mg/ml in 20 ml', 'per 1ml', 250),
  full('NHIA-01-01-02', 'Ketamine', 'General anaesthetics', 'Injection (HCL)', '50mg/ml in 10ml, 100mg/ml in 5ml', 'vial', 2700),
  full('NHIA-01-01-03', 'Nitrous oxide', 'General anaesthetics', 'Inhalation, medicinal gas', undefined, 'gas', 11000),
  full('NHIA-01-01-04', 'Oxygen', 'General anaesthetics', 'Inhalation, medicinal gas', 'per hour', 'gas', 4200),
  full('NHIA-01-01-05', 'Thiopental', 'General anaesthetics', 'Injection (powder) for IV as sodium salt', '100 mg/ml in 5 ml', 'vial', 6500),

  full('NHIA-01-02-01', 'Atropine', 'Premedication', 'Injection (sulphate)', '0.5mg/amp', 'amp', 155),
  full('NHIA-01-02-02', 'Atropine', 'Premedication', 'Injection (sulphate)', '1mg/1ml', 'amp', 970),
  full('NHIA-01-02-03', 'Diazepam', 'Premedication', 'Injection', '5mg/ml in 2 ml', 'amp', 800),
  full('NHIA-01-02-04', 'Hyoscine N-Butylbromide', 'Premedication', 'Injection', '20mg/ml', 'amp', 180),
  full('NHIA-01-02-05', 'Midazolam', 'Premedication', 'Injection', '15mg', 'injection', 3900),
  full('NHIA-01-02-06', 'Morphine', 'Premedication', 'Injection (sulphate or HCl)', '10 mg/ml, 15mg/ml in 1ml', 'amp', 8500),
  full('NHIA-01-02-07', 'Morphine', 'Premedication', 'Injection (sulphate or HCl)', '25mg (hydrochloride)', 'amp', 3526),
  full('NHIA-01-02-08', 'Promethazine', 'Premedication', 'Tablets', '5mg', 'tab', 10),
  full('NHIA-01-02-09', 'Promethazine', 'Premedication', 'Syrup', '25mg/ml (HCl) in 1 ml', '60mls', 670),
  full('NHIA-01-02-10', 'Promethazine', 'Premedication', 'Injection', '2ml ampoule', 'amp', 110),
  full('NHIA-01-02-11', 'Glycopyrrolate', 'Premedication', 'Injection', '0.2mg', 'injection', 1138),

  full('NHIA-01-03-01', 'Atracurium', 'Muscle relaxants', 'Injection', '50 mg/ml', 'amp', 4636),
  full('NHIA-01-03-02', 'Edrophonium', 'Muscle relaxants', 'Injection (chloride)', '10mg/ml', 'amp', 2733),
  full('NHIA-01-03-03', 'Neostigmine', 'Muscle relaxants', 'Injection (methylsulphate)', '2.5mg/ml in 1ml', 'amp', 1464),
  full('NHIA-01-03-04', 'Pancuronium', 'Muscle relaxants', 'Injection (bromide)', '4mg/2ml', 'amp', 2684),
  full('NHIA-01-03-05', 'Pancuronium', 'Muscle relaxants', 'Injection (bromide)', '1mg/ml', 'amp', 1985),
  full('NHIA-01-03-06', 'Suxamethonium', 'Muscle relaxants', 'Injection (chloride)', '100mg/2ml', 'amp', 1687),
  full('NHIA-01-03-07', 'Propofol', 'Muscle relaxants', 'Injection', '1%', 'injection', 3285),

  full('NHIA-01-04-01', 'Lidocaine', 'Local anaesthetics', 'Injection (HCL)', '1%, 2% + adrenaline 1:200000', 'vial 50mls', 1342),
  full('NHIA-01-04-02', 'Bupivacaine', 'Local anaesthetics', 'Injection (HCL)', 'plain or with epinephrine', 'amp', 5000),
  full('NHIA-01-04-03', 'Lidocaine', 'Local anaesthetics', undefined, '10%', undefined, 1281),
  full('NHIA-01-04-04', 'Lidocaine', 'Local anaesthetics', 'Topical spray', '2-4%', 'spray', 4597),
  full('NHIA-01-04-05', 'Lidocaine', 'Local anaesthetics', 'Jelly', '2-5%', 'tube', 2013),
  full('NHIA-01-04-06', 'Lidocaine', 'Local anaesthetics', 'Cream, ointment', '2% + epinephrine 1:80,000', 'tube', 2879),
  full('NHIA-01-04-07', 'Lidocaine', 'Local anaesthetics', 'Dental cartridge', '0.25%, 0.5% in 10ml', 'tube', 1174),
  full('NHIA-01-04-08', 'Prilocaine', 'Local anaesthetics', 'Injection', '3% with felypressin 0.03units/ml', 'amp', 1708),

  // ── 2. Analgesics ────────────────────────────────────────────────────────
  full('NHIA-02-01-01', 'Morphine', 'Narcotic analgesics', 'Injection', '10mg in 1ml', 'amp', 8500),
  full('NHIA-02-01-02', 'Morphine', 'Narcotic analgesics', 'Injection', '15mg in 1ml', 'amp', 8500),
  full('NHIA-02-01-03', 'Morphine', 'Narcotic analgesics', 'Tablet', '30mg', 'tab', 920),
  full('NHIA-02-01-04', 'Pentazocine', 'Narcotic analgesics', 'Injection (lactate)', '30mg/ml', 'amp', 2300),
  full('NHIA-02-01-05', 'Pethidine', 'Narcotic analgesics', 'Injection', '50mg/ml in 2 ml', 'amp', 4000),
  full('NHIA-02-01-06', 'Tramadol', 'Narcotic analgesics', 'Tablet', '50mg', 'tab', 85),
  full('NHIA-02-01-07', 'Tramadol', 'Narcotic analgesics', 'Injection', '50mg/ml', 'amp', 700),
  full('NHIA-02-01-08', 'Morphine', 'Narcotic analgesics', 'Syrup', '1mg/ml (200ml)', 'syrup', 2655),
  full('NHIA-02-01-09', 'Morphine', 'Narcotic analgesics', 'Syrup', '1mg/ml (500ml)', 'syrup', 3076),
  full('NHIA-02-01-10', 'Dihydrocodeine', 'Narcotic analgesics', 'Tablet', '30mg', 'tablet', 400),
  full('NHIA-02-01-11', 'Codeine/Paracetamol', 'Narcotic analgesics', 'Tablet', '8/500mg', 'tablet', 242),
  full('NHIA-02-01-12', 'Codeine/Paracetamol', 'Narcotic analgesics', 'Tablet', '30/500mg', 'tablet', 329),

  full('NHIA-02-02-01', 'Naloxone', 'Narcotic antagonist', 'Injection', '0.4mg/ml in 1ml', 'amp', 3900),

  full('NHIA-02-03-01', 'Acetyl salicylic acid', 'Non-narcotic analgesics', 'Tablet, capsule', '300mg', 'tab/caps', 30),
  full('NHIA-02-03-02', 'Paracetamol', 'Non-narcotic analgesics', 'Tablets', '500mg', 'tab', 27),
  full('NHIA-02-03-03', 'Paracetamol', 'Non-narcotic analgesics', 'Suppository', '100 mg', 'supp', 228),
  full('NHIA-02-03-04', 'Paracetamol', 'Non-narcotic analgesics', 'Syrup/suspension', '125mg/5ml', '60mls', 440),
  full('NHIA-02-03-05', 'Paracetamol', 'Non-narcotic analgesics', 'Drop', '125mg/5ml', '15mls', 482),
  full('NHIA-02-03-06', 'Paracetamol', 'Non-narcotic analgesics', 'Injection', '150mg/ml', 'amp', 120),
  full('NHIA-02-03-07', 'Diclofenac', 'Non-narcotic analgesics', 'Eye drops', '0.10%', '5mls', 1090),

  full('NHIA-02-04-05', 'Diclofenac', 'NSAIDs', 'Tablet', '100mg', 'tab', 60),
  full('NHIA-02-04-06', 'Diclofenac', 'NSAIDs', 'Tablet', '50mg', 'tab', 35),
  full('NHIA-02-04-07', 'Diclofenac', 'NSAIDs', 'Injection', '25mg/ml', 'amp', 125),
  full('NHIA-02-04-08', 'Diclofenac sodium', 'NSAIDs', 'Gel', '1%', 'tube', 1200),
  full('NHIA-02-04-12', 'Ibuprofen', 'NSAIDs', 'Tablets, capsules', '200mg', 'tab', 43),
  full('NHIA-02-04-13', 'Ibuprofen', 'NSAIDs', 'Tablets, capsules', '400mg', 'tab', 55),
  full('NHIA-02-04-14', 'Ibuprofen', 'NSAIDs', 'Suspension', '100mg/5ml', '100mls', 1000),
  full('NHIA-02-04-15', 'Ketoprofen', 'NSAIDs', 'Capsules', '200mg', 'caps/tabs', 200),
  full('NHIA-02-04-16', 'Ketoprofen', 'NSAIDs', 'Injection', '100mg', '2ml amp', 281),
  full('NHIA-02-04-18', 'Naproxen', 'NSAIDs', 'Tablet', '250mg', 'tab', 177),
  full('NHIA-02-04-19', 'Naproxen', 'NSAIDs', 'Tablet', '500mg', 'tab', 226),
  full('NHIA-02-04-20', 'Piroxicam', 'NSAIDs', 'Capsules', '20mg', 'caps', 25),
  full('NHIA-02-04-21', 'Piroxicam', 'NSAIDs', 'Injection', '10mg/ml', '2ml amp', 150),
  full('NHIA-02-04-22', 'Meloxicam', 'NSAIDs', 'Capsule', '15mg', 'capsule', 120),
  full('NHIA-02-04-23', 'Meloxicam', 'NSAIDs', 'Capsule', '7.5mg', 'capsule', 100),
  full('NHIA-02-04-24', 'Diclofenac', 'NSAIDs', 'Suppository', '100mg', 'suppository', 940),
  full('NHIA-02-04-25', 'Diclofenac', 'NSAIDs', 'Suppository', '12.5mg', 'suppository', 623),
  full('NHIA-02-04-26', 'Diclofenac', 'NSAIDs', 'Suppository', '50mg', 'suppository', 871),
  full('NHIA-02-04-27', 'Tenoxicam', 'NSAIDs', 'Capsule', '20mg', 'capsule', 100),
  full('NHIA-02-04-28', 'Aceclofenac', 'NSAIDs', 'Tablet', '100mg', 'tablet', 110),

  // ── 3. Anti-allergics ────────────────────────────────────────────────────
  full('NHIA-03-01-01', 'Cetrizine', 'Antihistamines', 'Tablet', '10mg', 'tab', 116),
  full('NHIA-03-01-03', 'Chlorpheniramine', 'Antihistamines', 'Tablet', '4mg (maleate)', 'tab', 37),
  full('NHIA-03-01-04', 'Chlorpheniramine', 'Antihistamines', 'Syrup', '2mg/5ml', '60mls', 683),
  full('NHIA-03-01-05', 'Chlorpheniramine', 'Antihistamines', 'Injection', '10mg (maleate) in 1ml', 'amp', 85),
  full('NHIA-03-01-10', 'Promethazine', 'Antihistamines', 'Tablets', '25mg (hydrochloride)', 'tab', 10),
  full('NHIA-03-01-12', 'Promethazine', 'Antihistamines', 'Injection', '25mg/ml (HCl) in 1 ml and 2ml', 'amp', 85),

  full('NHIA-03-02-01', 'Dexamethasone', 'Antianaphylactics', 'Injection (sodium phosphate)', '4mg/1ml', 'amp', 200),
  full('NHIA-03-02-02', 'Epinephrine (Adrenaline)', 'Antianaphylactics', 'Injection', '1mg/ml (1 in 1000)', 'amp', 650),
  full('NHIA-03-02-03', 'Epinephrine (Adrenaline)', 'Antianaphylactics', 'Injection', 'HCl in 1ml', 'amp', 793),
  full('NHIA-03-02-04', 'Hydrocortisone', 'Antianaphylactics', 'Injection (sodium succinate)', 'in vial', 'vial', 800),

  // ── 4. Antidotes ─────────────────────────────────────────────────────────
  full('NHIA-04-01-01', 'Atropine', 'Antidotes', 'Injection', '1.0mg (sulphate) in 1ml', 'amp', 440),
  full('NHIA-04-01-07', 'Naloxone', 'Antidotes', 'Injection (HCL)', '400mcg/ml', 'amp', 3900),
  full('NHIA-04-01-08', 'Phytomenadione (Vitamin K1)', 'Antidotes', 'Ampoule', '10mg/ml in 1ml', 'amp', 1093),
  full('NHIA-04-01-10', 'Protamine sulphate', 'Antidotes', 'Injection', '10mg/ml in 5 ml', 'amp', 4819),
  full('NHIA-04-01-13', 'Sodium thiosulphate', 'Antidotes', 'Injection', '500mg/ml', 'amp', 1525),
  full('NHIA-04-01-14', 'Acetylcysteine', 'Antidotes', 'Injection', '200mg/vial', 'injection', 10004),

  // ── 5. Anticonvulsants ───────────────────────────────────────────────────
  full('NHIA-05-01-04', 'Diazepam', 'Anticonvulsants', 'Injection', '5mg/ml in 2ml', 'amp', 800),
  full('NHIA-05-01-07', 'Magnesium sulphate', 'Anticonvulsants', 'Injection', '50% (500 mg/ml) in 2 ml', 'amp', 2989),
  full('NHIA-05-01-08', 'Paraldehyde', 'Anticonvulsants', 'Injection', '10ml, 5 mls', 'amp', 1928),
  full('NHIA-05-01-12', 'Phenobarbital', 'Anticonvulsants', 'Injection', '200mg/ml', 'amp', 6094),
  full('NHIA-05-01-13', 'Phenytoin sodium', 'Anticonvulsants', 'Capsule', '100mg, 50 mg, 25mg', 'caps', 92),

  // ── 6.1 Amoebicides ──────────────────────────────────────────────────────
  full('NHIA-06-01-01', 'Metronidazole', 'Amoebicides', 'Tablets', '200mg', 'tab', 12),
  full('NHIA-06-01-02', 'Metronidazole', 'Amoebicides', 'Tablet', '400mg', 'tab', 23),
  full('NHIA-06-01-03', 'Metronidazole', 'Amoebicides', 'Suspension', '200mg/5ml', '60mls', 632),
  full('NHIA-06-01-04', 'Metronidazole', 'Amoebicides', 'IV injection', '500mg in 100ml bottle', '100mls', 732),
  full('NHIA-06-01-05', 'Metronidazole', 'Amoebicides', 'Suppository', '500mg', 'supp/ovule', 453),

  // ── 6.7 Antibacterials ───────────────────────────────────────────────────
  full('NHIA-06-07-01', 'Amikacin', 'Antibacterials', 'Injection', '500mg/vial', 'injection', 1537),
  full('NHIA-06-07-02', 'Amoxycillin', 'Antibacterials', 'Capsule', '250mg', 'caps', 101),
  full('NHIA-06-07-03', 'Amoxycillin', 'Antibacterials', 'Capsule', '500 mg', 'caps', 120),
  full('NHIA-06-07-05', 'Amoxycillin', 'Antibacterials', 'Injection', '500mg in vials', 'vial', 1098),
  full('NHIA-06-07-06', 'Amoxycillin plus Clavulanic Acid (Co-amoxiclav)', 'Antibacterials', 'Tablet, capsules', '250mg + 125mg', 'tab', 153),
  full('NHIA-06-07-07', 'Amoxycillin plus Clavulanic Acid (Co-amoxiclav)', 'Antibacterials', 'Tablet, capsules', '500mg + 125mg', 'tab', 295),
  full('NHIA-06-07-08', 'Amoxicillin + Clavulanic Acid', 'Antibacterials', 'Tablet', '1g', 'tablet', 349),
  full('NHIA-06-07-11', 'Amoxycillin plus Clavulanic Acid (Co-amoxiclav)', 'Antibacterials', 'Injection', '500mg + 100mg in vial', 'vial', 3013),
  full('NHIA-06-07-12', 'Amoxycillin plus Clavulanic Acid (Co-amoxiclav)', 'Antibacterials', 'Injection', '1g + 200mg in vial', 'vial', 3587),
  full('NHIA-06-07-13', 'Ampicillin + Cloxacillin', 'Antibacterials', 'Capsule', '250mg of each (500mg)', 'caps', 189),
  full('NHIA-06-07-17', 'Ampicillin + Cloxacillin', 'Antibacterials', 'Injection', '250mg + 250mg per vial', 'amp', 488),
  full('NHIA-06-07-18', 'Ampicillin + Sulbactam', 'Antibacterials', 'Injection', '1.5g/vial', 'injection', 2051),
  full('NHIA-06-07-19', 'Ampicillin/Sulbactam', 'Antibacterials', 'Injection', '3g/vial', 'injection', 2199),
  full('NHIA-06-07-20', 'Ampicillin', 'Antibacterials', 'Injection', '500mg/vial', 'vial', 683),
  full('NHIA-06-07-21', 'Azithromycin', 'Antibacterials', 'Capsules', '250mg', 'caps', 317),
  full('NHIA-06-07-22', 'Azithromycin', 'Antibacterials', 'Capsules', '500mg', 'caps', 470),
  full('NHIA-06-07-24', 'Benzathine-Benzylpenicillin', 'Antibacterials', 'Injection', '2.4 M.U.', 'vial', 1403),
  full('NHIA-06-07-25', 'Benzylpenicillin', 'Antibacterials', 'Injection, powder', '1.0 MU', 'vial', 600),
  full('NHIA-06-07-26', 'Benzylpenicillin', 'Antibacterials', 'Injection, powder', '5 MU', 'vial', 308),
  full('NHIA-06-07-27', 'Cefixime', 'Antibacterials', 'Tablet', '400mg', 'tab', 390),
  full('NHIA-06-07-28', 'Cefixime', 'Antibacterials', 'Tablet', '200mg', 'tab', 537),
  full('NHIA-06-07-31', 'Cefotaxime', 'Antibacterials', 'Injection', '500mg', 'vial', 2635),
  full('NHIA-06-07-35', 'Ceftazidime', 'Antibacterials', 'Injection', '1gm', 'vial', 3318),
  full('NHIA-06-07-36', 'Ceftriaxone', 'Antibacterials', 'Injection', '250mg', 'vial', 1036),
  full('NHIA-06-07-37', 'Ceftriaxone', 'Antibacterials', 'Injection', '500mg I.M.', 'vial', 1059),
  full('NHIA-06-07-38', 'Ceftriaxone', 'Antibacterials', 'Injection', '1g IV', 'vial', 2123),
  full('NHIA-06-07-39', 'Ceftriaxone/Sulbactam', 'Antibacterials', 'Injection', undefined, 'vial', 4648),
  full('NHIA-06-07-40', 'Cefuroxime', 'Antibacterials', 'Tablets', '250mg', 'tab', 348),
  full('NHIA-06-07-41', 'Cefuroxime', 'Antibacterials', 'Tablets', '500 mg', 'tab', 543),
  full('NHIA-06-07-43', 'Cefuroxime', 'Antibacterials', 'Injection (sodium salt)', '750mg', 'vial', 1122),
  full('NHIA-06-07-44', 'Cefuroxime', 'Antibacterials', 'Injection (sodium salt)', '250 mg', 'vial', 521),
  full('NHIA-06-07-45', 'Cephalexin', 'Antibacterials', 'Capsules/tablet', '500mg', 'caps/tab', 137),
  full('NHIA-06-07-50', 'Chloramphenicol', 'Antibacterials', 'Injection', '1g (sodium succinate) in vial', 'vial', 602),
  full('NHIA-06-07-51', 'Ciprofloxacin', 'Antibacterials', 'Tablet', '250mg (HCl)', 'tab', 116),
  full('NHIA-06-07-52', 'Ciprofloxacin', 'Antibacterials', 'Tablet', '500 mg (HCl)', 'tab', 171),
  full('NHIA-06-07-53', 'Ciprofloxacin', 'Antibacterials', 'Infusion', 'I.V. 2mg/ml in 50 and 100ml vials', 'infusion', 866),
  full('NHIA-06-07-57', 'Clindamycin', 'Antibacterials', 'Capsule', 'HCL 150mg', 'cap', 317),
  full('NHIA-06-07-58', 'Clindamycin', 'Antibacterials', 'Injection', 'phosphate 150mg/ml', 'amp', 2300),
  full('NHIA-06-07-59', 'Clindamycin', 'Antibacterials', 'Tablet', '300mg', 'tablet', 439),
  full('NHIA-06-07-60', 'Cloxacillin', 'Antibacterials', 'Injection, powder', '250mg', 'vial', 182),
  full('NHIA-06-07-61', 'Cloxacillin', 'Antibacterials', 'Injection, powder', '500 mg in vial', 'vial', 192),
  full('NHIA-06-07-62', 'Cloxacillin', 'Antibacterials', 'Capsule', '250mg', 'caps', 63),
  full('NHIA-06-07-64', 'Co-trimoxazole', 'Antibacterials', 'Tablet', '400mg + 80mg', 'tab', 37),
  full('NHIA-06-07-65', 'Co-trimoxazole', 'Antibacterials', 'Tablet', '800mg + 160mg', 'tab (DS)', 55),
  full('NHIA-06-07-67', 'Doxycycline', 'Antibacterials', 'Capsule', '100mg', 'caps', 195),
  full('NHIA-06-07-68', 'Erythromycin', 'Antibacterials', 'Tablets, capsules', '250mg', 'tab', 116),
  full('NHIA-06-07-69', 'Erythromycin', 'Antibacterials', 'Tablets, capsules', '500mg', 'tab', 201),
  full('NHIA-06-07-72', 'Gentamycin', 'Antibacterials', 'Injection', '80mg/ml, 40mg/2ml (sulphate)', 'amp', 146),
  full('NHIA-06-07-73', 'Imipenem + Cilastin', 'Antibacterials', 'Injection', '500mg', 'injection', 10919),
  full('NHIA-06-07-75', 'Levofloxacin', 'Antibacterials', 'Tablet', '250mg', 'tab', 136),
  full('NHIA-06-07-76', 'Levofloxacin', 'Antibacterials', 'Tablet', '500mg', 'tab', 207),
  full('NHIA-06-07-78', 'Levofloxacin', 'Antibacterials', 'Injection', '500mg/100mls infusion', '100mls', 1793),
  full('NHIA-06-07-79', 'Lincomycin', 'Antibacterials', 'Capsules', '500 mg', 'caps', 598),
  full('NHIA-06-07-81', 'Lincomycin', 'Antibacterials', 'Injection (phosphate)', '150 mg/ml in 2 ml', 'amp', 409),
  full('NHIA-06-07-82', 'Metronidazole', 'Antibacterials', 'Tablets', '200mg', 'tab', 79),
  full('NHIA-06-07-83', 'Metronidazole', 'Antibacterials', 'Tablet', '400mg', 'tab', 95),
  full('NHIA-06-07-85', 'Metronidazole', 'Antibacterials', 'IV injection', '500mg in 100ml bottle', '100mls', 756),
  full('NHIA-06-07-86', 'Metronidazole', 'Antibacterials', 'Suppository', '500mg', 'supp/ovule', 317),
  full('NHIA-06-07-87', 'Moxifloxacin', 'Antibacterials', 'Tablet', '400mg', 'tablet', 551),
  full('NHIA-06-07-88', 'Moxifloxacin', 'Antibacterials', 'Injection', '400mg/250ml', 'injection', 3217),
  full('NHIA-06-07-92', 'Ofloxacin', 'Antibacterials', 'Tablet', '200mg', 'tab', 141),
  full('NHIA-06-07-93', 'Ofloxacin', 'Antibacterials', 'Tablet', '400mg', 'tab', 212),
  full('NHIA-06-07-94', 'Ofloxacin', 'Antibacterials', 'Infusion', '200mg/100ml', '100mls', 838),
  full('NHIA-06-07-98', 'Piperacillin + Tazobactam', 'Antibacterials', 'Vial', '2.25g', 'vial', 6545),
  full('NHIA-06-07-103', 'Tetracycline', 'Antibacterials', 'Capsule', '250mg (hydrochloride)', 'caps', 104),
  full('NHIA-06-07-105', 'Vancomycin', 'Antibacterials', 'Injection', undefined, 'injection', 7881),

  // ── 6.9 Antifungals ──────────────────────────────────────────────────────
  full('NHIA-06-09-01', 'Amphotericin B', 'Antifungals', 'Injection, powder', '50 mg/vial', 'vial', 8229),
  full('NHIA-06-09-04', 'Fluconazole', 'Antifungals', 'Capsule', '200mg', 'caps', 459),
  full('NHIA-06-09-06', 'Fluconazole', 'Antifungals', 'Injection', 'I.V. 2 mg/ml in 0.9% sodium chloride', 'vial', 798),

  // ── 6.11 Anti-retrovirals: AN EXCLUSION LIST in the published document ───
  excluded('NHIA-06-11-02', 'Indinavir (IDV)', 'Anti-retrovirals (excluded)', 'Capsule (sulphate)'),
  excluded('NHIA-06-11-07', 'Lopinavir + ritonavir (LPV/r)', 'Anti-retrovirals (excluded)', 'Capsule'),
  excluded('NHIA-06-11-12', 'Lamivudine (3TC)', 'Anti-retrovirals (excluded)', 'Tablet', '150 mg'),
  excluded('NHIA-06-11-14', 'Zidovudine (ZDV)', 'Anti-retrovirals (excluded)', 'Capsules', '100 mg'),
  excluded('NHIA-06-11-17', 'Abacavir (ABC)', 'Anti-retrovirals (excluded)', 'Tablet (sulfate)', '300mg'),
  excluded('NHIA-06-11-30', 'Nevirapine (NVP)', 'Anti-retrovirals (excluded)', 'Tablet', '200 mg'),
  excluded('NHIA-06-11-32', 'Efavirenz (EFV)', 'Anti-retrovirals (excluded)', 'Tablet', '600mg'),

  // ── 10. Antiseptics and disinfectants ────────────────────────────────────
  full('NHIA-10-01-01', 'Chlorhexidine', 'Antiseptics', 'Solution', '5% (gluconate) for dilution', '500mls', 11956),
  full('NHIA-10-01-02', 'Chlorhexidine', 'Antiseptics', 'Gel', '7.10%', '25g', 671),
  full('NHIA-10-01-03', 'Chlorhexidine + Cetrimide', 'Antiseptics', 'Solution', 'cetrimide 15% + 1.5% chlorhexidine gluconate', '500mls', 11956),
  full('NHIA-10-01-04', 'Chloroxylenol', 'Antiseptics', 'Solution', '5% for dilution', '250mls', 4270),
  full('NHIA-10-01-05', 'Chloroxylenol', 'Antiseptics', 'Solution', '5% for dilution', '125mls', 2166),
  full('NHIA-10-01-07', 'Compound Tincture of Benzoin', 'Antiseptics', 'Liquid', '2%', '100mls', 721),
  full('NHIA-10-01-09', 'Iodine', 'Antiseptics', 'Solution', '1%', '30mls', 466),
  full('NHIA-10-01-10', 'Methylated spirit', 'Antiseptics', 'Solution', 'alcohol vol/vol', '200mls', 1684),
  full('NHIA-10-01-11', 'Potassium permanganate', 'Antiseptics', 'Solution', '0.10%', '15mls', 246),
  full('NHIA-10-01-12', 'Povidone-iodine', 'Antiseptics', 'Solution', '10%', 'solution', 834),
  full('NHIA-10-01-13', 'Povidone-iodine', 'Antiseptics', 'Ointment', undefined, 'tube', 390),
  full('NHIA-10-01-14', 'Sodium hypochlorite', 'Antiseptics', 'Solution', '1-10%', '500mls', 600),
  full('NHIA-10-01-16', 'Hydrogen peroxide', 'Antiseptics', 'Bottle', '6% w/v', 'bottle', 622),

  // ── 11. Drugs affecting the blood ────────────────────────────────────────
  full('NHIA-11-01-02', 'Cyanocobalamin/Hydroxocobalamin', 'Anti-anaemics', 'Injection', '0.25 and 1mg/ml', 'amp', 252),
  full('NHIA-11-01-04', 'Ferrous sulphate', 'Anti-anaemics', 'Tablets, capsule', '200 mg (60mg iron)', 'tab', 8),
  full('NHIA-11-01-05', 'Folic acid', 'Anti-anaemics', 'Tablet', '5mg', 'tab', 8),
  full('NHIA-11-01-06', 'Iron dextran', 'Anti-anaemics', 'Injection', '50mg iron/ml in 2ml', 'amp', 275),
  full('NHIA-11-01-07', 'Iron sucrose', 'Anti-anaemics', 'Injection', '20mg iron/ml in 5ml', 'amp', 3538),

  full('NHIA-11-02-01', 'Enoxaparin', 'Anticoagulants', 'Injection', '100 mg/ml in 0.4ml (40mg)', 'prefilled syringe', 7015),
  full('NHIA-11-02-02', 'Enoxaparin', 'Anticoagulants', 'Injection', '100 mg/ml in 0.2ml (20mg)', 'prefilled syringe', 4249),
  full('NHIA-11-02-03', 'Heparin sodium', 'Anticoagulants', 'Injection', '5000 units/ml', 'amp', 4675),
  full('NHIA-11-02-04', 'Heparin sodium', 'Anticoagulants', 'Injection', '25,000 units/ml', 'amp', 9638),

  full('NHIA-11-04-01', 'Aminocaproic acid', 'Haemostatics', 'Tablet', '500 mg', 'tab', 56),
  full('NHIA-11-04-03', 'Tranexamic acid', 'Haemostatics', 'Injection', '500mg', 'injection', 1403),

  full('NHIA-11-05-01', 'Dextran 70', 'Plasma substitutes', 'Injection I.V.', '6% in 5% glucose or normal saline', '500ml', 1985),
  full('NHIA-11-05-02', 'Human albumin', 'Plasma substitutes', 'Injection', '20% in 100ml vials', 'vial', 218258),
  full('NHIA-11-05-03', 'Polygeline', 'Plasma substitutes', 'Injection IV', '3.5% solution in 500 mls', '500ml', 27755),

  // ── 12.5 Inotropes ───────────────────────────────────────────────────────
  full('NHIA-12-05-04', 'Digoxin', 'Cardiotonics', 'Injection', '0.25mg/ml in 2ml, 0.1mg/ml in 1ml', 'amp', 2074),
  full('NHIA-12-05-06', 'Dopamine', 'Cardiotonics', 'Injection', '40mg/ml in 5mls', 'vial', 2111),
  full('NHIA-12-05-07', 'Dobutamine', 'Cardiotonics', 'Injection', '250mg/20ml', 'injection', 6527),

  // ── 16.2 Anti-emetics ────────────────────────────────────────────────────
  full('NHIA-16-02-01', 'Metoclopramide', 'Anti-emetics', 'Tablet', '10mg (HCl)', 'tab', 33),
  full('NHIA-16-02-03', 'Metoclopramide', 'Anti-emetics', 'Injection', '5mg/ml (HCl)', 'amp', 64),
  full('NHIA-16-02-07', 'Prochlorperazine', 'Anti-emetics', 'Injection (mesilate)', '12.5 mg/ml in 1 ml and 2 ml', 'amp', 59),
  full('NHIA-16-02-10', 'Promethazine', 'Anti-emetics', 'Injection', '25mg/ml (HCl) in 2ml', 'amp', 110),

  // ── 16.7 Peptic ulcer drugs ──────────────────────────────────────────────
  full('NHIA-16-00-03', 'Cimetidine', 'Peptic ulcer drugs', 'Injection', '100mg/ml in 2 ml', 'amp', 343),
  full('NHIA-16-00-06', 'Omeprazole', 'Peptic ulcer drugs', 'Tablet', '10mg, 20mg', 'tab', 65),
  full('NHIA-16-00-07', 'Omeprazole', 'Peptic ulcer drugs', 'Injection', undefined, 'vial', 1094),
  full('NHIA-16-00-11', 'Ranitidine', 'Peptic ulcer drugs', 'Injection', '25mg/ml in 2 ml', 'amp', 427),
  full('NHIA-16-00-13', 'Esomeprazole', 'Peptic ulcer drugs', 'Injection', undefined, 'vial', 1035),

  // ── 17.1 Corticosteroids ─────────────────────────────────────────────────
  full('NHIA-17-01-02', 'Dexamethasone', 'Corticosteroids', 'Injection', '2mg/ml, 4mg/ml in 2ml', 'amp', 117),
  full('NHIA-17-01-04', 'Hydrocortisone', 'Corticosteroids', 'Injection, powder', '100mg/vial', 'vial', 650),
  full('NHIA-17-01-05', 'Methyl prednisolone', 'Corticosteroids', 'Injection', '40mg/ml in 2ml', 'amp', 3416),
  full('NHIA-17-01-07', 'Triamcinolone', 'Corticosteroids', 'Injection', '10mg/40mg/ml', 'amp', 1005),

  // ── 20. Oxytocics and tocolytics ─────────────────────────────────────────
  full('NHIA-20-01-01', 'Ergometrine', 'Oxytocics', 'Tablet', '0.5mg (maleate)', 'tab', 22),
  full('NHIA-20-01-02', 'Ergometrine', 'Oxytocics', 'Injection', '0.5mg/ml (maleate)', 'amp', 487),
  full('NHIA-20-01-03', 'Oxytocin', 'Oxytocics', 'Injection', '10 units/ml, 5 units/ml', 'amp', 1537),
  full('NHIA-20-01-04', 'Dinoprostone', 'Oxytocics', 'Pessary', '3mg', 'pessary', 122),
  full('NHIA-20-01-05', 'Misoprostol', 'Oxytocics', 'Tablet', '200mcg', 'tablet', 580),
  full('NHIA-20-01-06', 'Carbetocin', 'Oxytocics', 'Injection', undefined, 'injection', 6344),

  // ── 21. Fluids and electrolytes ──────────────────────────────────────────
  full('NHIA-21-02-01', "Darrow's solution", 'Infusions', 'Infusion, BP', 'half and full strength', '500ml', 720),
  full('NHIA-21-02-02', 'Dextrose + Sodium Chloride', 'Infusions', 'Infusion', '5% + 0.9%', '500ml', 720),
  full('NHIA-21-02-03', 'Glucose (Dextrose)', 'Infusions', 'Injection', '5% and 10%', '500ml', 720),
  full('NHIA-21-02-04', 'Glucose (Dextrose)', 'Infusions', 'Injection', '50% in water', '500ml', 720),
  full('NHIA-21-02-05', 'Glucose + Sodium Chloride (paediatric)', 'Infusions', 'Injection', '4.3% + 0.18%', '500ml', 720),
  full('NHIA-21-02-07', 'Mannitol', 'Infusions', 'Infusion', '10%', 'bottle', 1086),
  full('NHIA-21-02-08', 'Mannitol', 'Infusions', 'Infusion', '20%', 'bottle', 1757),
  full('NHIA-21-02-09', 'Potassium chloride', 'Infusions', 'Injection, strong', '15% in 10ml', '10mls', 1806),
  full('NHIA-21-02-10', "Ringer's lactate", 'Infusions', 'Solution', undefined, '100mls', 1007),
  full('NHIA-21-02-11', 'Sodium lactate compound solution', 'Infusions', 'Injection', 'solution, BP', '500ml', 720),
  full('NHIA-21-02-12', 'Sodium bicarbonate', 'Infusions', 'Injection', '1.4% in 10ml (isotonic)', '10mls', 1482),
  full('NHIA-21-02-13', 'Sodium chloride', 'Infusions', 'Infusion', '0.9%, 0.45%', '500ml', 720),
  full('NHIA-21-02-14', 'Water for injection', 'Infusions', 'Injection', '10ml per amp/vial', 'vial', 190),

  // ── 26. Minerals ─────────────────────────────────────────────────────────
  full('NHIA-26-01-05', 'Calcium gluconate', 'Minerals', 'Injection', '10%', 'injection', 561),

  // ── 27. Cytotoxics and adjuvants (the anti-emetics a theatre uses) ───────
  full('NHIA-27-01-07', 'Granisetron', 'Anti-emetics', 'Injection', '3mg', 'vial', 4209),
  full('NHIA-27-01-08', 'Granisetron', 'Anti-emetics', 'Tablet', '2mg', 'tab', 1098),
  full('NHIA-27-01-12', 'Ondansetron', 'Anti-emetics', 'Injection', '8mg', 'vial', 140),
  full('NHIA-27-01-13', 'Ondansetron', 'Anti-emetics', 'Tablet', '4mg', 'tab', 102),

  // ── 28.2 The Authority's own consumables list ────────────────────────────
  full('NHIA-28-02-01', 'Blood giving set', 'Consumables', 'Unit', undefined, 'unit', 519),
  full('NHIA-28-02-02', 'Chromic catgut', 'Consumables', 'Size', 'all sizes', 'unit', 793),
  full('NHIA-28-02-03', 'Cotton wool', 'Consumables', 'Roll', 'all sizes', 'unit', 400),
  full('NHIA-28-02-04', 'Crepe bandage', 'Consumables', 'Roll', 'all sizes', 'unit', 1415),
  full('NHIA-28-02-05', "Foley's catheter", 'Consumables', 'Size', 'all sizes', 'unit', 173),
  full('NHIA-28-02-06', 'Infusion set', 'Consumables', 'Unit', undefined, 'unit', 159),
  full('NHIA-28-02-07', 'IV cannula', 'Consumables', 'Size', '14G, 16G, 18G, 20G-23G, 25G', 'unit', 317),
  full('NHIA-28-02-08', 'Mucus extractor', 'Consumables', 'Size', 'all sizes', 'unit', 1976),
  full('NHIA-28-02-09', 'Needle', 'Consumables', 'Unit', undefined, 'unit', 20),
  full('NHIA-28-02-10', 'NG tube', 'Consumables', 'Size', 'all sizes', 'unit', 549),
  full('NHIA-28-02-11', 'Nylon', 'Consumables', 'Size', 'all sizes', 'unit', 708),
  full('NHIA-28-02-12', 'Plaster', 'Consumables', 'Roll', 'all sizes', 'unit', 872),
  full('NHIA-28-02-13', 'Scalp vein needle', 'Consumables', 'Size', '20G, 21G, 22G, 23G, 25G', 'unit', 85),
  full('NHIA-28-02-14', 'Soluset', 'Consumables', 'Size', 'all sizes', 'unit', 2379),
  full('NHIA-28-02-15', 'Surgical blade', 'Consumables', 'Size', 'all sizes', 'unit', 128),
  full('NHIA-28-02-16', 'Surgical gloves', 'Consumables', 'Size', 'all sizes', 'unit', 482),
  full('NHIA-28-02-17', 'Syringe/needle', 'Consumables', 'Unit', '2ml', 'unit', 55),
  full('NHIA-28-02-18', 'Syringe/needle', 'Consumables', 'Unit', '5ml', 'unit', 67),
  full('NHIA-28-02-19', 'Syringe/needle', 'Consumables', 'Unit', '10ml', 'unit', 100),
  full('NHIA-28-02-20', 'Syringe/needle', 'Consumables', 'Unit', '20ml', 'unit', 207),
  full('NHIA-28-02-21', 'Syringe/needle', 'Consumables', 'Unit', '50ml', 'unit', 400),
  full('NHIA-28-02-22', 'Urine bag', 'Consumables', 'Size', 'all sizes', 'unit', 573),
  full('NHIA-28-02-23', 'Insulin needles', 'Consumables', 'Needle', undefined, 'needle', 143),
  full('NHIA-28-02-24', 'Latex/examination gloves', 'Consumables', undefined, undefined, 'unit', 192),
  full('NHIA-28-02-25', 'Water for injection', 'Consumables', undefined, undefined, 'unit', 85),

  // ── 29-36: PARTIAL COVERAGE. The Authority's note: 50:50 enrolee:NHIA ────
  partial('NHIA-29-00-01', 'Meropenem', 'Antibacterials (partial)', 'Injection', '1g', 'injection', 13176),
  partial('NHIA-29-00-02', 'Meropenem', 'Antibacterials (partial)', 'Injection', '500mg', 'injection', 7564),
  partial('NHIA-33-01-01', 'Gelofusine', 'Infusions (partial)', 'Infusion', '500ml', 'infusion', 10000),
  partial('NHIA-33-01-02', 'Lipid emulsion', 'Infusions (partial)', 'Infusion', '10%, 20%', 'infusion', 19217),
  partial('NHIA-33-01-03', 'Total parenteral nutrition (TPN)', 'Infusions (partial)', 'Infusion', undefined, 'infusion', 91415),
];
/* eslint-enable max-len */

/** Every code in the transcription, for the integrity test. */
export const NHIA_CODES = NHIA_PRICE_LIST.map((i) => i.code);

export const nhiaItemByCode = (code: string): NhiaItem | undefined =>
  NHIA_PRICE_LIST.find((i) => i.code === code);
