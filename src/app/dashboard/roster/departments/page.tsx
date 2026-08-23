'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { ArrowLeft, CalendarDays, Users, Stethoscope, HeartPulse, Wrench, Truck, Sparkles, Pill, Link2, Check, UploadCloud } from 'lucide-react';
import { ROSTER_DEPARTMENTS, canManageRosterDept, type RosterDept } from '@/lib/rosterDepartments';
import RosterBulkUploadModal from '@/components/RosterBulkUploadModal';

const ICONS: Record<string, any> = {
  anaesthetists: Stethoscope, 'nurse-anaesthetists': HeartPulse,
  'anaesthetic-technicians': Wrench, porters: Truck, cleaners: Sparkles, pharmacy: Pill,
};

export default function DepartmentRosterHub() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const [copied, setCopied] = useState<string | null>(null);
  const [bulkDept, setBulkDept] = useState<RosterDept | null>(null);

  const shareUrl = (slug: string) =>
    `${typeof window !== 'undefined' ? window.location.origin : ''}/roster/${slug}`;

  const copyLink = async (slug: string) => {
    const url = shareUrl(slug);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for older webviews without the async clipboard API.
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(slug);
    setTimeout(() => setCopied((c) => (c === slug ? null : c)), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <Link href="/dashboard/roster" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4" /> Duty Roster</Link>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg bg-primary-100 flex items-center justify-center"><CalendarDays className="w-6 h-6 text-primary-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Department Rosters</h1>
          <p className="text-sm text-gray-500">Each department manages its own weekly roster — build a draft, then publish. Only published rosters drive theatre/booking/on-duty. Use the link button to share a department's page.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ROSTER_DEPARTMENTS.map((d) => {
          const Icon = ICONS[d.slug] ?? Users;
          const canManage = canManageRosterDept(d, role);
          return (
            <div key={d.slug} className="card border-2 border-transparent hover:border-primary-300 transition-colors">
              <div className="flex items-center gap-3">
                <Link href={`/dashboard/roster/dept/${d.slug}`} className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-11 h-11 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0"><Icon className="w-6 h-6 text-teal-600" /></div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{d.label}</h3>
                    <p className="text-xs text-gray-500 truncate">/roster/{d.slug}</p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => copyLink(d.slug)}
                  title={`Copy shareable link (${shareUrl(d.slug)})`}
                  aria-label={`Copy shareable link for ${d.label}`}
                  className={`flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-lg border ${copied === d.slug ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-primary-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  {copied === d.slug ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Link2 className="w-3.5 h-3.5" /> Copy link</>}
                </button>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setBulkDept(d)}
                  className="mt-2 w-full inline-flex items-center justify-center gap-1 text-xs font-medium px-2 py-1.5 rounded-lg border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100"
                >
                  <UploadCloud className="w-3.5 h-3.5" /> Bulk upload roster
                </button>
              )}
            </div>
          );
        })}
      </div>

      {bulkDept && (
        <RosterBulkUploadModal
          dept={bulkDept.slug}
          label={bulkDept.label}
          onClose={() => setBulkDept(null)}
        />
      )}
    </div>
  );
}
