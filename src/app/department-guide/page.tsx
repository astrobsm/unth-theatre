'use client';

/**
 * Public Department Guide — shareable link.
 *
 * URL:  /department-guide
 * Open to anyone (no auth required).
 *
 * Visitor picks a department (Anaesthesia, Surgery, Nursing, ...) and gets
 * a step-by-step navigation guide — from login through every screen they
 * need to do their job. Page is shareable via the Share button.
 *
 * No thermal printout here — the 80mm patient-call-up printout lives on
 * /dashboard/call-for-patient.
 */

import { useMemo, useState } from 'react';
import {
  Share2, Stethoscope, Syringe, HeartPulse, Bed, Pill, Droplet,
  FlaskConical, Ambulance, PackageCheck, Users, ShieldCheck, Wrench,
  Search, ArrowRight, CheckCircle2, AlertTriangle, Sparkles,
} from 'lucide-react';

// ---------- Department guide content ----------
type Step = { title: string; detail: string };
type Dept = {
  id: string;
  label: string;
  icon: any;
  color: string;          // tailwind gradient
  summary: string;
  loginNote: string;
  steps: Step[];
  cautions: string[];
};

const DEPARTMENTS: Dept[] = [
  {
    id: 'ANAESTHESIA',
    label: 'Anaesthesia',
    icon: Syringe,
    color: 'from-purple-600 to-indigo-700',
    summary:
      'Pre-operative review, intra-operative anaesthesia care, prescriptions, and consultant approvals.',
    loginNote:
      'Log in as ANAESTHETIST or CONSULTANT_ANAESTHETIST. Use staff code or username + password.',
    steps: [
      { title: '1. Log in',
        detail: 'Open the app → /auth/login → enter username and password. If you forgot your username, click "Recover with your phone number".' },
      { title: '2. View today\'s booked cases',
        detail: 'Sidebar → Surgeries → All Surgeries. Filter by date = today and status = SCHEDULED. You will see patient name, age, gender, ward, procedure, surgeon and scheduled time.' },
      { title: '3. Open the patient record',
        detail: 'Click the case row → review patient demographics, diagnosis, indication, comorbidities and any uploaded investigations.' },
      { title: '4. Pre-op assessment',
        detail: 'Sidebar → Pre-Op Visit (or open from the case). Document airway grade, ASA class, fasting status, allergies and consent.' },
      { title: '5. Write a prescription',
        detail: 'On the case page → Medications / Prescriptions tab → Add Prescription. Pick drug, dose, route, frequency. Save as DRAFT or submit for consultant approval.' },
      { title: '6. Consultant approval',
        detail: 'CONSULTANT_ANAESTHETIST signs in → Sidebar → Pending Approvals → review the prescription → Approve or Reject with comments. Approved prescriptions become active.' },
      { title: '7. Holding-area review',
        detail: 'When the patient arrives in holding area, open Holding Area module → confirm identity, fasting, consent, vitals → mark Cleared for Theatre.' },
      { title: '8. Intra-op',
        detail: 'In theatre, open the WHO Checklist → run Sign-In, Time-Out, Sign-Out with the team. Record anaesthesia start/end times in Surgical Timing.' },
      { title: '9. Hand-over to PACU',
        detail: 'After surgery → Nurse Handover → fill anaesthesia notes, post-op orders, analgesia plan → submit. Open PACU to monitor recovery.' },
    ],
    cautions: [
      'Never administer a controlled drug before consultant approval is logged.',
      'Always confirm patient identity in holding area before any intervention.',
      'Document allergies and ASA score before induction.',
    ],
  },
  {
    id: 'SURGERY',
    label: 'Surgery (Surgeons & House Officers)',
    icon: Stethoscope,
    color: 'from-blue-600 to-cyan-700',
    summary:
      'Book cases, build the surgical team, mark the site, run WHO checklists and complete operative notes.',
    loginNote:
      'Log in as SURGEON, CONSULTANT, REGISTRAR, SENIOR_REGISTRAR or HOUSE_OFFICER.',
    steps: [
      { title: '1. Log in & open Dashboard',
        detail: '/auth/login → Dashboard shows your assigned cases for the day.' },
      { title: '2. Book a new case',
        detail: 'Sidebar → Surgeries → New Surgery. Fill patient (search or add), procedure, scheduled date/time, indication, theatre and team.' },
      { title: '3. Build the surgical team',
        detail: 'In the New Surgery form, the "Surgical Team" section now searches the database. Type a name to find Consultants, Senior Registrars, Registrars and House Officers — selected entries are linked for analytics.' },
      { title: '4. Pre-op review',
        detail: 'Open the case → Pre-Op Visit → confirm patient is fit and consent is signed.' },
      { title: '5. Site marking & checklists',
        detail: 'Sidebar → WHO Checklists → run Sign-In before induction; Time-Out before incision; Sign-Out before patient leaves theatre.' },
      { title: '6. Operative note',
        detail: 'After the procedure → Surgeries → open the case → Operative Note → record findings, procedure performed, blood loss, complications.' },
      { title: '7. Post-op orders',
        detail: 'Add post-op instructions, antibiotics, analgesia. House Officers can draft and submit for Consultant counter-sign.' },
    ],
    cautions: [
      'Do not start a case without a completed WHO Sign-In.',
      'Always verify side and site at Time-Out, even for emergency cases.',
      'House Officers: prescriptions must be approved before administration.',
    ],
  },
  {
    id: 'SCRUB_NURSING',
    label: 'Scrub & Theatre Nursing',
    icon: HeartPulse,
    color: 'from-rose-600 to-pink-700',
    summary:
      'Theatre setup, instrument count, intra-op assistance, ward escort log transcription and handover.',
    loginNote: 'Log in as SCRUB_NURSE or RECOVERY_ROOM_NURSE.',
    steps: [
      { title: '1. Log in & start duty',
        detail: '/auth/login → Sidebar → Roster → Start Duty for your shift.' },
      { title: '2. Theatre setup',
        detail: 'Sidebar → Theatre Setup → confirm consumables, instruments and equipment for the booked case.' },
      { title: '3. Theatre readiness',
        detail: 'Sidebar → Theatre Readiness → tick environment ready, suction working, anaesthesia machine checked.' },
      { title: '4. Call for Patient (printout)',
        detail: 'Sidebar → Call for Patient → click Invite for the next case. The 80mm thermal printout includes a handwritten Ward Escort Log (Porter arrival/departure times + Ward Nurse name & signature).' },
      { title: '5. Holding area arrival',
        detail: 'When the patient arrives, open Holding Area → tick identity, site, consent, fasting, vitals, documents → Cleared for Theatre.' },
      { title: '6. Transcribe ward escort log',
        detail: 'Sidebar → Holding Area → Ward Escort Log → enter the porter arrival/departure times and ward-nurse name from the printout. Tick "signature on printout". Save.' },
      { title: '7. Intra-op',
        detail: 'Run WHO Time-Out with the team. Track instrument and swab counts in Equipment Checkout.' },
      { title: '8. Handover to PACU',
        detail: 'Sidebar → Nurse Handover → record swab/instrument counts, drains, dressings → submit to Recovery Room Nurse.' },
    ],
    cautions: [
      'Never sign Sign-Out before final swab and instrument counts match.',
      'Always confirm the ward-nurse signature is on the printout before transcribing.',
      'Report any equipment fault immediately via the alerts module.',
    ],
  },
  {
    id: 'RECOVERY',
    label: 'Recovery (PACU)',
    icon: Bed,
    color: 'from-teal-600 to-emerald-700',
    summary: 'Receive patient from theatre, monitor recovery, escalate alerts and discharge to ward.',
    loginNote: 'Log in as RECOVERY_ROOM_NURSE.',
    steps: [
      { title: '1. Log in', detail: '/auth/login.' },
      { title: '2. Receive handover', detail: 'Sidebar → Nurse Handover → accept handover from theatre.' },
      { title: '3. Open PACU module', detail: 'Sidebar → PACU → start a recovery record for the patient. Monitor vitals at intervals.' },
      { title: '4. Escalate alerts', detail: 'If patient deteriorates → Sidebar → Alerts → raise emergency. Anaesthetist on-call is paged.' },
      { title: '5. Discharge', detail: 'When Aldrete score is met → Discharge to Ward → Sidebar → Patient Transfers → arrange porter.' },
    ],
    cautions: [
      'Do not discharge from PACU without an Aldrete score ≥ 9 unless cleared by anaesthetist.',
      'Document analgesia and PONV management.',
    ],
  },
  {
    id: 'PHARMACY',
    label: 'Pharmacy',
    icon: Pill,
    color: 'from-amber-600 to-orange-700',
    summary: 'Receive prescription requests, dispense, and maintain theatre pharmacy stock.',
    loginNote: 'Log in as PHARMACIST.',
    steps: [
      { title: '1. Log in', detail: '/auth/login.' },
      { title: '2. View prescription requests', detail: 'Sidebar → Prescriptions → see today\'s approved orders.' },
      { title: '3. Dispense', detail: 'Click an order → Dispense → confirm batch, expiry, quantity. The TV announcement repeats every 5 min until you mark Fulfilled.' },
      { title: '4. Stock management', detail: 'Sidebar → Pharmacy Inventory → record receipts, transfers and expiries.' },
    ],
    cautions: [
      'Never dispense without a consultant-approved prescription.',
      'Record batch and expiry on every dispensation.',
    ],
  },
  {
    id: 'BLOOD_BANK',
    label: 'Blood Bank',
    icon: Droplet,
    color: 'from-red-600 to-rose-700',
    summary: 'Cross-match, issue blood and acknowledge requests for booked cases.',
    loginNote: 'Log in as BLOOD_BANK_OFFICER.',
    steps: [
      { title: '1. Log in', detail: '/auth/login.' },
      { title: '2. View blood requests', detail: 'Sidebar → Blood Requests → see requests grouped by urgency.' },
      { title: '3. Acknowledge & process', detail: 'Click a request → Acknowledge → record cross-match and units issued.' },
      { title: '4. Daily summary', detail: 'Sidebar → Blood Requests → Daily Summary → confirm counts at end of shift.' },
    ],
    cautions: [
      'Always verify patient ID, blood group and Rh before issuing.',
      'Record any reaction immediately under the request.',
    ],
  },
  {
    id: 'LAB',
    label: 'Laboratory',
    icon: FlaskConical,
    color: 'from-lime-600 to-green-700',
    summary: 'Receive lab requests, enter results, and notify the requesting team.',
    loginNote: 'Log in as LAB_OFFICER.',
    steps: [
      { title: '1. Log in', detail: '/auth/login.' },
      { title: '2. View lab requests', detail: 'Sidebar → Lab Requests.' },
      { title: '3. Enter results', detail: 'Click a request → enter values → save. The requesting team is notified.' },
    ],
    cautions: ['Double-check sample ID before entering results.'],
  },
  {
    id: 'PORTER',
    label: 'Porters (Theatre Porter)',
    icon: Ambulance,
    color: 'from-slate-600 to-gray-800',
    summary: 'Transport patients from ward to holding area and back; record times on the printout.',
    loginNote: 'Log in as PORTER.',
    steps: [
      { title: '1. Log in & Start Duty', detail: '/auth/login → Roster → Start Duty.' },
      { title: '2. Watch Call for Patient', detail: 'Sidebar → Call for Patient. When a case appears, accept and collect the printout from theatre reception.' },
      { title: '3. Record ward times by hand', detail: 'On arrival at the ward, write your arrival time on the printout. When leaving, write your departure time and ask the ward nurse to sign and print her name.' },
      { title: '4. Hand printout in holding area', detail: 'On reaching holding area, give the printout to the holding-area nurse who will transcribe the times into the system.' },
      { title: '5. End Duty', detail: 'Sidebar → Roster → End Duty at end of shift.' },
    ],
    cautions: [
      'Never leave a sedated patient unattended in transit.',
      'Always ensure the ward nurse signs before leaving the ward.',
    ],
  },
  {
    id: 'CSSD',
    label: 'CSSD',
    icon: PackageCheck,
    color: 'from-indigo-600 to-blue-700',
    summary: 'Sterilise, track readiness, manage inventory issue/return.',
    loginNote: 'Log in as CSSD_TECHNICIAN or CSSD_SUPERVISOR.',
    steps: [
      { title: '1. Log in', detail: '/auth/login.' },
      { title: '2. CSSD Sterilization', detail: 'Sidebar → CSSD → Sterilization → log cycle, load, indicators.' },
      { title: '3. Readiness check', detail: 'Sidebar → CSSD → Readiness → confirm sets are ready for tomorrow\'s cases.' },
      { title: '4. Inventory', detail: 'Sidebar → CSSD → Inventory → Issue to theatre / Return after use.' },
    ],
    cautions: ['Do not release a load if biological indicator failed.'],
  },
  {
    id: 'CLEANING',
    label: 'Cleaning & Environment',
    icon: Sparkles,
    color: 'from-cyan-600 to-sky-700',
    summary: 'Theatre cleaning between cases, environmental compliance.',
    loginNote: 'Log in as CLEANER.',
    steps: [
      { title: '1. Log in', detail: '/auth/login.' },
      { title: '2. Start cleaning', detail: 'Sidebar → Cleaning → Start. Pick the theatre.' },
      { title: '3. End cleaning', detail: 'When done → End. The system records turnover time for analytics.' },
    ],
    cautions: ['Always wait for the scrub nurse to confirm theatre is empty before entering.'],
  },
  {
    id: 'STORE',
    label: 'Theatre Store',
    icon: Wrench,
    color: 'from-stone-600 to-zinc-800',
    summary: 'Manage equipment checkout, returns and theatre store inventory.',
    loginNote: 'Log in as THEATRE_STORE_KEEPER.',
    steps: [
      { title: '1. Log in', detail: '/auth/login.' },
      { title: '2. Equipment Checkout', detail: 'Sidebar → Equipment Checkout → issue items to a case; record return after use.' },
      { title: '3. Inventory', detail: 'Sidebar → Inventory → manage stock levels, raise low-stock alerts.' },
    ],
    cautions: ['Never release sterile-pack items without checking expiry.'],
  },
  {
    id: 'ADMIN',
    label: 'Administration (CMD / CMAC)',
    icon: ShieldCheck,
    color: 'from-emerald-700 to-green-800',
    summary: 'Oversight, approvals, analytics and module access management.',
    loginNote: 'Log in as ADMIN, CMD or CMAC.',
    steps: [
      { title: '1. Log in', detail: '/auth/login.' },
      { title: '2. Live monitoring', detail: 'Sidebar → Monitoring → real-time view of theatres, holding area and PACU.' },
      { title: '3. Approve onboarding', detail: 'Sidebar → Onboarding → review pending submissions → import into User accounts.' },
      { title: '4. Module access', detail: 'Sidebar → Admin → User Access → grant per-user module overrides.' },
      { title: '5. Reports & analytics', detail: 'Sidebar → CMD or CMAC dashboards → cancellations, utilisation, complications.' },
    ],
    cautions: ['Removing a module from a user is immediate; communicate before doing so.'],
  },
  {
    id: 'ROSTER',
    label: 'Roster Coordinator',
    icon: Users,
    color: 'from-fuchsia-600 to-purple-700',
    summary: 'Build daily duty roster and theatre allocations.',
    loginNote: 'Log in as ROSTER_COORDINATOR or ADMIN.',
    steps: [
      { title: '1. Log in', detail: '/auth/login.' },
      { title: '2. Open Roster', detail: 'Sidebar → Roster → pick the date.' },
      { title: '3. Assign staff to theatres', detail: 'Drag staff into theatre slots (scrub nurse, circulating nurse, porter, anaesthetic technician).' },
      { title: '4. Publish', detail: 'Click Publish — affected staff see their assignments on next login.' },
    ],
    cautions: ['Do not double-book a staff member in two theatres at the same time.'],
  },
];

export default function DepartmentGuidePage() {
  const [deptId, setDeptId] = useState<string>('');
  const [filter, setFilter] = useState('');
  const [shareCopied, setShareCopied] = useState(false);

  const dept = useMemo(() => DEPARTMENTS.find(d => d.id === deptId) || null, [deptId]);

  const visibleDepts = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return DEPARTMENTS;
    return DEPARTMENTS.filter(d => d.label.toLowerCase().includes(q) || d.summary.toLowerCase().includes(q));
  }, [filter]);

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: 'UNTH Theatre — Department Guide', url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      }
    } catch {
      /* noop */
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
                <Stethoscope className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Department Guide</h1>
                <p className="text-gray-600 text-sm">
                  Pick your department to see how to navigate the app — from login through your daily workflow.
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 shadow-sm"
          >
            <Share2 className="w-4 h-4" />
            {shareCopied ? 'Link copied!' : 'Share this guide'}
          </button>
        </div>

        {/* Selector card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 mb-6">
          <label className="block text-sm font-semibold text-gray-800 mb-2">
            1. Select your department
          </label>
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Search e.g. anaesthesia, scrub, pharmacy..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              title="Select your department"
              value={deptId}
              onChange={e => setDeptId(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-w-[260px]"
            >
              <option value="">— Choose a department —</option>
              {visibleDepts.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* Quick chips */}
          <div className="flex flex-wrap gap-2">
            {visibleDepts.slice(0, 14).map(d => {
              const Icon = d.icon;
              const active = d.id === deptId;
              return (
                <button
                  key={d.id}
                  onClick={() => setDeptId(d.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {d.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Guide */}
        {!dept ? (
          <div className="bg-white rounded-2xl shadow-sm border border-dashed border-gray-300 p-10 text-center">
            <Stethoscope className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Select a department above to view its step-by-step guide.</p>
          </div>
        ) : (
          <>
            <div className={`rounded-2xl bg-gradient-to-br ${dept.color} text-white p-6 mb-6 shadow`}>
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
                  <dept.icon className="w-7 h-7" />
                </div>
                <div className="flex-1">
                  <div className="text-2xl font-bold">{dept.label}</div>
                  <div className="text-white/90 text-sm mt-1">{dept.summary}</div>
                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 text-white text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {dept.loginNote}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-5 mb-6">
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <ArrowRight className="w-5 h-5 text-blue-600" /> Step-by-step
                </h2>
                <ol className="space-y-3">
                  {dept.steps.map((s, i) => (
                    <li key={i} className="border-l-4 border-blue-500 pl-3 py-1">
                      <div className="font-semibold text-gray-900 text-sm">{s.title}</div>
                      <div className="text-gray-600 text-sm mt-0.5">{s.detail}</div>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5">
                <h2 className="text-lg font-bold text-amber-900 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" /> Cautions
                </h2>
                <ul className="space-y-2">
                  {dept.cautions.map((c, i) => (
                    <li key={i} className="text-sm text-amber-900 flex items-start gap-2">
                      <span className="text-amber-600 mt-0.5">●</span> {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}

        <div className="text-center text-xs text-gray-400 pb-8">
          Public link · UNTH Theatre Operations · {typeof window !== 'undefined' ? window.location.origin : ''}/department-guide
        </div>
      </div>
    </div>
  );
}
