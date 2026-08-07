'use client';

// ============================================================
// Duty flyers — one printable page per staff group
// ------------------------------------------------------------
// Built because the workflow was not being followed: two patient movements
// recorded in a fortnight across a hospital running full lists. Nobody had
// been told, in one place, which taps are theirs.
//
// The screen is deliberately plain. Its whole job is: pick a group, see what
// they are being asked to do, print it, pin it up.
// ============================================================

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Download, Printer, AlertCircle, FileText, Loader2 } from 'lucide-react';
import { DUTY_SHEETS, criticalCount, sheetsForRole, type DutySheet } from '@/lib/workflowDuties';
import { generateDutyFlyer, generateAllDutyFlyers, flyerFileName } from '@/lib/dutyFlyerPdf';

/** Download a blob under a given name. */
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DutyFlyersPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const mine = sheetsForRole(role);

  const [selected, setSelected] = useState<DutySheet>(mine[0] ?? DUTY_SHEETS[0]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (sheet: DutySheet) => {
    setBusy(sheet.id);
    setError(null);
    try {
      save(await generateDutyFlyer(sheet), flyerFileName(sheet));
    } catch (e) {
      setError(e instanceof Error ? `Could not build the flyer: ${e.message}` : 'Could not build the flyer.');
    } finally {
      setBusy(null);
    }
  };

  // One document, one page per group — rather than twenty-five separate
  // downloads, which browsers block after the first few, and which nobody
  // wants to feed to a printer one file at a time.
  const downloadAll = async () => {
    setBusy('all');
    setError(null);
    try {
      save(await generateAllDutyFlyers(DUTY_SHEETS), 'ORM_Duty_Flyers_All_Groups.pdf');
    } catch (e) {
      setError(e instanceof Error ? `Could not build the booklet: ${e.message}` : 'Could not build the booklet.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-600" />
            Duty Flyers
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            One printable page per staff group — what each has to record, and why it matters.
          </p>
        </div>
        <button
          onClick={downloadAll}
          disabled={busy !== null}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {busy === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          All {DUTY_SHEETS.length} groups as one PDF
        </button>
      </div>

      <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>
          Every staff group has a sheet. Print them on A4 and pin them where the work happens — the
          scrub sink, the porters&apos; room, the ward station, the power house, the CSSD bench.
          Each carries the hospital crest as a watermark, and duties numbered in <strong>red</strong>{' '}
          are the ones without which a measurement is impossible. The <strong>Ward Nurse</strong>{' '}
          sheet has no matching login — ward staff work from the call-up printout, so print theirs
          and take it to them.
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-[260px,1fr] gap-5">
        {/* Group list — twenty-five entries, so it scrolls rather than pushing
            the preview off the bottom of the screen. */}
        <div className="space-y-1.5 md:max-h-[72vh] md:overflow-y-auto md:pr-1">
          {mine.length > 0 && (
            <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-1">
              Yours
            </p>
          )}
          {[...mine, ...DUTY_SHEETS.filter((s) => !mine.includes(s))].map((s, i) => (
            <div key={s.id}>
              {mine.length > 0 && i === mine.length && (
                <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-1 mt-3">
                  All groups
                </p>
              )}
              <button
                onClick={() => setSelected(s)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition ${
                  selected.id === s.id
                    ? 'bg-emerald-50 border-emerald-300 font-medium text-emerald-900'
                    : 'bg-white hover:bg-gray-50 border-gray-200'
                }`}
              >
                {s.title}
                <span className="block text-xs text-gray-500 mt-0.5">
                  {s.duties.length} duties · {criticalCount(s)} critical
                </span>
              </button>
            </div>
          ))}
        </div>

        {/* Preview — the same words the flyer carries. */}
        <div className="rounded-xl border bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{selected.title}</h2>
              <p className="text-sm text-gray-700 mt-1">{selected.headline}</p>
            </div>
            <button
              onClick={() => download(selected)}
              disabled={busy !== null}
              className="px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-sm font-medium hover:bg-emerald-100 disabled:opacity-50 inline-flex items-center gap-2 whitespace-nowrap"
            >
              {busy === selected.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              Download this page
            </button>
          </div>

          <ol className="space-y-3 mt-4">
            {selected.duties.map((d, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className={`flex-shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                    d.critical ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{d.task}</p>
                  <p className="text-xs text-emerald-700 italic">
                    {d.when}
                    {d.where ? ` · ${d.where}` : ''}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">{d.why}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-semibold text-emerald-900">{selected.remember}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
