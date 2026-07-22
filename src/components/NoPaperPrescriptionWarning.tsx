'use client';

import { AlertTriangle } from 'lucide-react';

/**
 * Mandatory notice shown on every successful booking: all consumables and
 * medications are dispensed electronically through this platform, and issuing a
 * paper/handwritten prescription to the patient is a disciplinary offence.
 *
 * Rendered two ways:
 *  - `variant="banner"` — inline inside a success screen (e.g. the booking-codes
 *    modal on elective booking).
 *  - `variant="modal"`  — a blocking acknowledgement the user must accept before
 *    continuing (used on emergency booking, which navigates straight on).
 */
export function NoPaperPrescriptionWarning({ variant = 'banner' }: { variant?: 'banner' | 'modal' }) {
  const body = (
    <div className="rounded-lg border-2 border-red-400 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-red-900 uppercase tracking-wide">
            No paper prescriptions
          </p>
          <p className="mt-1 text-sm text-red-800">
            All consumables and medications for this patient are prescribed and dispensed
            <span className="font-semibold"> electronically through this platform only</span>.
            The patient must <span className="font-semibold">not</span> be given any paper or
            handwritten prescription, drug list, or consumable list.
          </p>
          <p className="mt-2 text-sm font-semibold text-red-900">
            Issuing a paper prescription is a violation of theatre policy and will be met with
            disciplinary measures.
          </p>
        </div>
      </div>
    </div>
  );

  if (variant === 'banner') return body;
  return body; // modal chrome is supplied by the caller's dialog wrapper
}

/**
 * Full-screen blocking acknowledgement dialog wrapping the warning. Used where
 * the flow navigates away immediately and there is no success screen to host a
 * banner (emergency booking).
 */
export function NoPaperPrescriptionDialog({
  onAcknowledge,
  acknowledging = false,
}: {
  onAcknowledge: () => void;
  acknowledging?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="text-lg font-bold text-green-800 mb-1">Surgery scheduled</h2>
        <p className="text-sm text-gray-600 mb-3">
          The case is booked and the consumable and pharmacy packs have been wired to the
          respective teams.
        </p>
        <NoPaperPrescriptionWarning variant="modal" />
        <button
          onClick={onAcknowledge}
          disabled={acknowledging}
          className="mt-4 w-full inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {acknowledging ? 'Continuing…' : 'I understand — continue'}
        </button>
      </div>
    </div>
  );
}
