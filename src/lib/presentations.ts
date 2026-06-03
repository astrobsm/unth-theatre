// Tutorial library for the in-app Presentation module.
// Each deck = 10 slides covering one workflow, with optional voice-over narration.

export type SlideBg = 'navy' | 'green' | 'skyblue' | 'maroon' | 'gold';

export interface DeckSlide {
  title: string;
  subtitle: string;
  bullets: string[];
  bg: SlideBg;
  voiceOver?: string; // Spoken narration (Web Speech API)
}

export interface Deck {
  id: string;
  title: string;
  description: string;
  audience: string;
  icon: string; // emoji
  category: 'Overview' | 'Booking' | 'Clinical' | 'Support Services' | 'Operations' | 'Reports';
  slides: DeckSlide[];
}

// Helper to alternate backgrounds for visual rhythm.
const bgFor = (i: number): SlideBg => {
  const cycle: SlideBg[] = ['navy', 'green', 'skyblue'];
  return cycle[i % cycle.length];
};

// ─────────────────────────────────────────────────────────────────────────────
// DECK: Vision / About the Platform (existing content, lightly restructured)
// ─────────────────────────────────────────────────────────────────────────────
const visionDeck: Deck = {
  id: 'vision',
  title: 'UNTH Digital Theatre — The Vision',
  description: 'Executive overview of the platform, its problems solved, modules and value.',
  audience: 'Management, CMD, all staff',
  icon: '🏥',
  category: 'Overview',
  slides: [
    {
      title: 'UNTH Digital Theatre\nManagement System',
      subtitle: 'Transforming Surgical Theatre Operations Through Technology',
      bullets: [],
      bg: 'navy',
      voiceOver:
        'Welcome to the UNTH Digital Theatre Management System — a complete platform built to transform surgical operations through technology.',
    },
    {
      title: 'The Problem',
      subtitle: 'Challenges Facing Our Surgical Theatres Today',
      bullets: [
        'Poor coordination among surgeons, anaesthetists, nurses and pharmacy',
        'Inadequate patient preparation leading to surgery cancellations',
        'Delayed transfers between wards, holding areas and theatres',
        'No real-time visibility into consumable inventory levels',
        'Untracked pre-anaesthetic reviews causing unsafe surgeries',
        'Risk of patient extortion through unverified billing',
        'No audit trail for accountability and compliance',
        'Slow emergency response due to communication gaps',
      ],
      bg: 'green',
      voiceOver:
        'For years our theatres have struggled with poor coordination, late preparation, delayed transfers, blind inventory and slow emergency response. This platform tackles each of these problems head on.',
    },
    {
      title: 'Our Solution',
      subtitle: 'An Integrated Digital Platform for End-to-End Theatre Management',
      bullets: [
        'Web-based — works on desktop, tablet and mobile',
        'Role-based access for every stakeholder in the workflow',
        'Real-time dashboards, notifications and alerts',
        'Complete digital audit trail from booking to discharge',
        'Offline-capable Progressive Web App — works with poor connectivity',
      ],
      bg: 'skyblue',
      voiceOver:
        'Our answer is a single, integrated platform. Web based, role based, real time, fully audited and even works offline when the network is poor.',
    },
    {
      title: 'Stakeholder Coordination',
      subtitle: 'Eliminating Communication Silos',
      bullets: [
        'Shared surgery schedule visible to all team members in real time',
        'Automated notifications when surgery is booked, approved or changed',
        'Role-based dashboards for every cadre',
        'Live theatre allocation board',
        'Emergency team availability with instant mobilisation alerts',
      ],
      bg: 'navy',
      voiceOver:
        'Every stakeholder sees the same live schedule and receives notifications relevant to their role — eliminating silos and confusion.',
    },
    {
      title: 'Patient Preparation & Safety',
      subtitle: 'No Surgery Without Verified Readiness',
      bullets: [
        'Mandatory pre-op checklist — labs, consent, imaging, blood',
        'Digital pre-anaesthetic review with ASA classification',
        'Surgery cannot proceed until preparation items are verified',
        'Automated reminders for incomplete items',
        'WHO surgical safety checklist enforced at the bedside',
      ],
      bg: 'green',
      voiceOver:
        'Patient preparation and safety are built in. The system blocks any surgery from starting until preparation is verified and the WHO checklist is signed.',
    },
    {
      title: 'Transparent Inventory & Billing',
      subtitle: 'Stop Stock-outs. Stop Extortion.',
      bullets: [
        'Central store and per-theatre sub-store stock control',
        'Bill of Materials auto-generated per surgery type',
        'Every consumable used is logged against the surgery',
        'Patients are charged only for what was actually used',
        'Medication reconciliation: dispensed vs administered vs returned',
      ],
      bg: 'skyblue',
      voiceOver:
        'Stock levels are visible in real time and every item used is logged against the surgery — eliminating both stock outs and overbilling.',
    },
    {
      title: 'Audit & Accountability',
      subtitle: 'Every Action Logged. Every Decision Traceable.',
      bullets: [
        'Staff effectiveness reports — surgeries, durations, outcomes',
        'Theatre utilisation dashboards — peak hours, idle time',
        'Roster compliance — scheduled vs actual attendance',
        'Medication reconciliation per surgery',
        'Exportable reports for management and regulators',
      ],
      bg: 'navy',
      voiceOver:
        'Everything is logged. Management has dashboards for utilisation, staff effectiveness and compliance — all exportable for regulators.',
    },
    {
      title: 'Rapid Emergency Response',
      subtitle: 'When Every Second Counts',
      bullets: [
        'Emergency booking bypasses the 5 PM cutoff',
        'Emergency team availability board — see who is on-call',
        'One-click mobilisation alerts via app notifications',
        'Priority queue management — emergencies jump the schedule',
        'Pre-configured emergency BOM templates for rapid setup',
      ],
      bg: 'green',
      voiceOver:
        'For emergencies, one click mobilises the team, bypasses the cutoff, and jumps the queue — because in emergencies, every second matters.',
    },
    {
      title: 'Value to the Hospital',
      subtitle: 'Measurable Impact on Theatre Efficiency',
      bullets: [
        'Fewer cancellations through verified readiness',
        'Faster turnaround between cases',
        'Eliminated stock-outs with proactive inventory',
        'Stopped revenue leakage with transparent tracking',
        'Improved patient safety with mandatory checklists',
        'Data-driven decisions with real-time analytics',
      ],
      bg: 'skyblue',
      voiceOver:
        'The result is fewer cancellations, faster turnarounds, no stock outs, no revenue leakage, and safer patients — backed by data.',
    },
    {
      title: 'Thank You',
      subtitle: 'UNTH Digital Theatre Management System\nBuilt for Efficiency. Designed for Excellence.',
      bullets: [
        'University of Nigeria Teaching Hospital',
        'Department of Surgery — Theatre Complex',
        'Empowering surgical teams with digital tools',
      ],
      bg: 'navy',
      voiceOver:
        'Thank you. The UNTH Digital Theatre Management System — built for efficiency, designed for excellence.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a standard 10-slide deck quickly.
// ─────────────────────────────────────────────────────────────────────────────
function buildDeck(
  meta: Omit<Deck, 'slides'>,
  slides: Omit<DeckSlide, 'bg'>[],
): Deck {
  return {
    ...meta,
    slides: slides.map((s, i) => ({ ...s, bg: bgFor(i) })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SURGERY BOOKING (Elective & Emergency)
// ─────────────────────────────────────────────────────────────────────────────
const surgeryBookingDeck: Deck = buildDeck(
  {
    id: 'surgery-booking',
    title: 'Surgery Booking — Elective & Emergency',
    description: 'Step-by-step guide to scheduling elective cases and overriding for emergencies.',
    audience: 'Surgeons, House Officers, Theatre Coordinators',
    icon: '📅',
    category: 'Booking',
  },
  [
    {
      title: 'Surgery Booking',
      subtitle: 'Elective & Emergency Scheduling — Made Simple',
      bullets: [
        'A single workflow for all elective and emergency cases',
        'Enforces the 5 PM cutoff for elective surgery',
        'Allows emergency override 24/7',
        'Links patient, surgeon, theatre and consumables',
      ],
      voiceOver:
        'Welcome to Surgery Booking. In the next ten slides you will learn exactly how to schedule both elective and emergency cases on the ORM platform.',
    },
    {
      title: 'Before You Begin',
      subtitle: 'Three things must already exist',
      bullets: [
        'A registered patient record (Patients module)',
        'A confirmed deposit for elective cases (recommended)',
        'An available theatre slot on your unit day',
        'Pre-op investigations uploaded where required',
      ],
      voiceOver:
        'Before booking, confirm the patient is registered, the deposit is captured for elective cases, and an appropriate theatre slot is free on your unit day.',
    },
    {
      title: 'Step 1 — Open the Booking Form',
      subtitle: 'Dashboard → Surgeries → New Booking',
      bullets: [
        'Click the green “New Surgery” button',
        'Choose surgery type: Elective or Emergency',
        'Emergency booking opens an unrestricted form',
        'Elective enforces the 5 PM next-day cutoff',
      ],
      voiceOver:
        'Open the Surgeries module and click New Booking. Pick Elective for routine cases or Emergency to override the cutoff.',
    },
    {
      title: 'Step 2 — Patient & Procedure',
      subtitle: 'Search and confirm clinical details',
      bullets: [
        'Search patient by folder number, name or phone',
        'Select the subspecialty (e.g. General Surgery)',
        'Choose surgical unit (e.g. GS Unit I)',
        'Enter the procedure name and clinical indication',
        'Pick the operating location (theatre complex)',
      ],
      voiceOver:
        'Search and confirm the patient, then pick your subspecialty, unit, procedure and the operating location.',
    },
    {
      title: 'Step 3 — Team & Time',
      subtitle: 'Assign the surgical team and time slot',
      bullets: [
        'Pick the primary surgeon and assistant',
        'Select the anaesthetist (or “to be assigned”)',
        'Set the scheduled date and time',
        'Set the estimated duration in minutes',
        'Choose anaesthesia type: GA, RA, LA, MAC',
      ],
      voiceOver:
        'Assign your surgeon, assistant and anaesthetist. Set the date, time and duration. Pick the anaesthesia type.',
    },
    {
      title: 'Step 4 — Special Requirements',
      subtitle: 'Flag every special need',
      bullets: [
        'ICU bed needed after surgery? Tick the box.',
        'Blood transfusion, diathermy, C-arm, microscope, suction',
        'Pneumatic tourniquet, stirrups, Montrell mattress',
        'Free-text “Other special needs” for unusual items',
        'These tickboxes power the readiness checks',
      ],
      voiceOver:
        'Tick every special requirement — ICU, blood, diathermy, C-arm, microscope and more. These choices drive automatic readiness checks later.',
    },
    {
      title: 'Step 5 — Consumables & Costs',
      subtitle: 'Pre-pack list and patient charge',
      bullets: [
        'Auto-loaded from your unit’s surgical catalog',
        'Add or remove items per case as needed',
        'Pharmacy & Pack Provider see this list immediately',
        'Enter patient charge and confirm deposit',
        'Upload signed consent (PDF or image)',
      ],
      voiceOver:
        'Your unit catalog pre-loads the consumables. Adjust per case, set the charge and upload the signed consent. Pharmacy and the Pack Provider are alerted instantly.',
    },
    {
      title: 'Emergency Booking Specifics',
      subtitle: 'When time is the enemy',
      bullets: [
        'No 5 PM cutoff — bookable 24/7',
        'Auto-elevates urgency to EMERGENCY',
        'Sends instant alert to on-call team',
        'Triggers emergency BOM template if configured',
        'Pre-anaesthetic review may be brief but mandatory',
      ],
      voiceOver:
        'For emergencies, the cutoff is lifted, the on-call team is alerted instantly and an emergency consumables template is pulled — but the pre-anaesthetic review is still required.',
    },
    {
      title: 'After Submission',
      subtitle: 'What happens automatically',
      bullets: [
        'Anaesthetist sees the case for pre-op review',
        'Pharmacy receives the prescription request',
        'CSSD is notified of instrument requirements',
        'Cleaners and porters are queued via duty board',
        'Surgery appears on the live theatre board',
      ],
      voiceOver:
        'Once submitted, the anaesthetist, pharmacy, CSSD, cleaners and porters are all notified automatically. The case appears on every relevant dashboard.',
    },
    {
      title: 'Benefits & Reminders',
      subtitle: 'Why this matters',
      bullets: [
        'Fewer cancellations — readiness verified up front',
        'No double-bookings — system blocks conflicts',
        'Full audit trail — who booked, when, what changed',
        'Faster theatre starts — pack is ready by morning',
        'Patient safety improved at every step',
      ],
      voiceOver:
        'The benefits are real — fewer cancellations, no conflicts, faster starts and a complete audit trail. Book early, book accurately, and the whole theatre runs smoother.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. PHARMACY (Prescription handling, packing, dispensing)
// ─────────────────────────────────────────────────────────────────────────────
const pharmacyDeck: Deck = buildDeck(
  {
    id: 'pharmacy',
    title: 'Theatre Pharmacy Workflow',
    description: 'How pharmacists receive, pack, dispense and reconcile theatre medications.',
    audience: 'Pharmacists, Pharmacy Technicians',
    icon: '💊',
    category: 'Clinical',
  },
  [
    {
      title: 'Theatre Pharmacy',
      subtitle: 'From Prescription to Reconciliation',
      bullets: [
        'Receive prescriptions in real time',
        'Pack drugs ahead of every booked case',
        'Dispense to scrub nurse or anaesthetist',
        'Reconcile administered vs returned vs wasted',
      ],
      voiceOver:
        'Welcome to the Theatre Pharmacy workflow. You will learn how to receive prescriptions, pack drugs, dispense safely and reconcile every dose.',
    },
    {
      title: 'Where to Start',
      subtitle: 'Dashboard → Prescriptions',
      bullets: [
        'The dashboard lists every prescription needing action',
        'Filter by status: PENDING, APPROVED, PACKED, DISPENSED',
        'Filter by urgency: ROUTINE, URGENT, EMERGENCY',
        'Emergency cases are highlighted in red at the top',
      ],
      voiceOver:
        'Start at the Prescriptions dashboard. It shows every prescription that needs your attention, sorted by urgency. Emergency cases are at the top in red.',
    },
    {
      title: 'Step 1 — Review the Prescription',
      subtitle: 'Verify before packing',
      bullets: [
        'Open the prescription to see drug, dose, route, frequency',
        'Confirm the prescriber and approving anaesthetist',
        'Check patient name, folder number and procedure',
        'Cross-check allergies on the patient record',
        'Flag any clinical or stock concerns',
      ],
      voiceOver:
        'Open each prescription and verify drug, dose, route, prescriber and patient identity. Check allergies and flag any concern before packing.',
    },
    {
      title: 'Step 2 — Pack the Order',
      subtitle: 'Physical assembly + digital confirmation',
      bullets: [
        'Pick items from theatre pharmacy stock',
        'Click “Mark as PACKED” when complete',
        'System captures who packed and when',
        'Out-of-stock items are flagged automatically',
        'Out-of-stock list pushes alert to procurement',
      ],
      voiceOver:
        'Pick the items, then mark the prescription as packed. The system records who packed and when. Any out of stock items trigger an automatic alert to procurement.',
    },
    {
      title: 'Step 3 — Print or Share',
      subtitle: 'A physical record for the case',
      bullets: [
        'Download the prescription PDF (narcotic-aware)',
        'Or share to scrub nurse via the radio module',
        'PDF lists drug, dose, route, frequency and notes',
        'Narcotic items shown in red with a star marker',
        'Attach PDF to the patient pack',
      ],
      voiceOver:
        'Download the prescription PDF — narcotic items appear in red with a star — and attach it to the patient pack or share via the radio module.',
    },
    {
      title: 'Step 4 — Dispense to Theatre',
      subtitle: 'Hand-off with accountability',
      bullets: [
        'Confirm hand-off to scrub nurse / anaesthetist',
        'Capture recipient name and signature',
        'Status moves to DISPENSED',
        'Pack movement appears on live monitoring board',
      ],
      voiceOver:
        'Hand the pack to the scrub nurse or anaesthetist, capture their name, and the system marks the prescription as dispensed.',
    },
    {
      title: 'Step 5 — Reconciliation',
      subtitle: 'Account for every dose',
      bullets: [
        'After surgery, capture administered quantities',
        'Capture returned and wasted drugs',
        'Narcotic returns require witness signature',
        'Discrepancies generate a non-return query',
        'Reconciliation closes the medication loop',
      ],
      voiceOver:
        'After surgery, reconcile every dose. Narcotic returns need a witness. Any unexplained gap raises a non return query for follow up.',
    },
    {
      title: 'Additional Requests',
      subtitle: 'Mid-case top-ups',
      bullets: [
        'Anaesthetist can request additional drugs intra-op',
        'Request hits your dashboard with a sound alert',
        'Pack and dispatch via porter or hand-off',
        'Added to the case medication log automatically',
      ],
      voiceOver:
        'If the anaesthetist needs more drugs mid case, you get an instant request. Pack and dispatch — the addition logs against the case automatically.',
    },
    {
      title: 'Daily & Weekly Reports',
      subtitle: 'Know your performance',
      bullets: [
        'Prescriptions filled per day, per anaesthetist',
        'Average packing turnaround time',
        'Narcotic register — full controlled-drug audit',
        'Stock-out frequency report for procurement',
        'Export to PDF or Excel for management',
      ],
      voiceOver:
        'The system gives you daily and weekly reports — volumes, turnaround, narcotic register and stock outs. Export to PDF or Excel anytime.',
    },
    {
      title: 'Why This Workflow Works',
      subtitle: 'Benefits to pharmacy, patient and hospital',
      bullets: [
        'No paper prescriptions to lose',
        'Faster, safer dispensing with full traceability',
        'Narcotic accountability built in',
        'Stock-outs detected and acted on early',
        'Patients charged accurately — no extortion',
      ],
      voiceOver:
        'No paper, full traceability, narcotic accountability and accurate billing. The Theatre Pharmacy workflow is faster, safer and fairer for everyone.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. PRE-OPERATIVE REVIEW & PRESCRIPTIONS (Anaesthetists)
// ─────────────────────────────────────────────────────────────────────────────
const preopReviewDeck: Deck = buildDeck(
  {
    id: 'preop-review',
    title: 'Pre-Operative Review & Prescriptions',
    description: 'How anaesthetists conduct the pre-op review and issue prescriptions.',
    audience: 'Anaesthetists, Consultant Anaesthetists',
    icon: '🩺',
    category: 'Clinical',
  },
  [
    {
      title: 'Pre-Operative Review',
      subtitle: 'The Anaesthetist’s Cockpit',
      bullets: [
        'Risk-stratify every patient before theatre',
        'Approve or reject readiness',
        'Issue pre-medications and intra-op drugs',
        'Link every decision to the patient record',
      ],
      voiceOver:
        'Welcome anaesthetists. This tutorial shows how to use the platform to assess every patient, issue prescriptions and clear them for theatre.',
    },
    {
      title: 'Find Your Work Queue',
      subtitle: 'Dashboard → Pre-Op Reviews',
      bullets: [
        'Lists every booked case awaiting review',
        'Sorted by surgery date and urgency',
        'Emergency cases flagged in red',
        'Filter by surgeon, unit or anaesthetist',
      ],
      voiceOver:
        'Open the Pre-Op Reviews module. Your queue is sorted by date and urgency, with emergencies in red.',
    },
    {
      title: 'Open a Case',
      subtitle: 'See the full clinical picture',
      bullets: [
        'Demographics, weight, ASA history',
        'Indication, procedure, planned surgeon',
        'Investigations: FBC, U&E, ECG, imaging',
        'Allergies, comorbidities, current medications',
        'Previous anaesthesia history if any',
      ],
      voiceOver:
        'Each case opens with everything you need — demographics, investigations, allergies, comorbidities and previous anaesthesia history.',
    },
    {
      title: 'Step 1 — Assess the Patient',
      subtitle: 'Fill the structured review',
      bullets: [
        'Airway assessment (Mallampati, mouth opening)',
        'Cardiovascular & respiratory status',
        'ASA classification (I–V, E for emergency)',
        'Anaesthesia plan: GA, RA, LA, MAC',
        'Risks discussed and consented',
      ],
      voiceOver:
        'Fill the structured review — airway, cardiovascular, respiratory, ASA class and your anaesthesia plan. Record what risks you discussed.',
    },
    {
      title: 'Step 2 — Decide: Approve or Reject',
      subtitle: 'Two paths forward',
      bullets: [
        'APPROVE: patient is fit to proceed',
        'REJECT: patient needs more work-up',
        'Rejected cases require a reason and corrective plan',
        'Surgeon and ward are notified instantly',
        'Surgery cannot start without your approval',
      ],
      voiceOver:
        'Decide. Approve if the patient is fit, or reject with a reason and a corrective plan. The surgeon and ward are notified immediately.',
    },
    {
      title: 'Step 3 — Issue Prescriptions',
      subtitle: 'Pre-meds and intra-op drugs',
      bullets: [
        'Open the “New Prescription” tab',
        'Add each drug: name, dose, route, frequency, timing',
        'Mark pre-medication vs intra-op vs post-op',
        'Add free-text notes for the pharmacist',
        'Submit — pharmacy is alerted in real time',
      ],
      voiceOver:
        'Open New Prescription. Add each drug with dose, route, frequency and timing. Mark pre, intra or post operative. Submit and the pharmacist gets the alert.',
    },
    {
      title: 'Consultant Approval',
      subtitle: 'Two-tier sign-off for safety',
      bullets: [
        'Registrar-issued scripts route to a consultant',
        'Consultant approves, amends or rejects',
        'Controlled substances always need consultant nod',
        'Approval timestamp is captured for audit',
      ],
      voiceOver:
        'Registrar scripts route to a consultant for approval. Controlled substances always need that second signature, and every approval is time stamped.',
    },
    {
      title: 'Additional Intra-Op Requests',
      subtitle: 'When more is needed mid-case',
      bullets: [
        'Open the active case during surgery',
        'Click “Additional Drug Request”',
        'Specify drug, dose and urgency',
        'Pharmacy receives an instant audible alert',
        'Drug is logged against the case automatically',
      ],
      voiceOver:
        'Mid case, you can request additional drugs in seconds. Pharmacy gets an instant audible alert and the drug logs against the case automatically.',
    },
    {
      title: 'Reconciliation & Returns',
      subtitle: 'Close the loop',
      bullets: [
        'After surgery, confirm what was administered',
        'Return unused drugs to pharmacy via the app',
        'Witness narcotic returns digitally',
        'Reconciliation report generated automatically',
      ],
      voiceOver:
        'After the case, confirm what was administered, return unused drugs and witness narcotic returns. The reconciliation report writes itself.',
    },
    {
      title: 'Benefits for Anaesthetists',
      subtitle: 'Why it pays to do it digitally',
      bullets: [
        'One place for everything you need pre-op',
        'No lost notes or missed prescriptions',
        'Full medico-legal protection through audit',
        'Faster, safer hand-overs between shifts',
        'Patients better prepared = fewer in-theatre surprises',
      ],
      voiceOver:
        'Everything in one place, no lost notes, full medico legal protection and safer hand overs. Pre Operative Review is the anaesthetist’s most valuable tool.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. PRE-OPERATIVE VISITS
// ─────────────────────────────────────────────────────────────────────────────
const preopVisitDeck: Deck = buildDeck(
  {
    id: 'preop-visit',
    title: 'Pre-Operative Visits',
    description: 'How nurses and HOs document the bedside pre-op visit.',
    audience: 'Nurses, House Officers, Anaesthetic Technicians',
    icon: '🚶',
    category: 'Clinical',
  },
  [
    {
      title: 'Pre-Operative Visits',
      subtitle: 'Meeting the patient before theatre day',
      bullets: [
        'Bedside check to confirm physical and psychological readiness',
        'Educate the patient and family',
        'Identify last-minute issues early',
        'Captured digitally for the whole team',
      ],
      voiceOver:
        'The Pre Operative Visit is the bedside check that catches problems before theatre day and prepares your patient mentally and physically.',
    },
    {
      title: 'Where to Find It',
      subtitle: 'Dashboard → Pre-Operative Visit',
      bullets: [
        'Shows tomorrow’s and today’s patients',
        'Filter by ward or surgical unit',
        'Pending visits highlighted',
        'Tap a patient to open the visit form',
      ],
      voiceOver:
        'Open Pre Operative Visit on the dashboard. It lists tomorrow’s and today’s patients with the pending ones highlighted.',
    },
    {
      title: 'Step 1 — Confirm Identity',
      subtitle: 'Two-identifier verification',
      bullets: [
        'Match name and folder number with the wristband',
        'Confirm date of birth or age',
        'Confirm planned procedure and side',
        'Document presence of next of kin if needed',
      ],
      voiceOver:
        'At the bedside, confirm two identifiers — name plus folder number — and check that the procedure and side match.',
    },
    {
      title: 'Step 2 — Education',
      subtitle: 'Prepare the patient and family',
      bullets: [
        'Explain fasting (NPO) rules and time',
        'Explain pre-medication, if prescribed',
        'Walk through what happens on theatre day',
        'Show transfer route to holding area',
        'Answer questions and capture concerns',
      ],
      voiceOver:
        'Educate the patient and family — fasting, pre meds, what theatre day looks like and the route to the holding area. Capture any concerns.',
    },
    {
      title: 'Step 3 — Bedside Checks',
      subtitle: 'Physical readiness',
      bullets: [
        'Vitals recap: BP, pulse, temperature, SpO2',
        'IV access patent? Site secure?',
        'Site marking present? Initialled?',
        'Allergy wristband in place?',
        'Loose teeth, jewellery, prostheses removed?',
      ],
      voiceOver:
        'Check vitals, IV access, site marking, allergy band, loose teeth, jewellery and prostheses. Catch these now, not on the table.',
    },
    {
      title: 'Step 4 — Document Findings',
      subtitle: 'Type or use voice/OCR',
      bullets: [
        'Type findings into the structured fields',
        'Use voice input for narrative notes',
        'Scan paper notes with the built-in OCR',
        'Attach photos of marked site if needed',
      ],
      voiceOver:
        'Document everything. Type the structured fields, dictate narrative notes by voice, or scan paper notes using the built in OCR.',
    },
    {
      title: 'Step 5 — Flag Concerns',
      subtitle: 'Escalate before theatre day',
      bullets: [
        'Mark concerns as MINOR, MAJOR or RED FLAG',
        'Red flag triggers an instant alert to anaesthetist',
        'Major concerns appear on the surgeon dashboard',
        'Notes flow into the holding-area assessment',
      ],
      voiceOver:
        'Flag concerns honestly. Red flags trigger an instant alert to the anaesthetist and major issues appear on the surgeon’s dashboard.',
    },
    {
      title: 'Step 6 — Sign Off',
      subtitle: 'Capture accountability',
      bullets: [
        'Tap “Submit Visit”',
        'System captures your name, role and time',
        'Visit becomes visible to the whole team',
        'Patient status updates to “Pre-op visit complete”',
      ],
      voiceOver:
        'Tap Submit. Your name, role and time are captured. The patient status updates and the whole team sees the visit is complete.',
    },
    {
      title: 'On Theatre Day',
      subtitle: 'Carries forward automatically',
      bullets: [
        'Visit notes appear in holding-area assessment',
        'Concerns automatically copied to handover',
        'Anaesthetist sees them on the pre-op screen',
        'No need to re-enter information',
      ],
      voiceOver:
        'On theatre day, your notes follow the patient automatically into the holding area and on to the anaesthetist — no re entry needed.',
    },
    {
      title: 'Why the Visit Matters',
      subtitle: 'Prevention beats cure',
      bullets: [
        'Catches preventable cancellations early',
        'Reduces patient anxiety',
        'Improves theatre on-time starts',
        'Strengthens nurse-patient trust',
        'Provides a medico-legal record of education',
      ],
      voiceOver:
        'A good pre operative visit prevents cancellations, calms patients, improves on time starts and protects you medico legally.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. CALL FOR PATIENTS
// ─────────────────────────────────────────────────────────────────────────────
const callForPatientDeck: Deck = buildDeck(
  {
    id: 'call-for-patient',
    title: 'Call for Patients',
    description: 'How theatre calls the next patient from the ward and tracks arrival.',
    audience: 'Scrub Nurses, Porters, Ward Nurses',
    icon: '📣',
    category: 'Operations',
  },
  [
    {
      title: 'Call for Patients',
      subtitle: 'Bringing the patient at the right moment',
      bullets: [
        'Coordinates the ward, porter and theatre',
        'Removes phone-call confusion',
        'Tracks every step with timestamps',
        'Drives on-time theatre starts',
      ],
      voiceOver:
        'Call for Patients coordinates ward, porter and theatre so the right patient arrives at the right time — no more endless phone calls.',
    },
    {
      title: 'Where to Find It',
      subtitle: 'Dashboard → Call for Patient',
      bullets: [
        'Lists every booked surgery for today',
        'Status badges: NOT CALLED, CALLED, IN HOLDING',
        'Sorted by scheduled start time',
        'Filter by theatre or surgeon',
      ],
      voiceOver:
        'Open Call for Patient. Every case for today is listed with status badges showing whether the patient has been called or already arrived.',
    },
    {
      title: 'Step 1 — Initiate the Call',
      subtitle: 'When the theatre is ready',
      bullets: [
        'Scrub nurse confirms theatre is set up',
        'Tap “Call Patient” on the case',
        'Status flips to CALLED with timestamp',
        'Ward gets an instant notification',
        'Porter dashboard shows a new pickup',
      ],
      voiceOver:
        'When the theatre is set up, the scrub nurse taps Call Patient. The ward and porter get an instant notification.',
    },
    {
      title: 'Step 2 — Porter Acknowledges',
      subtitle: 'Pickup confirmed',
      bullets: [
        'Porter opens their dashboard and accepts',
        'Status changes to EN ROUTE TO PATIENT',
        'Estimated arrival shown to theatre',
        'Voice prompt plays in the porter’s app',
      ],
      voiceOver:
        'The porter accepts on their dashboard. The status moves to en route and the estimated arrival appears for theatre.',
    },
    {
      title: 'Step 3 — Ward Hand-off',
      subtitle: 'Safe transfer from ward',
      bullets: [
        'Ward nurse confirms patient is ready',
        'Hand-off checklist: ID band, consent, file',
        'Porter signs for receipt in the app',
        'Status updates to EN ROUTE TO HOLDING',
      ],
      voiceOver:
        'The ward nurse confirms readiness, runs the hand off checklist and the porter signs for the patient. Status moves to en route to holding.',
    },
    {
      title: 'Step 4 — Arrival in Holding',
      subtitle: 'Capture timestamp and condition',
      bullets: [
        'Holding nurse scans the patient in',
        'Records arrival vitals if needed',
        'Status changes to IN HOLDING',
        'Surgeon and anaesthetist notified',
      ],
      voiceOver:
        'In holding, the nurse scans the patient in, records arrival vitals if needed, and notifies surgeon and anaesthetist.',
    },
    {
      title: 'Step 5 — Theatre Entry',
      subtitle: 'From holding to operating room',
      bullets: [
        'Anaesthetist confirms readiness',
        'Theatre status flips to PATIENT IN ROOM',
        'Knife-to-skin timer ready to start',
        'Live monitoring board updates everyone',
      ],
      voiceOver:
        'Once the anaesthetist is happy, the patient enters theatre, the status updates and the live board shows the case is starting.',
    },
    {
      title: 'Handling Delays',
      subtitle: 'Transparent escalation',
      bullets: [
        'If no porter accepts within 5 minutes — escalate',
        'If ward delays — log the reason in the app',
        'Delay reasons feed the cancellation analytics',
        'Supervisors see hotspots in real time',
      ],
      voiceOver:
        'When delays happen, the reason is logged. Supervisors see hotspots in real time, so issues get fixed quickly.',
    },
    {
      title: 'Communication',
      subtitle: 'Beyond the app',
      bullets: [
        'Radio module broadcasts confirmations theatre-wide',
        'Optional WhatsApp alert for ward nurse-in-charge',
        'Notifications appear on theatre TV screens',
      ],
      voiceOver:
        'Beyond the app, the radio module can broadcast a confirmation theatre wide, and the theatre TVs show the same updates.',
    },
    {
      title: 'Benefits',
      subtitle: 'Why it changes everything',
      bullets: [
        'On-time starts increase dramatically',
        'No more “patient not yet sent” surprises',
        'Audit trail of who called and when',
        'Reduces porter and nurse fatigue',
        'Patients are not left waiting unnecessarily',
      ],
      voiceOver:
        'The result is dramatically better on time starts, fewer surprises, less staff fatigue and a smoother experience for the patient.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. HOLDING AREA
// ─────────────────────────────────────────────────────────────────────────────
const holdingAreaDeck: Deck = buildDeck(
  {
    id: 'holding-area',
    title: 'Holding Area Assessment',
    description: 'The final safety check before the operating room.',
    audience: 'Holding-area nurses, Anaesthetic technicians',
    icon: '🛏️',
    category: 'Clinical',
  },
  [
    {
      title: 'Holding Area',
      subtitle: 'Last Stop Before the Operating Room',
      bullets: [
        'Final identity, consent and readiness check',
        'Catch any last-minute issues',
        'Coordinate hand-off to the theatre team',
        'Record vital signs at arrival',
      ],
      voiceOver:
        'The Holding Area is the last safety stop before the operating room — identity, consent, readiness, vitals, all verified here.',
    },
    {
      title: 'Where to Find It',
      subtitle: 'Dashboard → Holding Area',
      bullets: [
        'List of patients in or expected in holding',
        'Tap a patient to open the assessment',
        'Pending assessments flagged in amber',
        'Cleared patients turn green',
      ],
      voiceOver:
        'Open Holding Area on the dashboard. Pending patients are amber, cleared ones turn green.',
    },
    {
      title: 'Step 1 — Identity Verification',
      subtitle: 'Two identifiers always',
      bullets: [
        'Match wristband: name + folder number',
        'Confirm date of birth verbally',
        'Confirm planned procedure and side',
        'Tick the identity verification box',
      ],
      voiceOver:
        'Verify identity with two identifiers — name and folder number, plus a verbal date of birth confirmation. Confirm the procedure and side.',
    },
    {
      title: 'Step 2 — Surgical Site',
      subtitle: 'Marking and confirmation',
      bullets: [
        'Site marked by the operating surgeon?',
        'Laterality confirmed where applicable',
        'Tick: marked, confirmed, procedure agreed',
        'Note any discrepancy and escalate',
      ],
      voiceOver:
        'Confirm the surgical site is marked by the operating surgeon. Confirm laterality where it applies and escalate any discrepancy immediately.',
    },
    {
      title: 'Step 3 — Consent Document',
      subtitle: 'Visible and signed',
      bullets: [
        'View the uploaded consent (if attached)',
        'Confirm form present and signed',
        'Confirm patient understands the procedure',
        'Capture any clarifications offered',
      ],
      voiceOver:
        'Open the uploaded consent if available, confirm it is present and signed, and that the patient understands the procedure.',
    },
    {
      title: 'Step 4 — Safety Checks',
      subtitle: 'Allergies, fasting, IV access',
      bullets: [
        'Allergy band present and reviewed',
        'NPO time confirmed and compliant',
        'IV access patent and secure',
        'Vitals within range (or concerns noted)',
        'Documentation complete (labs, ECG, etc.)',
      ],
      voiceOver:
        'Run the safety checks — allergies, fasting, IV access, vitals and documentation. Note any concern, do not gloss over it.',
    },
    {
      title: 'Step 5 — Vital Signs',
      subtitle: 'Baseline before theatre',
      bullets: [
        'Capture BP, pulse, temperature, SpO2',
        'Respiratory rate and blood glucose if relevant',
        'System flags abnormal values automatically',
        'Notes feed straight to the anaesthetist',
      ],
      voiceOver:
        'Record baseline vitals. Abnormal values flag automatically and feed straight to the anaesthetist.',
    },
    {
      title: 'Red Alerts',
      subtitle: 'When something is wrong',
      bullets: [
        'Tap “Trigger Red Alert” if something is amiss',
        'Choose type: identity mismatch, consent issue, fitness',
        'Anaesthetist & surgeon notified immediately',
        'Surgery is paused pending resolution',
      ],
      voiceOver:
        'If anything is wrong, trigger a Red Alert. The surgeon and anaesthetist are notified immediately and the case is paused until resolved.',
    },
    {
      title: 'Step 6 — Clear for Theatre',
      subtitle: 'Sign off the assessment',
      bullets: [
        'All checks green? Tap “Clear for Theatre”',
        'Patient status updates to CLEARED',
        'Theatre team is notified to receive',
        'Holding-to-theatre transfer time recorded',
      ],
      voiceOver:
        'When all checks are green, tap Clear for Theatre. The team is notified and the transfer time is recorded automatically.',
    },
    {
      title: 'Why It Matters',
      subtitle: 'Catching one issue here saves a life',
      bullets: [
        'Wrong-site surgery prevention',
        'Stops never-events at the last gate',
        'Aligns with WHO Safe Surgery Checklist',
        'Documented evidence of due diligence',
        'Builds patient confidence',
      ],
      voiceOver:
        'The holding area is your last gate. Catching one issue here can save a life. Take every check seriously.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. PATIENT TRANSFERS (location-to-location)
// ─────────────────────────────────────────────────────────────────────────────
const transfersDeck: Deck = buildDeck(
  {
    id: 'transfers',
    title: 'Patient Transfers',
    description: 'Tracking every patient movement between locations.',
    audience: 'Porters, Nurses, Anaesthetic technicians',
    icon: '🚚',
    category: 'Operations',
  },
  [
    {
      title: 'Patient Transfers',
      subtitle: 'From Ward to Theatre to Recovery to Ward',
      bullets: [
        'Track every movement with timestamps',
        'Record who handed over and who received',
        'Capture patient condition at each leg',
        'Prevent “lost patient” incidents',
      ],
      voiceOver:
        'Patient Transfers tracks every leg of the patient journey — ward to theatre, theatre to recovery, recovery to ward — with full accountability.',
    },
    {
      title: 'Where to Find It',
      subtitle: 'Dashboard → Transfers',
      bullets: [
        'See all active transfers in real time',
        'Filter by direction or location',
        'Tap any transfer for full details',
        'New transfer button at the top',
      ],
      voiceOver:
        'Open Transfers on the dashboard. All active movements show in real time. Tap any one for full detail.',
    },
    {
      title: 'Step 1 — Initiate a Transfer',
      subtitle: 'Source location starts it',
      bullets: [
        'Tap “New Transfer”',
        'Search the patient by folder number',
        'Pick the destination location',
        'Choose the assigned porter or trolley team',
        'Capture reason (e.g. SURGERY, RECOVERY, WARD)',
      ],
      voiceOver:
        'The source location starts the transfer — pick the patient, the destination, the porter and the reason.',
    },
    {
      title: 'Step 2 — Hand-off',
      subtitle: 'Document patient condition',
      bullets: [
        'Vitals at hand-off',
        'Level of consciousness',
        'Oxygen, drips, drains attached',
        'Wristband, file and X-rays accompany',
        'Source nurse signs off in the app',
      ],
      voiceOver:
        'Document vitals, consciousness, attachments and accompanying items. The source nurse signs the hand off in the app.',
    },
    {
      title: 'Step 3 — In Transit',
      subtitle: 'Visible to everyone',
      bullets: [
        'Status moves to IN TRANSIT',
        'Live board shows movement at every location',
        'Estimated arrival is broadcast to destination',
        'Voice prompt plays at the destination',
      ],
      voiceOver:
        'During transit, the live board shows the movement and the destination hears a voice prompt about the incoming patient.',
    },
    {
      title: 'Step 4 — Arrival',
      subtitle: 'Receiving the patient',
      bullets: [
        'Destination nurse scans patient in',
        'Confirms identity at the receiving point',
        'Receives report from porter / source nurse',
        'Status updates to ARRIVED',
      ],
      voiceOver:
        'On arrival, the destination nurse scans the patient in, confirms identity and receives the report. Status updates to arrived.',
    },
    {
      title: 'Step 5 — Acceptance Sign-off',
      subtitle: 'Accountability transferred',
      bullets: [
        'Destination signs to accept care',
        'Reception vitals captured',
        'Any concerns flagged immediately',
        'Source team gets a confirmation alert',
      ],
      voiceOver:
        'The destination signs to accept care and captures reception vitals. The source team gets a confirmation alert.',
    },
    {
      title: 'Special Transfers',
      subtitle: 'ICU, imaging, mortality',
      bullets: [
        'ICU transfer: opens the critical care checklist',
        'Imaging transfer: links to the radiology request',
        'Mortuary transfer: requires mortality registration',
        'Each has its own readiness checks',
      ],
      voiceOver:
        'Special transfers — ICU, imaging, mortuary — have their own checklists and links. The system enforces the right one for each destination.',
    },
    {
      title: 'Audit & Reports',
      subtitle: 'Movement analytics',
      bullets: [
        'Average transit times per route',
        'Delays per porter or per route',
        'Adverse events during transfer',
        'Daily / weekly transfer volume',
      ],
      voiceOver:
        'Reports show average transit times, delays per route and any adverse events — perfect for improving porter and clinical workflow.',
    },
    {
      title: 'Benefits',
      subtitle: 'Why every transfer is logged',
      bullets: [
        'No patient is ever “unaccounted for”',
        'Clear chain of custody for clinical care',
        'Better porter scheduling from data',
        'Stronger medico-legal defence',
        'Faster recovery turnover',
      ],
      voiceOver:
        'No patient unaccounted for, clear chain of custody, smarter porter scheduling and better medico legal defence. Logging every transfer pays off.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 8. CLEANING & PATIENT TRANSPORT LOGGING (Porters / Cleaners)
// ─────────────────────────────────────────────────────────────────────────────
const dutyLogDeck: Deck = buildDeck(
  {
    id: 'duty-logs',
    title: 'Cleaning & Transport Logs',
    description: 'How porters and cleaners log every duty performed.',
    audience: 'Porters, Cleaners, Theatre Supervisors',
    icon: '🧹',
    category: 'Operations',
  },
  [
    {
      title: 'Cleaning & Transport Logs',
      subtitle: 'Every duty captured, every staff member credited',
      bullets: [
        'Log each cleaning task with timestamps',
        'Log each patient transport leg',
        'Builds objective performance records',
        'Triggers theatre readiness automatically',
      ],
      voiceOver:
        'This tutorial shows porters and cleaners how to log every duty — building objective performance records and triggering theatre readiness automatically.',
    },
    {
      title: 'Logging In',
      subtitle: 'Use your staff code',
      bullets: [
        'Open the ORM app on the shared device or your phone',
        'Enter your staff code (or username on first login)',
        'Your duty dashboard opens immediately',
        'You can switch between Cleaning and Transport tabs',
      ],
      voiceOver:
        'Open the ORM app and log in with your staff code. Your duty dashboard opens with Cleaning and Transport tabs ready to use.',
    },
    {
      title: 'Cleaning — Step 1: Select Theatre',
      subtitle: 'Pick the room you cleaned',
      bullets: [
        'Tap “New Cleaning Log”',
        'Choose the theatre or area cleaned',
        'Pick the type: BETWEEN_CASES, TERMINAL, DEEP_CLEAN',
        'System pre-fills your name and time',
      ],
      voiceOver:
        'For cleaning, tap New Cleaning Log, pick the theatre and the type — between cases, terminal or deep clean. Your name and time pre fill.',
    },
    {
      title: 'Cleaning — Step 2: Capture Details',
      subtitle: 'What you cleaned and how',
      bullets: [
        'Tick: floor, walls, surfaces, equipment, lights',
        'Note disinfectant used and dilution',
        'Add photos before / after if you wish',
        'Record any damage or fault observed',
      ],
      voiceOver:
        'Tick the areas you cleaned, note the disinfectant, add photos if you want and report any damage you spotted.',
    },
    {
      title: 'Cleaning — Step 3: Submit',
      subtitle: 'Theatre marked ready',
      bullets: [
        'Tap Submit',
        'Theatre status flips to CLEANED',
        'Scrub nurse is notified the room is ready',
        'Cleaning duration recorded for analytics',
      ],
      voiceOver:
        'Tap submit. The theatre is marked cleaned, the scrub nurse is notified and your cleaning duration is recorded.',
    },
    {
      title: 'Transport — Step 1: Accept Job',
      subtitle: 'From the porter dashboard',
      bullets: [
        'New transport jobs appear automatically',
        'Tap “Accept” on the next job',
        'Pickup location and patient details show',
        'Voice prompt confirms the assignment',
      ],
      voiceOver:
        'For transport, accept the next job from your porter dashboard. The pickup location and patient details appear with a voice confirmation.',
    },
    {
      title: 'Transport — Step 2: Pickup & Drop-off',
      subtitle: 'Sign at both ends',
      bullets: [
        'At pickup, ward nurse hands over and signs',
        'In transit, status shows IN TRANSIT',
        'At drop-off, destination nurse signs receipt',
        'Status updates to COMPLETED',
      ],
      voiceOver:
        'At pickup the ward nurse signs, in transit the status updates, and at drop off the destination signs receipt. Job marked complete.',
    },
    {
      title: 'Multiple Jobs',
      subtitle: 'Queue them efficiently',
      bullets: [
        'See a queue of upcoming pickups',
        'Accept multiple if route is sensible',
        'System suggests pickup order',
        'Supervisors see your live workload',
      ],
      voiceOver:
        'You can accept multiple jobs and the system suggests the best pickup order. Supervisors see your live workload.',
    },
    {
      title: 'Your Performance',
      subtitle: 'Recognised and rewarded',
      bullets: [
        'Daily, weekly and monthly summaries',
        'Tasks completed, average duration',
        'Punctuality and acceptance rate',
        'Used for appraisals and recognition',
      ],
      voiceOver:
        'Your performance is summarised daily and monthly — tasks done, punctuality and acceptance rate. These reports feed into appraisals and recognition.',
    },
    {
      title: 'Why Logging Matters',
      subtitle: 'For you and the team',
      bullets: [
        'Proof of work — no more being overlooked',
        'Fair workload distribution',
        'Faster theatre turnaround',
        'Cleaner, safer surgical environment',
        'Career growth based on data, not opinion',
      ],
      voiceOver:
        'Logging gives you proof of work, fair distribution and a record that supports your career growth. Log every duty, every time.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 9. THEATRE MEALS
// ─────────────────────────────────────────────────────────────────────────────
const theatreMealsDeck: Deck = buildDeck(
  {
    id: 'theatre-meals',
    title: 'Theatre Meals',
    description: 'How staff request, receive and account for theatre meals.',
    audience: 'All theatre staff, Cafeteria managers',
    icon: '🍽️',
    category: 'Operations',
  },
  [
    {
      title: 'Theatre Meals',
      subtitle: 'Fuel for the team — fairly and transparently',
      bullets: [
        'Request meals before your shift',
        'Track distribution per staff member',
        'Stop double-claims and waste',
        'Cafeteria knows numbers in advance',
      ],
      voiceOver:
        'Theatre Meals is the system for ordering, distributing and accounting for staff meals — fairly, transparently and without waste.',
    },
    {
      title: 'Where to Find It',
      subtitle: 'Dashboard → Theatre Meals',
      bullets: [
        'See today’s meal menu',
        'View your past requests',
        'Tap “Request Meal” to start',
        'Cafeteria manager has the supervisor view',
      ],
      voiceOver:
        'Open Theatre Meals on the dashboard. You see today’s menu, your past requests, and a button to request a new meal.',
    },
    {
      title: 'Step 1 — Place a Request',
      subtitle: 'Pick what and when',
      bullets: [
        'Choose meal type: breakfast, lunch, dinner, night shift',
        'Pick from today’s menu options',
        'Note dietary requirement if any',
        'Submit before the cut-off time',
      ],
      voiceOver:
        'Pick your meal type, choose from today’s menu, note any dietary need and submit before the cut off.',
    },
    {
      title: 'Step 2 — Cafeteria Plans',
      subtitle: 'Numbers ready in advance',
      bullets: [
        'Cafeteria sees total requests live',
        'Plans portions and ingredients accurately',
        'Reduces over-cooking and waste',
        'Special diets prepared separately',
      ],
      voiceOver:
        'The cafeteria sees live numbers, plans portions accurately and prepares special diets separately — far less waste.',
    },
    {
      title: 'Step 3 — Collection',
      subtitle: 'Sign for your meal',
      bullets: [
        'Show your staff code at collection point',
        'Cafeteria attendant scans or types it',
        'Meal marked as DISPENSED',
        'You cannot claim twice in the same window',
      ],
      voiceOver:
        'Collect your meal by showing your staff code. The attendant scans it, marks it dispensed and prevents double claims.',
    },
    {
      title: 'Step 4 — Substitutes',
      subtitle: 'When you cannot collect',
      bullets: [
        'You can authorise a substitute in the app',
        'Substitute shows their own staff code',
        'Audit trail shows the substitution',
        'Common during back-to-back long cases',
      ],
      voiceOver:
        'If you are stuck in a case, authorise a substitute in the app. They collect on your behalf and the substitution is audited.',
    },
    {
      title: 'Special Cases',
      subtitle: 'Emergency teams, long surgeries',
      bullets: [
        'Emergency call-in? Auto meal entitlement',
        'Surgeries over 6 hours? Extra meal generated',
        'Night shift? Extra night meal scheduled',
        'Visiting consultants can be added manually',
      ],
      voiceOver:
        'Emergency call ins, marathon surgeries and night shifts automatically generate extra meal entitlements. Visiting consultants can be added manually.',
    },
    {
      title: 'Reports for Management',
      subtitle: 'Cost control and fairness',
      bullets: [
        'Meals served per day, per shift',
        'Cost per cadre',
        'Waste rate and trends',
        'Inequities flagged for review',
      ],
      voiceOver:
        'Management sees meals served per day, cost per cadre, waste trends and any inequity that needs review.',
    },
    {
      title: 'Tips',
      subtitle: 'Make life easier',
      bullets: [
        'Request the day before for breakfast',
        'Edit your request up to the cut-off',
        'Cancel if your shift changes',
        'Inform cafeteria of allergies in profile',
      ],
      voiceOver:
        'Request the day before, edit before the cut off, cancel if your shift changes, and keep allergy info in your profile.',
    },
    {
      title: 'Benefits',
      subtitle: 'A small thing, done well',
      bullets: [
        'Fair access to meals across cadres',
        'Less food waste, lower cost',
        'No queue confusion at collection',
        'Better team morale on long days',
      ],
      voiceOver:
        'Fair access, less waste, lower cost, no queue confusion and stronger morale on long days. Theatre Meals quietly transforms the working day.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 10. CSSD REPORTS
// ─────────────────────────────────────────────────────────────────────────────
const cssdDeck: Deck = buildDeck(
  {
    id: 'cssd-reports',
    title: 'CSSD Reports',
    description: 'Tracking sterilisation cycles, packs and instrument turnaround.',
    audience: 'CSSD Staff, CSSD Supervisor, Theatre Coordinators',
    icon: '🧼',
    category: 'Reports',
  },
  [
    {
      title: 'CSSD Reports',
      subtitle: 'Sterile, Safe, Traceable',
      bullets: [
        'Track every sterilisation cycle',
        'Log packs issued and returned',
        'Monitor autoclave performance',
        'Build full instrument traceability',
      ],
      voiceOver:
        'CSSD Reports gives you full traceability of sterilisation cycles, packs and instruments — sterile, safe and accountable.',
    },
    {
      title: 'Where to Find It',
      subtitle: 'Dashboard → CSSD',
      bullets: [
        'Live cycle counter on the home view',
        'Tabs: Cycles, Packs, Instruments, Reports',
        'Supervisor view shows daily summary',
        'Tap any cycle for full details',
      ],
      voiceOver:
        'Open CSSD on your dashboard. You see live cycles plus tabs for packs, instruments and reports. Tap any cycle for full detail.',
    },
    {
      title: 'Step 1 — Log a Sterilisation Cycle',
      subtitle: 'Start of every run',
      bullets: [
        'Tap “New Cycle”',
        'Choose autoclave / sterilizer used',
        'Enter temperature and time parameters',
        'Scan or pick the packs loaded',
        'Submit at cycle start',
      ],
      voiceOver:
        'Start every run by logging a new cycle — sterilizer used, parameters set, packs loaded. Submit at cycle start.',
    },
    {
      title: 'Step 2 — Capture Indicators',
      subtitle: 'Biological and chemical',
      bullets: [
        'Tick chemical indicator pass / fail',
        'Log biological indicator results',
        'Attach printout from sterilizer',
        'Reject cycle if any indicator fails',
      ],
      voiceOver:
        'Capture chemical and biological indicators. Attach the printout. Reject the cycle if any indicator fails — never compromise.',
    },
    {
      title: 'Step 3 — Issue Packs',
      subtitle: 'To theatre or sub-store',
      bullets: [
        'Pick the destination (theatre / sub-store)',
        'Scan or select pack identifiers',
        'Receiver signs in the app',
        'Movement appears on live board',
      ],
      voiceOver:
        'Issue packs to theatre or sub store. The receiver signs in the app and the movement appears on the live board.',
    },
    {
      title: 'Step 4 — Return & Re-cycle',
      subtitle: 'After surgery',
      bullets: [
        'Used packs returned by theatre staff',
        'Condition logged: complete, incomplete, damaged',
        'Missing instruments raise a query',
        'Pack queued for the next cycle',
      ],
      voiceOver:
        'After surgery, returned packs are logged for completeness and condition. Missing instruments raise a query, then the pack queues for the next cycle.',
    },
    {
      title: 'Instrument Audit',
      subtitle: 'Per-instrument history',
      bullets: [
        'Each instrument has its own record',
        'Sterilisation count, last cycle, cases used in',
        'Maintenance / replacement reminders',
        'Lost instruments tagged and investigated',
      ],
      voiceOver:
        'Each instrument has its own record showing sterilisation count, cases used and maintenance reminders. Lost items are tagged and investigated.',
    },
    {
      title: 'Daily Report',
      subtitle: 'What the supervisor sees',
      bullets: [
        'Cycles completed, success rate',
        'Packs issued and returned',
        'Indicator failures and reasons',
        'Sterilizer downtime and maintenance',
      ],
      voiceOver:
        'The supervisor’s daily report shows cycle counts, success rate, indicator failures and downtime — everything needed to run a tight CSSD.',
    },
    {
      title: 'Weekly & Monthly Trends',
      subtitle: 'Drive improvement',
      bullets: [
        'Track failure rates over time',
        'Compare autoclave performance',
        'Workload by shift and staff',
        'Export PDF/Excel for audits',
      ],
      voiceOver:
        'Weekly and monthly trends drive improvement — failure rates, autoclave performance and staff workload — exportable for audits.',
    },
    {
      title: 'Benefits',
      subtitle: 'Why we log it all',
      bullets: [
        'Zero ambiguity around sterility',
        'Faster pack turnaround for theatre',
        'Stronger infection-control evidence',
        'Smarter equipment investment decisions',
        'Compliance with national CSSD standards',
      ],
      voiceOver:
        'Zero ambiguity, faster turnaround, stronger infection control and smarter investments — and full compliance with national CSSD standards.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 11. OXYGEN REPORTS
// ─────────────────────────────────────────────────────────────────────────────
const oxygenDeck: Deck = buildDeck(
  {
    id: 'oxygen-reports',
    title: 'Oxygen Reports',
    description: 'Tracking oxygen levels, supply and emergency cylinder use.',
    audience: 'Oxygen Unit Supervisor, Anaesthetic Technicians',
    icon: '🫁',
    category: 'Support Services',
  },
  [
    {
      title: 'Oxygen Reports',
      subtitle: 'Never run out. Never guess.',
      bullets: [
        'Live oxygen tank and manifold readings',
        'Cylinder inventory tracking',
        'Consumption per theatre per day',
        'Early-warning alerts on low levels',
      ],
      voiceOver:
        'Oxygen Reports gives the theatre live readings, cylinder inventory and early warning alerts — so we never run out and never have to guess.',
    },
    {
      title: 'Where to Find It',
      subtitle: 'Dashboard → Oxygen Control',
      bullets: [
        'Live tank level gauge',
        'Manifold pressure per zone',
        'Cylinders in stock and in use',
        'Alert badges in red when low',
      ],
      voiceOver:
        'Open Oxygen Control. You see tank levels, manifold pressure per zone and cylinders in stock or in use. Low levels glow red.',
    },
    {
      title: 'Step 1 — Daily Readings',
      subtitle: 'Capture at every shift',
      bullets: [
        'Tap “New Reading”',
        'Enter main tank level (in litres or PSI)',
        'Enter pressure for each manifold',
        'Note any abnormal reading',
        'Submit — supervisor is alerted if low',
      ],
      voiceOver:
        'At every shift, capture a new reading — main tank, manifold pressures, anything abnormal. The supervisor is alerted if levels are low.',
    },
    {
      title: 'Step 2 — Cylinder Movements',
      subtitle: 'In, out, refilled',
      bullets: [
        'Log new cylinders received',
        'Log cylinders deployed to theatres or wards',
        'Log empties returned for refill',
        'Each cylinder has a serial number',
      ],
      voiceOver:
        'Log every cylinder movement — received, deployed, returned for refill. Each cylinder is tracked by serial number.',
    },
    {
      title: 'Step 3 — Faults & Maintenance',
      subtitle: 'Report immediately',
      bullets: [
        'Report leak, regulator fault, valve issue',
        'Photo upload supported',
        'Works supervisor notified instantly',
        'Theatre supervisor sees risk badge',
      ],
      voiceOver:
        'Report faults instantly — leaks, regulators, valves — with photos. The works team and theatre supervisor are alerted at once.',
    },
    {
      title: 'Low-Level Alerts',
      subtitle: 'Multi-tier escalation',
      bullets: [
        'Yellow — refill needed within 24 hours',
        'Orange — refill needed today',
        'Red — emergency: surgeries may be paused',
        'Alerts go to oxygen, works and CMD',
      ],
      voiceOver:
        'Alerts escalate from yellow to orange to red. A red alert can pause surgeries and notifies oxygen, works and management together.',
    },
    {
      title: 'Emergency Cylinders',
      subtitle: 'For unscheduled surges',
      bullets: [
        'Tap “Deploy Emergency Cylinder”',
        'Choose theatre and reason',
        'Voice prompt plays in destination',
        'Movement logged with timestamps',
      ],
      voiceOver:
        'During surges, tap Deploy Emergency Cylinder. A voice prompt plays at the destination and the movement is logged.',
    },
    {
      title: 'Daily Report',
      subtitle: 'What management sees',
      bullets: [
        'Tank levels over 24 hours',
        'Consumption per theatre',
        'Cylinder utilisation',
        'Faults raised and resolved',
      ],
      voiceOver:
        'The daily report shows tank trends, consumption per theatre, cylinder use and faults raised — at a glance.',
    },
    {
      title: 'Procurement Insight',
      subtitle: 'Order before you need it',
      bullets: [
        'Forecast based on weekly trend',
        'Auto-suggested reorder quantity',
        'Track supplier delivery times',
        'Cost per litre tracked over time',
      ],
      voiceOver:
        'Procurement gets forecasts based on weekly trends, auto suggested reorder quantities and supplier delivery times.',
    },
    {
      title: 'Benefits',
      subtitle: 'Patient safety first',
      bullets: [
        'No surgeries cancelled for oxygen',
        'Faster fault resolution',
        'Lower cost through better planning',
        'Stronger safety culture',
      ],
      voiceOver:
        'No oxygen related cancellations, faster fault resolution, lower cost and a stronger safety culture. Patient safety, first.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 12. LAUNDRY REPORTS
// ─────────────────────────────────────────────────────────────────────────────
const laundryDeck: Deck = buildDeck(
  {
    id: 'laundry-reports',
    title: 'Laundry Reports',
    description: 'Linen tracking from collection to return — clean, counted, costed.',
    audience: 'Laundry Staff, Laundry Supervisor',
    icon: '👕',
    category: 'Support Services',
  },
  [
    {
      title: 'Laundry Reports',
      subtitle: 'Linen on time, every time',
      bullets: [
        'Track soiled linen collected per theatre',
        'Track clean linen delivered',
        'Detect loss and damage',
        'Forecast demand for restocking',
      ],
      voiceOver:
        'Laundry Reports tracks soiled linen out, clean linen in, loss and damage — and forecasts demand. Clean, counted and costed.',
    },
    {
      title: 'Where to Find It',
      subtitle: 'Dashboard → Laundry',
      bullets: [
        'Today’s collection schedule',
        'Pending deliveries',
        'Loss / damage register',
        'Supervisor analytics view',
      ],
      voiceOver:
        'Open Laundry on your dashboard. You see today’s collection schedule, pending deliveries and the loss register.',
    },
    {
      title: 'Step 1 — Collection',
      subtitle: 'From each theatre',
      bullets: [
        'Tap “Log Collection”',
        'Choose theatre / area',
        'Count items by type: gown, drape, sheet',
        'Note heavily soiled or contaminated items',
        'Receiver signs and submits',
      ],
      voiceOver:
        'For collection, pick the theatre, count items by type, note contamination and submit. Both staff sign on the device.',
    },
    {
      title: 'Step 2 — Processing',
      subtitle: 'In the laundry',
      bullets: [
        'Log machine cycles started',
        'Capture detergent and disinfectant batches',
        'Record temperature and duration',
        'Flag items requiring special treatment',
      ],
      voiceOver:
        'In the laundry, log machine cycles, detergents, temperatures and any item needing special treatment.',
    },
    {
      title: 'Step 3 — Delivery',
      subtitle: 'Clean linen back to theatre',
      bullets: [
        'Tap “Log Delivery”',
        'Choose destination theatre or store',
        'Count clean items delivered',
        'Receiver signs the digital docket',
      ],
      voiceOver:
        'When clean linen returns, log delivery to theatre or store. The receiver signs the digital docket and counts are recorded.',
    },
    {
      title: 'Step 4 — Loss & Damage',
      subtitle: 'Account for every item',
      bullets: [
        'Items not returned → automatic loss query',
        'Damaged items logged with photo',
        'Replacement requests sent to procurement',
        'Audit trail per theatre',
      ],
      voiceOver:
        'Any item that does not come back becomes a loss query. Damaged items are photographed and replacement requests go to procurement.',
    },
    {
      title: 'Stock View',
      subtitle: 'What is available right now',
      bullets: [
        'Total clean items in store',
        'Items per theatre par level',
        'Items expected back today',
        'Low-stock alerts',
      ],
      voiceOver:
        'The stock view shows total clean items, par levels per theatre, items expected back and low stock alerts.',
    },
    {
      title: 'Reports & Trends',
      subtitle: 'For supervisors and management',
      bullets: [
        'Daily turnover per theatre',
        'Loss rate and root causes',
        'Machine cycle costs',
        'Restock forecast',
      ],
      voiceOver:
        'Supervisor reports show turnover per theatre, loss rates, cycle costs and restock forecasts.',
    },
    {
      title: 'Special Handling',
      subtitle: 'Infectious and bloodied items',
      bullets: [
        'Tag as INFECTIOUS or HIGHLY_SOILED',
        'Routed through a separate cycle',
        'Staff handling them prompted to PPE up',
        'Recorded for infection-control audit',
      ],
      voiceOver:
        'Infectious and heavily soiled items are tagged, routed separately, and the system reminds staff to put on PPE. Records support infection control audits.',
    },
    {
      title: 'Benefits',
      subtitle: 'Linen done right',
      bullets: [
        'No more missing gowns mid-surgery',
        'Fewer disputes about losses',
        'Lower cost through correct cycle sizing',
        'Safer infection-control practice',
      ],
      voiceOver:
        'No more missing gowns, fewer disputes, lower cost and safer practice. Laundry done right keeps theatre moving.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 13. POWER STATUS REPORT
// ─────────────────────────────────────────────────────────────────────────────
const powerDeck: Deck = buildDeck(
  {
    id: 'power-status',
    title: 'Power Status Reports',
    description: 'Mains, generator and UPS readiness across theatre complexes.',
    audience: 'Power Plant Operator, Works Supervisor, Theatre Manager',
    icon: '⚡',
    category: 'Support Services',
  },
  [
    {
      title: 'Power Status',
      subtitle: 'Theatre needs power. Always.',
      bullets: [
        'Live mains, generator and UPS view',
        'Outage logging with duration',
        'Fuel level tracking',
        'Auto-alert when running on backup',
      ],
      voiceOver:
        'Power Status keeps theatre lit. Live mains, generator and UPS view, outage logging, fuel tracking and automatic alerts when on backup.',
    },
    {
      title: 'Where to Find It',
      subtitle: 'Dashboard → Power House',
      bullets: [
        'Status panel: Mains / Generator / UPS',
        'Fuel and battery gauges',
        'Recent outage log',
        'Operator action buttons',
      ],
      voiceOver:
        'Open Power House on your dashboard. You see status panels for mains, generator and UPS, plus fuel and battery gauges.',
    },
    {
      title: 'Step 1 — Shift Reading',
      subtitle: 'Capture at handover',
      bullets: [
        'Tap “New Reading”',
        'Mark mains UP or DOWN',
        'Generator status and run hours',
        'Diesel level (litres)',
        'UPS health and battery percentage',
      ],
      voiceOver:
        'At every handover, capture a new reading — mains status, generator hours, diesel level and UPS health.',
    },
    {
      title: 'Step 2 — Log Outage',
      subtitle: 'When mains drops',
      bullets: [
        'Tap “Log Outage”',
        'Choose start time (or “now”)',
        'Capture source (Mains, Generator, UPS)',
        'Affected theatres auto-detected',
        'Voice broadcast plays in affected zones',
      ],
      voiceOver:
        'When mains drops, log the outage. The system identifies affected theatres and broadcasts a voice alert in those zones.',
    },
    {
      title: 'Step 3 — Restore Power',
      subtitle: 'Close the incident',
      bullets: [
        'Tap “Restore Power”',
        'System computes downtime automatically',
        'Add notes on root cause',
        'Outage closed — alerts cleared',
      ],
      voiceOver:
        'When power returns, tap Restore. The system computes downtime, you add the root cause and the alert clears.',
    },
    {
      title: 'Generator Operation',
      subtitle: 'Plan and protect the asset',
      bullets: [
        'Scheduled test-runs logged',
        'Service due reminders',
        'Run-hours by generator',
        'Refuelling logs with quantity & supplier',
      ],
      voiceOver:
        'Generator operation is fully logged — test runs, service due, run hours per generator and every refuelling event.',
    },
    {
      title: 'UPS Monitoring',
      subtitle: 'For critical equipment',
      bullets: [
        'Battery health snapshots',
        'Load percentage by zone',
        'Predicted minutes-on-battery',
        'Replacement reminders',
      ],
      voiceOver:
        'UPS monitoring shows battery health, load per zone, predicted backup minutes and replacement reminders for ageing batteries.',
    },
    {
      title: 'Daily Report',
      subtitle: 'Stability at a glance',
      bullets: [
        'Total uptime % per theatre',
        'Outage count and duration',
        'Generator fuel used',
        'UPS events and battery dips',
      ],
      voiceOver:
        'The daily report shows uptime percentage per theatre, outage counts, generator fuel use and UPS events.',
    },
    {
      title: 'Procurement & Maintenance',
      subtitle: 'Stay ahead of failure',
      bullets: [
        'Fuel reorder forecast',
        'Service-due heatmap by generator',
        'Battery replacement schedule',
        'Vendor performance ranking',
      ],
      voiceOver:
        'Procurement and maintenance receive forecasts, service due heatmaps, battery replacement schedules and vendor performance ranking.',
    },
    {
      title: 'Benefits',
      subtitle: 'Lights stay on',
      bullets: [
        'No surgeries lost to power',
        'Faster diagnosis when mains drops',
        'Right-sized fuel orders',
        'Stronger evidence for capital investment',
      ],
      voiceOver:
        'No surgeries lost to power, faster diagnosis, right sized fuel orders and stronger evidence for capital investment in the power plant.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 14. ANAESTHETIC SETUP
// ─────────────────────────────────────────────────────────────────────────────
const anaestheticSetupDeck: Deck = buildDeck(
  {
    id: 'anaesthetic-setup',
    title: 'Anaesthetic Setup',
    description: 'Daily and per-case anaesthesia machine and drug-tray readiness checks.',
    audience: 'Anaesthetic Technicians, Anaesthetists',
    icon: '🧪',
    category: 'Clinical',
  },
  [
    {
      title: 'Anaesthetic Setup',
      subtitle: 'Machine, drugs, monitors — every case',
      bullets: [
        'Daily machine check captured digitally',
        'Per-case tray verification',
        'Drug stocks logged at start and end',
        'Faults raised on the spot',
      ],
      voiceOver:
        'Anaesthetic Setup is the digital record of machine checks, drug trays and monitors — every day, every case.',
    },
    {
      title: 'Where to Find It',
      subtitle: 'Dashboard → Anaesthesia Setup',
      bullets: [
        'Today’s machine checks per theatre',
        'Pending case setups',
        'Last completed setup and technician',
        'Action buttons to start a new setup',
      ],
      voiceOver:
        'Open Anaesthesia Setup on your dashboard. You see today’s machine checks, pending case setups and the last completed setup.',
    },
    {
      title: 'Step 1 — Daily Machine Check',
      subtitle: 'Start of the shift',
      bullets: [
        'Tap “New Daily Check”',
        'Choose theatre and anaesthesia machine',
        'Run through the checklist: power, gas, suction, vent',
        'Test alarms, CO2 absorbent, breathing system',
        'Submit — signed and timestamped',
      ],
      voiceOver:
        'At the start of every shift, run a daily check — power, gas, suction, ventilator, alarms, CO2 absorbent. Submit and it is timestamped.',
    },
    {
      title: 'Step 2 — Per-Case Setup',
      subtitle: 'Just before the patient',
      bullets: [
        'Open the case in the dashboard',
        'Choose the prescribed anaesthesia plan',
        'Draw up drugs per plan, label syringes',
        'Set monitors: ECG, NIBP, SpO2, EtCO2, BIS',
        'Tick each ready item; add notes if needed',
      ],
      voiceOver:
        'Per case, pick the prescribed plan, draw up drugs, label syringes and prepare monitors. Tick each ready item with notes if needed.',
    },
    {
      title: 'Step 3 — Drug Tray',
      subtitle: 'Counted and recorded',
      bullets: [
        'List drugs, doses and quantities loaded',
        'Narcotics flagged with controlled handling',
        'Witness signature required for narcotics',
        'Tray photo can be attached',
      ],
      voiceOver:
        'Record the drug tray — every drug and dose. Narcotics need a witness signature and you can attach a tray photo.',
    },
    {
      title: 'Step 4 — Difficult-Airway Kit',
      subtitle: 'Pre-arranged when flagged',
      bullets: [
        'If review flagged difficult airway, kit is pre-listed',
        'Confirm each item is at the trolley',
        'Video laryngoscope battery checked',
        'Bougie, LMA, surgical airway tray present',
      ],
      voiceOver:
        'If the review flagged a difficult airway, the kit is pre listed. Confirm every item is at the trolley — including a charged video laryngoscope.',
    },
    {
      title: 'Step 5 — Fault Reporting',
      subtitle: 'Anything broken',
      bullets: [
        'Tap “Report Fault”',
        'Category: ventilator, monitor, suction, vapouriser',
        'Severity: low / medium / critical',
        'Photo and free text',
        'Works team notified immediately',
      ],
      voiceOver:
        'For any fault, tap Report Fault, pick severity and add a photo. Works are notified immediately.',
    },
    {
      title: 'Step 6 — End-of-Case Reconciliation',
      subtitle: 'Close the tray',
      bullets: [
        'Mark drugs administered',
        'Mark drugs returned to pharmacy',
        'Witness narcotic returns',
        'Equipment cleaned and parked',
      ],
      voiceOver:
        'After the case, reconcile the tray — administered, returned, narcotic witnesses — and confirm equipment is cleaned and parked.',
    },
    {
      title: 'Daily Report',
      subtitle: 'Supervisor view',
      bullets: [
        'Machine checks completed per theatre',
        'Faults raised and resolution time',
        'Drug usage by case and class',
        'Narcotic register summary',
      ],
      voiceOver:
        'The supervisor sees machine checks per theatre, faults and resolution times, drug usage and the narcotic register summary.',
    },
    {
      title: 'Benefits',
      subtitle: 'Safer anaesthesia, faster turnover',
      bullets: [
        'Zero ambiguity at handover',
        'Faster fault resolution',
        'Narcotic accountability built in',
        'Better data for equipment investment',
      ],
      voiceOver:
        'Anaesthetic Setup delivers safer anaesthesia, faster turnover, full narcotic accountability and the data needed for smart investment.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 15. DUTY ROSTER ENTRY
// ─────────────────────────────────────────────────────────────────────────────
const rosterDeck: Deck = buildDeck(
  {
    id: 'duty-roster',
    title: 'Duty Roster Entry',
    description: 'Creating, editing and publishing the staff duty roster.',
    audience: 'Theatre Coordinators, Supervisors, Admins',
    icon: '📋',
    category: 'Operations',
  },
  [
    {
      title: 'Duty Roster',
      subtitle: 'The right people, in the right place, at the right time',
      bullets: [
        'Plan shifts weeks ahead',
        'Match staff to skill and unit',
        'Avoid clashes and overtime traps',
        'Publish once, visible to everyone',
      ],
      voiceOver:
        'The Duty Roster module puts the right people, in the right place, at the right time — planned weeks ahead, visible to everyone.',
    },
    {
      title: 'Where to Find It',
      subtitle: 'Dashboard → Roster',
      bullets: [
        'Weekly grid view by default',
        'Filter by unit, role or theatre',
        'Toggle Day / Week / Month',
        'Templates panel for repeating patterns',
      ],
      voiceOver:
        'Open Roster on the dashboard. By default you see the weekly grid. Filter by unit, role or theatre and toggle Day, Week or Month.',
    },
    {
      title: 'Step 1 — Choose a Template',
      subtitle: 'Re-use what works',
      bullets: [
        'Open Templates panel',
        'Pick a published template (e.g. “Standard week”)',
        'Adjust dates to apply',
        'Templates pre-fill 80% of the grid',
      ],
      voiceOver:
        'Start with a template — they pre fill most of the grid. Pick one, set the date range, and the heavy lifting is done.',
    },
    {
      title: 'Step 2 — Assign Staff to Slots',
      subtitle: 'Drag, drop, click',
      bullets: [
        'Click an empty slot',
        'Pick role: surgeon, anaesthetist, nurse, porter, cleaner',
        'Choose the staff member from filtered list',
        'Pick shift: AM, PM, NIGHT, ON-CALL',
        'Save — instant publication is optional',
      ],
      voiceOver:
        'Click an empty slot, pick the role, choose the staff member and select the shift. Save when ready.',
    },
    {
      title: 'Step 3 — Validate Conflicts',
      subtitle: 'The system catches mistakes',
      bullets: [
        'Double-booking flagged in red',
        'Back-to-back shifts warned',
        'Required cover gaps highlighted',
        'Skill gaps (e.g. no scrub nurse) flagged',
      ],
      voiceOver:
        'The system flags conflicts in red — double bookings, back to back shifts, coverage gaps and missing skills. Fix them before publishing.',
    },
    {
      title: 'Step 4 — Publish',
      subtitle: 'Notify the whole team',
      bullets: [
        'Tap “Publish Roster”',
        'Notifications go to every assigned staff',
        'Roster appears on each person’s dashboard',
        'Changes after publishing trigger an alert',
      ],
      voiceOver:
        'Tap Publish. Every assigned staff member gets a notification and the roster appears on their dashboard. Later changes trigger fresh alerts.',
    },
    {
      title: 'Step 5 — Last-Minute Changes',
      subtitle: 'Swaps and stand-ins',
      bullets: [
        'Click a published slot to amend',
        'Choose reason: leave, illness, swap',
        'Auto-suggested replacements based on availability',
        'Both parties notified of the swap',
      ],
      voiceOver:
        'Last minute, click any slot to amend. Pick a reason, accept a suggested replacement and both parties are notified instantly.',
    },
    {
      title: 'Leave & Availability',
      subtitle: 'Built into the same place',
      bullets: [
        'Staff submit leave from their dashboard',
        'Supervisors approve in the roster view',
        'Approved leave blocks future assignments',
        'Unavailable staff hidden from suggestions',
      ],
      voiceOver:
        'Leave is integrated. Staff request from their dashboard, you approve in the roster, and the system stops suggesting them while they are off.',
    },
    {
      title: 'Reports',
      subtitle: 'Visibility for management',
      bullets: [
        'Hours scheduled per staff per week',
        'Overtime tracking',
        'Coverage rate per unit / theatre',
        'Last-minute change frequency',
      ],
      voiceOver:
        'Reports show hours scheduled per staff, overtime, coverage rate and how often last minute changes happen.',
    },
    {
      title: 'Benefits',
      subtitle: 'Fair, fast, transparent',
      bullets: [
        'No more pen-and-paper confusion',
        'Fewer no-shows — alerts hit every device',
        'Fair workload distribution',
        'Faster swap resolution',
        'Audit trail for HR and payroll',
      ],
      voiceOver:
        'No paper confusion, fewer no shows, fair workload, faster swaps and a complete audit trail for HR and payroll. Roster done right.',
    },
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Export all decks
// ─────────────────────────────────────────────────────────────────────────────
export const DECKS: Deck[] = [
  visionDeck,
  surgeryBookingDeck,
  pharmacyDeck,
  preopReviewDeck,
  preopVisitDeck,
  callForPatientDeck,
  holdingAreaDeck,
  transfersDeck,
  dutyLogDeck,
  theatreMealsDeck,
  cssdDeck,
  oxygenDeck,
  laundryDeck,
  powerDeck,
  anaestheticSetupDeck,
  rosterDeck,
];

export const getDeck = (id: string): Deck | undefined => DECKS.find((d) => d.id === id);
