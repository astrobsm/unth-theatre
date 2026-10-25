'use client';

/**
 * The slip a patient takes to buy what the hospital could not supply.
 *
 * SIZED FOR 80mm THERMAL PAPER, which is 72mm of printable width. The page
 * rule below is what makes a browser print it as a continuous receipt
 * rather than centring it on an A4 sheet and wasting the roll — and it is
 * scoped to print, so the on-screen preview stays readable.
 *
 * Monospace throughout: the layout is columns of text built by
 * lib/specialNeeds/outsideProcurement, and a proportional font turns those
 * into ragged lines on a 42-character width.
 */

import { useMemo } from 'react';
import { Printer } from 'lucide-react';
import {
  renderSlip,
  canIssue,
  type OutsideSlip,
} from '@/lib/specialNeeds/outsideProcurement';

export default function OutsideProcurementSlip({ slip }: { slip: OutsideSlip }) {
  const lines = useMemo(() => renderSlip(slip), [slip]);
  const issuable = canIssue(slip.items);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <style jsx global>{`
        @media print {
          @page {
            /* 80mm roll; height auto so the receipt is as long as it needs. */
            size: 80mm auto;
            margin: 0;
          }
          body * {
            visibility: hidden;
          }
          #outside-slip,
          #outside-slip * {
            visibility: visible;
          }
          #outside-slip {
            position: absolute;
            left: 0;
            top: 0;
            width: 72mm;
            padding: 2mm;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="no-print mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">Items to buy outside</h3>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!issuable}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          title={issuable ? 'Print on the 80mm thermal printer' : 'Nothing is marked out of stock'}
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>

      {!issuable && (
        <p className="no-print mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          Nothing is marked out of stock for this case. The hospital is supplying everything —
          do not give the patient a prescription.
        </p>
      )}

      <div
        id="outside-slip"
        className="whitespace-pre-wrap break-words bg-white font-mono text-[11px] leading-snug text-black"
      >
        {lines.map((l, i) => (
          <div key={i} className={l.emphasis ? 'font-bold' : undefined}>
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}
