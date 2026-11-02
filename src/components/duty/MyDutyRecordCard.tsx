'use client';

/**
 * A colleague's own duty record, on their own dashboard.
 *
 * RENDERS NOTHING FOR ANYBODY WHO CARRIES NONE OF THESE DUTIES. The endpoint
 * returns carriesNone for a manager or an administrator and the card does not
 * appear — the same self-gating pattern as the celebrations card, and the
 * reason the dashboard does not need to know who is reading it.
 *
 * WHAT THIS IS FOR. Until now these figures existed only on theatre
 * management's board, so the first a nurse heard of her own record was a chase
 * message. Shown her own two unrecorded discharges on the Tuesday, she enters
 * them on the Tuesday and there is no chase to send.
 *
 * SO OUTSTANDING WORK LEADS, not the percentage. A percentage describes a
 * month that has already happened; the outstanding count is the part somebody
 * can still do something about this afternoon, and it is what the card opens
 * with and what the rows are sorted by.
 *
 * AND IT IS NOT A LEAGUE TABLE. Nobody else's name appears here, ever. The
 * position is shown as "4th of 11" and only where eleven is big enough for
 * that to be a ranking rather than a comparison with one named colleague —
 * which is a conversation to have face to face, not on a dashboard.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Award, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, TrendingUp,
} from 'lucide-react';

type Band = 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION' | 'TOO_FEW';

interface Standing {
  duty: string;
  label: string;
  owner: string;
  where: string;
  whyShort: string;
  total: number;
  done: number;
  outstanding: number;
  late: number;
  onTime: number;
  onTimeShare: number | null;
  rank: number | null;
  ofRanked: number;
  band: Band;
  perfect: boolean;
  headline: string;
}

interface Counts {
  duties: number;
  outstanding: number;
  late: number;
  total: number;
  needsAttention: number;
  excellent: number;
  bestRank: { duty: string; label: string; rank: number; ofRanked: number } | null;
}

const BAND_LABEL: Record<Band, string> = {
  EXCELLENT: 'On top of it',
  GOOD: 'Keeping up',
  NEEDS_ATTENTION: 'Falling behind',
  TOO_FEW: 'Too few to score',
};

const BAND_TONE: Record<Band, string> = {
  EXCELLENT: 'bg-green-100 text-green-900',
  GOOD: 'bg-blue-100 text-blue-900',
  NEEDS_ATTENTION: 'bg-amber-100 text-amber-900',
  TOO_FEW: 'bg-gray-100 text-gray-700',
};

const MIN_RANKED_FOR_RANK = 3;

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);

export default function MyDutyRecordCard() {
  const [duties, setDuties] = useState<Standing[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [head, setHead] = useState('');
  const [period, setPeriod] = useState('');
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/my-duty-record?days=30', { cache: 'no-store' });
      if (!res.ok) return; // Not signed in, or unavailable. Say nothing.
      const d = await res.json();
      if (d.carriesNone) return;
      setDuties(d.duties ?? []);
      setCounts(d.counts ?? null);
      setHead(d.headline ?? '');
      setPeriod(d.periodLabel ?? '');
    } catch {
      // Never let this break a dashboard.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Nobody is shown an empty panel: a colleague with nothing recorded against
  // them in the period has nothing to read here.
  if (!counts || counts.duties === 0 || duties.length === 0) return null;

  const needsWork = counts.outstanding > 0 || counts.needsAttention > 0;
  const tone = needsWork
    ? 'border-amber-200'
    : (counts.late === 0 ? 'border-green-200' : 'border-blue-200');
  const headTone = needsWork
    ? 'bg-amber-50 border-amber-100'
    : (counts.late === 0 ? 'bg-green-50 border-green-100' : 'bg-blue-50 border-blue-100');

  return (
    <div className={`bg-white rounded-lg shadow-sm border ${tone} mb-6 overflow-hidden`}>
      <div className={`px-4 py-3 border-b ${headTone} flex flex-wrap items-center gap-3`}>
        {needsWork
          ? <ClipboardList className="w-5 h-5 text-amber-700" />
          : <Award className="w-5 h-5 text-green-700" />}
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900">Your record</h2>
          <p className="text-sm text-gray-700">{head}</p>
          <p className="text-xs text-gray-500 mt-0.5">{period}</p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
        >
          {open ? 'Hide' : `Show ${duties.length === 1 ? 'the duty' : `all ${duties.length}`}`}
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* The one thing worth saying when there is nothing to fix. A colleague
          who is doing this properly is told so, in one line, by the same
          system that would otherwise only ever write to them when they slip. */}
      {!needsWork && counts.bestRank && (
        <div className="px-4 py-3 border-b border-gray-100 flex items-start gap-2">
          <TrendingUp className="w-4 h-4 mt-0.5 text-green-700 shrink-0" />
          <p className="text-sm text-gray-800">
            {ordinal(counts.bestRank.rank)} of {counts.bestRank.ofRanked} colleagues on{' '}
            <span className="font-medium">{counts.bestRank.label.toLowerCase()}</span>{' '}
            over this period. Thank you.
          </p>
        </div>
      )}

      {open && (
        <ul className="divide-y divide-gray-100">
          {duties.map((s) => (
            <li key={s.duty} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{s.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${BAND_TONE[s.band]}`}>
                      {BAND_LABEL[s.band]}
                    </span>
                    {s.rank !== null && s.ofRanked >= MIN_RANKED_FOR_RANK && (
                      <span className="text-xs text-gray-500">
                        {ordinal(s.rank)} of {s.ofRanked}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{s.headline}</p>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1.5">
                    <span>{s.total} assigned</span>
                    <span>{s.onTime} on time</span>
                    {s.late > 0 && <span className="text-amber-700">{s.late} late</span>}
                    {s.outstanding > 0 && (
                      <span className="text-red-700 font-medium">
                        {s.outstanding} not done
                      </span>
                    )}
                    <span>{pct(s.onTimeShare)} on time</span>
                  </div>

                  {/* Where to go, shown only where something is actually
                      outstanding. Telling somebody with a clean record where
                      the button is reads as a reprimand for nothing. */}
                  {(s.outstanding > 0 || s.band === 'NEEDS_ATTENTION') && (
                    <p className="text-xs text-gray-600 mt-2">
                      <span className="text-gray-500">Where: </span>{s.where}
                      <span className="block mt-0.5 text-gray-500">{s.whyShort}</span>
                    </p>
                  )}
                </div>

                {s.perfect && (
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}
