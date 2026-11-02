'use client';

/**
 * The joint cases another unit has asked this surgeon onto.
 *
 * RENDERS NOTHING when nobody has. Most surgeons, most weeks, are on no joint
 * case at all, and a permanent panel saying so is one people learn to scroll
 * past — and then they scroll past it on the week it is not empty.
 *
 * TOMORROW IS CALLED OUT BY NAME, in amber, because that is the request this
 * was built for: an invited surgeon knowing the day before rather than when
 * the telephone rings on the morning. Today is red for the same reason, only
 * more so.
 *
 * IT SAYS WHAT THEY ARE BEING ASKED FOR. "You are on a case" sends a surgeon
 * looking for the booking; "Cardiothoracic, for vascular control" tells them
 * whether to bring an assistant and what instruments to ask for. The booking
 * form offers that field precisely so this line can exist.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronRight, Users } from 'lucide-react';

interface JointCase {
  id: string;
  patientName: string;
  folderNumber: string | null;
  procedureName: string;
  bookingUnit: string;
  leadSurgeonName: string | null;
  scheduledDate: string;
  scheduledTime: string | null;
  theatre: string | null;
  status: string;
  surgeryType: string;
  myUnit: string;
  myRole: string | null;
  note: string | null;
  units: string[];
}

interface Counts {
  total: number;
  today: number;
  tomorrow: number;
  imminent: number;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  const d = new Date(`${iso}T00:00:00.000Z`);
  return d.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

function dayTone(iso: string, today: string): string {
  if (iso === today) return 'bg-red-600 text-white';
  if (iso === addDays(today, 1)) return 'bg-amber-500 text-white';
  return 'bg-gray-100 text-gray-700';
}

export default function JointCasesCard() {
  const [cases, setCases] = useState<JointCase[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [head, setHead] = useState('');
  const [today, setToday] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/surgeries/joining?days=7', { cache: 'no-store' });
      if (!res.ok) return; // Not signed in, or unavailable. Say nothing.
      const d = await res.json();
      setCases(d.cases ?? []);
      setCounts(d.counts ?? null);
      setHead(d.headline ?? '');
      setToday(d.from ?? '');
    } catch {
      // Never let this break a dashboard.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!counts || counts.total === 0) return null;

  const urgent = counts.imminent > 0;

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border mb-6 overflow-hidden ${
        urgent ? 'border-amber-300' : 'border-gray-200'
      }`}
    >
      <div
        className={`px-4 py-3 border-b flex flex-wrap items-center gap-3 ${
          urgent ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'
        }`}
      >
        <Users className={`w-5 h-5 ${urgent ? 'text-amber-700' : 'text-gray-600'}`} />
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900">Joint cases you are on</h2>
          <p className="text-sm text-gray-700">{head}</p>
        </div>
      </div>

      <ul className="divide-y divide-gray-100">
        {cases.map((c) => (
          <li key={`${c.id}-${c.myUnit}`} className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${dayTone(c.scheduledDate, today)}`}
                  >
                    {dayLabel(c.scheduledDate, today)}
                  </span>
                  {c.scheduledTime && (
                    <span className="text-xs text-gray-600 inline-flex items-center gap-1">
                      <CalendarClock className="w-3 h-3" />{c.scheduledTime}
                    </span>
                  )}
                  {c.surgeryType === 'EMERGENCY' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-900">
                      Emergency
                    </span>
                  )}
                </div>

                <div className="text-sm font-medium text-gray-900 mt-1">
                  {c.patientName}{c.folderNumber ? ` · ${c.folderNumber}` : ''}
                </div>
                <div className="text-sm text-gray-600">{c.procedureName}</div>

                {/* What they are actually being asked for. The reason the
                    booking form offers the field at all. */}
                <div className="text-sm text-gray-800 mt-1">
                  You are on this case for{' '}
                  <span className="font-medium">{c.myUnit}</span>
                  {c.myRole ? <> — {c.myRole}</> : null}.
                </div>

                <div className="text-xs text-gray-500 mt-0.5">
                  {c.bookingUnit}&rsquo;s case
                  {c.leadSurgeonName ? `, led by ${c.leadSurgeonName}` : ''}
                  {c.theatre ? ` · ${c.theatre}` : ''}
                  {c.units.length > 1
                    ? ` · ${c.units.length} units joining`
                    : ''}
                </div>

                {c.note && (
                  <p className="text-xs text-gray-600 mt-1 italic">{c.note}</p>
                )}
              </div>

              <Link
                href={`/dashboard/surgeries/${c.id}`}
                className="text-xs text-gray-600 hover:text-gray-900 inline-flex items-center gap-1 shrink-0"
              >
                Open <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
