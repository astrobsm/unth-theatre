'use client';

/**
 * The training log book, in the form a college asks for.
 *
 * A surgeon or anaesthetist picks their name, picks their college and
 * programme, and gets every case they took part in as a numbered book with
 * the summary tables an examiner reads first.
 *
 * THREE THINGS ON THIS SCREEN ARE THERE TO STOP A TRAINEE BEING EMBARRASSED
 * AT AN EXAMINATION, and none of them is decoration:
 *
 *   The participation level is marked as PROPOSED. Nothing in this database
 *   records whether the consultant was scrubbed, which is the exact line
 *   between "performed under supervision" and "performed independently". The
 *   screen says so, and the printed book carries the College's own
 *   requirement that every entry be signed.
 *
 *   A quota with no published figure shows a count and no progress bar. A
 *   bar against an invented denominator would be the most misleading thing
 *   here.
 *
 *   The gaps are counted and shown. A book with forty blank diagnosis cells
 *   is a book an examiner will ask about, and it is far better to find that
 *   out on this screen than across a table.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, BookOpen, Check, Download, FileSpreadsheet, Loader2,
  ShieldCheck, Stethoscope,
} from 'lucide-react';
import { exportMultiSheetExcel, exportToCSV } from '@/lib/exportUtils';

interface Person { id: string; fullName: string; role: string | null }
interface Quota { key: string; label: string; required: number | null }
interface Level { key: string; code: string; label: string; help: string }
interface College {
  key: string; college: string; programme: string; discipline: string;
  requirement: string; sourceNote: string; quotasVerified: boolean;
  totalRequired: number | null;
  columns: Array<{ key: string; header: string }>;
  quotas: Quota[]; attestation: string;
  levels: Level[] | null;
  guidance: string[] | null;
  categorised: boolean;
  patientNameColumn: boolean;
}
interface Table {
  sectionKey: string; sectionLabel: string; part: 1 | 2; group: string | null;
  categoryKey: string; categoryLabel: string; rows: Row[]; required: number | null;
}
interface Row {
  serial: number; caseId: string; date: string | null; hospitalNumber: string | null;
  patientName: string | null; age: string | null; sex: string | null;
  specialty: string | null; diagnosis: string | null; procedure: string | null;
  anaesthesia: string | null; asa: string | null; comorbidities: string | null;
  urgency: string | null; role: string; roleCode: string; level: string;
  levelBasis: string; complications: string | null; outcome: string | null;
  supervisor: string | null;
}
interface Book {
  person: { id: string; fullName: string; role: string | null; staffCode: string | null };
  college: College;
  from: string | null; to: string | null; includedPatientNames: boolean;
  subspecialty: { key: string; label: string } | null;
  categorised: { tables: Table[]; unclassified: Row[] } | null;
  summary: {
    total: number; byLevel: Record<string, number>; byRole: Record<string, number>;
    bySpecialty: Record<string, number>; byYear: Record<string, number>;
    withComplication: number; deaths: number;
    missingDiagnosis: number; missingOutcome: number;
    firstDate: string | null; lastDate: string | null;
  };
  quotas: Array<{ key: string; label: string; required: number | null; achieved: number;
    shortfall: number | null; percent: number | null }>;
  rows: Row[];
}

export default function CollegeLogbook() {
  const [meta, setMeta] = useState<{
    me: { id: string | null; role: string | null };
    ownCasesOnly: boolean;
    people: Person[]; colleges: College[];
    npmcnSubspecialties: Array<{ key: string; label: string }>;
    npmcnCourses: { requirement: string; courses: string[] };
  } | null>(null);
  const [personId, setPersonId] = useState('');
  const [college, setCollege] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [includeNames, setIncludeNames] = useState(false);
  const [subspecialty, setSubspecialty] = useState('general');
  const [nameTouched, setNameTouched] = useState(false);
  const [book, setBook] = useState<Book | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/research/logbook', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setMeta(d);
        // Opens on the person it is most likely to be for: you.
        if (d.me?.id) setPersonId(d.me.id);
        if (d.colleges?.length) setCollege(d.colleges[0].key);
      })
      .catch(() => setError('Could not load the log book options.'));
  }, []);

  const generate = useCallback(async () => {
    setBusy(true); setError(''); setBook(null);
    try {
      const res = await fetch('/api/research/logbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personId, college, from, to, subspecialty,
          // Undefined lets the server apply the College's own default:
          // NPMCN prints the name column, so withholding it would hand back
          // a book that does not match the one being transcribed into.
          includePatientName: nameTouched ? includeNames : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Could not build the log book.'); return; }
      setBook(d);
    } catch {
      setError('Could not build the log book.');
    } finally {
      setBusy(false);
    }
  }, [personId, college, from, to, includeNames, nameTouched, subspecialty]);

  const selected = meta?.colleges.find((c) => c.key === college) ?? null;

  /**
   * Excel sheet names are capped at 31 characters, may not contain : \ / ? * [ ]
   * and must be unique in a workbook. A College table called "Operative
   * treatment of omphalocele/gastroschisis" breaks all three rules at once,
   * and the whole export fails rather than that one sheet.
   */
  const sheetName = (label: string, taken: Set<string>): string => {
    const cleaned = label.replace(/[:\\/?*[\]]/g, '-').slice(0, 28).trim();
    let name = cleaned || 'Table';
    let n = 2;
    while (taken.has(name.toLowerCase())) {
      name = `${cleaned.slice(0, 26)} ${n}`;
      n += 1;
    }
    taken.add(name.toLowerCase());
    return name;
  };

  const exportBook = async (kind: 'excel' | 'csv') => {
    if (!book) return;
    const toSheet = (list: Row[]) => list.map((r) => {
      const base: Record<string, string | number> = {
        'S/N': r.serial,
        Date: r.date ?? '',
        'Hospital No.': r.hospitalNumber ?? '',
      };
      if (book.includedPatientNames) base['Patient name'] = r.patientName ?? '';
      return {
        ...base,
        Age: r.age ?? '',
        Sex: r.sex ?? '',
        Specialty: r.specialty ?? '',
        Diagnosis: r.diagnosis ?? '',
        'Operation / Procedure': r.procedure ?? '',
        ASA: r.asa ?? '',
        'Comorbidity': r.comorbidities ?? '',
        Anaesthesia: r.anaesthesia ?? '',
        'Elective / Emergency': r.urgency ?? '',
        Capacity: r.role,
        'Role (O/A/S/P)': r.roleCode,
        Complications: r.complications ?? '',
        Outcome: r.outcome ?? '',
        'Supervising consultant': r.supervisor ?? '',
        // Left empty on purpose: the College requires a signature per entry
        // and will not accept one signature for the whole book.
        'Signature & date': '',
      };
    });

    const rows = toSheet(book.rows);
    const name = `logbook-${book.person.fullName.replace(/\s+/g, '-').toLowerCase()}`;
    if (kind === 'csv') { await exportToCSV(rows, name); return; }

    // One sheet per table, where the College organises the book that way.
    const taken = new Set<string>();
    const categorySheets = book.categorised
      ? book.categorised.tables
        .filter((t) => t.rows.length > 0)
        .map((t) => ({ name: sheetName(t.categoryLabel, taken), data: toSheet(t.rows) }))
        .concat(book.categorised.unclassified.length > 0
          ? [{ name: sheetName('Not yet placed', taken), data: toSheet(book.categorised.unclassified) }]
          : [])
      : [];

    await exportMultiSheetExcel([
      ...categorySheets,
      { name: book.categorised ? 'All cases' : 'Log book', data: rows },
      { name: 'Summary', data: [
        { Item: 'Candidate', Value: book.person.fullName },
        { Item: 'College', Value: book.college.college },
        { Item: 'Programme', Value: book.college.programme },
        { Item: 'Period', Value: `${book.summary.firstDate ?? '—'} to ${book.summary.lastDate ?? '—'}` },
        { Item: 'Total cases', Value: book.summary.total },
        ...Object.entries(book.summary.byLevel).map(([k, v]) => ({ Item: k, Value: v })),
        ...Object.entries(book.summary.byRole).map(([k, v]) => ({ Item: `As ${k}`, Value: v })),
        { Item: 'Cases with a complication', Value: book.summary.withComplication },
        { Item: 'Deaths', Value: book.summary.deaths },
        { Item: 'Entries with no diagnosis recorded', Value: book.summary.missingDiagnosis },
        { Item: 'Entries with no outcome recorded', Value: book.summary.missingOutcome },
        { Item: 'Attestation', Value: book.college.attestation },
        { Item: 'Source', Value: book.college.sourceNote },
      ] },
      { name: 'By specialty', data: Object.entries(book.summary.bySpecialty)
        .map(([Specialty, Cases]) => ({ Specialty, Cases })) },
      { name: 'By year', data: Object.entries(book.summary.byYear)
        .map(([Year, Cases]) => ({ Year, Cases })) },
      ...(book.quotas.length > 0 ? [{ name: 'Against quota', data: book.quotas.map((q) => ({
        Category: q.label,
        Required: q.required ?? 'Not published',
        Achieved: q.achieved,
        Shortfall: q.shortfall ?? '—',
      })) }] : []),
    ], name);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-amber-50 p-2.5 text-amber-700">
          <BookOpen className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Training log book</h2>
          <p className="mt-0.5 max-w-3xl text-sm text-gray-600">
            Every case you took part in, numbered and laid out the way your college asks for
            it, with the summary tables an examiner reads first. Built from the theatre
            record, so it is only as complete as the record is.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-gray-600">
            Log book for
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
            >
              {(meta?.people ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.fullName} (you)</option>
              ))}
            </select>
            <span className="mt-1 block font-normal text-[11px] leading-relaxed text-gray-500">
              Your own book only. It carries hospital numbers, so if a supervisor needs yours,
              they ask you for it — and you know it was taken.
            </span>
          </label>

          <label className="text-xs font-semibold text-gray-600">
            College and programme
            <select
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            >
              {(meta?.colleges ?? []).map((c) => (
                <option key={c.key} value={c.key}>{c.college} — {c.programme}</option>
              ))}
            </select>
          </label>

          {selected?.categorised && (
            <label className="text-xs font-semibold text-gray-600">
              Your subspecialty
              <select
                value={subspecialty}
                onChange={(e) => setSubspecialty(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              >
                {(meta?.npmcnSubspecialties ?? []).map((x) => (
                  <option key={x.key} value={x.key}>{x.label}</option>
                ))}
              </select>
              <span className="mt-1 block font-normal text-[11px] leading-relaxed text-gray-500">
                Decides which Part 2 tables you get. Part 1 is the same for everybody.
              </span>
            </label>
          )}

          <label className="text-xs font-semibold text-gray-600">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-gray-600">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
          </label>
        </div>

        {selected && (
          <div className="mt-3 rounded-xl bg-gray-50 p-3">
            <p className="text-xs leading-relaxed text-gray-700">
              <strong>{selected.college} requires:</strong> {selected.requirement}
            </p>
            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-gray-500">
              {selected.quotasVerified
                ? <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
              {selected.sourceNote}
            </p>

            {selected.levels && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {selected.levels.map((l) => (
                  <span key={l.code} className="text-[11px] text-gray-700" title={l.help}>
                    <strong className="rounded bg-white px-1.5 py-0.5">{l.code}</strong>{' '}
                    {l.label}
                  </span>
                ))}
              </div>
            )}

            {selected.guidance && (
              <ul className="mt-2 list-disc space-y-0.5 pl-4">
                {selected.guidance.map((g) => (
                  <li key={g} className="text-[11px] leading-relaxed text-gray-600">{g}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={nameTouched ? includeNames : (selected?.patientNameColumn ?? false)}
              onChange={(e) => { setNameTouched(true); setIncludeNames(e.target.checked); }}
            />
            Include patient names
          </label>
          <span className="text-[11px] text-gray-500">
            {selected?.patientNameColumn
              ? 'On, because this College prints a “Patient’s Names” column. Turn it off if you would rather write the names in by hand.'
              : 'Off by default. The hospital number satisfies the college on its own, and a file of names in a downloads folder is a different kind of object from one of numbers.'}
          </span>
        </div>

        <button
          type="button"
          disabled={!personId || !college || busy}
          onClick={() => void generate()}
          className="mt-3 flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
          Build the log book
        </button>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {book && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-gray-900">{book.person.fullName}</p>
                <p className="text-xs text-gray-500">
                  {book.college.college} · {book.college.programme}
                  {book.summary.firstDate && ` · ${book.summary.firstDate} to ${book.summary.lastDate}`}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void exportBook('excel')}
                  className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                </button>
                <button type="button" onClick={() => void exportBook('csv')}
                  className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                  <Download className="h-3.5 w-3.5" /> CSV
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Cases in the book" value={book.summary.total} />
              <Stat label="With a complication" value={book.summary.withComplication} />
              <Stat label="Deaths" value={book.summary.deaths} />
              <Stat label="No diagnosis recorded" value={book.summary.missingDiagnosis}
                tone={book.summary.missingDiagnosis > 0 ? 'warn' : undefined} />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Counts title="By participation" data={book.summary.byLevel} />
              <Counts title="By capacity" data={book.summary.byRole} />
            </div>

            <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>The participation level is proposed, not certified.</strong> Nothing in
                the theatre record says whether the consultant was scrubbed, which is the exact
                line between performed under supervision and performed independently. Hover a
                row&rsquo;s code to see how it was reached. Your supervisor&rsquo;s signature on
                the entry is what makes it true, and {book.college.college} requires that
                signature case by case.
              </span>
            </p>
          </div>

          {book.quotas.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900">Against the college requirement</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                {book.college.totalRequired
                  ? `${book.college.college} requires ${book.college.totalRequired} cases in all.`
                  : 'No total is published for this programme.'}
              </p>
              <div className="mt-3 space-y-2">
                {book.quotas.map((q) => (
                  <div key={q.key}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-700">{q.label}</span>
                      <span className="text-gray-500">
                        {q.achieved}{q.required !== null ? ` / ${q.required}` : ' recorded'}
                        {q.shortfall !== null && q.shortfall > 0 && ` · ${q.shortfall} to go`}
                      </span>
                    </div>
                    {q.percent !== null && (
                      <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
                        <div
                          className={`h-1.5 rounded-full ${q.percent >= 100 ? 'bg-green-500' : 'bg-primary-500'}`}
                          style={{ width: `${Math.min(100, q.percent)}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {book.categorised ? (
            <CategorisedBook book={book} />
          ) : (
            <LogbookTable book={book} rows={book.rows} />
          )}
        </div>
      )}
    </div>
  );
}

const Missing = () => (
  <span className="text-amber-600" title="Not recorded on the case">not recorded</span>
);

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${tone === 'warn' ? 'text-amber-600' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}

function Counts({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <p className="text-xs font-bold text-gray-700">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {entries.length === 0 && <li className="text-xs text-gray-400">Nothing yet</li>}
        {entries.map(([k, v]) => (
          <li key={k} className="flex justify-between text-xs text-gray-600">
            <span>{k}</span><span className="font-semibold">{v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The book itself. A table, because that is what a college prints. */
function LogbookTable({ book, rows }: { book: Book; rows: Row[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">S/N</th>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Hospital No.</th>
            {book.includedPatientNames && <th className="px-3 py-2">Patient</th>}
            <th className="px-3 py-2">Age/Sex</th>
            <th className="px-3 py-2">Diagnosis</th>
            <th className="px-3 py-2">Operation</th>
            <th className="px-3 py-2">Anaesth.</th>
            <th className="px-3 py-2" title="Observed / Assisted / Supervised / Performed">Role</th>
            <th className="px-3 py-2">Complications</th>
            <th className="px-3 py-2">Outcome</th>
            <th className="px-3 py-2">Supervisor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.caseId} className="hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-500">{r.serial}</td>
              <td className="whitespace-nowrap px-3 py-2">{r.date ?? '—'}</td>
              <td className="whitespace-nowrap px-3 py-2 font-medium">{r.hospitalNumber ?? '—'}</td>
              {book.includedPatientNames && <td className="px-3 py-2">{r.patientName ?? '—'}</td>}
              <td className="whitespace-nowrap px-3 py-2">
                {r.age ?? '—'}/{r.sex?.charAt(0) ?? '—'}
              </td>
              <td className="px-3 py-2">{r.diagnosis ?? <Missing />}</td>
              <td className="px-3 py-2">{r.procedure ?? <Missing />}</td>
              <td className="px-3 py-2">{r.anaesthesia ?? '—'}</td>
              <td className="px-3 py-2" title={r.levelBasis}>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 font-bold">{r.roleCode}</span>
              </td>
              <td className="px-3 py-2">{r.complications ?? '—'}</td>
              <td className="px-3 py-2">{r.outcome ?? <Missing />}</td>
              <td className="px-3 py-2">{r.supervisor ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="p-6 text-center text-sm text-gray-500">
          No cases found in this period.
        </p>
      )}
      <p className="flex items-start gap-2 border-t border-gray-100 p-3 text-xs text-gray-500">
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {book.college.attestation}
      </p>
    </div>
  );
}

/**
 * The book as the College prints it: one table per named procedure.
 *
 * EMPTY TABLES ARE SHOWN, collapsed to a single line. That is the point of a
 * portfolio organised this way — a trainee opens it to see which tables are
 * still blank, and a view that hid them would answer the opposite question
 * from the one being asked.
 */
function CategorisedBook({ book }: { book: Book }) {
  const [showEmpty, setShowEmpty] = useState(false);
  const cat = book.categorised!;
  const filled = cat.tables.filter((t) => t.rows.length > 0);
  const empty = cat.tables.filter((t) => t.rows.length === 0);

  const groups: Array<{ label: string; tables: Table[] }> = [];
  filled.forEach((t) => {
    const label = t.part === 1 ? 'Part 1 procedures' : `Part 2 — ${t.group ?? ''} · ${t.sectionLabel}`;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.tables.push(t);
    else groups.push({ label, tables: [t] });
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-700">
          <strong>{filled.length}</strong> of {cat.tables.length} tables have cases in them
          {book.subspecialty && <> · Part 2 shown for <strong>{book.subspecialty.label}</strong></>}
        </p>
        <button type="button" onClick={() => setShowEmpty((v) => !v)}
          className="text-xs font-semibold text-primary-700 underline">
          {showEmpty ? 'Hide' : 'Show'} the {empty.length} empty tables
        </button>
      </div>

      {cat.unclassified.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            {cat.unclassified.length} cases not yet placed in a table
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-amber-900">
            These could not be matched to one of the portfolio&rsquo;s tables from the operation
            or the diagnosis. They are shown rather than hidden, because a case filed in the
            wrong table is worse than one you can see is unfiled — place them by hand, or
            correct the operation name on the case.
          </p>
          <LogbookTable book={book} rows={cat.unclassified} />
        </div>
      )}

      {groups.map((g) => (
        <section key={g.label}>
          <h3 className="mb-2 text-sm font-bold text-gray-900">{g.label}</h3>
          <div className="space-y-3">
            {g.tables.map((t) => (
              <div key={t.categoryKey}>
                <p className="mb-1 text-xs font-semibold text-gray-700">
                  {t.categoryLabel}
                  <span className="ml-2 font-normal text-gray-500">
                    {t.rows.length} {t.rows.length === 1 ? 'case' : 'cases'}
                  </span>
                </p>
                <LogbookTable book={book} rows={t.rows} />
              </div>
            ))}
          </div>
        </section>
      ))}

      {showEmpty && (
        <div className="rounded-2xl border border-dashed border-gray-300 p-4">
          <h3 className="text-sm font-bold text-gray-700">Tables with nothing in them yet</h3>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {empty.map((t) => (
              <li key={t.categoryKey} className="text-xs text-gray-500">
                {t.part === 1 ? 'Part 1' : t.sectionLabel} · {t.categoryLabel}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
