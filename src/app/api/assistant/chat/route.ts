import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const askSchema = z.object({
  question: z.string().min(1),
  contextPath: z.string().optional(),
  channel: z.enum(['TEXT', 'VOICE']).optional(),
});

interface KbEntry {
  topic: string;          // short label (used in suggestions / fallback)
  keywords: string[];     // lowercased tokens / phrases
  answer: string;
  followups?: string[];
}

/* ------------------------------------------------------------------ *
 * Knowledge base
 * ------------------------------------------------------------------ *
 * Each entry should answer ONE intent. Keywords are matched case-
 * insensitive as substrings; longer keywords win on ties. Add new
 * entries freely — no other code change required.
 * ------------------------------------------------------------------ */
const KB: KbEntry[] = [
  /* ───────────── Overview / Help ───────────── */
  {
    topic: 'What this app does',
    keywords: ['what is this', 'what does this app do', 'about the app', 'overview', 'introduce', 'introduction'],
    answer:
      'UNTH Theatre Operative Resource Manager is the Theatre Department\'s end-to-end operations platform. It covers patient & surgery management, the WHO surgical safety workflow, anaesthesia and prescriptions, blood and lab requests, theatre allocation & readiness, sub-store inventory, equipment checkout, emergency bookings, PACU & transfers, mortality registry, incident & fault reporting, staff roster, support services (CSSD, laundry, power, water, oxygen), real-time radio announcements, and reporting dashboards. Sign in, then use the side menu — items shown depend on your role.',
  },
  {
    topic: 'Capabilities',
    keywords: ['help', 'what can you do', 'capabilities', 'how can you help', 'features', 'menu'],
    answer:
      'I can guide you through every module: Patients, Surgeries, Theatres, Theatre Setup & Readiness, Holding Area, Anaesthesia, Prescriptions, Blood Bank, Emergency Lab Workup, PACU, Transfers, Roster, CSSD, Laundry, Power House, Plumbing/Water, Oxygen, Sub-Stores, Equipment Checkout, Inventory, Incidents, Fault Alerts, Anonymous Tips, Mortality, Live Monitoring, Reports, Radio Service, and Admin/Users. Ask things like "how do I book an emergency", "how do I do an AM check", "how do I run a count?", "what is SBAR handover", or "show available theatres".',
  },

  /* ───────────── Auth & Roles ───────────── */
  {
    topic: 'Login / sign in',
    keywords: ['login', 'log in', 'sign in', 'cannot login', "can't login", 'password', 'forgot password'],
    answer:
      'Use your staff username and password on the login page. Accounts are created/approved by an Admin (status PENDING → APPROVED). If you forgot your password, contact a Theatre Admin to reset it from Admin → Users. After 5 failed attempts your account may be temporarily locked.',
  },
  {
    topic: 'Roles and permissions',
    keywords: ['role', 'roles', 'permission', 'permissions', 'access', "can't see menu", 'menu missing'],
    answer:
      'Menu items are role-filtered. Common roles: ADMIN, THEATRE_MANAGER, CMAC/DC_MAC, ANAESTHETIST, SURGEON, PERIOPERATIVE_NURSE, ANAESTHETIC_TECHNICIAN, SCRUB_NURSE, RECOVERY_NURSE, PHARMACIST, PORTER, CLEANER, BIOMEDICAL_ENGINEER, SECURITY, CSSD_STAFF, LAUNDRY_STAFF, POWER_HOUSE, PLUMBER, OXYGEN_TECHNICIAN. If you cannot see a module you should have, ask an admin to verify your role and approval status under Admin → Users.',
  },
  {
    topic: 'Approve a new user',
    keywords: ['approve user', 'pending user', 'new staff', 'register staff', 'create user', 'add user'],
    answer:
      'Admin → Users. Staff who self-register show as PENDING. Open the row → assign role and theatre/department → click Approve. The user can then sign in. Admins can also Suspend/Reject and reset passwords from the same screen.',
  },
  {
    topic: 'Staff codes',
    keywords: ['staff code', 'staff id', 'code for porter', 'badge code', 'pin code'],
    answer:
      'Each staff member has a Staff Code used for quick actions (porter starts transport, cleaner starts cleaning, scrub nurse counts, etc.). Generate or view from Admin → Users. Codes are short and unique per role.',
  },

  /* ───────────── Patients ───────────── */
  {
    topic: 'Register a patient',
    keywords: ['register patient', 'add patient', 'new patient', 'create patient', 'patient registration'],
    answer:
      'Patients → New Patient. Capture name, folder number, age/DOB, sex, ward, diagnosis and contact. The folder number is the unique key used everywhere (transfers, surgeries, blood, lab, prescriptions). Save to enable scheduling a surgery.',
  },
  {
    topic: 'Find a patient',
    keywords: ['find patient', 'search patient', 'patient lookup', 'patient by folder'],
    answer:
      'Patients → use the search bar. You can search by name or folder number. Click a patient to view their full surgical history, transfers, prescriptions, lab and blood requests.',
  },
  {
    topic: 'Pre-op fitness assessment',
    keywords: ['fitness', 'pre-op assessment', 'preop assessment', 'asa', 'asa grade'],
    answer:
      'Open the patient → Pre-Op Fitness. Record ASA grade, comorbidities, allergies, current medications, fasting status, consent. Anaesthetist completes the Pre-Operative Visit / Pre-Op Review which feeds the WHO Sign-In checklist.',
  },

  /* ───────────── Surgery scheduling ───────────── */
  {
    topic: 'Schedule a surgery',
    keywords: ['schedule surgery', 'book surgery', 'add surgery', 'new case', 'add case', 'list a case'],
    answer:
      'Surgeries → New Surgery. Select patient, procedure, primary surgeon, anaesthetist, theatre suite, scheduled date/time and urgency (ELECTIVE/URGENT/EMERGENCY). The case appears on the Theatre Allocation Schedule and the surgical team\'s board.',
  },
  {
    topic: 'Cancel a surgery',
    keywords: ['cancel surgery', 'cancel case', 'cancellation', 'postpone'],
    answer:
      'Open the surgery → Cancel. Choose a reason (clinical, logistical, equipment, patient-request, etc.) and add notes. The cancellation is logged in Cancellations and notifies the team. Patients moved off-list need rescheduling from Surgeries.',
  },
  {
    topic: 'Surgery statuses',
    keywords: ['surgery status', 'case status', 'in progress', 'completed', 'pending'],
    answer:
      'A surgery moves through SCHEDULED → CHECKED_IN → IN_HOLDING → IN_THEATRE → IN_PROGRESS → COMPLETED → IN_RECOVERY → DISCHARGED_FROM_THEATRE. Cancellations and emergencies have their own statuses. Each transition is timestamped and audited.',
  },

  /* ───────────── Emergency booking ───────────── */
  {
    topic: 'Book an emergency case',
    keywords: ['emergency', 'book emergency', 'urgent case', 'emergency booking', 'red alert'],
    answer:
      'Emergency Booking → New Emergency. Pick the patient (or create one quickly), state the indication, set urgency (EMERGENCY/RED_ALERT), choose a theatre and ETA. The Theatre Manager, on-call CMAC/DC-MAC, anaesthetist and scrub nurse get instant notifications, and an EMERGENCY radio announcement plays — overriding music and routine playback.',
  },
  {
    topic: 'Emergency alerts',
    keywords: ['emergency alert', 'red alert', 'panic', 'mass casualty'],
    answer:
      'Emergency Alerts shows live alerts (red alerts, mass casualty, security incidents). Click an alert to acknowledge and assign a response team. Acknowledgement times feed monthly performance reports.',
  },

  /* ───────────── Theatres & allocation ───────────── */
  {
    topic: 'Available theatres',
    keywords: ['available theatres', 'free theatre', 'theatre available', 'show theatres', 'list theatres', 'which theatre'],
    answer:
      'Theatres shows all 14 suites with status (AVAILABLE / IN_USE / CLEANING / CLOSED / FAULT). Open the Theatre Allocation Schedule to see today\'s bookings and free slots. Allocations are managed by the Theatre Manager and CMAC.',
  },
  {
    topic: 'Theatre setup log',
    keywords: ['theatre setup', 'setup log', 'set up theatre', 'prepare theatre'],
    answer:
      'Theatre Setup → choose theatre → log items prepared (table, monitors, suction, diathermy, light, anaesthesia machine, drugs, instruments). Geolocation is captured automatically. The Setup feeds Theatre Readiness.',
  },
  {
    topic: 'Theatre readiness',
    keywords: ['readiness', 'theatre ready', 'is the theatre ready', 'readiness report'],
    answer:
      'Theatre Readiness aggregates: setup log, CSSD trays delivered, equipment status, cleaning log, anaesthesia setup, blood/drugs in fridge, and pending faults. A theatre is READY only when all components are green.',
  },
  {
    topic: 'Holding area',
    keywords: ['holding area', 'pre-op holding', 'patient ready'],
    answer:
      'Holding Area lists patients checked in and awaiting theatre. Mark Sign-In complete (WHO checklist), confirm consent, IV access, fasting and site-marking. When the theatre is ready, transfer to theatre — the radio will call the team.',
  },

  /* ───────────── WHO surgical safety checklist ───────────── */
  {
    topic: 'WHO checklist',
    keywords: ['who checklist', 'safety checklist', 'sign in', 'time out', 'sign out', 'time-out'],
    answer:
      'Checklists → WHO Surgical Safety Checklist. Three phases: Sign-In (before anaesthesia: identity, consent, site, allergies, airway, blood loss risk), Time-Out (before incision: team intro, antibiotics, imaging, critical events), Sign-Out (before patient leaves: counts, specimen labelling, equipment issues, recovery plan). Each item is timestamped and signed.',
  },
  {
    topic: 'Counts (swabs/instruments)',
    keywords: ['count', 'swab count', 'instrument count', 'needle count', 'sponge count'],
    answer:
      'Scrub nurses record counts at three moments: initial, before closing, and final. Open the surgery → Counts panel. Any discrepancy must be resolved before Sign-Out. All counts are audited.',
  },

  /* ───────────── Anaesthesia & timing ───────────── */
  {
    topic: 'Anaesthesia setup',
    keywords: ['anaesthesia setup', 'anesthesia setup', 'anaesthetic machine', 'check anaesthesia'],
    answer:
      'Anaesthesia Setup → choose theatre → log machine check (leak, soda lime, vapouriser, monitors, suction, intubation kit, emergency drugs, defibrillator). The anaesthetist signs off; this feeds Theatre Readiness.',
  },
  {
    topic: 'Surgery timing',
    keywords: ['knife on skin', 'start surgery', 'incision time', 'timing'],
    answer:
      'Open the surgery → Timing. Record Patient In Room, Anaesthesia Start, Knife on Skin (Incision), Procedure End, Patient Out, Recovery In/Out. Knife-on-Skin auto-broadcasts on the radio. End-of-Surgery auto-calls porters and cleaners until acknowledged.',
  },
  {
    topic: 'End of surgery',
    keywords: ['end of surgery', 'finish surgery', 'close case', 'procedure end'],
    answer:
      'In the Timing panel click "Procedure End / End of Surgery". The radio announces completion with duration, then automatically calls porters (to move the patient) and cleaners (to turn over the theatre) — three times spoken, then repeated every 2 minutes until acknowledged. The Surgery status becomes COMPLETED.',
  },

  /* ───────────── PACU / Recovery / Transfers ───────────── */
  {
    topic: 'Transfer to recovery',
    keywords: ['transfer recovery', 'pacu transfer', 'send to recovery', 'recovery'],
    answer:
      'Transfers → New Transfer → from THEATRE to RECOVERY (PACU). The radio announces the transfer at HIGH priority. PACU nurse opens PACU → admit the patient and start observations.',
  },
  {
    topic: 'PACU observations',
    keywords: ['pacu', 'recovery observations', 'aldrete', 'discharge from recovery'],
    answer:
      'PACU module records vitals, pain score, sedation, nausea, bleeding and Aldrete/PADSS scores at 5/15/30 minute intervals. When discharge criteria are met, transfer to ward with handover.',
  },
  {
    topic: 'Patient transfers (general)',
    keywords: ['transfer patient', 'move patient', 'transfer', 'transfers'],
    answer:
      'Transfers → New Transfer. Pick patient, FROM and TO locations (WARD, HOLDING_AREA, THEATRE_n, RECOVERY, ICU, etc.) and add a note. Every transfer is broadcast on the radio; transfers to RECOVERY are escalated. A porter call is also triggered automatically.',
  },

  /* ───────────── Nurse handover (SBAR) ───────────── */
  {
    topic: 'Nurse handover (SBAR)',
    keywords: ['handover', 'sbar', 'shift handover', 'nurse handover', 'intra-op handover', 'post-op handover', 'theatre to ward'],
    answer:
      'Nurse Handover follows SBAR + WHO. Phases: SHIFT_HANDOVER, INTRA_OP_HANDOVER, POST_OP_HANDOVER, THEATRE_TO_WARD. Complete S (Situation), B (Background), A (Assessment incl. counts/drains/lines), R (Recommendation). Both giving and receiving nurses sign; an audit log records every change.',
  },

  /* ───────────── Prescriptions & medication ───────────── */
  {
    topic: 'Submit a prescription',
    keywords: ['prescription', 'prescribe', 'submit prescription', 'anaesthetic prescription', 'drug order'],
    answer:
      'Prescriptions → New Prescription (opens from a pre-op review or directly). Add medications (drug, dose, route, frequency, duration), indications and special instructions. Submit — pharmacy is alerted on the radio in real time and via Prescription Approvals.',
  },
  {
    topic: 'Approve a prescription',
    keywords: ['approve prescription', 'pharmacy approve', 'prescription approval'],
    answer:
      'Pharmacist role only. Prescription Approvals → open pending → review → Approve / Query / Reject. Approved scripts move to Medication Tracking for collection, administration and reconciliation.',
  },
  {
    topic: 'Medication tracking',
    keywords: ['medication tracking', 'drug administration', 'medication chart', 'reconcile'],
    answer:
      'Medication Tracking shows each prescribed drug through Collected → Administered → Reconciled → Returned (if unused). Anaesthetists/nurses scan the staff code to record each step.',
  },

  /* ───────────── Blood bank ───────────── */
  {
    topic: 'Request blood',
    keywords: ['request blood', 'blood request', 'order blood', 'crossmatch'],
    answer:
      'Blood Bank → New Request. Specify patient, units, blood group/Rh, urgency, indication. The request goes to Blood Bank staff who update status REQUESTED → CROSSMATCHED → READY → DELIVERED → RETURNED. When marked READY, an HIGH-priority radio call goes out and repeats every 4 minutes until acknowledged.',
  },
  {
    topic: 'Blood ready announcement',
    keywords: ['blood ready', 'blood collection', 'collect blood'],
    answer:
      'When the lab marks blood READY, the radio automatically announces: "Blood is ready for collection — patient X, n units of group Y. Send a porter to blood bank." Acknowledge from the radio bar once a porter is dispatched.',
  },

  /* ───────────── Emergency Lab Workup ───────────── */
  {
    topic: 'Emergency lab workup',
    keywords: ['lab', 'lab workup', 'lab request', 'emergency lab', 'laboratory'],
    answer:
      'Emergency Lab Workup → New Request → choose tests (FBC, U&E, LFT, coagulation, blood gas, etc.). When a result is entered, the radio announces it in real time; CRITICAL results trigger an EMERGENCY broadcast that overrides music and repeats every 3 minutes until a clinician acknowledges.',
  },

  /* ───────────── Sub-stores / inventory / equipment ───────────── */
  {
    topic: 'Sub-stores overview',
    keywords: ['sub store', 'substore', 'sub-store', 'theatre store', 'consumables'],
    answer:
      'Each theatre has two sub-stores: Perioperative Nurse and Anaesthetic Technician. Sub-Stores → choose theatre → choose owner. Each has its own stock list, AM check, EOD check, fault reports, transfers in/out and bulk upload.',
  },
  {
    topic: 'AM / EOD check',
    keywords: ['am check', 'eod check', 'morning check', 'end of day', 'daily check'],
    answer:
      'In a sub-store click AM Check on arrival to confirm presence and condition of items; click EOD Check before leaving. Discrepancies create a fault entry and notify the Theatre Manager. AM/EOD compliance is tracked in Reports.',
  },
  {
    topic: 'Report a faulty item',
    keywords: ['fault', 'broken', 'faulty', 'biomedical', 'fault alert', 'item not working'],
    answer:
      'Sub-Stores → find the item → Report Fault → choose severity (LOW/MEDIUM/HIGH/CRITICAL) → describe → submit. Biomedical engineers, the Theatre Manager and admins are notified instantly. Track resolution under Fault Alerts.',
  },
  {
    topic: 'Transfer stock between sub-stores',
    keywords: ['stock transfer', 'transfer stock', 'send stock', 'move item'],
    answer:
      'In a sub-store click Transfer → pick destination sub-store / theatre → quantity → notes. Receiving owner confirms; both inventories update and the action is audited.',
  },
  {
    topic: 'Bulk upload inventory',
    keywords: ['bulk upload', 'excel upload', 'import inventory', 'upload stock'],
    answer:
      'Sub-Stores or Inventory → Bulk Upload → download the Excel template → fill in itemName, category, quantity, unit, expiry, lot, location → upload. The system validates and shows row-level errors before committing.',
  },
  {
    topic: 'Equipment checkout',
    keywords: ['equipment checkout', 'checkout equipment', 'borrow equipment', 'return equipment'],
    answer:
      'Equipment Checkout → scan or pick item → assign to staff/theatre/case. On return scan back in. Overdue items appear in red. Useful for portable monitors, ultrasound, video laryngoscopes, etc.',
  },

  /* ───────────── Radio service ───────────── */
  {
    topic: 'Radio service',
    keywords: ['radio', 'announcement', 'broadcast', 'speak', 'tannoy', 'pa system'],
    answer:
      'The Theatre Radio plays announcements through every connected dashboard. It speaks them aloud and ducks background music. Radio Service → New Announcement → category (EMERGENCY, WORKFLOW, STAFF_REQUEST, INFO, MUSIC), priority, location, message → Broadcast. EMERGENCY overrides routine playback.',
  },
  {
    topic: 'Acknowledge a radio call',
    keywords: ['acknowledge', 'ack', 'porter call', 'cleaner call', 'silence radio'],
    answer:
      'When a STAFF_REQUEST repeats (porter or cleaner), tap the green Acknowledge button on the radio bar at the bottom of the screen and confirm. Your identity and response time are logged. Porter starting transport or cleaner starting cleaning auto-acknowledges the matching call.',
  },
  {
    topic: 'Background music',
    keywords: ['music', 'background music', 'play music', 'mute music'],
    answer:
      'A subtle background music player is available from the radio bar. It auto-hides during announcements and resumes after. Toggle on/off and change volume from the bar.',
  },

  /* ───────────── Roster / staff scheduling ───────────── */
  {
    topic: 'Roster',
    keywords: ['roster', 'duty roster', 'shift', 'schedule staff', 'on call', 'on-call'],
    answer:
      'Roster shows shifts per role per theatre. Theatre Manager publishes weekly/monthly rosters; staff can view their assignments and on-call duty. Swap requests can be raised and approved.',
  },

  /* ───────────── Support services ───────────── */
  {
    topic: 'CSSD',
    keywords: ['cssd', 'sterile', 'sterilisation', 'tray', 'autoclave'],
    answer:
      'CSSD module logs trays in/out, sterilisation cycles (autoclave logs), tray contents and expiry. CSSD Supervisor approves cycles. Theatres request trays which appear on Theatre Readiness when delivered.',
  },
  {
    topic: 'Laundry',
    keywords: ['laundry', 'linen', 'gown', 'drape'],
    answer:
      'Laundry tracks linen sent and received per theatre, with cycle status and shortages. Faults and shortages alert the Theatre Manager.',
  },
  {
    topic: 'Power house',
    keywords: ['power house', 'electricity', 'generator', 'power'],
    answer:
      'Power House logs mains/generator status, fuel level, outage events and switch-overs. Outages create high-priority alerts to leadership and the radio.',
  },
  {
    topic: 'Plumbing / water supply',
    keywords: ['water', 'plumbing', 'water supply', 'leak'],
    answer:
      'Plumbing & Water Supply records tank levels, scrub-sink water pressure, leaks and outages. Faults route to the Plumber and Theatre Manager.',
  },
  {
    topic: 'Oxygen control',
    keywords: ['oxygen', 'o2', 'oxygen supply', 'cylinder', 'manifold'],
    answer:
      'Oxygen Control logs central manifold readings, cylinder counts, line pressures and consumption per theatre. Low pressure or cylinder shortage triggers an EMERGENCY alert. Oxygen Supervisor reviews and approves logs.',
  },

  /* ───────────── Cleaning / Transport (porter) ───────────── */
  {
    topic: 'Porter — start transport',
    keywords: ['porter', 'transport patient', 'wheel patient', 'move patient'],
    answer:
      'Porters use the Call for Patient screen or the radio bar prompt. Enter your staff code → confirm patient → start transport. The pending porter radio call is automatically acknowledged. On arrival, mark Transport Completed.',
  },
  {
    topic: 'Cleaner — start cleaning',
    keywords: ['cleaner', 'clean theatre', 'turnover', 'start cleaning'],
    answer:
      'Cleaners use the Call for Patient / Cleaning screen on the dashboard or the radio bar prompt. Enter staff code → choose theatre → start cleaning. The pending cleaner radio call is auto-acknowledged. On completion, mark Cleaning Completed; the theatre status returns to AVAILABLE.',
  },

  /* ───────────── Incidents / safety ───────────── */
  {
    topic: 'Report incident',
    keywords: ['incident', 'report incident', 'sentinel event', 'near miss', 'adverse event'],
    answer:
      'Incidents → New Incident. Choose type (clinical, equipment, safety, security), severity, persons involved, narrative and immediate actions. Submitted incidents notify CMAC/Manager and feed monthly safety reviews.',
  },
  {
    topic: 'Anonymous tips',
    keywords: ['anonymous tip', 'whistleblower', 'tip-off', 'confidential report'],
    answer:
      'Anonymous Tips lets any staff submit a confidential message to leadership without revealing identity. Used for safety concerns, harassment or governance issues. Reviewed by CMAC.',
  },
  {
    topic: 'Disciplinary queries',
    keywords: ['disciplinary', 'query', 'warning', 'reprimand'],
    answer:
      'Disciplinary Queries (CMAC/CMD/admin) lets leadership issue queries to staff with deadlines and track responses. All actions are audited.',
  },
  {
    topic: 'Mortality registry',
    keywords: ['mortality', 'death', 'morgue', 'mortality registry'],
    answer:
      'Mortality records peri-operative deaths with cause, timing, ASA grade, contributing factors and review status. Used for monthly mortality & morbidity meetings.',
  },

  /* ───────────── Reports & monitoring ───────────── */
  {
    topic: 'Reports',
    keywords: ['report', 'reports', 'analytics', 'statistics', 'kpi', 'dashboard report'],
    answer:
      'Reports has dashboards for theatre utilisation, on-time starts, cancellations, surgery trends, cost breakdowns, mortality, incident & fault rates, AM/EOD compliance, and staff performance. Export to Excel or PDF from the toolbar.',
  },
  {
    topic: 'Live monitoring',
    keywords: ['live monitoring', 'live dashboard', 'real time', 'realtime', 'big screen'],
    answer:
      'Live Monitoring is the wall-display dashboard: every theatre tile shows current case, surgeon, anaesthetist, status, and elapsed time, plus active alerts and the radio queue. Refreshes automatically.',
  },
  {
    topic: 'Anaesthetist board / CMAC / DC-MAC / CMD',
    keywords: ['anaesthetist board', 'cmac', 'dc-mac', 'dcmac', 'cmd', 'leadership board'],
    answer:
      'Role-specific boards: Anaesthetist Board lists today\'s cases assigned to anaesthetists with pre-op status; CMAC and DC-MAC see oversight panels for emergencies, allocation, escalations, and approvals; CMD sees executive KPIs and incidents requiring sign-off.',
  },

  /* ───────────── Misc / admin ───────────── */
  {
    topic: 'Settings',
    keywords: ['settings', 'preferences', 'profile', 'change password'],
    answer:
      'Settings → update your profile, change password, set notification preferences and toggle voice features. Theatre-wide settings (categories, drug list, theatre count) are under Admin.',
  },
  {
    topic: 'Notifications',
    keywords: ['notification', 'notifications', 'bell', 'unread'],
    answer:
      'The bell icon in the header shows unread notifications: new approvals, escalations, faults, prescriptions, blood ready, etc. Click to view; click an item to jump to the source.',
  },
  {
    topic: 'Offline / PWA',
    keywords: ['offline', 'pwa', 'install app', 'no internet'],
    answer:
      'The app is a PWA — install it from your browser menu (Add to Home Screen). Critical screens cache the last known data so you can keep viewing during a brief outage. Writes queue and sync automatically when back online.',
  },
  {
    topic: 'Voice & OCR',
    keywords: ['voice input', 'voice to text', 'ocr', 'scan document'],
    answer:
      'Many forms support voice dictation (mic icon) and OCR (camera/upload icon) to scan handwritten notes or printed labels into text fields. Review the recognised text before saving.',
  },
  {
    topic: 'Audit logs',
    keywords: ['audit', 'audit log', 'history', 'who did what', 'changes log'],
    answer:
      'Every critical action (handover edits, surgery status changes, prescription approvals, role changes, etc.) is recorded in an audit log with user, timestamp and before/after values. Admins can view per-record audit history.',
  },
  {
    topic: 'Report a delay',
    keywords: ['report delay', 'delay', 'late start', 'theatre delay'],
    answer:
      'Open the active surgery → Report Delay → choose category (patient, surgeon, anaesthetist, equipment, CSSD, blood, lab, theatre cleaning, other) → describe → submit. The system records the timestamp and notifies the Theatre Manager. Delays feed the on-time-start KPI in Reports.',
  },
];

/* ------------------------------------------------------------------ *
 * Matcher
 * ------------------------------------------------------------------ */
function score(question: string, entry: KbEntry): number {
  const q = question.toLowerCase();
  let s = 0;
  for (const k of entry.keywords) {
    if (!k) continue;
    if (q.includes(k)) {
      // Phrase match: weight by length + small bonus per hit
      s += k.length + 3;
      // Word-boundary bonus
      const re = new RegExp(`(^|\\W)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`, 'i');
      if (re.test(q)) s += 5;
    }
  }
  return s;
}

function topMatches(question: string, n: number): KbEntry[] {
  return KB
    .map((e) => ({ e, s: score(question, e) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.e);
}

/* ------------------------------------------------------------------ *
 * Live (Prisma-backed) answers
 * ------------------------------------------------------------------ */
async function dynamicAnswer(question: string): Promise<string | null> {
  const q = question.toLowerCase();

  try {
    if (q.includes('how many') && (q.includes('theatre') || q.includes('suite'))) {
      const n = await prisma.theatreSuite.count();
      return `There are ${n} theatre suites configured in the system.`;
    }

    if ((q.includes('available') || q.includes('free')) && q.includes('theatre')) {
      const list = await prisma.theatreSuite.findMany({
        where: { status: 'AVAILABLE' as any },
        select: { name: true, location: true },
        take: 20,
      });
      if (list.length === 0) return 'No theatres are currently marked as available.';
      return `Currently available theatres: ${list.map((t) => t.name).join(', ')}.`;
    }

    if (q.includes('today') && q.includes('surger')) {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      const n = await prisma.surgery.count({ where: { scheduledDate: { gte: start, lt: end } } });
      return `${n} surgeries are scheduled for today.`;
    }

    if (q.includes('today') && (q.includes('emergency') || q.includes('emergencies'))) {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      const n = await prisma.surgery.count({
        where: { scheduledDate: { gte: start, lt: end }, surgeryType: { in: ['EMERGENCY'] as any } },
      });
      return `${n} emergency cases have been booked today.`;
    }

    if (q.includes('pending') && q.includes('user')) {
      const n = await prisma.user.count({ where: { status: 'PENDING' as any } });
      return `${n} user account${n === 1 ? '' : 's'} are pending admin approval.`;
    }

    if (q.includes('radio') && (q.includes('queue') || q.includes('pending') || q.includes('waiting'))) {
      try {
        const n = await prisma.radioAnnouncement.count({ where: { status: { in: ['PENDING', 'PLAYING'] as any } } });
        return `Radio queue has ${n} announcement${n === 1 ? '' : 's'} pending or playing.`;
      } catch { /* */ }
    }
  } catch (e) {
    // Never let a live query break the chat.
    console.error('[assistant] dynamic query failed:', e);
  }

  return null;
}

/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = askSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 400 });

  const { question, contextPath, channel } = parsed.data;

  // 1) Try live data
  let answer = await dynamicAnswer(question);

  // 2) Knowledge base — combine top matches into a richer reply
  if (!answer) {
    const matches = topMatches(question, 3);
    if (matches.length === 0) {
      const sample = [
        'how do I book an emergency case?',
        'how do I report a fault?',
        'how do I do an AM check in a sub-store?',
        'how do I submit a prescription?',
        'how do I request blood?',
        'what is the WHO checklist?',
        'how do I acknowledge a radio call?',
        'show available theatres',
      ];
      answer =
        "I'm not sure I caught that. I can help with patients, surgeries, theatres, anaesthesia, prescriptions, blood/lab requests, sub-stores, equipment, transfers/PACU, roster, CSSD, laundry, power, water, oxygen, incidents, mortality, the radio service, reports, and admin tasks.\n\nTry one of these:\n• " +
        sample.join('\n• ');
    } else if (matches.length === 1) {
      answer = matches[0].answer;
    } else {
      // Lead with the best match, then add brief related info from runners-up.
      const primary = matches[0];
      const related = matches.slice(1).map((m) => `• ${m.topic}: ${m.answer.split('. ')[0]}.`);
      answer = primary.answer + '\n\nRelated:\n' + related.join('\n');
    }
  }

  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

  try {
    await prisma.assistantInteraction.create({
      data: {
        userId,
        userRole,
        question,
        answer,
        channel: channel ?? 'TEXT',
        contextPath,
      },
    });
  } catch (e) {
    // Do not fail the response if logging fails.
    console.error('[assistant] failed to log interaction:', e);
  }

  return NextResponse.json({ answer });
}
