'use client';

/**
 * The packs for a case, reachable from the list rather than only from the case.
 *
 * The editor itself already existed and already did the hard part — view both
 * lists, add, withdraw with a reason, show withdrawn lines struck through. It
 * simply lived one navigation away, on the case detail page, so on a morning
 * list nobody opened it. A capability that costs a page load is a capability
 * that gets used once and then worked around.
 *
 * Two things happen here that the detail page does not offer:
 *
 *   The counts are visible on the button itself, so a case with NO pack is
 *   obvious while scanning the list — which is the moment it can still be
 *   fixed.
 *
 *   "Request standard packs" builds both lists from the procedure the case was
 *   booked for, using the same mapping booking uses. Additive: it never
 *   overwrites a quantity somebody set, and never resurrects a withdrawn line.
 */

import { useCallback, useEffect, useState } from 'react';
import { Package, Loader2, X, Sparkles, AlertTriangle } from 'lucide-react';
import SurgeryPackEditor from '@/components/SurgeryPackEditor';

interface Props {
  surgeryId: string;
  procedureName?: string;
  patientName?: string;
  status?: string;
}

export default function CasePacksButton({ surgeryId, procedureName, patientName, status }: Props) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<{ c: number; d: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Remounts the editor after a generate, so it shows what was just added. */
  const [editorKey, setEditorKey] = useState(0);

  const loadCounts = useCallback(async () => {
    try {
      const r = await fetch(`/api/surgeries/${surgeryId}/pack`, { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      const live = (rows: any[]) => (Array.isArray(rows) ? rows.filter((x) => x.status !== 'CANCELLED').length : 0);
      // The endpoint returns "consumables" and "pharmacy". Guessing the second
      // key would have shown every case as having no drugs — exactly the wrong
      // failure for a badge whose whole job is to flag an empty pack.
      setCounts({ c: live(d.consumables), d: live(d.pharmacy) });
    } catch { /* the badge is a nicety; its absence must not break the row */ }
  }, [surgeryId]);

  useEffect(() => { void loadCounts(); }, [loadCounts]);

  const generate = async () => {
    setGenerating(true); setError(null); setNotice(null);
    try {
      const r = await fetch(`/api/surgeries/${surgeryId}/pack/generate`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? 'The packs could not be generated.'); return; }
      setNotice(d.message ?? 'Done.');
      if (Array.isArray(d.unmapped) && d.unmapped.length) {
        setError(
          `No mapping exists for: ${d.unmapped.join(', ')}. Those items must be added by hand, ` +
          'and the procedure is worth mapping so the next case is not the same work again.',
        );
      }
      setEditorKey((k) => k + 1);
      await loadCounts();
    } catch {
      setError('The packs could not be generated. Check your connection.');
    } finally {
      setGenerating(false);
    }
  };

  const empty = counts !== null && counts.c === 0 && counts.d === 0;
  const closed = ['COMPLETED', 'CANCELLED'].includes(status ?? '');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Consumable and pharmacy packs for this case"
        className={`inline-flex items-center gap-1 font-semibold ${
          empty && !closed ? 'text-amber-700 hover:text-amber-900' : 'text-purple-600 hover:text-purple-800'
        }`}
      >
        <Package className="w-4 h-4" />
        Packs
        {counts && (
          <span className={`ml-0.5 text-[11px] font-normal ${empty && !closed ? 'text-amber-700' : 'text-gray-500'}`}>
            {empty ? '(none yet)' : `(${counts.c}+${counts.d})`}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="w-full sm:max-w-3xl bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-gray-900">Packs for this case</h2>
                <p className="mt-0.5 truncate text-xs text-gray-500">
                  {[patientName, procedureName].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4">
              {!closed && (
                <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 p-3">
                  <button
                    type="button"
                    onClick={generate}
                    disabled={generating}
                    className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Request standard packs for this procedure
                  </button>
                  <p className="mt-1.5 text-xs text-purple-900">
                    Builds both lists from what {procedureName ? `“${procedureName}”` : 'this procedure'} normally
                    needs, plus the mandatory theatre pack. It only ever ADDS — nothing you have changed is
                    overwritten, and a withdrawn item stays withdrawn.
                  </p>
                  {notice && <p className="mt-2 text-sm font-medium text-green-800">{notice}</p>}
                  {error && (
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-amber-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      {error}
                    </p>
                  )}
                </div>
              )}

              {/* The existing editor, unchanged: consumables to the store,
                  drugs and dressings to pharmacy, both editable here. */}
              <SurgeryPackEditor key={editorKey} surgeryId={surgeryId} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
