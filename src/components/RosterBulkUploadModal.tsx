'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { X, UploadCloud, FileText, Loader2, CheckCircle2, AlertTriangle, ClipboardPaste, Download } from 'lucide-react';

// ---------------------------------------------------------------------------
// Date / shift helpers — intentionally forgiving so the upload "just works".
// ---------------------------------------------------------------------------
function mondayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const DAY_OFFSETS: Record<string, number> = {
  monday: 0, mon: 0, tuesday: 1, tue: 1, tues: 1, wednesday: 2, wed: 2,
  thursday: 3, thu: 3, thur: 3, thurs: 3, friday: 4, fri: 4, saturday: 5, sat: 5, sunday: 6, sun: 6,
};

function normalizeDate(token: string, weekStart: string): string | null {
  const t = (token || '').trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const off = DAY_OFFSETS[t.toLowerCase()];
  if (off !== undefined) return addDays(weekStart, off);
  const m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function normalizeShift(token: string): 'MORNING' | 'CALL' | 'NIGHT' | null {
  const t = (token || '').trim().toUpperCase().replace(/[_\s-]+/g, ' ');
  if (['MORNING', 'AM', 'DAY', 'M', 'EARLY', 'MORN'].includes(t)) return 'MORNING';
  if (['CALL', 'ON CALL', 'ONCALL', 'C'].includes(t)) return 'CALL';
  if (['NIGHT', 'PM', 'N', 'LATE'].includes(t)) return 'NIGHT';
  return null;
}

function splitLine(line: string, delim: string): string[] {
  if (delim === '\t') return line.split('\t').map((s) => s.trim());
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

type ParsedRow = {
  name: string;
  date: string;
  shift: string;
  subRole: string;
  seniorityLevel: string;
  location: string;
  notes: string;
  ok: boolean;
  issue?: string;
};

const HEADER_KEYS = ['name', 'date', 'day', 'shift', 'sub', 'role', 'senior', 'level', 'location', 'theatre', 'note'];

function parse(text: string, weekStart: string): ParsedRow[] {
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const delim0 = rawLines[0]?.includes('\t') ? '\t' : ',';
  // Drop rows that are entirely empty (e.g. the template's unused validated rows).
  const lines = rawLines.filter((l) => splitLine(l, delim0).some((c) => c.trim() !== ''));
  if (!lines.length) return [];
  const delim = lines[0].includes('\t') ? '\t' : ',';

  // Detect a header row.
  const first = splitLine(lines[0], delim).map((c) => c.toLowerCase());
  const looksLikeHeader = first.some((c) => HEADER_KEYS.some((k) => c.includes(k))) && !normalizeShift(first[2] || '');
  let idx = { name: 0, date: 1, shift: 2, subRole: 3, seniority: 4, location: 5, notes: 6 };
  let dataLines = lines;
  if (looksLikeHeader) {
    const find = (...keys: string[]) => first.findIndex((c) => keys.some((k) => c.includes(k)));
    idx = {
      name: Math.max(0, find('name', 'staff')),
      date: Math.max(0, find('date', 'day')),
      shift: Math.max(0, find('shift')),
      subRole: find('sub', 'role'),
      seniority: find('senior', 'level', 'grade'),
      location: find('location', 'theatre', 'venue'),
      notes: find('note', 'remark'),
    };
    dataLines = lines.slice(1);
  }

  return dataLines.map((line) => {
    const cells = splitLine(line, delim);
    const get = (i: number) => (i >= 0 && i < cells.length ? cells[i] : '');
    const name = get(idx.name);
    const rawDate = get(idx.date);
    const rawShift = get(idx.shift);
    const date = normalizeDate(rawDate, weekStart);
    const shift = normalizeShift(rawShift);

    let ok = true;
    let issue = '';
    if (!name) { ok = false; issue = 'missing name'; }
    else if (!date) { ok = false; issue = `unreadable day/date "${rawDate}"`; }
    else if (!shift) { ok = false; issue = `unreadable shift "${rawShift}"`; }

    return {
      name,
      date: date || rawDate,
      shift: shift || rawShift,
      subRole: get(idx.subRole),
      seniorityLevel: get(idx.seniority),
      location: get(idx.location),
      notes: get(idx.notes),
      ok,
      issue,
    };
  });
}

const EXAMPLE = `Name\tDay\tShift\tSub-role\tSeniority\tLocation\tNotes
Jane Doe\tMonday\tMORNING\tSCRUB\t\tMAIN_THEATRE\t
John Bull\tMon\tCALL\t\t\tA_AND_E\tcovering trauma
Mary Cole\t2026-07-29\tNIGHT\tCIRCULATING\t\tMAIN_THEATRE\t`;

export default function RosterBulkUploadModal({
  dept,
  label,
  weekStart: initialWeek,
  onClose,
  onUploaded,
}: {
  dept: string;
  label: string;
  weekStart?: string;
  onClose: () => void;
  onUploaded?: () => void;
}) {
  const [weekStart, setWeekStart] = useState(initialWeek || mondayOf(new Date()));
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parse(text, weekStart), [text, weekStart]);
  const valid = parsed.filter((r) => r.ok);
  const invalid = parsed.filter((r) => !r.ok);

  const [reading, setReading] = useState(false);
  const onFile = async (f: File | null) => {
    if (!f) return;
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      setReading(true);
      setError('');
      try {
        const XLSX = await import('xlsx');
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets['Roster'] || wb.Sheets[wb.SheetNames[0]];
        // sheet_to_csv quotes any value containing commas, and our parser handles
        // quoted CSV — so this round-trips names/notes safely.
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        setText(csv);
      } catch {
        setError('Could not read that Excel file. Try “Save As → CSV” and upload that instead.');
      } finally {
        setReading(false);
      }
    } else {
      const content = await f.text();
      setText(content);
    }
  };

  const upload = async () => {
    if (!valid.length) { setError('Nothing valid to upload yet — check the preview.'); return; }
    setSubmitting(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/roster/departments/${dept}/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart,
          rows: valid.map((r) => ({
            name: r.name,
            date: r.date,
            shift: r.shift,
            subRole: r.subRole || null,
            seniorityLevel: r.seniorityLevel || null,
            location: r.location || null,
            notes: r.notes || null,
          })),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `Upload failed (${res.status})`);
      setResult(j);
      onUploaded?.();
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Excel template with dropdowns (staff names for THIS department, shifts, etc.)
  const downloadTemplate = () => {
    const a = document.createElement('a');
    a.href = `/api/roster/departments/${dept}/template`;
    a.download = `roster-template-${dept}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Bulk upload — {label}</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {!result ? (
            <>
              {/* Instructions */}
              <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
                <strong>Easiest:</strong> click <em>Excel template</em> — it downloads a sheet with <strong>dropdown menus of this
                department's staff</strong> plus Day, Shift, Sub-role, Seniority and Location. Fill it by picking from the menus,
                then choose the file here to upload. You can also paste from Excel / Google Sheets or upload a CSV.
                <ul className="ml-4 mt-1 list-disc text-[13px] text-blue-700">
                  <li>Day can be a weekday name (<em>Mon</em>, <em>Tuesday</em>) or a date (<em>2026-07-29</em>, <em>29/07/2026</em>).</li>
                  <li>Shift accepts MORNING/AM/Day, CALL/On-call, NIGHT/PM.</li>
                  <li>Names are matched to your department's staff (full name, part of it, or staff code).</li>
                  <li>Everything lands as a <strong>draft</strong> — nothing goes live until you press Publish.</li>
                </ul>
              </div>

              {/* Week + actions */}
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <label className="flex flex-col text-xs font-medium text-gray-500">
                  Week starting (Mon) — used for weekday names
                  <input
                    type="date"
                    value={weekStart}
                    onChange={(e) => setWeekStart(mondayOf(new Date(e.target.value + 'T00:00:00Z')))}
                    className="input-field mt-1 py-1.5 text-sm"
                  />
                </label>
                <button onClick={() => setText(EXAMPLE)} className="btn-secondary inline-flex items-center gap-1 py-1.5 text-sm">
                  <ClipboardPaste className="h-4 w-4" /> Load example
                </button>
                <button onClick={downloadTemplate} className="btn-secondary inline-flex items-center gap-1 py-1.5 text-sm">
                  <Download className="h-4 w-4" /> Excel template
                </button>
                <button onClick={() => fileRef.current?.click()} className="btn-secondary inline-flex items-center gap-1 py-1.5 text-sm">
                  {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Choose file (Excel/CSV)
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv,.txt,text/csv"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0] || null)}
                />
              </div>

              {/* Paste box */}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'Paste rows here…\nName  Day  Shift  Sub-role  Seniority  Location  Notes'}
                className="input-field h-40 w-full font-mono text-xs"
              />

              {/* Preview */}
              {parsed.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 flex items-center gap-3 text-sm">
                    <span className="inline-flex items-center gap-1 text-green-700">
                      <CheckCircle2 className="h-4 w-4" /> {valid.length} ready
                    </span>
                    {invalid.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <AlertTriangle className="h-4 w-4" /> {invalid.length} need a look
                      </span>
                    )}
                  </div>
                  <div className="max-h-52 overflow-auto rounded-lg border border-gray-200">
                    <table className="w-full min-w-[560px] text-xs">
                      <thead className="sticky top-0 bg-gray-50 text-left text-gray-400">
                        <tr>
                          <th className="px-2 py-1">Name</th>
                          <th className="px-2 py-1">Date</th>
                          <th className="px-2 py-1">Shift</th>
                          <th className="px-2 py-1">Sub-role</th>
                          <th className="px-2 py-1">Location</th>
                          <th className="px-2 py-1">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.slice(0, 200).map((r, i) => (
                          <tr key={i} className={`border-t border-gray-100 ${r.ok ? '' : 'bg-amber-50'}`}>
                            <td className="px-2 py-1">{r.name || <span className="text-gray-300">—</span>}</td>
                            <td className="px-2 py-1">{r.date}</td>
                            <td className="px-2 py-1">{r.shift}</td>
                            <td className="px-2 py-1">{r.subRole}</td>
                            <td className="px-2 py-1">{r.location}</td>
                            <td className="px-2 py-1">
                              {r.ok ? (
                                <span className="text-green-600">ready</span>
                              ) : (
                                <span className="text-amber-700">{r.issue}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            </>
          ) : (
            /* Result report */
            <div className="space-y-3">
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <CheckCircle2 className="mr-1 inline h-4 w-4" />
                <strong>{result.created}</strong> draft assignment(s) added
                {result.duplicates > 0 && <> · {result.duplicates} already existed (skipped)</>}.
              </div>
              {result.unmatched?.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <strong>{result.unmatched.length}</strong> name(s) not found in this department — please add them manually or
                  check spelling:
                  <div className="mt-1 text-xs">{result.unmatched.map((u: any) => u.name).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).join(', ')}</div>
                </div>
              )}
              {result.ambiguous?.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <strong>{result.ambiguous.length}</strong> name(s) matched more than one person (skipped — add these manually):
                  <ul className="mt-1 ml-4 list-disc text-xs">
                    {result.ambiguous.map((a: any, i: number) => (
                      <li key={i}>
                        “{a.name}” → {a.options.map((o: any) => o.fullName).join(' / ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.invalid?.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                  {result.invalid.length} row(s) skipped for bad data ({result.invalid.slice(0, 6).map((x: any) => `${x.name}: ${x.reason}`).join('; ')}
                  {result.invalid.length > 6 ? '…' : ''}).
                </div>
              )}
              <Link
                href={`/dashboard/roster/dept/${dept}?weekStart=${weekStart}`}
                className="inline-block text-sm font-medium text-primary-600 hover:underline"
              >
                Open {label} roster to review &amp; publish →
              </Link>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          {!result ? (
            <>
              <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
              <button
                onClick={upload}
                disabled={submitting || valid.length === 0}
                className="btn-primary inline-flex items-center gap-1 text-sm disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Upload {valid.length > 0 ? `${valid.length} ` : ''}draft{valid.length === 1 ? '' : 's'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { setResult(null); setText(''); }} className="btn-secondary text-sm">Upload more</button>
              <button onClick={onClose} className="btn-primary text-sm">Done</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
