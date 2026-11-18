// ============================================================
// What every patient is told, whatever the operation
// ------------------------------------------------------------
// The parts of surgical counselling that do not change with the procedure:
// what consent means and that it can be withdrawn, how anaesthesia works and
// what it risks, when to stop eating and drinking, what the days after an
// operation normally feel like, and the signs that mean "come back now".
//
// WRITTEN ONCE, VERSIONED, AND REVIEWED AS CODE. These paragraphs are a
// clinical document. Holding them in the repository rather than in a database
// means every word has a commit, an author and a diff: it is the same reason
// ANAESTHESIA_CONSENT_TEXT lives in src/lib/anaesthesiaConsent.ts, and the
// version string below travels onto every leaflet so that a sheet produced
// last month can be identified exactly.
//
// WHAT THIS IS NOT. It is not consent, and it does not replace the
// conversation. Consent is given to a named surgeon who has examined this
// patient and answered their questions; this is the written half, given in
// advance so that the conversation starts from something read rather than
// from nothing. Every leaflet says so, in those words, and the sections below
// defer to the treating team wherever an individual fact could differ --
// which is why the fasting section ends by pointing at the ward and not at
// itself.
//
// THE REGISTER IS DELIBERATE. Plain words, short sentences, no euphemism.
// "Death" is written where death is meant, because a risk a patient cannot
// recognise has not been disclosed. Equally, nothing is dramatised: the
// figures given are the ordinary ones for elective surgery in a teaching
// hospital, and anything specific to this patient is left to the surgeon who
// knows their heart, their haemoglobin and their history.
// ============================================================

/**
 * The edition of the standard text.
 *
 * Printed on every leaflet. Changing any wording in this file means changing
 * this, so that a sheet in a patient's folder can be matched to the exact
 * words they were given.
 */
export const COUNSELLING_VERSION = 'UNTH-PC-2026.1';

export interface CounsellingSection {
  /** Stable key, used for ordering and for tests. Never displayed. */
  id: string;
  /** The heading, as the patient reads it. */
  heading: string;
  /** Paragraphs. Rendered as prose in the PDF and on the page. */
  body: string[];
  /** Points rendered as a list under the paragraphs. */
  points?: string[];
  /**
   * Draw attention to it: a bordered box in the PDF, a tinted panel on the
   * page. Used for the two sections that cause harm when skimmed.
   */
  emphasis?: boolean;
}

// ─────────────────────────────────────────────────────────── consent ────

export const CONSENT_SECTION: CounsellingSection = {
  id: 'consent',
  heading: 'Your consent, and your right to change your mind',
  body: [
    'Nothing will be done to you without your permission. Before your operation you will be '
    + 'asked to sign a consent form. Signing it means that the operation has been explained to '
    + 'you, that you have had the chance to ask questions, and that you agree to go ahead.',
    'You may withdraw your consent at any time before the operation begins, and you do not have '
    + 'to give a reason. Your care will continue either way, and nobody will treat you '
    + 'differently for asking questions or for saying no.',
    'If you do not understand something, say so. If the explanation was not in a language you '
    + 'are comfortable with, ask for someone who speaks it. An operation you did not understand '
    + 'is not an operation you agreed to.',
  ],
  points: [
    'You may ask for a second opinion.',
    'You may ask who will be performing the operation, and whether anyone will be assisting '
    + 'or training.',
    'You may ask what happens if you decide not to have the operation at all.',
    'A relative or friend may sit with you while the operation is explained.',
  ],
};

// ───────────────────────────────────────────────────────── anaesthesia ────

export const ANAESTHESIA_SECTION: CounsellingSection = {
  id: 'anaesthesia',
  heading: 'Anaesthesia — being kept free of pain',
  body: [
    'An anaesthetist, who is a doctor, will see you before your operation. They will ask about '
    + 'your health, your medicines, your allergies and any previous anaesthetics, and they will '
    + 'agree a plan with you. Tell them everything, including herbal preparations and anything '
    + 'bought without a prescription — some of these affect bleeding and the heart.',
    'The anaesthetic may be general (you are asleep), regional or spinal (you are awake but the '
    + 'part being operated on is numb), sedation, or local (only the small area is numbed). '
    + 'Which is used depends on the operation and on you.',
    'Anaesthesia today is very safe, but it is not without risk, and the risk is higher if you '
    + 'have heart or lung disease, diabetes, sickle cell disease, obesity, or if the operation '
    + 'is an emergency.',
  ],
  points: [
    'Common and usually brief: nausea or vomiting, sore throat, shivering, headache, '
    + 'drowsiness, bruising where the drip was placed.',
    'Less common: a drug or allergic reaction, damage to teeth or lips during airway '
    + 'placement, nerve irritation causing numbness or weakness that usually recovers.',
    'Rare but serious: difficulty with breathing or the airway, stomach contents entering '
    + 'the lungs, awareness during a general anaesthetic, a heart or blood-pressure event, '
    + 'and, very rarely, permanent injury or death.',
  ],
};

// ──────────────────────────────────────────────────────────── fasting ────

export const FASTING_SECTION: CounsellingSection = {
  id: 'fasting',
  heading: 'Eating and drinking before your operation',
  emphasis: true,
  body: [
    'Your stomach must be empty when you are anaesthetised. If it is not, stomach contents can '
    + 'pass into your lungs while you are asleep, which is dangerous and can be fatal. This is '
    + 'the single most important instruction in this sheet.',
    'Unless your team tells you otherwise, the usual times before the operation are:',
  ],
  points: [
    'No solid food, milk, or drinks containing milk for 6 hours.',
    'Infant formula: stop 6 hours before. Breast milk: stop 4 hours before.',
    'Clear fluids only — water, clear juice without pulp, black tea or coffee with no milk — '
    + 'until 2 hours before. Then nothing at all.',
    'No chewing gum, no sweets and no kola nut once the 6 hours have begun.',
  ],
  // The deferral is not a disclaimer. This module does not know that a
  // particular patient is diabetic, a child, on a drip, or first on a list
  // that has moved — and the ward does.
  // See the same rule in src/lib/patients/notices.ts.
};

export const FASTING_DEFERRAL =
  'If the ward or your anaesthetist gives you different times, follow THEIRS and not this '
  + 'sheet — they know your particular case. Keep taking your regular medicines with a sip of '
  + 'water unless you have been told to stop one; if you take medicine for diabetes or for '
  + 'thinning the blood, ask specifically, because those often change before surgery.';

// ─────────────────────────────────────────────────── general surgical ────

export const GENERAL_RISK_SECTION: CounsellingSection = {
  id: 'general-risks',
  heading: 'Risks that belong to surgery in general',
  body: [
    'Every operation carries some risk. Most people have none of the problems below, and most '
    + 'problems that do occur are treated and resolve. They are listed because you are entitled '
    + 'to know them before you agree, not because they are expected.',
    'Your own risk depends on your age, your other illnesses and the operation itself. Your '
    + 'surgeon and anaesthetist will tell you where you personally stand.',
  ],
  points: [
    'Bleeding, which occasionally needs a blood transfusion or a second operation.',
    'Infection of the wound, which may need antibiotics, dressings, or an operation to drain it.',
    'A scar, which may be thick, raised or darker than the surrounding skin.',
    'Pain, which is expected and is treated — tell the nurses if it is not controlled.',
    'Clots in the leg veins which can travel to the lungs. You will be helped to move early, '
    + 'and some patients are given injections to prevent this.',
    'Damage to nearby structures — nerves, blood vessels or other organs — which is uncommon '
    + 'but can be serious.',
    'Chest or urinary infection, more likely if you smoke or are slow to get out of bed.',
    'The operation not achieving everything hoped for, or the problem returning later.',
    'In a small number of patients, a serious complication, permanent harm, or death.',
  ],
};

// ─────────────────────────────────────────────────── after the operation ────

export const RECOVERY_SECTION: CounsellingSection = {
  id: 'recovery',
  heading: 'What to expect afterwards',
  body: [
    'You will wake in the recovery room, where nurses watch your breathing, pulse and blood '
    + 'pressure before you go back to the ward. It is normal to feel cold, shaky, sleepy or '
    + 'sick for a while. Tell the nurses if you are in pain or feel sick; both are treatable '
    + 'and you do not need to endure them.',
    'You may have a drip in your arm, a tube draining the wound, or a catheter draining urine. '
    + 'These are usual and are removed as you recover.',
    'Getting out of bed early, breathing deeply and moving your legs are not optional extras. '
    + 'They are the main things that prevent chest infection and clots, and the nurses will '
    + 'help you start sooner than you may expect.',
    'How long you stay, when you may eat, when you may wash the wound, when you may drive, '
    + 'lift or return to work all depend on the operation. Ask your surgeon for your own '
    + 'figures, and ask again before you are discharged.',
  ],
};

// ───────────────────────────────────────────────────────── alert signs ────

export const ALERT_SECTION: CounsellingSection = {
  id: 'alert-signs',
  heading: 'Warning signs — come back to the hospital',
  emphasis: true,
  body: [
    'After you go home, most people recover steadily. If any of the following happens, do not '
    + 'wait for your next appointment and do not treat it at home. Come to the hospital.',
  ],
  points: [
    'Fever, or shaking chills.',
    'Pain that is getting worse rather than better, or pain your tablets no longer control.',
    'The wound becoming red, hot, swollen, or leaking pus or fluid; or the wound opening.',
    'Bleeding that soaks through the dressing, or bleeding that does not stop.',
    'Shortness of breath, chest pain, or coughing blood.',
    'A swollen, painful calf.',
    'Vomiting that will not stop, a swollen abdomen, or not passing stool or flatus.',
    'Not passing urine, or pain on passing urine with fever.',
    'Dizziness or fainting.',
    'Confusion or drowsiness that is new, in you or in the patient you are caring for.',
  ],
};

export const EMERGENCY_LINE =
  'If you are seriously unwell, go to the Accident and Emergency department at UNTH '
  + 'Ituku-Ozalla straight away. Do not wait for clinic.';

// ───────────────────────────────────────────────────────── the framing ────

/**
 * The sentence that keeps this sheet in its place.
 *
 * On every leaflet, at the top, before any clinical content. A patient who
 * believes this sheet IS the consent conversation has been given less than
 * they are owed, not more.
 */
export const LEAFLET_PURPOSE =
  'This sheet is written to help you prepare for the conversation with your surgeon, and to '
  + 'give you something to read again afterwards. It is general information about this kind of '
  + 'operation. It is not your consent, and it does not replace what your own surgeon tells '
  + 'you about your own case. Where the two differ, your surgeon is right.';

export const QUESTIONS_PROMPT =
  'Write your questions down and bring them. Patients routinely ask: why this operation rather '
  + 'than another; what happens if I wait; how long will I be in hospital; what will I be able '
  + 'to do afterwards, and when; who will be operating; and what this will cost.';

/** Said at the foot of every sheet. */
export const PRIVACY_NOTE =
  'This sheet is about your care. Please keep it where you are comfortable for others to see '
  + 'it, or keep it private — that is your choice.';

/**
 * The standard sections, in the order they are read.
 *
 * Fasting sits early, before the risks, because it is the one section that
 * changes what the patient must DO tonight. Risks and alert signs follow the
 * operation-specific part, so that the specific reads first.
 */
export const UNIVERSAL_ORDER = [
  'consent',
  'anaesthesia',
  'fasting',
  'general-risks',
  'recovery',
  'alert-signs',
] as const;

export const UNIVERSAL_SECTIONS: CounsellingSection[] = [
  CONSENT_SECTION,
  ANAESTHESIA_SECTION,
  FASTING_SECTION,
  GENERAL_RISK_SECTION,
  RECOVERY_SECTION,
  ALERT_SECTION,
];
