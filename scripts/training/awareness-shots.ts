// ============================================================
// Which screen belongs on which slide
// ------------------------------------------------------------
// Keyed by deck id, then by the SLIDE TITLE rather than its position. Titles
// are unique within a deck and readable here; an index would silently point at
// the wrong screen the first time a step was inserted, and nobody reviewing a
// diff of numbers would catch it.
//
// The value is the screenshot slug, without the `__desktop.png`. Files come
// from the training capture in
// `C:/Users/HomePC/Documents/phone and desktop screenshots`, taken against the
// THROWAWAY screenshot database — every patient on them is invented, which is
// the only reason this material can be circulated hospital-wide.
//
// A slide with no entry gets no screenshot and is laid out full width. That is
// deliberate for the opening and closing slides of each deck, which are about
// the deck rather than about a screen.
// ============================================================

export type ShotMap = Record<string, Record<string, string>>;

export const SHOTS: ShotMap = {
  // ── 1. Network access ──────────────────────────────────────────────────
  'awareness-network-access': {
    'Step 1 — Connect to the theatre Wi-Fi': '201-wifi-portal',
    'Step 2 — The sign-in page appears': '201-wifi-portal',
    'Step 3 — Sign in with your ORM details': '201-wifi-portal',
    'Step 4 — You are on for the day': '201-wifi-portal',
    'If it will not let you in': '201-wifi-portal',
    'Forgotten your username or password?': '133-users',
    'Signing in to ORM itself': '200-auth-login',
    'Two rules that matter': '133-users',
  },

  // ── 2. Emergency ───────────────────────────────────────────────────────
  'awareness-emergency-flow': {
    'Step 1 — Book the emergency': '034-emergency-booking-new',
    'Step 2 — The theatre is told, automatically': '031-emergency-alerts',
    'Step 3 — Who is reachable right now': '100-staff-availability',
    'Step 4 — Approve the case': '033-emergency-booking',
    'Step 5 — Assign the theatre': '129-theatres',
    'Step 6 — Emergency pre-anaesthetic review': '081-preop-reviews-new',
    'Step 7 — The anaesthetist prescribes': '083-prescriptions',
    'Step 8 — Urgent laboratory work': '117-theatre-ops-emergency-response',
    'Step 9 — Blood, if it is needed': '012-blood-bank',
    'Step 10 — Consumables and drugs are packed': '023-consumable-pack-provider',
    'Step 11 — Call for the patient': '013-call-for-patient',
    'Step 12 — The porter moves the patient': '130-transfers',
    'Step 13 — The holding area check': '043-holding-area',
    'Step 14 — Reception into theatre': '121-theatre-reception',
    'Step 15 — The operation and the note': '019-checklists',
    'Step 16 — Recovery, and back to the ward': '070-pacu',
    'If the case runs late': '114-theatre-ops',
    'What you should be able to do now': '016-case-readiness',
  },

  // ── 3. Elective ────────────────────────────────────────────────────────
  'awareness-elective-flow': {
    'Step 1 — Register the patient': '074-patients-new',
    'Step 2 — Book the surgery': '109-surgeries-new',
    'Step 3 — The pre-operative requirements': '109-surgeries-new',
    'Step 4 — Consent': '107-surgeries',
    'Step 5 — The codes are issued': '107-surgeries',
    'Step 6 — The estimate and the deposit': '037-estimates',
    'Step 7 — Investigations': '080-preop-reviews',
    'Step 8 — The pre-operative visit': '079-pre-operative-visit',
    'Step 9 — Theatre allocation': '129-theatres',
    'Step 10 — One hour before': '085-radio',
    'Step 11 — Team check-in': '116-theatre-ops-check-in',
    'Step 12 — Call for the patient, and the move': '013-call-for-patient',
    'Step 13 — Holding area and reception': '043-holding-area',
    'Step 14 — The operation note': '019-checklists',
    'Step 15 — Recovery and the ward': '070-pacu',
    'What you should be able to do now': '016-case-readiness',
  },

  // ── 4. Anaesthesia review ──────────────────────────────────────────────
  'awareness-anaesthesia-review': {
    'Step 1 — See the board': '007-anaesthetist-board',
    'Step 2 — Read what is already recorded': '080-preop-reviews',
    'Step 3 — The pre-operative visit': '079-pre-operative-visit',
    'Step 4 — ASA grade and the fitness decision': '081-preop-reviews-new',
    'Step 5 — Optimisation requirements': '081-preop-reviews-new',
    'Step 6 — Prescribe': '083-prescriptions',
    'Step 7 — The emergency short form': '033-emergency-booking',
    'Step 8 — The anaesthetic machine check': '008-anesthesia-setup',
    'Step 9 — During the case': '114-theatre-ops',
    'Step 10 — Handover to recovery': '064-nurse-handover',
    'What you should be able to do now': '007-anaesthetist-board',
  },

  // ── 5. Pharmacy ────────────────────────────────────────────────────────
  'awareness-pharmacy-flow': {
    'Step 1 — The request is made': '109-surgeries-new',
    'Step 2 — The patient is given the code': '107-surgeries',
    'Step 3 — The patient presents the code': '083-prescriptions',
    'Step 4 — Check the prescription': '082-prescription-approvals',
    'Step 5 — Pack against the case': '059-medication-tracking',
    'Step 6 — Mark it ready': '016-case-readiness',
    'Step 7 — Collection': '059-medication-tracking',
    'Step 8 — What comes back': '059-medication-tracking',
    'Step 9 — The post-operative prescription': '083-prescriptions',
    'What you should be able to do now': '083-prescriptions',
  },

  // ── 6. Consumable packs ────────────────────────────────────────────────
  'awareness-consumable-packs': {
    'Step 1 — The pack is requested': '109-surgeries-new',
    'Step 2 — The CP code is issued': '107-surgeries',
    'Step 3 — The provider receives the patient': '023-consumable-pack-provider',
    'Step 4 — Pack it': '023-consumable-pack-provider',
    'Step 5 — Short of something?': '126-theatre-supply',
    'Step 6 — Mark the pack ready': '016-case-readiness',
    'Step 7 — Into theatre': '122-theatre-setup',
    'Step 8 — What comes back': '128-theatre-supply-reports',
    'What you should be able to do now': '023-consumable-pack-provider',
  },

  // ── 7. Staff availability ──────────────────────────────────────────────
  'awareness-staff-availability': {
    'Step 1 — Open Staff Availability': '100-staff-availability',
    'Step 2 — The statuses that mean "call me"': '100-staff-availability',
    'Step 3 — The statuses that mean "not now"': '100-staff-availability',
    'Step 4 — The statuses that mean "not at work"': '100-staff-availability',
    'Step 5 — Where you are, and only while at work': '100-staff-availability',
    'Step 6 — When to change it': '100-staff-availability',
    'What it is used for': '031-emergency-alerts',
    'What you should be able to do now': '100-staff-availability',
  },
};
