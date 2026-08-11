'use client';

// ============================================================
// Price master — bulk upload
// ------------------------------------------------------------
// Where the hospital's prices come from. Everything the surgery estimate
// produces is derived from what is loaded here, so the screen is built around
// one principle: SHOW THE FAULTS BEFORE COMMITTING ANYTHING.
//
// Validation is a separate step from applying, and applying is refused while
// any row is faulty. A price list where some rows landed and some did not is
// worse than one that was rejected outright, because nobody can tell which half
// took — and the difference is what patients are charged.
// ============================================================

import { useState } from 'react';
import { CHARGE_KIND_LABELS, CHARGE_KINDS } from '@/lib/estimates/chargeKinds';
import { TEMPLATE_HEADERS } from '@/lib/estimates/priceImport';
import {
  AlertCircle, CheckCircle2, CloudUpload, Copy, FileSpreadsheet, Loader2, Upload,
} from 'lucide-react';

interface Problem { line: number; code: string; problem: string }
interface Preview {
  line: number; code: string; name: string; kind: string;
  amountKobo: number; effectiveFrom: string; ward?: string;
}
interface Response {
  applied: boolean;
  summary: { valid: number; invalid: number; duplicates: number; skipped: number };
  preview?: Preview[];
  invalid?: Problem[];
  duplicateRows?: Problem[];
  inserted?: number;
  superseded?: number;
  error?: string;
}

const naira = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

const EXAMPLE = [
  TEMPLATE_HEADERS.join(','),
  'THEATRE-MAJOR,Theatre charge (major),THEATRE,25000,2026-08-11,,,New tariff',
  'FEE-MAJOR,Surgeon fee (major),PROCEDURE,80000,2026-08-11,,,',
  'ANAES-GA,Anaesthetist fee (GA),ANAESTHESIA,40000,2026-08-11,,,',
  'BED-DAILY,Daily bed charge,ADMISSION,7500,2026-08-11,WARD 3,,',
  'FBC,Full blood count,LABORATORY,3500,2026-08-11,,,',
  'SUT-VIC20,"Suture, 2/0 vicryl",CONSUMABLE,2800,2026-08-11,,SUT-VIC20,',
].join('\n');

export default function PriceMasterPage() {
  const [text, setText] = useState('');
  const [res, setRes] = useState<Response | null>(null);
  const [busy, setBusy] = useState<'check' | 'apply' | null>(null);
  const [error, setError] = useState('');

  const send = async (apply: boolean) => {
    setBusy(apply ? 'apply' : 'check');
    setError('');
    if (!apply) setRes(null);
    try {
      const r = await fetch('/api/price-master/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, apply }),
      });
      const data: Response = await r.json();
      setRes(data);
      if (!r.ok) setError(data.error || `HTTP ${r.status}`);
      if (apply && r.ok) setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setBusy(null);
    }
  };

  const readFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result ?? '')); setRes(null); };
    reader.readAsText(f);
  };

  const faults = (res?.summary.invalid ?? 0) + (res?.summary.duplicates ?? 0);
  const canApply = !!res && !res.applied && res.summary.valid > 0 && faults === 0;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg bg-emerald-100 flex items-center justify-center">
          <FileSpreadsheet className="w-6 h-6 text-emerald-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Price master</h1>
          <p className="text-sm text-gray-500">
            Upload item prices, ward admission rates, surgical and anaesthetic fees
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>
          A price is never overwritten. Uploading a new price <strong>closes</strong> the
          current one and starts a new period, so an estimate given to a patient in August
          still reads the August price in September.
        </span>
      </div>

      {/* Input */}
      <div className="bg-white rounded-lg border shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="prices" className="font-medium text-gray-900">
            Paste from a spreadsheet, or choose a CSV
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => { setText(EXAMPLE); setRes(null); }}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
            >
              <Copy className="w-4 h-4" /> Load an example
            </button>
            <label className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
              <Upload className="w-4 h-4" /> Choose file
              <input
                type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }}
              />
            </label>
          </div>
        </div>

        <textarea
          id="prices"
          value={text}
          onChange={(e) => { setText(e.target.value); setRes(null); }}
          rows={10}
          spellCheck={false}
          placeholder={TEMPLATE_HEADERS.join(',')}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        />

        <p className="text-xs text-gray-500">
          Columns: <span className="font-mono">{TEMPLATE_HEADERS.join(' · ')}</span>.
          Amounts in naira. Dates as <span className="font-mono">YYYY-MM-DD</span>.
          An admission row needs a ward.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => send(false)}
            disabled={!text.trim() || busy !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
          >
            {busy === 'check' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Check
          </button>
          <button
            onClick={() => send(true)}
            disabled={!canApply || busy !== null}
            title={canApply ? undefined : 'Check the file first, and clear every fault'}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy === 'apply' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
            Import {res?.summary.valid ? `${res.summary.valid} price(s)` : ''}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}

      {res?.applied && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          <p className="font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Imported
          </p>
          <p className="mt-1">
            {res.inserted} price(s) added
            {res.superseded ? `, ${res.superseded} previous price(s) closed rather than deleted` : ''}.
          </p>
        </div>
      )}

      {res && !res.applied && (
        <div className="grid sm:grid-cols-4 gap-3">
          {[
            ['Valid', res.summary.valid, 'text-green-700 border-green-200 bg-green-50'],
            ['Faults', res.summary.invalid, 'text-red-700 border-red-200 bg-red-50'],
            ['Duplicates', res.summary.duplicates, 'text-amber-700 border-amber-200 bg-amber-50'],
            ['Skipped', res.summary.skipped, 'text-gray-600 border-gray-200 bg-gray-50'],
          ].map(([label, n, cls]) => (
            <div key={String(label)} className={`rounded-lg border p-3 ${cls}`}>
              <div className="text-2xl font-bold">{n as number}</div>
              <div className="text-xs">{label as string}</div>
            </div>
          ))}
        </div>
      )}

      {!!res?.invalid?.length && (
        <div className="bg-white rounded-lg border border-red-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-red-50 border-b border-red-200 text-sm font-semibold text-red-900">
            Fix these before importing — nothing has been written
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {res.invalid.map((p, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">Line {p.line}</td>
                    <td className="px-4 py-2 font-mono text-xs">{p.code}</td>
                    <td className="px-4 py-2 text-red-800">{p.problem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!!res?.duplicateRows?.length && (
        <div className="bg-white rounded-lg border border-amber-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-sm font-semibold text-amber-900">
            Two rows claim the same price — remove one
          </div>
          <table className="w-full text-sm">
            <tbody>
              {res.duplicateRows.map((p, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">Line {p.line}</td>
                  <td className="px-4 py-2 font-mono text-xs">{p.code}</td>
                  <td className="px-4 py-2 text-amber-900">{p.problem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!!res?.preview?.length && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b text-sm font-semibold text-gray-800">
            Ready to import — first {res.preview.length}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Kind</th>
                  <th className="px-3 py-2 text-left">Ward</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">From</th>
                </tr>
              </thead>
              <tbody>
                {res.preview.map((p) => (
                  <tr key={p.line} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{p.kind}</td>
                    <td className="px-3 py-2 text-xs">{p.ward ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">{naira(p.amountKobo)}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{p.effectiveFrom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <details className="bg-white rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-medium text-gray-800">
          What each kind means
        </summary>
        <div className="mt-3 grid sm:grid-cols-2 gap-1.5 text-sm">
          {CHARGE_KINDS.map((k) => (
            <div key={k} className="flex gap-2">
              <span className="font-mono text-xs text-emerald-700 w-36 flex-shrink-0">{k}</span>
              <span className="text-gray-600">{CHARGE_KIND_LABELS[k]}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
