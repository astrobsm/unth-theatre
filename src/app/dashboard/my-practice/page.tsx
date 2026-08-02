'use client';

// ============================================================
// My Practice — the consultant's desk
// ------------------------------------------------------------
// Your cases, and what is missing from them.
//
// It shows YOUR punctuality and nobody else's, and says so on the page. A
// surgeon looking at their own record is reflection; the same screen showing
// a league table of colleagues is the thing the operations module was built
// to avoid, and the difference is one query away, so it is stated in words
// rather than left to trust.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Stethoscope, AlertCircle, Users } from 'lucide-react';
import DeskShell, { Section, type DeskStat } from '@/components/DeskShell';

interface CaseRow {
  id: string;
  procedureName: string;
  scheduledDate: string;
  scheduledTime: string;
  theatre: string | null;
  unit: string | null;
  surgeryType: string;
  patientName: string | null;
  folderNumber: string | null;
  ward: string | null;
  readinessStatus: string;
  outstanding: string[];
  teamSummary: string;
  teamReady: boolean;
  alerted: boolean;
}

export default function MyPracticePage() {
  const [stats, setStats] = useState<DeskStat[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [onTimeNote, setOnTimeNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboards/consultant');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setStats(data.stats || []);
      setCases(data.cases || []);
      setOnTimeNote(data.onTime?.note || '');
    } catch (e: any) {
      setError(e.message || 'Failed to load your practice');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const needing = cases.filter((c) => c.outstanding.length > 0);
  const day = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  const CaseCard = ({ c }: { c: CaseRow }) => (
    <Link
      href={`/dashboard/surgeries`}
      className={`block rounded-xl border p-3 hover:shadow-sm transition ${
        c.outstanding.length ? 'border-amber-300 bg-amber-50/40' : 'bg-white'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium text-gray-900">{c.procedureName}</div>
          <div className="text-xs text-gray-600">
            {day(c.scheduledDate)} · {c.scheduledTime} · {c.theatre || 'Theatre not allocated'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {c.patientName || 'Patient not named'}
            {c.ward ? ` · ${c.ward}` : ''}
            {c.surgeryType !== 'ELECTIVE' ? ` · ${c.surgeryType}` : ''}
          </div>
        </div>
        <div className="text-right">
          <div
            className={`text-xs px-2 py-1 rounded-full border inline-flex items-center gap-1 ${
              c.teamReady
                ? 'bg-green-50 text-green-800 border-green-200'
                : 'bg-gray-50 text-gray-600 border-gray-200'
            }`}
          >
            <Users className="w-3 h-3" />
            {c.teamSummary}
          </div>
        </div>
      </div>

      {c.outstanding.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.outstanding.map((o) => (
            <span
              key={o}
              className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200"
            >
              {o}
            </span>
          ))}
        </div>
      )}
    </Link>
  );

  return (
    <DeskShell
      title="My Practice"
      subtitle="Your cases this week, and what is still missing from them."
      icon={<Stethoscope className="w-6 h-6 text-blue-600" />}
      loading={loading}
      error={error}
      onRefresh={load}
      stats={stats}
      footnote={onTimeNote}
    >
      <Section
        title="Needs something before it can run"
        count={needing.length}
        empty="Nothing outstanding on your cases this week."
      >
        <div className="space-y-2">
          {needing.map((c) => (
            <CaseCard key={c.id} c={c} />
          ))}
        </div>
      </Section>

      <Section
        title="Your list, next seven days"
        count={cases.length}
        empty="You are not on the team for any case in the next seven days."
      >
        <div className="space-y-2">
          {cases.map((c) => (
            <CaseCard key={c.id} c={c} />
          ))}
        </div>
      </Section>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 flex gap-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          Punctuality can only be measured on cases where the theatre recorded the milestones —
          patient sent for, in room, knife to skin. Where those are missing the case is left out of
          the figure rather than counted as late.
        </span>
      </div>
    </DeskShell>
  );
}
