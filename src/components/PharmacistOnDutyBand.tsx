'use client';

// ============================================================
// The pharmacist on duty, on the surgery schedule
// ------------------------------------------------------------
// Asked for on 12 November, alongside the nurse supervisor band: name the
// pharmacist on duty for the day and shift, with a number, and when there is
// none to fetch, show the standing contact instead.
//
// WHY THE BAND SAYS WHICH ONE IT FOUND. "Rostered this shift" and "the only
// pharmacist in the system" and "the standing contact" are three different
// promises, and theatre behaves differently depending on which it is holding:
// the first can be told the case is waiting, the last is being rung as a
// favour. A band that printed a name and a number for all three would be
// lying by omission about the two that are not a roster.
//
// A NUMBER THAT RINGS NOBODY IS WORSE THAN NO NUMBER. So a name with no phone
// on file says so plainly rather than rendering a dead link, and when the
// standing contact cannot be resolved the band says that too, with what to do.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Pill, Phone, AlertTriangle } from 'lucide-react';
import { whatsappChatLink } from '@/lib/whatsapp';

interface Person {
  userId: string;
  name: string;
  phoneNumber: string | null;
  extension?: string | null;
  shift?: string | null;
  source: 'roster' | 'role' | 'standing' | 'none';
}

interface Payload {
  date: string;
  shift: 'MORNING' | 'CALL' | 'NIGHT' | null;
  isToday: boolean;
  source: 'roster' | 'role' | 'standing' | 'none';
  people: Person[];
  standingName: string;
  ambiguous?: boolean;
}

const SHIFT_LABEL: Record<string, string> = {
  MORNING: 'Morning',
  CALL: 'Day call',
  NIGHT: 'Night',
};

export default function PharmacistOnDutyBand({ date }: { date: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (forDate: string) => {
    try {
      const res = await fetch(`/api/pharmacy/on-duty?date=${forDate}`);
      if (!res.ok) { setData(null); return; }
      setData(await res.json());
    } catch {
      // The schedule is the point of this page. A band that failed to load
      // must not stop it drawing, and must not claim there is nobody either —
      // it simply does not render.
      setData(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { if (date) void load(date); }, [date, load]);

  if (!date || !loaded || !data) return null;

  const shiftText = data.shift
    ? `${SHIFT_LABEL[data.shift] ?? data.shift} shift`
    : 'all shifts that day';

  if (data.source === 'none') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
        <AlertTriangle className="mr-1.5 inline h-4 w-4" />
        {data.ambiguous ? (
          <>
            No pharmacist is on duty for the {shiftText}, and more than one person
            answers to <strong>{data.standingName}</strong> — so there is no number
            here that is safe to ring.
          </>
        ) : (
          <>
            No pharmacist is on duty for the {shiftText}, and no standing contact
            could be found. A case held up for drugs has nobody to chase.
          </>
        )}{' '}
        <Link href="/dashboard/roster" className="font-semibold underline">
          Put one on the roster
        </Link>
      </div>
    );
  }

  const note =
    data.source === 'roster'
      ? `On duty · ${shiftText}`
      : data.source === 'role'
        ? 'Nobody is rostered — this is the pharmacist on record'
        : `Nobody is rostered — standing contact`;

  return (
    <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 px-4 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-cyan-800">
        <Pill className="h-4 w-4" />
        Pharmacist{data.people.length > 1 ? 's' : ''} {data.source === 'roster' ? 'on duty' : 'to ring'}
        <span className="ml-1 font-normal normal-case tracking-normal text-cyan-700">· {note}</span>
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1.5">
        {data.people.map((p) => (
          <li key={p.userId} className="text-sm text-gray-900">
            <span className="font-semibold">{p.name}</span>
            {p.shift && data.source === 'roster' && (
              <span className="text-gray-600">{' · '}{SHIFT_LABEL[p.shift] ?? p.shift}</span>
            )}
            {p.phoneNumber ? (
              <a
                href={whatsappChatLink(p.phoneNumber) || `tel:${p.phoneNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 inline-flex items-center gap-1 font-medium text-cyan-800 hover:underline"
              >
                <Phone className="h-3.5 w-3.5" />{p.phoneNumber}
              </a>
            ) : (
              <span className="ml-2 text-xs text-gray-500">(no phone on file)</span>
            )}
            {p.extension && <span className="ml-2 text-xs text-gray-700">ext {p.extension}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
