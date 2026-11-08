'use client';

/**
 * Who is on the holding area, shown on the holding area itself.
 *
 * The allocation already existed — a theatre manager names somebody to the
 * holding area for a shift on the staffing screen, and it is written into the
 * roster. But the holding area page, the one a nurse actually works from, said
 * nothing about it. So the person standing in the room, and anyone ringing to
 * ask who is in it, had to open a different screen to find out; in practice
 * nobody did, and "who was on the holding area this morning" was answered from
 * memory.
 *
 * ALL THREE SHIFTS, NOT JUST THE CURRENT ONE. A patient is wheeled in at the
 * end of one shift and handed over in the next, so whoever is reading this
 * needs the name on either side of the boundary, not only the name on now.
 *
 * AN EMPTY CURRENT SHIFT IS SAID OUT LOUD. A blank row reads as "not loaded
 * yet"; this says nobody is named, and it only says it for a day and shift
 * where that is a live problem rather than a historical one.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, UserPlus, AlertTriangle } from 'lucide-react';
import { watMinutesOfDay } from '@/lib/watDay';
import { electiveShiftFromMinutes, type DutyShift } from '@/lib/rosterOnDutyShift';

interface Allocation {
  id: string;
  userId: string | null;
  staffName: string;
  shift: string;
  notes: string | null;
  allocatedByName: string | null;
  allocatedAt: string | null;
}

/** Same three, in the same words, as the staffing screen that writes them. */
const SHIFTS: Array<{ value: DutyShift; label: string; hours: string }> = [
  { value: 'MORNING', label: 'Morning', hours: '08:00–16:00' },
  { value: 'CALL', label: 'Call', hours: '16:00–22:00' },
  { value: 'NIGHT', label: 'Night', hours: '22:00–08:00' },
];

export default function HoldingAreaStaffBand({
  date, isToday,
}: {
  /** YYYY-MM-DD, the day the page is showing. */
  date: string;
  /** Whether that day is today, in the hospital's own time. */
  isToday: boolean;
}) {
  const [staff, setStaff] = useState<Allocation[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!date) return;
    try {
      const res = await fetch(`/api/holding-area/staffing?date=${encodeURIComponent(date)}`);
      if (!res.ok) throw new Error('staffing lookup failed');
      const json = await res.json();
      setStaff(Array.isArray(json.staff) ? json.staff : []);
      setFailed(false);
    } catch {
      // Say nothing rather than claim nobody is on. An allocation that failed
      // to load is not an empty holding area, and showing it as one would send
      // somebody looking for a nurse who is standing right there.
      setStaff(null);
      setFailed(true);
    }
  }, [date]);

  useEffect(() => { void load(); }, [load]);

  // Only meaningful for today: on any other day no shift is "on now".
  const currentShift: DutyShift | null = isToday
    ? electiveShiftFromMinutes(watMinutesOfDay(new Date()))
    : null;

  if (failed) {
    return (
      <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        Who is on the holding area could not be loaded.{' '}
        <button type="button" onClick={() => void load()} className="underline font-medium">
          Try again
        </button>
      </div>
    );
  }

  if (staff === null) {
    return (
      <div className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-400">
        Loading who is on the holding area…
      </div>
    );
  }

  const forShift = (s: DutyShift) => staff.filter((a) => a.shift === s);
  const onNow = currentShift ? forShift(currentShift) : [];
  const nobodyOnNow = currentShift !== null && onNow.length === 0;

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Users className="h-4 w-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-800">On the holding area</h2>
        <Link
          href="/dashboard/holding-area/staffing"
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900"
        >
          <UserPlus className="h-3.5 w-3.5" />
          {/* Names the destination rather than promising an action. Only a
              theatre manager and the senior nurses may allocate, and that list
              already lives in two places; a third copy here to pick a verb
              would be the one that drifts. The staffing screen itself shows
              the list to everybody and the form only to those who may use it. */}
          Holding area staffing
        </Link>
      </div>

      {nobodyOnNow && (
        <div className="flex items-start gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            Nobody is named to the holding area for the shift running now. Patients waiting
            here are nobody&apos;s named responsibility until somebody is put on it.
          </span>
        </div>
      )}

      <div className="divide-y divide-gray-50">
        {SHIFTS.map((s) => {
          const rows = forShift(s.value);
          const isNow = currentShift === s.value;
          return (
            <div
              key={s.value}
              className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 ${
                isNow ? 'bg-blue-50/60' : ''
              }`}
            >
              <span className="w-28 flex-shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {s.label}
                {isNow && (
                  <span className="ml-1.5 normal-case tracking-normal text-blue-700">on now</span>
                )}
              </span>
              <span className="w-24 flex-shrink-0 text-xs text-gray-400 tabular-nums">{s.hours}</span>

              {rows.length === 0 ? (
                <span className="text-sm text-gray-400">Nobody named</span>
              ) : (
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                  {rows.map((a) => (
                    <span key={a.id} className="text-sm">
                      <span className={isNow ? 'font-semibold text-gray-900' : 'text-gray-800'}>
                        {a.staffName}
                      </span>
                      {a.notes && <span className="text-gray-500"> — {a.notes}</span>}
                    </span>
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
