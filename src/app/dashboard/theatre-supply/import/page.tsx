'use client';

// ============================================================
// Bulk import — download a template, fill it in, upload it
// ------------------------------------------------------------
// Nothing is written until the operator has seen what WOULD be written. The
// upload validates first and shows a preview: how many rows would be created,
// how many updated, and every fault with its row and column.
//
// Any fault at all blocks the commit. A half-imported catalogue is worse than
// none, because nobody can tell which half arrived.
// ============================================================

import { useCallback, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react';

type Kind = 'ITEMS' | 'VENDORS' | 'TARIFFS' | 'STOCK';

const KINDS: Array<{ kind: Kind; label: string; blurb: string }> = [
  { kind: 'ITEMS', label: 'Catalogue items', blurb: 'Consumables, drugs, implants and devices.' },
  { kind: 'VENDORS', label: 'Vendors', blurb: 'Suppliers and consignment partners, with bank details.' },
  { kind: 'TARIFFS', label: 'Prices', blurb: 'Fees and item prices, effective from a date you set.' },
  { kind: 'STOCK', label: 'Opening stock', blurb: 'Lots on the shelf today, with batch numbers and expiry.' },
];

interface RowError {
  row: number;
  column: string;
  value: string;
  message: string;
}

interface Preview {
  totalRows: number;
  errors: RowError[];
  summary: { toCreate: number; toUpdate: number; rejected: number };
}

export default function BulkImportPage() {
  const [kind, setKind] = useState<Kind>('ITEMS');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const reset = () => {
    setPreview(null);
    setError(null);
    setDone(null);
  };

  const downloadTemplate = () => {
    // A plain navigation: the response is an attachment, so the browser saves it.
    window.location.href = `/api/stock/import?kind=${kind}`;
  };

  const onFile = useCallback((file: File) => {
    reset();
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setFileDataUrl(String(reader.result));
    reader.onerror = () => setError('That file could not be read.');
    reader.readAsDataURL(file);
  }, []);

  const send = async (commit: boolean) => {
    if (!fileDataUrl) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch('/api/stock/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, fileDataUrl, commit }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.preview) setPreview(data.preview);

      if (!res.ok) {
        setError(data.error || 'The file could not be imported.');
        return;
      }
      if (commit && data.committed) {
        setDone(data.message ?? 'Imported.');
        setFileDataUrl(null);
        setFileName(null);
      }
    } catch {
      setError('Could not reach the server. Nothing has been imported.');
    } finally {
      setBusy(false);
    }
  };

  const downloadErrors = () => {
    if (!preview?.errors.length) return;
    const escape = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [
      'Row,Column,Value,Problem',
      ...preview.errors.map((e) => [e.row, e.column, e.value, e.message].map(escape).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-errors-${kind.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clean = preview !== null && preview.errors.length === 0;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100">
          <FileSpreadsheet className="h-6 w-6 text-primary-700" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bulk Import</h1>
          <p className="text-sm text-gray-500">
            Nothing is written until you have seen exactly what would be written.
          </p>
        </div>
      </div>

      {/* 1. What */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">1. What are you importing?</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              onClick={() => { setKind(k.kind); reset(); }}
              className={`rounded-lg border p-3 text-left ${
                kind === k.kind ? 'border-primary-300 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <p className="text-sm font-medium text-gray-900">{k.label}</p>
              <p className="text-xs text-gray-500">{k.blurb}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Template */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">2. Start from the template</h2>
        <p className="mb-3 text-xs text-gray-500">
          It carries the exact column headings, which is the commonest reason an import fails. Required
          columns are shaded red, and every heading has a note explaining what it accepts.
        </p>
        <button
          onClick={downloadTemplate}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download className="h-4 w-4" /> Download {KINDS.find((k) => k.kind === kind)?.label} template
        </button>
      </div>

      {/* 3. Upload */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">3. Upload the filled-in file</h2>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-gray-300 p-4 hover:bg-gray-50">
          <Upload className="h-5 w-5 flex-shrink-0 text-gray-400" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-gray-900">
              {fileName ?? 'Choose an .xlsx file'}
            </span>
            <span className="block text-xs text-gray-500">Up to 5,000 rows per file.</span>
          </span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          />
        </label>

        {fileDataUrl && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => send(false)}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {busy ? 'Checking…' : 'Check the file'}
            </button>
            <button
              onClick={() => send(true)}
              disabled={busy || !clean}
              title={clean ? undefined : 'Check the file first, and fix any problems.'}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              Import
            </button>
          </div>
        )}
      </div>

      {done && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" /> {done}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* 4. Preview */}
      {preview && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            {clean ? 'Ready to import' : 'This file cannot be imported yet'}
          </h2>

          <div className="grid gap-3 sm:grid-cols-4">
            <Tile label="Rows in file" value={String(preview.totalRows)} />
            <Tile label="Would create" value={String(preview.summary.toCreate)} good={preview.summary.toCreate > 0} />
            <Tile label="Would update" value={String(preview.summary.toUpdate)} />
            <Tile label="Rejected" value={String(preview.summary.rejected)} bad={preview.summary.rejected > 0} />
          </div>

          {preview.errors.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-red-800">
                  {preview.errors.length} problem{preview.errors.length === 1 ? '' : 's'} across{' '}
                  {new Set(preview.errors.map((e) => e.row)).size} row
                  {new Set(preview.errors.map((e) => e.row)).size === 1 ? '' : 's'}
                </p>
                <button
                  onClick={downloadErrors}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Download className="h-3.5 w-3.5" /> Download the list
                </button>
              </div>
              <div className="max-h-80 overflow-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[520px] text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-left uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Column</th>
                      <th className="px-3 py-2 font-medium">Value</th>
                      <th className="px-3 py-2 font-medium">Problem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.errors.slice(0, 200).map((e, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-medium text-gray-900">{e.row}</td>
                        <td className="px-3 py-1.5 text-gray-700">{e.column}</td>
                        <td className="px-3 py-1.5 text-gray-500">{e.value || <span className="italic">empty</span>}</td>
                        <td className="px-3 py-1.5 text-red-700">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.errors.length > 200 && (
                <p className="mt-1 text-xs text-gray-500">
                  Showing the first 200. Download the list for all {preview.errors.length}.
                </p>
              )}
              <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-600">
                <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                Nothing has been changed. Fix the file and upload it again — the import is all or nothing,
                so a partly-correct file never leaves the catalogue half updated.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${bad ? 'border-red-200 bg-red-50' : good ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${bad ? 'text-red-700' : good ? 'text-green-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}
