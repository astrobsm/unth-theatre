'use client';

// ============================================================
// What was used for one patient
// ------------------------------------------------------------
// Looked up by PT number, because that is the number everybody outside this
// app already works in — the wristband, the folder, the accounts ledger.
// Asking a supplier or a finance officer for an internal uuid would mean
// giving them a way to find it, which is a second lookup to get to the first.
//
// WHO SEES WHAT. A consumable provider sees their OWN lines, priced at what
// was agreed with them. Hospital-side staff see every supplier's lines,
// priced at what the patient is billed. The page does not decide that — the
// API does, from the signed-in account — and this only renders what comes
// back. Putting the choice in the browser would put it within reach of
// whoever is using the browser.
//
// AND IT IS NOT A BILL. The figure at the top is what was consumed and what
// it is worth. ORM does not hold deposits or payments and cannot say what is
// owed. That sentence is on the page, not in a tooltip, because a page of
// naira totals is read as an invoice otherwise.
// ============================================================

import { useCallback, useState } from 'react';
import {
  AlertTriangle, FileSearch, Loader2, PackageSearch, Search, TriangleAlert,
} from 'lucide-react';

interface Line {
  itemId: string;
  itemName: string;
  category: string;
  batchNumber: string;
  expiryDate: string | null;
  quantityReserved: number;
  quantityIssued: number;
  quantityUsed: number;
  quantityReturned: number;
  quantityWasted: number;
  unitPriceAtReservation: number;
  lineValue: number;
  owner: string;
  vendorName: string | null;
  sourceKind: string | null;
  status: string;
}

interface Case {
  surgeryId: string;
  procedureName: string | null;
  scheduledDate: string | null;
  status: string;
  lines: Line[];
  caseValue: number;
}

interface Statement {
  patient: { id: string; ptNumber: string | null; folderNumber: string; name: string };
  scopedToVendorId: string | null;
  cases: Case[];
  totalValue: number;
  unaccountedLines: number;
  generatedAt: string;
  note: string;
}

/** Kobo in, naira out. The API keeps kobo; only this turns it into money. */
function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function ConsumptionPage() {
  const [pt, setPt] = useState('');
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const look = useCallback(async () => {
    const q = pt.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setStatement(null);
    try {
      const res = await fetch(
        `/api/consumable-provider/consumption?pt=${encodeURIComponent(q)}`,
        { cache: 'no-store' },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? 'That could not be looked up.');
        return;
      }
      setStatement(d as Statement);
    } catch {
      setError('The server did not answer. Check the connection and try again.');
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, [pt]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <PackageSearch className="h-6 w-6 text-blue-600" /> Items used for a patient
        </h1>
        <p className="mt-1 max-w-2xl text-gray-600">
          Everything consumed in theatre for one patient, with the quantities reserved,
          issued, used, returned and written off. For reconciliation.
        </p>
      </div>

      {/* ── Lookup ── */}
      <form
        onSubmit={(e) => { e.preventDefault(); void look(); }}
        className="rounded-2xl bg-white p-5 ring-1 ring-gray-200"
      >
        <label htmlFor="pt-number" className="block text-sm font-semibold text-gray-800">
          PT number
        </label>
        <p className="mt-0.5 text-sm text-gray-600">
          The patient&rsquo;s PT number, as it appears on the folder.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id="pt-number"
            value={pt}
            onChange={(e) => setPt(e.target.value)}
            placeholder="PT12345"
            className="min-w-0 flex-1 rounded-xl border border-gray-300 px-4 py-2.5 font-mono text-sm"
          />
          <button
            type="submit"
            disabled={loading || !pt.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Look up
          </button>
        </div>
      </form>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {searched && !error && statement && statement.cases.length === 0 && (
        <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-gray-200">
          <FileSearch className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-2 font-semibold text-gray-900">
            Nothing recorded as used for {statement.patient.name}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            {statement.scopedToVendorId
              ? 'None of your items have been consumed for this patient. Items supplied by '
                + 'others are not shown here.'
              : 'No theatre consumption has been recorded against this patient yet.'}
          </p>
        </div>
      )}

      {statement && statement.cases.length > 0 && (
        <>
          {/* ── Header figures ── */}
          <div className="rounded-2xl bg-white p-5 ring-1 ring-gray-200">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-lg font-bold text-gray-900">{statement.patient.name}</p>
                <p className="font-mono text-sm text-gray-600">
                  PT {statement.patient.ptNumber ?? '—'} · Folder {statement.patient.folderNumber}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-gray-500">Value of items used</p>
                <p className="text-2xl font-bold tabular-nums text-gray-900">
                  {naira(statement.totalValue)}
                </p>
                <p className="text-xs text-gray-500">
                  {statement.cases.length} case{statement.cases.length > 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* The sentence that stops this being read as an invoice. */}
            <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
              {statement.note}
            </p>

            {statement.unaccountedLines > 0 && (
              <p className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="font-semibold">
                    {statement.unaccountedLines} line
                    {statement.unaccountedLines > 1 ? 's were' : ' was'} issued and cannot be
                    accounted for.
                  </span>{' '}
                  Stock left the store and was neither used, returned, nor written off as
                  waste. These are marked below and are worth checking before this is
                  reconciled.
                </span>
              </p>
            )}
          </div>

          {/* ── Per case ── */}
          {statement.cases.map((c) => (
            <section key={c.surgeryId} className="rounded-2xl bg-white p-5 ring-1 ring-gray-200">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="font-bold text-gray-900">
                    {c.procedureName ?? 'Procedure not recorded'}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {shortDate(c.scheduledDate)} · {c.status.replace(/_/g, ' ').toLowerCase()}
                  </p>
                </div>
                <p className="text-lg font-bold tabular-nums text-gray-900">{naira(c.caseValue)}</p>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-gray-500">
                    <tr className="border-b-2 border-gray-900">
                      <th className="py-2 pr-3">Item</th>
                      <th className="py-2 pr-3">Batch</th>
                      <th className="py-2 pr-3 text-right">Res.</th>
                      <th className="py-2 pr-3 text-right">Issued</th>
                      <th className="py-2 pr-3 text-right">Used</th>
                      <th className="py-2 pr-3 text-right">Ret.</th>
                      <th className="py-2 pr-3 text-right">Waste</th>
                      <th className="py-2 pr-3 text-right">Unit</th>
                      <th className="py-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.lines.map((l, i) => {
                      const unaccounted =
                        l.quantityIssued - l.quantityUsed - l.quantityReturned - l.quantityWasted;
                      return (
                        <tr
                          key={`${l.itemId}-${l.batchNumber}-${i}`}
                          className={`border-b border-gray-100 ${unaccounted > 0 ? 'bg-amber-50' : ''}`}
                        >
                          <td className="py-2 pr-3">
                            <span className="font-medium text-gray-900">{l.itemName}</span>
                            {l.vendorName && (
                              <span className="block text-xs text-gray-500">{l.vendorName}</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs text-gray-600">
                            {l.batchNumber || '—'}
                            {l.expiryDate && (
                              <span className="block text-gray-400">exp {l.expiryDate}</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-gray-600">{l.quantityReserved}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-gray-600">{l.quantityIssued}</td>
                          <td className="py-2 pr-3 text-right font-semibold tabular-nums text-gray-900">{l.quantityUsed}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-gray-600">{l.quantityReturned}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-gray-600">
                            {l.quantityWasted > 0 ? l.quantityWasted : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-gray-600">
                            {naira(l.unitPriceAtReservation)}
                          </td>
                          <td className="py-2 text-right font-semibold tabular-nums text-gray-900">
                            {naira(l.lineValue)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Said once per case rather than per row, where it is read. */}
              <p className="mt-2 text-xs text-gray-500">
                Only the <span className="font-semibold">Used</span> column is charged. Waste is
                recorded as the hospital&rsquo;s loss and is never billed to the patient. Unit
                prices are those agreed when the case was booked.
              </p>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
