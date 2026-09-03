'use client';

/**
 * The floating notice that stands in front of an elective booking.
 *
 * It is deliberately NOT a modal that can be dismissed and forgotten. Both
 * things it reports are conditions that make the booking wrong, so it stays on
 * screen until the condition is gone: choose a patient, or close the operation
 * that was never finished.
 *
 * It is anchored to the bottom on a phone and to the bottom-right on a desktop,
 * clear of the form, because the person has to be able to read it AND act on
 * the field it is telling them about.
 */

import { AlertTriangle, UserRound, Loader2, CheckCircle2 } from 'lucide-react';
import { readableStatus, type GateState, type PriorCase } from '@/lib/bookingGate';

interface Props {
  gate: GateState;
  /** Marks one unfinished case completed. */
  onComplete: (surgeryId: string) => void;
  /** The case currently being closed, if any. */
  completing?: string | null;
  error?: string | null;
}

const when = (d: string | Date) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export default function BookingGateNotice({ gate, onComplete, completing, error }: Props) {
  if (gate.state === 'OPEN') return null;

  const tone =
    gate.state === 'NEEDS_CLOSING'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-blue-300 bg-blue-50 text-blue-900';

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:justify-end"
      role="status"
      aria-live="polite"
    >
      <div className={`pointer-events-auto w-full max-w-md rounded-xl border-2 shadow-lg ${tone}`}>
        <div className="flex items-start gap-2 px-4 py-3">
          {gate.state === 'CHECKING' ? (
            <Loader2 className="mt-0.5 h-5 w-5 flex-shrink-0 animate-spin" />
          ) : gate.state === 'NEEDS_PATIENT' ? (
            <UserRound className="mt-0.5 h-5 w-5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          )}
          <p className="text-sm font-medium">{gate.message}</p>
        </div>

        {gate.state === 'NEEDS_CLOSING' && (
          <div className="border-t border-amber-200 px-4 py-2">
            <ul className="space-y-2">
              {gate.cases.map((c: PriorCase) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 text-xs">
                    <strong className="block truncate">{c.procedureName}</strong>
                    <span className="text-amber-800">
                      {when(c.scheduledDate)} · {readableStatus(c.status)}
                      {c.surgeonName ? ` · ${c.surgeonName}` : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onComplete(c.id)}
                    disabled={completing === c.id}
                    className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {completing === c.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Mark as completed
                  </button>
                </li>
              ))}
            </ul>
            {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
            <p className="mt-2 text-[11px] text-amber-800">
              Only mark an operation completed if it actually took place. If it did not, cancel it on the
              case itself instead — this button records you as the person who closed it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
