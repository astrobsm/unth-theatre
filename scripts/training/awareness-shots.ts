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
// `C:/Users/HomePC/Documents/ORM-Screens`, taken against the
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
    'Step 1 — Connect to the theatre Wi-Fi': 'wifi-portal',
    'Step 2 — The sign-in page appears': 'wifi-portal',
    'Step 3 — Sign in with your ORM details': 'wifi-portal',
    'Step 4 — You are on for the day': 'wifi-portal',
    'If it will not let you in': 'wifi-portal',
    'Forgotten your username or password?': 'users',
    'Signing in to ORM itself': 'auth-login',
    'Two rules that matter': 'users',
  },

  // ── 2. Emergency ───────────────────────────────────────────────────────
  'awareness-emergency-flow': {
    'Step 1 — Book the emergency': 'emergency-booking-new',
    'Step 2 — The theatre is told, automatically': 'emergency-alerts',
    'Step 3 — Who is reachable right now': 'staff-availability',
    'Step 4 — Approve the case': 'emergency-booking',
    'Step 5 — Assign the theatre': 'theatres',
    'Step 6 — Emergency pre-anaesthetic review': 'preop-reviews-new',
    'Step 7 — The anaesthetist prescribes': 'prescriptions',
    'Step 8 — Urgent laboratory work': 'theatre-ops-emergency-response',
    'Step 9 — Blood, if it is needed': 'blood-bank',
    'Step 10 — Consumables and drugs are packed': 'consumable-pack-provider',
    'Step 11 — Call for the patient': 'call-for-patient',
    'Step 12 — The porter moves the patient': 'transfers',
    'Step 13 — The holding area check': 'holding-area',
    'Step 14 — Reception into theatre': 'theatre-reception',
    'Step 15 — The operation and the note': 'surgeries-post-op-notes',
    'Step 16 — Recovery, and back to the ward': 'pacu',
    'If the case runs late': 'theatre-ops',
    'What you should be able to do now': 'case-readiness',
  },

  // ── 3. Elective ────────────────────────────────────────────────────────
  'awareness-elective-flow': {
    'Step 1 — Register the patient': 'patients-new',
    'Step 2 — Book the surgery': 'surgeries-new',
    // No screen for this one. The dialog is a modal on a six-step wizard whose
    // trigger only enables once a date registers, and driving the form to that
    // point headlessly proved unreliable — a slide showing the wrong screen is
    // worse than one showing none, so this slide runs full width.
    'Step 3 — The pre-operative requirements': 'surgeries-new',
    'Step 4 — Consent': 'surgeries',
    'Step 5 — The codes are issued': 'surgeries',
    'Step 6 — The estimate and the deposit': 'estimates',
    'Step 7 — Investigations': 'preop-reviews',
    'Step 8 — The pre-operative visit': 'pre-operative-visit',
    'Step 9 — Theatre allocation': 'theatres',
    'Step 10 — One hour before': 'radio',
    'Step 11 — Team check-in': 'theatre-ops-check-in',
    'Step 12 — Call for the patient, and the move': 'call-for-patient',
    'Step 13 — Holding area and reception': 'holding-area',
    'Step 14 — The operation note': 'surgeries-post-op-notes',
    'Step 15 — Recovery and the ward': 'surgeries-post-op-notes-nursing-summary',
    'What you should be able to do now': 'case-readiness',
  },

  // ── 4. Anaesthesia review ──────────────────────────────────────────────
  'awareness-anaesthesia-review': {
    'Step 1 — See the board': 'anaesthetist-board',
    'Step 2 — Read what is already recorded': 'preop-reviews',
    'Step 3 — The pre-operative visit': 'pre-operative-visit',
    'Step 4 — ASA grade and the fitness decision': 'preop-reviews-new',
    'Step 5 — Optimisation requirements': 'preop-reviews-new',
    'Step 6 — Prescribe': 'prescriptions',
    'Step 7 — The emergency short form': 'emergency-booking',
    'Step 8 — The anaesthetic machine check': 'anesthesia-setup',
    'Step 9 — During the case': 'theatre-ops',
    'Step 10 — Handover to recovery': 'nurse-handover',
    'What you should be able to do now': 'anaesthetist-board',
  },

  // ── 5. Pharmacy ────────────────────────────────────────────────────────
  'awareness-pharmacy-flow': {
    'Step 1 — The request is made': 'surgeries-new',
    'Step 2 — The patient is given the code': 'surgeries',
    'Step 3 — The patient presents the code': 'prescriptions',
    'Step 4 — Check the prescription': 'prescription-approvals',
    'Step 5 — Pack against the case': 'medication-tracking',
    'Step 6 — Mark it ready': 'case-readiness',
    'Step 7 — Collection': 'medication-tracking',
    'Step 8 — What comes back': 'medication-tracking',
    'Step 9 — The post-operative prescription': 'prescriptions',
    'What you should be able to do now': 'prescriptions',
  },

  // ── 6. Consumable packs ────────────────────────────────────────────────
  'awareness-consumable-packs': {
    'Step 1 — The pack is requested': 'surgeries-new',
    'Step 2 — The CP code is issued': 'surgeries',
    'Step 3 — The provider receives the patient': 'consumable-pack-provider',
    'Step 4 — Pack it': 'consumable-pack-provider',
    'Step 5 — Short of something?': 'theatre-supply',
    'Step 6 — Mark the pack ready': 'case-readiness',
    'Step 7 — Into theatre': 'theatre-setup',
    'Step 8 — What comes back': 'theatre-supply-reports',
    'What you should be able to do now': 'consumable-pack-provider',
  },

  // ── 7. Staff availability ──────────────────────────────────────────────
  'awareness-staff-availability': {
    'Step 1 — Open Staff Availability': 'staff-availability',
    'Step 2 — The statuses that mean "call me"': 'staff-availability',
    'Step 3 — The statuses that mean "not now"': 'staff-availability',
    'Step 4 — The statuses that mean "not at work"': 'staff-availability',
    'Step 5 — Where you are, and only while at work': 'staff-availability',
    'Step 6 — When to change it': 'staff-availability',
    'What it is used for': 'emergency-alerts',
    'What you should be able to do now': 'staff-availability',
  },
};
