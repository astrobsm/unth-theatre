'use client';

import Link from 'next/link';
import { ArrowLeft, ClipboardCheck, Stethoscope, Wrench, UserCog, Sparkles, Pill, Bed, Users } from 'lucide-react';

interface GroupCard {
  slug: string;
  title: string;
  blurb: string;
  icon: any;
  color: string;
}

const GROUPS: GroupCard[] = [
  { slug: 'nurses',                 title: 'Nurses',                 blurb: 'Morning & Night shifts. Sub-roles: scrub, circulating, holding area, supervising. Main Theatre or A&E.', icon: Users,        color: 'bg-green-100 text-green-700 border-green-200' },
  { slug: 'anaesthetists',          title: 'Anaesthetists',          blurb: 'Mon–Fri elective 8am–4pm; on-call covers all weekday emergencies. Sat/Sun = call (weekend emergencies). Separate A&E roster.', icon: Stethoscope,  color: 'bg-red-100 text-red-700 border-red-200' },
  { slug: 'anaesthetic-technicians', title: 'Anaesthetic Technicians', blurb: 'Same shift pattern as anaesthetists. Main Theatre or A&E.', icon: UserCog,      color: 'bg-pink-100 text-pink-700 border-pink-200' },
  { slug: 'porters',                title: 'Porters',                blurb: 'Morning & Night shifts.',                                       icon: Wrench,       color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { slug: 'cleaners',               title: 'Cleaners',               blurb: 'Morning & Night shifts.',                                       icon: Sparkles,     color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { slug: 'pharmacists',            title: 'Pharmacists',            blurb: 'Morning & Night shifts.',                                       icon: Pill,         color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  { slug: 'recovery-nurses',        title: 'Nurse Anaesthetists',   blurb: 'Morning & Night shifts in PACU.',                               icon: Bed,          color: 'bg-purple-100 text-purple-700 border-purple-200' },
];

function nextSaturdayDeadline(): { date: Date; isPast: boolean } {
  // Deadline is THIS week's Saturday at 5:00 PM (local time).
  const now = new Date();
  const day = now.getDay(); // 0=Sun .. 6=Sat
  const offsetToSat = (6 - day + 7) % 7; // days until Sat
  const sat = new Date(now);
  sat.setDate(now.getDate() + offsetToSat);
  sat.setHours(17, 0, 0, 0);
  const isPast = day === 6 && now.getHours() >= 17;
  return { date: sat, isPast };
}

export default function WeeklyRosterHubPage() {
  const { date, isPast } = nextSaturdayDeadline();
  const formatted = date.toLocaleString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/roster" className="text-gray-500 hover:text-gray-800 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Duty Roster
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardCheck className="w-7 h-7 text-primary-600" />
          Weekly Roster Forms
        </h1>
        <p className="text-gray-600 mt-2">
          Each unit lead fills the roster for their group <strong>every Saturday before 5:00 PM</strong> for the upcoming week.
        </p>
      </div>

      <div className={`rounded-lg border p-4 ${isPast ? 'bg-red-50 border-red-300 text-red-800' : 'bg-amber-50 border-amber-300 text-amber-900'}`}>
        <p className="font-semibold">
          {isPast ? '⚠ Deadline passed' : '🕛 Submission deadline'} — {formatted}
        </p>
        <p className="text-sm mt-1">
          {isPast
            ? 'This week\'s submission window has closed. Late entries will be flagged in the audit log.'
            : 'Please complete and submit your group\'s weekly roster before the cut-off.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {GROUPS.map((g) => {
          const Icon = g.icon;
          return (
            <Link
              key={g.slug}
              href={`/dashboard/roster/weekly/${g.slug}`}
              className={`block border rounded-xl p-5 hover:shadow-lg transition ${g.color}`}
            >
              <div className="flex items-center gap-3 mb-2">
                <Icon className="w-6 h-6" />
                <h2 className="text-lg font-bold">{g.title}</h2>
              </div>
              <p className="text-sm leading-snug opacity-90">{g.blurb}</p>
              <p className="text-xs mt-3 font-semibold uppercase tracking-wide">Open form →</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
