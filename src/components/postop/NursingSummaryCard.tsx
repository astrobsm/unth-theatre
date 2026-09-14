'use client';

// ============================================================
// The sheet the ward reads
// ------------------------------------------------------------
// Rendered from the signed note, never stored, so it cannot disagree with what
// was signed. Printable on its own: the print rules below hide everything else
// on the page, because a nurse asked to print "the instructions" should get one
// sheet and not eleven pages of the application around it.
//
// Escalation is red and first. Everything else on this sheet can wait until the
// reader has a moment; that part cannot.
// ============================================================

import { Printer, AlertTriangle } from 'lucide-react';
import type { NursingSummary } from '@/lib/postop/nursingSummary';

export default function NursingSummaryCard({
  summary, patientName, folderNumber, procedure, ward,
}: {
  summary: NursingSummary;
  patientName?: string;
  folderNumber?: string;
  procedure?: string;
  ward?: string;
}) {
  if (!summary.entries.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
        No post-operative instructions have been recorded yet.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white print:border-0" id="nursing-summary">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #nursing-summary, #nursing-summary * { visibility: visible; }
          #nursing-summary { position: absolute; inset: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex items-start justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Nursing management summary</h2>
          <p className="text-sm text-gray-600">
            {patientName}{folderNumber ? ` (${folderNumber})` : ''}
            {ward ? ` — ${ward}` : ''}
          </p>
          {procedure && <p className="text-sm text-gray-600">{procedure}</p>}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="no-print inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <Printer className="h-4 w-4" /> Print
        </button>
      </div>

      <div className="divide-y divide-gray-100">
        {summary.entries.map((entry) => (
          <div
            key={entry.heading}
            className={`px-4 py-3 ${entry.urgent ? 'bg-red-50' : ''}`}
          >
            <h3
              className={`flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide ${
                entry.urgent ? 'text-red-800' : 'text-gray-700'
              }`}
            >
              {entry.urgent && <AlertTriangle className="h-4 w-4" />}
              {entry.heading}
            </h3>
            <ul className="mt-1 space-y-0.5">
              {entry.lines.map((line, i) => (
                <li
                  key={i}
                  className={`text-sm ${entry.urgent ? 'font-medium text-red-900' : 'text-gray-800'}`}
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="border-t border-gray-200 px-4 py-3 text-xs text-gray-500">
        {summary.attribution}
      </p>
    </div>
  );
}
