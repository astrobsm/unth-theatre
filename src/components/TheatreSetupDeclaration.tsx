'use client';

import { useState } from 'react';
import { AlertTriangle, ShieldCheck, X } from 'lucide-react';
import {
  SETUP_DECLARATION_BODY,
  SETUP_DECLARATION_TITLE,
  SETUP_DECLARATION_VERSION,
} from '@/lib/theatreOps/setupCertification';

/**
 * The declaration a technician acknowledges before certifying a theatre ready.
 *
 * Built to be un-dismissable-by-reflex rather than merely prominent. The
 * confirm button stays disabled until the box is ticked, the box is not
 * pre-ticked, and nothing here can be satisfied by pressing Enter on a
 * keyboard — because a warning that can be cleared without being read is a
 * warning that will be.
 *
 * The version travels with the acknowledgement so the record can answer, later
 * and precisely, what this person agreed to.
 */
export default function TheatreSetupDeclaration({
  theatreName,
  outstanding,
  submitting,
  onCancel,
  onConfirm,
}: {
  theatreName: string;
  /** Checks not yet ticked. Non-empty means certification is impossible. */
  outstanding: string[];
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (ack: { acknowledged: true; version: string }) => void;
}) {
  const [ticked, setTicked] = useState(false);
  const blocked = outstanding.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 rounded-t-xl bg-red-700 p-4 text-white">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 shrink-0" />
            <h2 className="text-lg font-bold uppercase tracking-wide">{SETUP_DECLARATION_TITLE}</h2>
          </div>
          <button type="button" onClick={onCancel} className="rounded p-1 hover:bg-red-800" title="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm font-medium text-gray-700">
            You are about to certify <span className="font-bold">{theatreName}</span> as ready for use.
          </p>

          <div className="space-y-3 rounded-lg border-2 border-red-200 bg-red-50 p-4">
            {SETUP_DECLARATION_BODY.map((para, i) => (
              <p key={i} className={`text-sm text-red-900 ${i === 1 ? 'font-semibold' : ''}`}>
                {para}
              </p>
            ))}
            <p className="text-sm font-bold uppercase tracking-wide text-red-900">
              False or misleading documentation is prohibited.
            </p>
          </div>

          {blocked ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">
                {outstanding.length} check{outstanding.length === 1 ? '' : 's'} still outstanding.
              </p>
              <ul className="mt-1 list-inside list-disc">
                {outstanding.map((o) => <li key={o}>{o}</li>)}
              </ul>
              <p className="mt-2">
                This theatre cannot be certified until these are done. If it cannot be made
                ready, close this and report the deficiency instead — that route exists and
                is the correct one.
              </p>
            </div>
          ) : (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-gray-300 p-3 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={ticked}
                onChange={(e) => setTicked(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0"
              />
              <span className="text-sm text-gray-900">
                I have personally completed and checked the setup of this theatre, and I am
                recording that it is ready for use.
              </span>
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t p-4">
          <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            disabled={blocked || !ticked || submitting}
            onClick={() => onConfirm({ acknowledged: true, version: SETUP_DECLARATION_VERSION })}
            className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" />
            {submitting ? 'Recording…' : 'Confirm theatre is ready'}
          </button>
        </div>
      </div>
    </div>
  );
}
