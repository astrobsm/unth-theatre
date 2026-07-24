'use client';

import Link from 'next/link';
import { ArrowLeft, CalendarDays, Users, Stethoscope, HeartPulse, Wrench, Truck, Sparkles, Pill } from 'lucide-react';
import { ROSTER_DEPARTMENTS } from '@/lib/rosterDepartments';

const ICONS: Record<string, any> = {
  nursing: Users, anaesthetists: Stethoscope, 'nurse-anaesthetists': HeartPulse,
  'anaesthetic-technicians': Wrench, porters: Truck, cleaners: Sparkles, pharmacy: Pill,
};

export default function DepartmentRosterHub() {
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <Link href="/dashboard/roster" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4" /> Duty Roster</Link>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg bg-primary-100 flex items-center justify-center"><CalendarDays className="w-6 h-6 text-primary-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Department Rosters</h1>
          <p className="text-sm text-gray-500">Each department manages its own weekly roster — build a draft, then publish. Only published rosters drive theatre/booking/on-duty.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ROSTER_DEPARTMENTS.map((d) => {
          const Icon = ICONS[d.slug] ?? Users;
          return (
            <Link key={d.slug} href={`/dashboard/roster/dept/${d.slug}`}
              className="card hover:border-primary-300 border-2 border-transparent transition-colors flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0"><Icon className="w-6 h-6 text-teal-600" /></div>
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">{d.label}</h3>
                <p className="text-xs text-gray-500">/roster/{d.slug}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
