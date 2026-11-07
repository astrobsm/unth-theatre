'use client';

// ============================================================
// The nurse supervisors on the surgery schedule
// ------------------------------------------------------------
// Asked for on 7 November: the supervisors assigned for a day are to appear
// on the main surgery schedule page for that day, with their details.
//
// WHY A NAME AND A NUMBER, NOT JUST A NAME. The reason anybody reads this
// band is that something on the list has gone wrong and they need the person
// who can move it. A name without a number sends them to a different screen
// to find one, which in a corridor is the same as no answer at all.
//
// WHEN NOBODY IS NAMED it says so in amber, and says what follows from it,
// rather than drawing an empty row. An unstaffed supervisor post means the
// emergency chase has one fewer person to reach.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye, Phone } from 'lucide-react';

interface Supervisor {
  rosterId: string;
  name: string;
  role: string;
  phoneNumber: string | null;
  shift: string;
  notes: string | null;
}

const SHIFT_LABEL: Record<string, string> = {
  MORNING: 'Morning',
  CALL: 'Day call',
  NIGHT: 'Night',
};

const ROLE_LABEL: Record<string, string> = {
  SCRUB_NURSE: 'Scrub nurse',
  RECOVERY_ROOM_NURSE: 'Recovery nurse',
  INFECTION_CONTROL_NURSE: 'Infection control nurse',
};

export default function NurseSupervisorBand({ date }: { date: string }) {
  const [rows, setRows] = useState<Supervisor[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (forDate: string) => {
    try {
      const res = await fetch(`/api/theatre-nursing/staffing?date=${forDate}`);
      if (!res.ok) { setRows([]); return; }
      const data = await res.json();
      const all = Array.isArray(data.staff) ? data.staff : [];
      setRows(all.filter((s: { subRole?: string }) => s.subRole === 'SUPERVISING'));
    } catch {
      // The schedule is the point of this page; a failed band must not stop it
      // drawing. Shown as "not named" rather than as an error.
      setRows([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { if (date) void load(date); }, [date, load]);

  if (!date || !loaded) return null;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
        <Eye className="mr-1.5 inline h-4 w-4" />
        No nurse supervisor is named for this day, so there is nobody for the
        theatre manager to be chased alongside.{' '}
        <Link href="/dashboard/holding-area/staffing" className="font-semibold underline">
          Name one
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-800">
        <Eye className="h-4 w-4" /> Nurse supervisor{rows.length > 1 ? 's' : ''} today
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1.5">
        {rows.map((s) => (
          <li key={s.rosterId} className="text-sm text-gray-900">
            <span className="font-semibold">{s.name}</span>
            <span className="text-gray-600">
              {' · '}{SHIFT_LABEL[s.shift] ?? s.shift}
              {' · '}{ROLE_LABEL[s.role] ?? s.role.replace(/_/g, ' ').toLowerCase()}
            </span>
            {s.phoneNumber ? (
              <a href={`tel:${s.phoneNumber}`}
                className="ml-2 inline-flex items-center gap-1 font-medium text-indigo-700 hover:underline">
                <Phone className="h-3.5 w-3.5" />{s.phoneNumber}
              </a>
            ) : (
              <span className="ml-2 text-xs text-gray-500">(no phone on file)</span>
            )}
            {s.notes && <span className="ml-2 text-xs text-gray-700">“{s.notes}”</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
