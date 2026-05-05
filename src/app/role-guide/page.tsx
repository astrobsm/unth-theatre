'use client';

/**
 * Public Role Guide — shareable link.
 *
 * Open to anyone (no auth). Staff pick their role and get a tailored guide:
 * - How to use the app for that role
 * - Their key responsibilities
 * - Cautions / what NOT to do
 * - Real benefits to them personally
 * - Step-by-step quick-start
 *
 * Live at: /role-guide   (e.g. https://unth-theatre-mai.vercel.app/role-guide)
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Shield,
  Stethoscope,
  Syringe,
  Heart,
  Bed,
  Pill,
  Droplet,
  FlaskConical,
  Ambulance,
  Wrench,
  Sparkles,
  Building2,
  PackageCheck,
  ChefHat,
  Flame,
  Waves,
  Zap,
  Users,
  ClipboardCheck,
  Search,
  CheckCircle2,
  AlertTriangle,
  Star,
  Rocket,
  ArrowRight,
  Share2,
} from 'lucide-react';

type Role = {
  id: string;
  label: string;
  group: string;
  icon: any;
  color: string; // tailwind gradient e.g. 'from-blue-600 to-indigo-700'
  intro: string;
  responsibilities: string[];
  howToUse: string[];
  cautions: string[];
  benefits: string[];
  quickStart: string[];
};

const ROLES: Role[] = [
  // ─── Leadership ────────────────────────────────────────────────
  {
    id: 'THEATRE_CHAIRMAN',
    label: 'Theatre Chairman',
    group: 'Leadership',
    icon: Star,
    color: 'from-amber-500 to-orange-600',
    intro:
      'You hold the strategic oversight of all theatre operations. The app gives you a single command-centre view of every list, every emergency and every resource.',
    responsibilities: [
      'Approve theatre policies, rosters and major allocations.',
      'Review monthly performance dashboards (case-load, on-time starts, cancellations).',
      'Arbitrate inter-specialty theatre disputes using the audit log.',
      'Sign off capital expenditure requests raised through Procurement.',
    ],
    howToUse: [
      'Open Live Monitoring to see every theatre in real time.',
      'Use Reports → Executive Dashboard for KPIs at a glance.',
      'Tap any surgery to drill into the full perioperative timeline.',
      'Approve or reject access requests under Module Access.',
    ],
    cautions: [
      'Never share your login — every approval is signed with your name in the audit trail.',
      'Avoid editing live cases; use the audit notes feature for governance comments.',
    ],
    benefits: [
      'See utilisation, downtime and bottlenecks without waiting for end-of-month reports.',
      'Evidence-based decisions backed by tamper-proof timestamps.',
      'Recognise top-performing teams and individuals from the leaderboard.',
    ],
    quickStart: [
      'Log in → Dashboard.',
      'Tap "Live Monitoring" in the sidebar.',
      'Open "Reports" → "Executive Summary".',
    ],
  },
  {
    id: 'THEATRE_MANAGER',
    label: 'Theatre Manager',
    group: 'Leadership',
    icon: Building2,
    color: 'from-indigo-600 to-purple-700',
    intro:
      'You run the day-to-day theatre suite. The app becomes your duty roster, equipment register, incident log and communication channel — all in one.',
    responsibilities: [
      'Publish daily theatre allocation and on-call roster.',
      'Coordinate emergency cases with surgeons and anaesthetists.',
      'Track equipment downtime and CSSD turnaround.',
      'Investigate incidents and never-events flagged in the system.',
    ],
    howToUse: [
      'Theatre Allocation → drag cases to rooms; the system warns on conflicts.',
      'Roster → publish weekly; staff get notifications.',
      'Equipment → mark items in service / out of service.',
      'Live Monitoring + Announcement TVs for real-time visibility.',
    ],
    cautions: [
      'Re-allocating a running case mid-surgery will alert the team — only do so with verbal confirmation.',
      'Roster changes within 12h of a shift trigger SMS alerts; double-check before publishing.',
    ],
    benefits: [
      'No more paper rosters lost or disputed.',
      'One-tap escalation for emergency lists, blood and pharmacy.',
      'Clear audit trail when issues are raised at clinical governance.',
    ],
    quickStart: [
      'Open Theatre Allocation each morning by 7:30 a.m.',
      'Confirm Roster for the day.',
      'Pin Live Monitoring on a side screen.',
    ],
  },

  // ─── Surgeons ──────────────────────────────────────────────────
  {
    id: 'SURGEON',
    label: 'Surgeon / Consultant Surgeon',
    group: 'Surgical Team',
    icon: Stethoscope,
    color: 'from-blue-600 to-indigo-700',
    intro:
      'Plan your list, brief your team, and document the case — all from your phone. Your operative footprint is preserved for appraisal and CPD.',
    responsibilities: [
      'Book elective and emergency surgeries with full diagnosis & indication.',
      'Lead the WHO Surgical Safety Checklist.',
      'Submit operative notes promptly after each case.',
      'Request blood, lab and equipment via the app — not via runners.',
    ],
    howToUse: [
      'Surgery Booking → create case → choose theatre & date.',
      'For emergencies: Emergency Surgery → fill diagnosis, ward, urgency.',
      'During case: Perioperative → Time Out / Sign Out checklist.',
      'After case: Operative Notes → submit; copy auto-saves to patient record.',
    ],
    cautions: [
      'Never list a case without a confirmed consent — the app will block submission.',
      'Avoid generic diagnoses ("abdominal pain") — be specific so lab/pharmacy can prepare.',
      'Do not mark a case "complete" before the patient leaves theatre.',
    ],
    benefits: [
      'Every case you do is auto-counted for appraisal & log book.',
      'Lab/Blood/Pharmacy requests reach the right person in seconds.',
      'Your patients\' allergies and prior surgeries pop up automatically.',
    ],
    quickStart: [
      'Login → Dashboard → "My Cases" tile.',
      'Tap "+ New Surgery" or "+ Emergency".',
      'Complete the WHO checklist on the day.',
    ],
  },

  // ─── Anaesthesia ───────────────────────────────────────────────
  {
    id: 'ANAESTHETIST',
    label: 'Anaesthetist / Consultant Anaesthetist',
    group: 'Anaesthesia',
    icon: Syringe,
    color: 'from-cyan-600 to-blue-700',
    intro:
      'Pre-op assessment, drug prescription, intra-op timing and recovery hand-over — fully digital and linked to the patient record.',
    responsibilities: [
      'Complete pre-anaesthetic assessment and ASA grading.',
      'Issue anaesthetic prescription early — the pharmacy needs lead time.',
      'Document induction, maintenance, reversal and extubation times.',
      'Sign hand-over to recovery nurse.',
    ],
    howToUse: [
      'Patient Assessment → fill ASA, airway, comorbidities.',
      'Anaesthetic Prescription → pick urgency (EMERGENCY routes to Pharmacy TV instantly).',
      'Surgical Timing → record each phase live.',
      'Recovery Hand-over → digital sign-off.',
    ],
    cautions: [
      'Mark "EMERGENCY" only for true emergencies — it triggers an audio announcement at the pharmacy until packed.',
      'Always document allergies; a missed allergy alert is the #1 governance flag.',
      'Do not delay extubation timestamp — it drives the room turnover stats.',
    ],
    benefits: [
      'No more paper prescriptions lost on the way to pharmacy.',
      'Automatic ASA-stratified case log for your portfolio.',
      'Live drug-stock visibility before you induce.',
    ],
    quickStart: [
      'Login → "Today\'s List".',
      'Tap each patient → Pre-op Assessment → Prescription.',
      'In theatre → open Surgical Timing.',
    ],
  },

  // ─── Nursing ───────────────────────────────────────────────────
  {
    id: 'SCRUB_NURSE',
    label: 'Scrub Nurse',
    group: 'Nursing',
    icon: Heart,
    color: 'from-pink-600 to-rose-700',
    intro:
      'Your instrument count, swab count and intra-op events all go in the same place. No more chasing the consultant for a signature.',
    responsibilities: [
      'Pre-case instrument & swab count (and final count before closure).',
      'Document specimens, implants and prosthesis serial numbers.',
      'Report any instrument failure or contamination event.',
      'Confirm WHO checklist Sign-In with the team.',
    ],
    howToUse: [
      'Open the case → "Counts" tab → enter initial counts.',
      'During closure → enter final counts; mismatch triggers a red alert.',
      'Specimens → scan or type request → auto-routed to lab.',
      'Equipment Checkout → flag any faulty item.',
    ],
    cautions: [
      'Never close a case in the app with a count discrepancy — escalate immediately.',
      'Specimen mislabelling is irreversible; double-check patient name & site.',
    ],
    benefits: [
      'Counts dispute? — The audit log resolves it instantly.',
      'Your CPD log auto-fills with cases scrubbed.',
      'Immediate alert to CSSD when an instrument set returns short.',
    ],
    quickStart: [
      'Login → Today\'s List → tap your case → "Open in OR".',
      'Tab "Counts" before knife-to-skin.',
      'Tab "Closure" before skin closure.',
    ],
  },
  {
    id: 'RECOVERY_ROOM_NURSE',
    label: 'Recovery Room Nurse',
    group: 'Nursing',
    icon: Bed,
    color: 'from-teal-600 to-emerald-700',
    intro:
      'Receive the patient with the full intra-op record already in front of you. Aldrete scoring, observations and discharge — paperless.',
    responsibilities: [
      'Receive hand-over and confirm in app.',
      'Record vitals at the standard intervals.',
      'Calculate Aldrete / Modified Aldrete score.',
      'Discharge to ward only when criteria met.',
    ],
    howToUse: [
      'Recovery → "Pending Hand-overs" → tap to accept.',
      'Vitals → quick-entry tiles.',
      'Aldrete → auto-calculates; suggests readiness.',
      'Discharge → notify ward in one tap.',
    ],
    cautions: [
      'Do not discharge before the surgeon\'s post-op orders are visible.',
      'A delayed Aldrete entry skews PACU dwell-time KPIs.',
    ],
    benefits: [
      'Surgeon and anaesthetist get an automatic notification when their patient is stable.',
      'No more chasing folders to the ward.',
      'Your PACU competencies are evidenced in the audit.',
    ],
    quickStart: [
      'Login → Recovery → accept hand-over.',
      'Record vitals every 15 min.',
      'Discharge when Aldrete ≥ 9.',
    ],
  },

  // ─── Pharmacy ──────────────────────────────────────────────────
  {
    id: 'PHARMACIST',
    label: 'Theatre Pharmacist',
    group: 'Pharmacy',
    icon: Pill,
    color: 'from-emerald-600 to-green-700',
    intro:
      'See incoming prescriptions before the patient arrives. Emergency prescriptions are announced loudly on the Pharmacy TV until you mark them packed.',
    responsibilities: [
      'Pack, dispense and document all theatre drugs.',
      'Monitor controlled-drug register entries.',
      'Update stock levels after each dispense.',
      'Flag near-expiry and out-of-stock items.',
    ],
    howToUse: [
      'Pharmacy Dashboard → "Inbox" of prescriptions sorted by urgency.',
      'Open Pharmacy Announcement TV on the wall screen.',
      'Tap "Pack" → confirm items → "Dispensed" when collected.',
      'Stock → adjust on receipt of supplies.',
    ],
    cautions: [
      'Never silence the announcement TV without packing — the audio stops only when you mark the prescription PACKED.',
      'Controlled-drug entries cannot be edited after submit; double-check.',
    ],
    benefits: [
      'No more paper prescriptions misplaced between theatre and pharmacy.',
      'Real-time view of every emergency surgery requiring drugs.',
      'Auto-generated month-end consumption report.',
    ],
    quickStart: [
      'Cast /announcement-display/pharmacy on a wall TV.',
      'Login → Pharmacy → process Inbox top-down.',
    ],
  },

  // ─── Blood Bank ────────────────────────────────────────────────
  {
    id: 'BLOODBANK_STAFF',
    label: 'Blood Bank Staff',
    group: 'Blood Bank',
    icon: Droplet,
    color: 'from-red-600 to-rose-700',
    intro:
      'Every emergency blood request lights up your TV with patient, group and units. Cross-match progress is logged from request to delivery.',
    responsibilities: [
      'Acknowledge incoming blood requests.',
      'Cross-match and prepare requested products.',
      'Update status: ACKNOWLEDGED → IN_PREPARATION → READY → DELIVERED.',
      'Log return of unused units.',
    ],
    howToUse: [
      'Cast Blood Bank Announcement TV on the wall.',
      'Blood Bank dashboard → tap request → update status as you go.',
      'When ready, tap "READY" — the audio announcement stops automatically.',
    ],
    cautions: [
      'Do not jump straight to READY without IN_PREPARATION — the audit trail must show each step.',
      'Group/Rh mismatch alerts are hard-blocked; never override without consultant sign-off.',
    ],
    benefits: [
      'Saves lives — surgeons know exactly when blood will arrive.',
      'No more phone calls asking "is the blood ready?"',
      'Wastage drops because returns are tracked.',
    ],
    quickStart: [
      'Cast /announcement-display/blood-bank.',
      'Login → Blood Bank → process oldest first.',
    ],
  },

  // ─── Lab ───────────────────────────────────────────────────────
  {
    id: 'LABORATORY_STAFF',
    label: 'Laboratory Staff / Emergency Lab Scientist',
    group: 'Laboratory',
    icon: FlaskConical,
    color: 'from-cyan-600 to-sky-700',
    intro:
      'Emergency lab requests appear on your wall TV with audio repeat until you upload the result. No more shouting across the corridor.',
    responsibilities: [
      'Acknowledge sample collection requests.',
      'Process samples and upload results promptly.',
      'Flag critical values for surgeon notification.',
      'Maintain sample chain-of-custody log.',
    ],
    howToUse: [
      'Cast /announcement-display/lab on the lab TV.',
      'Lab dashboard → progress each request through statuses.',
      'Upload results → audio stops automatically.',
    ],
    cautions: [
      'Critical values must be flagged — the surgeon won\'t see your private notes.',
      'Do not delete a request; mark CANCELLED with a reason.',
    ],
    benefits: [
      'TAT (turnaround time) is auto-measured and displayed.',
      'Results are linked to the right surgery without re-typing.',
    ],
    quickStart: [
      'Cast /announcement-display/lab.',
      'Login → Lab → "Active Requests".',
    ],
  },

  // ─── Sterile Services ──────────────────────────────────────────
  {
    id: 'CSSD_STAFF',
    label: 'CSSD Staff / Supervisor',
    group: 'Sterile Services',
    icon: Sparkles,
    color: 'from-violet-600 to-purple-700',
    intro:
      'Track every set from soiled return through wash, pack, sterilise and re-issue. Implant traceability built-in.',
    responsibilities: [
      'Receive and decontaminate used sets.',
      'Pack and load sterilisers; record cycle parameters.',
      'Issue sets to theatres against booking list.',
      'Record any failed BI / load.',
    ],
    howToUse: [
      'CSSD → "Returns" → scan/select sets.',
      'Cycles → log autoclave run with indicator results.',
      'Issues → tick off sets going to each theatre for tomorrow\'s list.',
    ],
    cautions: [
      'Never issue a set without a successful BI.',
      'A failed cycle blocks all sets in that load — escalate to supervisor immediately.',
    ],
    benefits: [
      'Full traceability if a recall is ever needed.',
      'Theatre managers can see your set availability without phoning you.',
    ],
    quickStart: [
      'CSSD → Returns → Wash → Pack → Cycle → Issue.',
    ],
  },

  // ─── Stores / Procurement ──────────────────────────────────────
  {
    id: 'THEATRE_STORE_KEEPER',
    label: 'Theatre Store Keeper',
    group: 'Logistics',
    icon: PackageCheck,
    color: 'from-orange-600 to-amber-700',
    intro:
      'Receive, dispense and re-order — the app shows par-levels and auto-flags items that need a requisition.',
    responsibilities: [
      'Receive deliveries and update stock.',
      'Dispense to theatres against requisitions.',
      'Raise low-stock and expiry alerts.',
    ],
    howToUse: [
      'Stores → Goods In → scan or enter delivery.',
      'Requisitions → approve / part-fulfil.',
      'Stock-take → monthly count entry.',
    ],
    cautions: [
      'Always scan/check expiry on goods-in; the app uses the date you enter.',
      'Bulk uploads must use the official template — others are rejected.',
    ],
    benefits: [
      'Auto-alerts when items hit re-order level.',
      'Reduced over-stocking and expiry losses.',
    ],
    quickStart: ['Stores → Goods In, then process Requisitions.'],
  },
  {
    id: 'PROCUREMENT_OFFICER',
    label: 'Procurement Officer',
    group: 'Logistics',
    icon: PackageCheck,
    color: 'from-orange-700 to-yellow-800',
    intro:
      'Convert low-stock alerts into purchase requests with full vendor history and price benchmarks.',
    responsibilities: [
      'Process purchase requisitions raised by stores/managers.',
      'Maintain vendor list and price benchmarks.',
      'Track delivery against PO.',
    ],
    howToUse: [
      'Procurement → Pending Requisitions.',
      'Vendors → maintain.',
      'POs → close on delivery.',
    ],
    cautions: ['Do not close a PO before goods-in is confirmed.'],
    benefits: [
      'No more lost requisition slips.',
      'Audit-ready price history.',
    ],
    quickStart: ['Procurement → Pending → Issue PO → Close on receipt.'],
  },

  // ─── Engineering / Support ─────────────────────────────────────
  {
    id: 'BIOMEDICAL_ENGINEER',
    label: 'Biomedical Engineer',
    group: 'Engineering',
    icon: Wrench,
    color: 'from-slate-600 to-zinc-800',
    intro:
      'Receive equipment fault reports the moment they happen. PPM schedule and downtime logs in one place.',
    responsibilities: [
      'Action equipment fault tickets.',
      'Run preventive maintenance schedule.',
      'Update equipment status when serviced.',
    ],
    howToUse: [
      'Equipment → Tickets → Open / In Progress / Resolved.',
      'Maintenance → schedule next PPM.',
    ],
    cautions: [
      'Do not mark a ticket "Resolved" without leaving a fix note — it goes into the asset history.',
    ],
    benefits: [
      'Asset down-time auto-totalled per quarter.',
      'Easy evidence for warranty claims.',
    ],
    quickStart: ['Equipment → Tickets → process oldest first.'],
  },
  {
    id: 'OXYGEN_UNIT_SUPERVISOR',
    label: 'Oxygen Unit Supervisor',
    group: 'Utilities',
    icon: Waves,
    color: 'from-sky-600 to-blue-800',
    intro:
      'Monitor cylinder stock, manifold pressures and theatre demand from your phone.',
    responsibilities: [
      'Log cylinder receipts and dispatches.',
      'Record manifold pressure readings.',
      'Raise low-pressure alerts.',
    ],
    howToUse: ['Oxygen → Stock, Pressure Log, Alerts.'],
    cautions: ['Pressure readings cannot be back-dated; record in real time.'],
    benefits: ['Theatre managers see live availability before listing big cases.'],
    quickStart: ['Oxygen → Pressure Log every shift.'],
  },
  {
    id: 'POWER_PLANT_OPERATOR',
    label: 'Power Plant Operator',
    group: 'Utilities',
    icon: Zap,
    color: 'from-yellow-600 to-orange-700',
    intro: 'Log mains, generator and changeover events.',
    responsibilities: ['Hourly log of supply source and load.', 'Fuel level entry.'],
    howToUse: ['Power → Shift Log.'],
    cautions: ['Late log entries trigger an alert to the Manager.'],
    benefits: ['Down-time correlation with theatre incidents is automatic.'],
    quickStart: ['Power → Shift Log every hour.'],
  },
  {
    id: 'LAUNDRY_STAFF',
    label: 'Laundry Staff / Supervisor',
    group: 'Support',
    icon: Sparkles,
    color: 'from-fuchsia-600 to-pink-700',
    intro: 'Track linen in, out and losses per theatre.',
    responsibilities: ['Receive soiled, dispatch clean linen.', 'Log losses.'],
    howToUse: ['Laundry → Cycle Log → Issues.'],
    cautions: ['Always weigh-in soiled before counting clean out.'],
    benefits: ['No more disputes over missing scrubs.'],
    quickStart: ['Laundry → Cycle Log each shift.'],
  },
  {
    id: 'CLEANER',
    label: 'Cleaner / Environmental Hygiene',
    group: 'Support',
    icon: Sparkles,
    color: 'from-lime-600 to-green-700',
    intro: 'Mark each theatre cleaned between cases — turnover times improve.',
    responsibilities: ['Terminal & between-case cleaning sign-off.'],
    howToUse: ['Theatre → tap "Cleaning Done" after each case.'],
    cautions: ['Do not sign off if biohazard not removed.'],
    benefits: ['Your work is visible — recognised in monthly KPIs.'],
    quickStart: ['Tap "Cleaning Done" after each case.'],
  },
  {
    id: 'PORTER',
    label: 'Porter',
    group: 'Support',
    icon: Ambulance,
    color: 'from-stone-600 to-amber-800',
    intro:
      'Receive transport requests with full pickup, drop-off and patient details.',
    responsibilities: ['Move patients between ward, holding, theatre and recovery.'],
    howToUse: ['Porters → Active Requests → Accept → Complete.'],
    cautions: ['Confirm patient ID and folder number before moving.'],
    benefits: ['No more standing waiting — requests come straight to your phone.'],
    quickStart: ['Porters → Accept oldest request.'],
  },
  {
    id: 'THEATRE_CAFETERIA_MANAGER',
    label: 'Cafeteria Manager',
    group: 'Support',
    icon: ChefHat,
    color: 'from-rose-600 to-red-700',
    intro: 'Plan meals against the day\'s on-call list.',
    responsibilities: ['Daily menu, meal counts, waste log.'],
    howToUse: ['Cafeteria → Menu → Counts → Waste.'],
    cautions: ['Meal counts above roster headcount are auto-flagged.'],
    benefits: ['Reduced food waste; staff see today\'s menu in their app.'],
    quickStart: ['Cafeteria → Menu by 8 a.m.'],
  },

  // ─── Admin ─────────────────────────────────────────────────────
  {
    id: 'ADMIN',
    label: 'System Administrator',
    group: 'Administration',
    icon: Shield,
    color: 'from-gray-700 to-slate-900',
    intro:
      'You configure modules, user access and system settings. Everything you change is logged.',
    responsibilities: [
      'Approve / reject new user registrations.',
      'Grant per-user module overrides.',
      'Maintain reference data (theatres, specialties, item catalogue).',
      'Review audit logs.',
    ],
    howToUse: [
      'Admin → User Management → Pending.',
      'Admin → Module Access → grant per user.',
      'Admin → Settings → reference data.',
    ],
    cautions: [
      'Never grant ADMIN role without written authorisation.',
      'Bulk deletes are blocked — use status changes instead.',
    ],
    benefits: ['Single pane of glass to govern the platform.'],
    quickStart: ['Admin → process Pending Users daily.'],
  },
];

const GROUPS = [
  'Leadership',
  'Surgical Team',
  'Anaesthesia',
  'Nursing',
  'Pharmacy',
  'Blood Bank',
  'Laboratory',
  'Sterile Services',
  'Logistics',
  'Engineering',
  'Utilities',
  'Support',
  'Administration',
];

export default function RoleGuidePage() {
  const [selected, setSelected] = useState<Role | null>(null);
  const [search, setSearch] = useState('');
  const [shareCopied, setShareCopied] = useState(false);

  // Restore selection from URL hash so the link is shareable per-role.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const r = ROLES.find((x) => x.id === hash);
      if (r) setSelected(r);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (selected) {
      window.history.replaceState(null, '', `#${selected.id}`);
    } else {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ROLES;
    return ROLES.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.group.toLowerCase().includes(q) ||
        r.intro.toLowerCase().includes(q)
    );
  }, [search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Role[]>();
    filtered.forEach((r) => {
      if (!map.has(r.group)) map.set(r.group, []);
      map.get(r.group)!.push(r);
    });
    return GROUPS.filter((g) => map.has(g)).map((g) => ({ group: g, items: map.get(g)! }));
  }, [filtered]);

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const text =
      'Operative Resource Manager — Role Guide. Pick your role and learn how to make the best use of the app.';
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: 'ORM Role Guide', text, url });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {}
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 text-white shadow-lg">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">
                Operative Resource Manager
              </p>
              <h1 className="mt-1 text-3xl font-bold sm:text-4xl">
                Role Guide
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-blue-100 sm:text-base">
                Pick your role to see exactly how to use the app, your
                responsibilities, what to avoid, and the real benefits to you
                and your patients.
              </p>
            </div>
            <button
              type="button"
              onClick={handleShare}
              className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25"
              title="Share this guide"
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">{shareCopied ? 'Link copied' : 'Share'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {!selected ? (
          <>
            {/* Search */}
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <Search className="h-5 w-5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your role… e.g. nurse, anaesthetist, pharmacy"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>

            {/* Groups */}
            <div className="space-y-8">
              {grouped.map(({ group, items }) => (
                <section key={group}>
                  <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-600">
                    {group}
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelected(r)}
                        className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div
                          className={`flex h-12 w-12 flex-none items-center justify-center rounded-lg bg-gradient-to-br ${r.color} text-white shadow`}
                        >
                          <r.icon className="h-6 w-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-semibold text-slate-900">
                            {r.label}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                            {r.intro}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 flex-none text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {grouped.length === 0 && (
                <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
                  No role matches &quot;{search}&quot;. Try a different keyword.
                </p>
              )}
            </div>

            <p className="mt-10 rounded-xl bg-white/70 p-4 text-center text-xs text-slate-600 ring-1 ring-slate-200 backdrop-blur">
              Don&apos;t see your role exactly?{' '}
              Pick the closest one — most modules are shared across teams. You
              can always ask your supervisor to grant additional access from{' '}
              <strong>Admin → Module Access</strong>.
            </p>
          </>
        ) : (
          <RoleDetail role={selected} onBack={() => setSelected(null)} />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white/60 py-6 text-center text-xs text-slate-500 backdrop-blur">
        University of Nigeria Teaching Hospital, Ituku-Ozalla — Theatre
        Operative Resource Manager
      </footer>
    </div>
  );
}

function RoleDetail({ role, onBack }: { role: Role; onBack: () => void }) {
  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-semibold text-blue-700 hover:text-blue-900"
      >
        ← Back to all roles
      </button>

      <div className={`overflow-hidden rounded-2xl bg-gradient-to-br ${role.color} text-white shadow-xl`}>
        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 flex-none items-center justify-center rounded-xl bg-white/15 ring-2 ring-white/30">
              <role.icon className="h-8 w-8" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest opacity-80">
                {role.group}
              </p>
              <h2 className="mt-1 text-2xl font-bold sm:text-3xl">{role.label}</h2>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-white/95">
            {role.intro}
          </p>
        </div>
      </div>

      <Section title="How to use the app" icon={Rocket} accent="text-blue-700" items={role.howToUse} />
      <Section title="Your key responsibilities" icon={ClipboardCheck} accent="text-emerald-700" items={role.responsibilities} />
      <Section title="Real benefits to you" icon={Star} accent="text-amber-700" items={role.benefits} />
      <Section title="Cautions — things to avoid" icon={AlertTriangle} accent="text-red-700" items={role.cautions} highlight />

      <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-6">
        <div className="flex items-center gap-2 text-blue-900">
          <Rocket className="h-5 w-5" />
          <h3 className="text-lg font-bold">Quick Start (3 minutes)</h3>
        </div>
        <ol className="mt-3 space-y-2">
          {role.quickStart.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                {i + 1}
              </span>
              <span className="text-sm text-slate-800">{s}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white sm:flex-row">
        <div>
          <p className="text-lg font-bold">Ready to get started?</p>
          <p className="text-sm text-emerald-100">
            Create your profile (or log in) and put this guide into practice.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/onboarding"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-emerald-700 shadow hover:bg-emerald-50"
          >
            Create Profile
          </a>
          <a
            href="/auth/login"
            className="rounded-full bg-emerald-800 px-5 py-2.5 text-sm font-bold text-white ring-1 ring-white/30 hover:bg-emerald-900"
          >
            Log In
          </a>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  accent,
  items,
  highlight = false,
}: {
  title: string;
  icon: any;
  accent: string;
  items: string[];
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-6 shadow-sm ${
        highlight ? 'border-red-200 bg-red-50/50' : 'border-slate-200'
      }`}
    >
      <div className={`flex items-center gap-2 ${accent}`}>
        <Icon className="h-5 w-5" />
        <h3 className="text-lg font-bold">{title}</h3>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-slate-800">
            {highlight ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-red-600" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
            )}
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
